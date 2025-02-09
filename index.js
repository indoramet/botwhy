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
        try {
            // Cek apakah pesan dari grup
            const chat = await msg.getChat();
            
            // Hanya respons jika mention bot atau pesan pribadi
            if (!chat.isGroup || (chat.isGroup && msg.mentionedIds.includes(client.info.wid._serialized))) {
                if (command === '!jadwal' || command === 'kapan praktikum?') {
                    await msg.reply('Jadwal praktikum akan diumumkan melalui web. Silakan cek pengumuman terakhir atau hubungi asisten lab.');
                }
                else if (command === '!nilai' || command === 'nilai praktikum?') {
                    await msg.reply('Nilai praktikum akan diumumkan melalui web. Silakan cek pengumuman terakhir atau hubungi asisten lab.');
                }
                else if (command === '!sesi' || command === 'sesi praktikum?') {
                    await msg.reply('Praktikum sesi satu : 10:00 - 12:00\nPraktikum sesi dua : 13:00 - 15:00');
                }




                else if (command === '!laporan' || command === 'bagaimana cara upload laporan?') {
                    await msg.reply('Untuk mengupload laporan:\n1. ubah file word laporan menjadi pdf\n2. cek link upload laporan sesuai dengan pertemuan ke berapa command contoh !laporan1\n3. klik link upload laporan\n4. upload laporan\n5. Tunggu sampai kelar\nJANGAN SAMPAI MENGUMPULKAN LAPORAN TERLAMBAT -5%!!!');
                }

                else if (command === '!laporan1' || command === 'mana link upload laporan praktikum pertemuan pertama?') {
                    await msg.reply('https://s.id/laporan1');
                }
                else if (command === '!laporan2' || command === 'mana link upload laporan praktikum pertemuan kedua?') {
                    await msg.reply('praktikum pertemuan kedua belum diadakan');
                }
                else if (command === '!laporan3' || command === 'mana link upload laporan praktikum pertemuan ketiga?') {
                    await msg.reply('praktikum pertemuan ketiga belum diadakan');
                }
                else if (command === '!laporan4' || command === 'mana link upload laporan praktikum pertemuan keempat?') {
                    await msg.reply('praktikum pertemuan keempat belum diadakan');
                }
                else if (command === '!laporan5' || command === 'mana link upload laporan praktikum pertemuan kelima?') {
                    await msg.reply('praktikum pertemuan kelima belum diadakan');
                }
                else if (command === '!laporan6' || command === 'mana link upload laporan praktikum pertemuan keenam?') {
                    await msg.reply('praktikum pertemuan keenam belum diadakan');
                }
                else if (command === '!laporan7' || command === 'mana link upload laporan praktikum pertemuan ketujuh?') {
                    await msg.reply('praktikum pertemuan ketujuh belum diadakan');
                }



                else if (command === '!who made you' || command === 'siapa yang membuat kamu?') {
                    await msg.reply('I have been made by @unlovdman atas izin allah\nSaya dibuat oleh @unlovdman atas izin allah');
                }
                else if (command === '!contact' || command === 'gimana saya mengontak anda?') {
                    await msg.reply('you can visit my portofolio web app https://unlovdman.vercel.app/ for more information');
                }
                else if (command === '!help' || command === '!bantuan') {
                    await msg.reply(`Daftar perintah yang tersedia:
!jadwal - Informasi jadwal praktikum
!laporan - Cara upload laporan
!who made you - Info pembuat bot
!contact - Info kontak
!bantuan - Menampilkan bantuan ini`);
                }
            } else if (chat.isGroup && command.startsWith('!')) {
                // Jika di grup tapi tidak di-mention, beri tahu cara menggunakan bot
                await msg.reply('Untuk menggunakan bot di grup, mohon mention bot terlebih dahulu.\nContoh: @bot !help');
            }
        } catch (error) {
            console.error('Error handling message:', error);
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