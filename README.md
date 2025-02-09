# WhatsApp Lab Assistant Bot
# Bot WhatsApp Asisten Praktikum

A WhatsApp bot for lab management system that can send notifications and answer common questions. This bot comes with message queuing system and rate limiting for security.

*Bot WhatsApp untuk sistem manajemen praktikum yang dapat memberikan notifikasi dan menjawab pertanyaan umum. Bot ini dilengkapi dengan sistem antrian pesan dan pembatasan rate untuk keamanan.*

## Features | Fitur

- QR Code system for WhatsApp Web authentication | *Sistem QR Code untuk autentikasi WhatsApp Web*
- Web interface for bot monitoring and control | *Antarmuka web untuk monitoring dan kontrol bot*
- Message queuing system to prevent spam | *Sistem antrian pesan untuk mencegah spam*
- Rate limiting for security | *Rate limiting untuk keamanan*
- Auto-reply for common questions | *Auto-reply untuk pertanyaan umum*
- Message activity logging | *Logging aktivitas pesan*
- Message broadcast support | *Dukungan broadcast pesan*

### Security Features | Fitur Keamanan
- 3-second delay between message sends | *Delay 3 detik antar pengiriman pesan*
- Maximum 10 messages per minute | *Maksimal 10 pesan per menit*
- Rate limiting for incoming message responses (2-second delay per sender) | *Rate limiting untuk respons pesan masuk (2 detik delay per pengirim)*
- Queue system for message management | *Sistem antrian untuk mengelola pengiriman pesan*

### Auto-Reply Features | Fitur Auto-Reply
- Lab schedule information | *Informasi jadwal praktikum*
- Report submission guide | *Panduan upload laporan*
- Help menu | *Menu bantuan*

## System Requirements | Persyaratan Sistem

- Node.js version 12 or higher | *Node.js versi 12 atau lebih tinggi*
- Chrome/Chromium browser | *Browser Chrome/Chromium*
- Stable internet connection | *Koneksi internet yang stabil*
- Active WhatsApp account | *Whatsapp yang aktif di ponsel*

## Installation | Instalasi

1. Make sure Node.js is installed on your system | *Pastikan Node.js sudah terinstall di sistem Anda*
2. Clone this repository | *Clone repository ini*
3. Enter the bot directory | *Masuk ke direktori bot*:
   ```bash
   cd botwa
   ```
4. Install dependencies | *Install dependencies*:
   ```bash
   npm install
   ```
5. Create `.env` file for configuration (optional) | *Buat file `.env` untuk konfigurasi (opsional)*:
   ```env
   PORT=3000
   ```

## Usage | Penggunaan

1. Run the bot | *Jalankan bot*:
   ```bash
   npm start
   ```
2. Open browser and access | *Buka browser dan akses* `http://localhost:3000`
3. Scan the QR code with your WhatsApp | *Scan QR code yang muncul dengan WhatsApp di ponsel Anda*
4. Bot is ready to use! | *Bot siap digunakan!*

### Available Commands | Perintah yang Tersedia

- `!schedule` or `!jadwal` - Lab schedule information | *Informasi jadwal praktikum*
- `!report` or `!laporan` - Report submission guide | *Panduan upload laporan*
- `!help` or `!bantuan` - Show command list | *Menampilkan daftar perintah*

### Web Interface | Antarmuka Web

The web interface provides | *Antarmuka web menyediakan*:
- QR code display for authentication | *Tampilan QR code untuk autentikasi*
- Bot connection status | *Status koneksi bot*
- Incoming message logs | *Log pesan masuk*
- Message broadcast panel | *Panel broadcast pesan*

## Development | Pengembangan

For development mode with auto-reload | *Untuk mode development dengan auto-reload*:
```bash
npm run dev
```

## Project Structure | Struktur Proyek

```
├── index.js           # Main application file | File utama aplikasi
├── public/            # Static files for web interface | File statis untuk antarmuka web
├── .env              # Environment configuration | Konfigurasi environment
└── .gitignore        # Git ignore list | Daftar file yang diabaikan git
```

## Security | Keamanan

The bot includes several security features | *Bot ini dilengkapi dengan beberapa fitur keamanan*:
- Message rate limiting | *Pembatasan jumlah pesan*
- Message queuing system | *Sistem antrian pesan*
- Automatic delay between messages | *Delay otomatis antara pesan*
- Spam protection | *Proteksi terhadap spam*

## Troubleshooting | Pemecahan Masalah

1. If QR code doesn't appear | *Jika QR code tidak muncul*:
   - Ensure Chrome/Chromium is installed | *Pastikan Chrome/Chromium terinstall*
   - Check internet connection | *Periksa koneksi internet*
   - Restart application | *Restart aplikasi*

2. If messages fail to send | *Jika pesan tidak terkirim*:
   - Check number format (use country code) | *Periksa format nomor (gunakan kode negara)*
   - Ensure number is registered on WhatsApp | *Pastikan nomor terdaftar di WhatsApp*
   - Check rate limiting | *Periksa batas rate limiting*

## Important Notes | Catatan Penting

- Bot uses whatsapp-web.js which requires Chrome/Chromium | *Bot menggunakan whatsapp-web.js yang membutuhkan Chrome/Chromium*
- Keep WhatsApp on phone connected to internet | *Pastikan WhatsApp di ponsel tetap terkoneksi ke internet*
- Don't logout from WhatsApp Web on phone | *Jangan logout dari WhatsApp Web di ponsel*
- Backup session files regularly | *Backup file sesi secara berkala*
- Mind the rate limits to avoid blocking | *Perhatikan batasan rate untuk menghindari pemblokiran*

## Contributing | Kontribusi

Contributions are always welcome. For major changes, please open an issue first to discuss the desired changes.

*Kontribusi selalu diterima. Untuk perubahan besar, harap buka issue terlebih dahulu untuk mendiskusikan perubahan yang diinginkan.*

## License | Lisensi

[MIT License](LICENSE)

---
*Mit Liebe erschaffen von unlovdman* 