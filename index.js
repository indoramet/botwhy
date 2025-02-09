const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment');
require('dotenv').config();

// Inisialisasi Express
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi keamanan
const DELAY_BETWEEN_MESSAGES = 3000; // 3 detik delay antar pesan
const MAX_MESSAGES_PER_INTERVAL = 10; // maksimal 10 pesan per interval
const INTERVAL_RESET = 60000; // reset counter setiap 1 menit
const MESSAGE_QUEUE = [];
let messageCounter = 0;
let lastMessageTime = 0;

// Fungsi untuk mengelola antrian pesan
const processMessageQueue = async () => {
    if (MESSAGE_QUEUE.length > 0 && Date.now() - lastMessageTime >= DELAY_BETWEEN_MESSAGES) {
        const { number, message, socket } = MESSAGE_QUEUE.shift();
        try {
            if (messageCounter < MAX_MESSAGES_PER_INTERVAL) {
                await client.sendMessage(number, message);
                messageCounter++;
                lastMessageTime = Date.now();
                socket.emit('broadcastStatus', {
                    success: true,
                    message: 'Pesan berhasil dikirim!'
                });
            } else {
                MESSAGE_QUEUE.unshift({ number, message, socket }); // Kembalikan ke antrian
                console.log('Rate limit reached, waiting...');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('broadcastStatus', {
                success: false,
                message: 'Gagal mengirim pesan. Pastikan nomor valid dan terdaftar di WhatsApp.'
            });
        }
    }
};

// Reset counter setiap interval
setInterval(() => {
    messageCounter = 0;
}, INTERVAL_RESET);

// Proses antrian setiap interval
setInterval(processMessageQueue, DELAY_BETWEEN_MESSAGES);

// Inisialisasi client WhatsApp dengan pengaturan keamanan
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions'
        ],
        headless: true,
        timeout: 100000
    }
});

// Menyimpan socket yang aktif
let activeSocket = null;

// Event saat client socket terhubung
io.on('connection', (socket) => {
    console.log('Web client connected');
    activeSocket = socket;

    // Handle broadcast request dengan rate limiting
    socket.on('broadcast', async (data) => {
        const { target, message } = data;
        // Format nomor telepon
        const formattedNumber = target.includes('@c.us') ? target : `${target}@c.us`;
        
        // Tambahkan ke antrian pesan
        MESSAGE_QUEUE.push({
            number: formattedNumber,
            message,
            socket
        });
    });

    socket.on('disconnect', () => {
        console.log('Web client disconnected');
        if (activeSocket === socket) {
            activeSocket = null;
        }
    });
});

// Event saat QR code tersedia untuk di scan
client.on('qr', async (qr) => {
    console.log('QR RECEIVED');
    try {
        const qrImage = await QRCode.toDataURL(qr);
        io.emit('qr', `<img src="${qrImage}" alt="QR Code" />`);
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

// Event saat client siap
client.on('ready', () => {
    console.log('Client is ready!');
    io.emit('ready');
});

// Event saat autentikasi berhasil
client.on('authenticated', () => {
    console.log('Authenticated');
    io.emit('authenticated');
});

// Map untuk menyimpan waktu pesan terakhir dari setiap pengirim
const lastUserMessage = new Map();

// Event saat menerima pesan dengan rate limiting
client.on('message', async msg => {
    const now = Date.now();
    const lastTime = lastUserMessage.get(msg.from) || 0;
    
    // Minimal 2 detik delay antara respons ke pengguna yang sama
    if (now - lastTime < 2000) {
        console.log('Rate limiting response to:', msg.from);
        return;
    }

    // Update waktu pesan terakhir
    lastUserMessage.set(msg.from, now);

    // Kirim pesan ke web interface untuk ditampilkan di log
    if (activeSocket) {
        activeSocket.emit('message', {
            from: msg.from,
            body: msg.body,
            time: moment().format('HH:mm:ss')
        });
    }

    const command = msg.body.toLowerCase();

    // Handle pertanyaan umum dengan delay
    setTimeout(async () => {
        if (command === '!jadwal' || command === 'kapan praktikum?') {
            await msg.reply('Jadwal praktikum akan diumumkan melalui grup. Silakan cek pengumuman terakhir atau hubungi asisten lab.');
        }
        else if (command === '!laporan' || command === 'bagaimana cara upload laporan?') {
            await msg.reply('Untuk mengupload laporan:\n1. Login ke sistem\n2. Pilih menu "Upload Laporan"\n3. Pilih praktikum\n4. Upload file laporan Anda');
        }
        else if (command === '!help' || command === '!bantuan') {
            await msg.reply(`Daftar perintah yang tersedia:
!jadwal - Informasi jadwal praktikum
!laporan - Cara upload laporan
!bantuan - Menampilkan bantuan ini`);
        }
    }, Math.random() * 1000 + 1000); // Random delay 1-2 detik
});

// Event saat ada error
client.on('auth_failure', msg => {
    console.error('Authentication failure', msg);
});

// Route untuk halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Mulai server pada port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

// Inisialisasi koneksi WhatsApp
client.initialize(); 