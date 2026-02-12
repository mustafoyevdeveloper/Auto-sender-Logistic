/**
 * Telegram Userbot — logistika yuklari xabarlarini guruhlarga avtomatik tarqatish.
 * Shaxsiy chatdan qabul qilingan matnni barcha guruhlarga navbat bilan, delay bilan yuboradi.
 */

import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import input from "input";

import { loadConfig } from "./src/config.js";
import { createLogger } from "./src/logger.js";
import { loadSession, saveSession } from "./src/session.js";
import { loadAutoBlacklist, addToAutoBlacklist } from "./src/blacklist.js";

// ——— Holat ———
let config;
let log;
let client;
/** Saqlangan yuklar: { id: messageId, text: string } — tarqatishdan oldin chatdan joriy matn tekshiriladi. */
let lastMessages = [];
let isBroadcasting = false;
let stopRequested = false;

/** Saved Messages dan o‘qiladigan xabarlar soni — nechta bo‘lsa ham oxirgilari tekshiriladi. */
const LOAD_YUKS_LIMIT = 10000;

/** Buyruq yoki yuk emas (send/10 kabi) bo‘lgan matnni rad etish. */
function isCommandOrFake(text) {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (t.startsWith("/")) return true;
  if (/^send\s*\/\s*\d+$/i.test(t)) return true; // send/10, send / 15
  return false;
}

/** Bot o‘zining javob xabarlari — yuk sifatida hisoblanmasin va tarqatilmasin.
 *  Bu yerga faqat bot yuboradigan, oddiy yuk matnlarida uchramaydigan iboralar yoziladi.
 */
const BOT_REPLY_PHRASES = [
  // /start va yordam matni
  "Yuk yuborsangiz — saqlanadi",
  "barcha yuklarni",
  "xabarlarni  kutib tarqatadi",
  "/start — yordam",
  "Xabar yuboring",

  // Holat va statistikalar
  "Userbot ishga tushdi",
  "Holat:",
  "Guruhlar:",
  "Saqlangan yuklar:",
  "Jami saqlangan:",

  // Tarqatish yakunlari
  "barcha guruhlarga tarqatildi",
  "marta guruhga yuborildi",

  // Xatolik / ogohlantirish matnlari
  "Saqlangan yuk yo'q",
  "Bu buyruq emas",
  "Yuboriladigan guruh qolmadi",
  "Tarqatish to'xtatildi",
  "Tarqatish va taymer to'xtatildi",
  "To'xtatish: /stop",
  "Taymerni ornating",
  "oxirgi xabarlarni tekshirib",

  // Avto-javoblar
  "onlayn bo'lishim bilan javob beraman",
  "Xabar ish vaqtida ko'riladi",
  "Yangi yuk qo'shildi",

  // Emoji bilan boshlanadigan tipik javoblar
  "🛑Tarqatish to'xtatildi",
  "⚡ Jami",
  "✅ Xabarlar barcha guruhlarga tarqatildi",
];

/** Bot javobi — buyruqlar, yordam/status matnlari va tarqatish/tasdiq xabarlari. Faqat qolgan matnlar yuk. */
function isBotOwnMessage(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  const lower = t.toLowerCase();

  // Buyruqlar (faqat / bilan boshlanadigan) ham yuk emas
  if (t.startsWith("/")) return true;

  // Yordam/status/ogohlantirish matnlari — matn ichida IBORA bo‘lsa ham botniki
  for (const phrase of BOT_REPLY_PHRASES) {
    if (!phrase) continue;
    if (lower.includes(phrase.toLowerCase())) return true;
  }

  // Bot tarqatish xabarlari: "N ta yuk tarqatilmoqda..." — boshida yoki matnda
  if (/^\d+\s*ta\s*yuk\s*tarqatilmoqda/i.test(t)) return true;
  if (lower.includes("ta yuk tarqatilmoqda")) return true;

  // Bot tasdiq xabarlari: "kutish vaqti", "barcha guruhlarga tarqatildi" va statistikalar
  if (lower.includes("kutish vaqti") && lower.includes("tarqatilmoqda")) return true;

  return false;
}

/**
 * Saved Messages dan barcha yuklarni oladi: oxirgi N ta xabarni iterMessages orqali o‘qiydi,
 * buyruq va bot javoblarini tashlab, qolgan matnli xabarlarni lastMessages ga yozadi.
 * "me" entity ni aniq resolve qiladi — ishga tushirilishidan oldin yuborilgan xabarlar ham topiladi.
 */
async function loadLastMessagesFromChat() {
  try {
    const savedPeer = await client.getInputEntity("me");
    const raw = await client.getMessages(savedPeer, { limit: LOAD_YUKS_LIMIT });
    const list = raw == null ? [] : Array.isArray(raw) ? [...raw] : Array.from(raw);
    // Matnni API "message" maydonidan olish (Telegram Message.message = matn qatori)
    const rawText = (m) => {
      if (!m || m.id == null) return "";
      const msg = m.message;
      if (typeof msg === "string" && msg.length > 0) return msg;
      if (typeof m.rawText === "string" && m.rawText.length > 0) return m.rawText;
      if (typeof m.text === "string" && m.text.length > 0) return m.text;
      if (msg != null && typeof msg === "object" && typeof msg.text === "string") return msg.text;
      const s = String(msg ?? m.rawText ?? m.text ?? "").trim();
      if (s.length > 0) return s;
      // Baʼzi obyektlarda matn boshqa nomda bo‘lishi mumkin
      if (typeof m.text === "string") return m.text;
      return "";
    };
    const withText = list.map((m) => ({ id: m.id, text: rawText(m).trim() }));
    const matnliCount = withText.filter((x) => x.text.length > 0).length;
    if (list.length > 0 && matnliCount === 0) {
      const first = list[0];
      log.warn(`Matn topilmadi. Birinchi xabar id=${first?.id}, message tipi=${typeof first?.message}, keys=${first ? Object.keys(first).join(",") : ""}`);
    }
    const yuks = withText.filter((m) => {
      if (!m.text) return false;
      if (m.text.startsWith("/")) return false;
      if (isBotOwnMessage(m.text)) return false;
      return true;
    });
    lastMessages.length = 0;
    lastMessages.push(...yuks.reverse());
    if (list.length > 0) {
      log.info(`Saved Messages: ${list.length} xabar, ${matnliCount} tasida matn, ${lastMessages.length} ta yuk.`);
    }
  } catch (err) {
    log.error("Chatdan yuklarni yig‘ishda xato:", err.message);
  }
}

/**
 * Chatdan saqlangan xabarlarni tekshiradi: joriy matnni yangilaydi, o'chirilganlarini ro'yxatdan olib tashlaydi.
 * Har doim /send yoki /send10, /send15 dan oldin chaqiriladi (loadLastMessagesFromChat dan keyin).
 */
async function refreshLastMessagesFromChat() {
  if (lastMessages.length === 0) return;
  try {
    const ids = lastMessages.map((m) => m.id);
    const fetched = await client.getMessages("me", { ids });
    const list = Array.isArray(fetched) ? fetched : fetched ? [fetched] : [];
    const stillExist = [];
    for (let i = 0; i < lastMessages.length; i++) {
      const storedId = lastMessages[i].id;
      const msg = list.find((m) => m && (m.id === storedId || m.id?.toString() === String(storedId)));
      const currentText = msg && (msg.text ?? msg.message ?? "").trim();
      if (currentText && !isBotOwnMessage(currentText)) {
        stillExist.push({ id: lastMessages[i].id, text: currentText });
      }
    }
    lastMessages.length = 0;
    lastMessages.push(...stillExist);
  } catch (err) {
    log.error("Yuklarni yangilashda xato:", err.message);
  }
}

function randomDelaySec(minSec, maxSec) {
  const min = Math.min(minSec, maxSec);
  const max = Math.max(minSec, maxSec);
  return min + Math.random() * (max - min);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Faqat guruhlar (kanal va shaxsiy chatlarsiz).
 * Blacklist / whitelist qo'llanadi.
 */
async function getTargetGroups() {
  const dialogs = await client.getDialogs({});
  const groups = dialogs.filter((d) => d.isGroup && !d.entity.deactivated);
  const byId = (e) => (e && e.id ? e.id.toString() : "");
  const byTitle = (e) => (e && e.title ? e.title : "");

  let list = groups;

  if (config.whitelistGroups && config.whitelistGroups.length > 0) {
    const wl = new Set(config.whitelistGroups.map(String));
    list = list.filter(
      (d) =>
        wl.has(byId(d.entity)) ||
        wl.has(byTitle(d.entity)) ||
        wl.has(String(d.id))
    );
  }

  const bl = new Set([
    ...(config.blacklistGroups || []).map(String),
    ...loadAutoBlacklist(),
  ]);
  if (bl.size > 0) {
    list = list.filter(
      (d) =>
        !bl.has(byId(d.entity)) &&
        !bl.has(byTitle(d.entity)) &&
        !bl.has(String(d.id))
    );
  }

  return list;
}

/**
 * Bir guruhga xabar yuborish. FloodWait va boshqa xatolarni boshqaradi.
 */
async function sendToGroup(dialog, text) {
  const name = dialog.name || dialog.title || String(dialog.id);
  const { FloodWaitError } = await import("telegram/errors/index.js");

  try {
    await client.sendMessage(dialog.entity, { message: text });
    log.success(name);
    return true;
  } catch (err) {
    if (err instanceof FloodWaitError) {
      const sec = err.seconds || 30;
      log.info(`FloodWait: ${name} — ${sec}s kutamiz`);
      await sleep(sec * 1000);
      return sendToGroup(dialog, text);
    }
    const msg = err.message || String(err);
    const permanentErr =
      msg.includes("CHAT_WRITE_FORBIDDEN") ||
      msg.includes("USER_BANNED") ||
      msg.includes("PEER_ID_INVALID") ||
      msg.includes("CHANNEL_PRIVATE") ||
      msg.includes("CHAT_RESTRICTED") ||
      msg.includes("ALLOW_PAYMENT_REQUIRED");
    if (permanentErr) {
      addToAutoBlacklist(dialog);
      log.error(name, `skip + blacklist: ${msg}`);
      return false;
    }
    log.error(name, msg);
    return false;
  }
}

/**
 * Bir martada barcha saqlangan xabarlarni guruhlarga yuborish (1 marta va to'xtaydi).
 * messages — matnlar massivi; har biri barcha guruhlarga yuboriladi.
 */
async function runBroadcast(messages) {
  if (isBroadcasting) {
    log.info("Tarqatish allaqachon ishlayapti.");
    return;
  }
  if (!messages || messages.length === 0) return;
  isBroadcasting = true;
  stopRequested = false;

  log.info(`Tarqatish boshlandi (${messages.length} ta xabar).`);

  const groups = await getTargetGroups();
  if (groups.length === 0) {
    log.info("Yuboriladigan guruh qolmadi (blacklist).");
    isBroadcasting = false;
    try {
      await client.sendMessage("me", {
        message: "❌ Yuboriladigan guruh qolmadi (blacklist).",
      });
    } catch (err) {
      log.error("Xabar yuborishda xato:", err.message);
    }
    return;
  }

  let totalSent = 0;
  for (const text of messages) {
    const sendAll = async () => {
      const results = await Promise.all(
        groups.map((dialog) => sendToGroup(dialog, text))
      );
      return results.filter(Boolean).length;
    };
    totalSent += await sendAll();
  }
  const totalPossible = groups.length * messages.length;
  log.info(`Tarqatish tugadi: ${messages.length} ta xabar, jami ${totalSent}/${totalPossible} marta yuborildi.`);

  isBroadcasting = false;
  try {
    await client.sendMessage("me", {
      message: `✅ Xabarlar barcha guruhlarga tarqatildi.\n📊 ${messages.length} ta xabar, ${totalSent} marta guruhga yuborildi.`,
    });
  } catch (err) {
    log.error("Xabar yuborishda xato:", err.message);
  }
}

/**
 * Tsiklda davom etadigan tarqatish: har N sekundda barcha saqlangan xabarlarni guruhlarga yuboradi.
 */
async function runBroadcastInLoop(messages, delaySec) {
  if (isBroadcasting) {
    log.info("Tarqatish allaqachon ishlayapti.");
    return;
  }
  if (!messages || messages.length === 0) return;
  isBroadcasting = true;
  stopRequested = false;

  log.info(`Tsiklda tarqatish boshlandi (${messages.length} ta xabar). Har ${delaySec}s da.`);

  let round = 0;
  while (!stopRequested) {
    const groups = await getTargetGroups();
    if (groups.length === 0) {
      log.info("Yuboriladigan guruh qolmadi (blacklist). To'xtatildi.");
      try {
        await client.sendMessage("me", {
          message: "❌ Yuboriladigan guruh qolmadi (blacklist). Tarqatish to'xtatildi.",
        });
      } catch (err) {
        log.error("Xabar yuborishda xato:", err.message);
      }
      break;
    }

    let sent = 0;
    for (const text of messages) {
      const results = await Promise.all(
        groups.map((dialog) => sendToGroup(dialog, text))
      );
      sent += results.filter(Boolean).length;
    }
    round++;
    log.info(`${round}-raund tugadi: ${messages.length} ta xabar, ${sent} marta yuborildi.`);

    if (stopRequested) break;
    log.info(`${delaySec} soniya kutilmoqda...`);
    await sleep(delaySec * 1000);
  }

  isBroadcasting = false;
  log.info("Tsiklda tarqatish to'xtatildi.");
}

/**
 * Shaxsiy chatdagi xabarlarni qayta ishlash: buyruqlar va oddiy matn.
 * Har bir buyruqdan oldin Saved Messages dan xabarlar qayta o‘qiladi (ishga tushirilishidan oldin yuborilganlar ham).
 */
async function handlePrivateMessage(event) {
  const msg = event.message;
  if (!msg) return;
  const text = (msg.text ?? msg.message ?? "").trim();
  if (!text) return;

  // Har bir buyruqdan oldin Saved Messages dan barcha yuklarni qayta o‘qish
  if (text.startsWith("/")) {
    await loadLastMessagesFromChat();
  }

  if (text === "/start") {
    await event.message.reply({
      message:
        "📝 Yuk yuborsangiz — saqlanadi.\n📤 /send — barcha yuklarni 1 marta tarqatib to'xtaydi.\n⏱️ /send10 — /send300 gacha — xabarlarni  kutib tarqatadi.\n🛑 /stop — tarqatishni to'xtatish\n📊 /status — holat va guruhlar soni",
    });
    return;
  }

  if (text === "/stop") {
    stopRequested = true;
    await event.message.reply({ message: "🛑 Tarqatish to'xtatildi." });
    return;
  }

  if (text === "/status") {
    const groups = await getTargetGroups();
    const status = isBroadcasting
      ? "Tarqatish ishlayapti."
      : "Tarqatish to'xtatilgan.";
    await event.message.reply({
      message: `📊 Holat: ${status}\nGuruhlar: ${groups.length}\nSaqlangan yuklar: ${lastMessages.length} ta`,
    });
    return;
  }

  // Bir martalik tarqatish — yuqorida loadLastMessagesFromChat() chaqirilgan
  if (text === "/send") {
    const toSend = lastMessages.map((m) => m.text).filter(Boolean);
    if (toSend.length === 0) {
      await event.message.reply({
        message: "Saqlangan yuk yo'q. Avval yuk yuboring.",
      });
      return;
    }
    stopRequested = true;
    lastMessages = [];
    await event.message.reply({
      message: `📤 ${toSend.length} ta yuk tarqatilmoqda...`,
    });
    runBroadcast(toSend);
    return;
  }

  // Tsiklda tarqatish: /send10, /send/10, /send/11, ... /send/100 — barcha xabarlarni tarqatib, N sekund kutadi, yana tarqatadi (10–100)
  const sendMatch = text.match(/^\/send\/?(\d+)$/);
  if (sendMatch) {
    const delaySec = parseInt(sendMatch[1], 10);
    if (delaySec < 10 || delaySec > 300) {
      await event.message.reply({
        message: "⏱️ Faqat 10 dan 300 raqam ishlatiladi. Masalan: /send/10",
      });
      return;
    }
    const toSend = lastMessages.map((m) => m.text).filter(Boolean);
    if (toSend.length === 0) {
      await event.message.reply({
        message: "Saqlangan yuk yo'q. Avval yuk (xabar) yuboring yoki chatdagi oxirgi xabarlarni tekshirib ko‘ring.",
      });
      return;
    }
    stopRequested = false;
    await event.message.reply({
      message: `📤 ${toSend.length} ta yuk tarqatilmoqda, ⏱️ kutish vaqti ${delaySec}`,
    });
    runBroadcastInLoop([...toSend], delaySec);
    return;
  }

  if (text.startsWith("/")) return;

  // Yuk (xabar) qabul qilindi — send/10 va bot javoblari hisoblanmasin
  if (isCommandOrFake(text)) {
    await event.message.reply({
      message: "Bu buyruq emas, lekin yuk sifatida saqlanmaydi. Tarqatish uchun /send yoki /send10 va boshqa raqamlar yuboring.",
    });
    return;
  }
  if (isBotOwnMessage(text)) {
    return;
  }

  // Har safar yangi yuk kelganda ham, faqat Saved Messages dagi haqiqiy yuklar bo‘yicha sanaymiz
  await loadLastMessagesFromChat();

  if (isBroadcasting) {
    stopRequested = true;
    await event.message.reply({
      message: `⏹️ Yangi yuk qo'shildi. 🛑Tarqatish to'xtatildi.\n⚡ Jami saqlangan: ${lastMessages.length} ta.`,
    });
    return;
  }

  await event.message.reply({
    message: `✅ Yuk qabul qilindi (${text.length} belgi).\n⚡ Jami : ${lastMessages.length} ta.`,
  });
}

async function main() {
  const authOnly = process.argv.includes("--auth-only");

  config = loadConfig();
  log = createLogger(config.logFile);

  const session = loadSession(config.sessionFile);
  client = new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: 5,
    floodSleepThreshold: 60,
  });

  if (authOnly) {
    log.info("Faqat avtorizatsiya. Telefon va kod kiriting.");
    await client.start({
      phoneNumber: async () => await input.text("Telefon raqam: "),
      password: async () => await input.text("Parol (2FA bo'lsa): "),
      phoneCode: async () => await input.text("Telegramdan kelgan kod: "),
      onError: (err) => console.error(err),
    });
    const sessionString = client.session.save();
    if (typeof sessionString === "string") {
      saveSession(sessionString, config.sessionFile);
      log.info("Sessiya saqlandi: " + config.sessionFile);
    }
    await client.disconnect();
    process.exit(0);
    return;
  }

  await client.connect();

  if (!(await client.isUserAuthorized())) {
    log.error("Sessiya amalda emas. Ishga tushiring: node index.js --auth-only");
    process.exit(1);
  }

  log.info("Userbot ulandi.");

  // Kiruvchi va chiquvchi xabarlar (o‘zingiz yuborgan yuk ham) — Saved Messages da ikkalasi ham qabul qilinadi
  client.addEventHandler(handlePrivateMessage, new NewMessage({ chats: ["me"], incoming: true, outgoing: true }));

  await client.sendMessage("me", {
    message: "Userbot ishga tushdi.",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
