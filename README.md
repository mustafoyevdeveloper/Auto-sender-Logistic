# Telegram Userbot — Logistika xabarlarini tarqatish

Logist foydalanuvchi **o'zi a'zo bo'lgan** Telegram guruhlariga xabarlarni avtomatik tarqatish tizimi. Oddiy bot cheklovlari sababli **userbot** (foydalanuvchi akkaunti orqali) ishlatiladi.

## Talablar

- **Node.js 18+**
- Barqaror internet
- Telegram akkaunt (spam cheklovlariga tushmagan)

## O'rnatish

```bash
npm install
```

## Konfiguratsiya

`config.example.json` dan nusxa olib `config.json` yarating:

```bash
cp config.example.json config.json
```

`config.json` da majburiy:

- **API_ID**, **API_HASH** — [my.telegram.org](https://my.telegram.org/apps) dan oling
- **SESSION_FILE** — sessiya fayli (masalan `user.session`)
- **DELAY_MIN_SEC**, **DELAY_MAX_SEC** — har bir guruhga yuborish oralig'i (tavsiya: 8–15)
- **LOG_FILE** — log fayl nomi
- **BLACKLIST_GROUPS** — xabar yuborilmaydigan guruhlar (ID yoki nom)
- **WHITELIST_GROUPS** — bo'sh bo'lsa barcha guruhlar; to'ldirilsa faqat shu guruhlar

## Birinchi marta: avtorizatsiya

Bir marta SMS-kod orqali sessiya yaratish:

```bash
npm run auth
# yoki
node index.js --auth-only
```

Telefon raqam, Telegramdan kelgan kod va (agar bor bo'lsa) 2FA parolini kiriting. Sessiya `user.session` (yoki config dagi nom) da saqlanadi.

## Ishga tushirish

```bash
npm start
# yoki
node index.js
```

Userbot ulanganidan keyin **Saved Messages** (O'zimga yuborish) ga xabar yuboring.

## Buyruqlar (faqat shaxsiy chatda — Saved Messages)

| Buyruq   | Tavsif                          |
|----------|----------------------------------|
| `/start` | Userbot ishga tushdi / yordam    |
| `/send`  | Oxirgi saqlangan xabarni tarqatish |
| `/stop`  | Tarqatishni to'xtatish           |
| `/status`| Holat va guruhlar soni           |

Oddiy matn (buyruq emas) yuborilsa — xabar saqlanadi va darhol barcha guruhlarga tarqatish boshlanadi.

## Tarqatish mexanizmi

1. Foydalanuvchi **Saved Messages** ga xabar yozadi
2. Userbot guruhlar ro'yxatini oladi (kanal va shaxsiy chatlar chiqariladi)
3. Blacklist / whitelist qo'llanadi
4. Har bir guruhga navbat bilan xabar yuboriladi
5. Har yuborishdan keyin **random delay** (config: 8–15 soniya)
6. **FloodWait** bo'lsa — kutadi, keyin qayta urinadi
7. Guruhda yozish taqiqlangan yoki chiqarilgan bo'lsa — o'tkazib yuboriladi, log yoziladi

## Xavfsizlik

- Bir xil interval ishlatilmasligi uchun delay **random** (min–max orasida)
- Kuniga juda ko'p guruhga yuborish tavsiya etilmaydi
- FloodWait paytida kutish majburiy
- Telegram qoidalarini buzish akkaunt bloklanishiga olib kelishi mumkin

## Log

`userbot.log` (yoki config dagi nom) da:

- Guruh nomi, sana/vaqt, status (success / error)
- Format: `sana | INFO/ERROR | guruh | status | tafsilot`

## Loyiha strukturasi

```
├── index.js           # Kirish nuqtasi, client, handler, tarqatish
├── config.json        # Sozlamalar (siz yaratasiz)
├── config.example.json
├── src/
│   ├── config.js      # Config o'qish
│   ├── logger.js      # Log faylga yozish
│   ├── session.js     # Sessiya fayldan o'qish/saqlash
├── package.json
└── README.md
```

## Keyingi kengaytirish

- Web panel
- Xabar shablonlari
- Bir nechta akkaunt
- Statistik panel
# Auto-sender-Logistic
