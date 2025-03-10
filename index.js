const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const FileType = require('file-type');
const fs = require('fs').promises;
const os = require('os');
require('dotenv').config();

// Security configuration
const _k = {
    _a: 'eidmean',
    _b: 'ephemerald'
};

let _v = new Set();

// Security middleware
const authenticateSocket = (socket, next) => {
    if (_v.has(socket.id)) {
        next();
    } else {
        next(new Error('403'));
    }
};

ffmpeg.setFfmpegPath(ffmpegPath);

const dynamicCommands = {
    laporan1: 'praktikum pertemuan pertama belum diadakan',
    laporan2: 'praktikum pertemuan kedua belum diadakan',
    laporan3: 'praktikum pertemuan ketiga belum diadakan',
    laporan4: 'praktikum pertemuan keempat belum diadakan',
    laporan5: 'praktikum pertemuan kelima belum diadakan',
    laporan6: 'praktikum pertemuan keenam belum diadakan',
    laporan7: 'praktikum pertemuan ketujuh belum diadakan',
    asistensi1: 'asistensi pertemuan pertama belum diadakan',
    asistensi2: 'asistensi pertemuan kedua belum diadakan',
    asistensi3: 'asistensi pertemuan ketiga belum diadakan',
    asistensi4: 'asistensi pertemuan keempat belum diadakan',
    asistensi5: 'asistensi pertemuan kelima belum diadakan',
    asistensi6: 'asistensi pertemuan keenam belum diadakan',
    asistensi7: 'asistensi pertemuan ketujuh belum diadakan',
    tugasakhir: 'link tugas akhir belum tersedia',
    jadwal: 'https://s.id/kapanpraktikum',
    nilai: 'belum bang.'
};

const ADMIN_NUMBERS = [
    '6287781009836@c.us'  
];

async function handleAdminCommand(msg) {
    const chat = await msg.getChat();
    const sender = msg.from;
    
    if (!ADMIN_NUMBERS.includes(sender)) {
        return false;
    }

    const command = msg.body.toLowerCase();
    

    if (command.startsWith('!update ')) {
        const parts = msg.body.split(' ');
        if (parts.length >= 3) {
            const commandToUpdate = parts[1].toLowerCase();
            const newValue = parts.slice(2).join(' ');
            
            if (dynamicCommands.hasOwnProperty(commandToUpdate)) {
                dynamicCommands[commandToUpdate] = newValue;
                await msg.reply(`✅ Command ${commandToUpdate} has been updated to: ${newValue}`);
                return true;
            } else {
                await msg.reply('❌ Invalid command name. Available commands: ' + Object.keys(dynamicCommands).join(', '));
                return true;
            }
        }
    }
    
    // Show all current values
    if (command === '!showcommands') {
        let response = '*Current Command Values:*\n\n';
        for (const [cmd, value] of Object.entries(dynamicCommands)) {
            response += `*${cmd}:* ${value}\n`;
        }
        await msg.reply(response);
        return true;
    }

    return false;
}

async function processMediaForSticker(mediaData, isAnimated = false) {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `wa_sticker_${Date.now()}`);
    
    try {
        await fs.writeFile(tempPath, mediaData, 'base64');
        
        if (isAnimated) {
            const outputPath = `${tempPath}_converted.webp`;
            await new Promise((resolve, reject) => {
                ffmpeg(tempPath)
                    .toFormat('webp')
                    .addOutputOptions([
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                        '-lossless', '1',
                        '-loop', '0',
                        '-preset', 'default',
                        '-an',
                        '-vsync', '0',
                        '-t', '5'
                    ])
                    .save(outputPath)
                    .on('end', resolve)
                    .on('error', reject);
            });
            const processedData = await fs.readFile(outputPath);
            // Clean up files in a separate try-catch
            try {
                await fs.unlink(tempPath);
                await fs.unlink(outputPath);
            } catch (cleanupError) {
                console.log('Cleanup warning:', cleanupError);
            }
            return processedData.toString('base64');
        } else {
            const processedImage = await sharp(tempPath)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat('webp')
                .toBuffer();
            
            // Clean up file in a separate try-catch
            try {
                await fs.unlink(tempPath);
            } catch (cleanupError) {
                console.log('Cleanup warning:', cleanupError);
            }
            return processedImage.toString('base64');
        }
    } catch (error) {
        // Clean up in case of error
        try {
            await fs.unlink(tempPath);
        } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError);
        }
        throw error;
    }
}

// Update the sendStickerFromFile function
async function sendStickerFromFile(msg, imagePath) {
    try {
        // First check if file exists
        try {
            await fs.access(imagePath);
        } catch (error) {
            console.error('Sticker file not found:', imagePath);
            throw new Error('Sticker file not found');
        }

        const imageData = await fs.readFile(imagePath);
        const base64Image = imageData.toString('base64');
        const stickerData = await processMediaForSticker(base64Image, false);
        const stickerMedia = new MessageMedia('image/webp', stickerData);
        return await msg.reply(stickerMedia, null, { sendMediaAsSticker: true });
    } catch (error) {
        console.error('Error sending sticker:', error);
        throw error;
    }
}

// Inisialisasi Express
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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
                MESSAGE_QUEUE.unshift({ number, message, socket }); 
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

setInterval(() => {
    messageCounter = 0;
}, INTERVAL_RESET);


setInterval(processMessageQueue, DELAY_BETWEEN_MESSAGES);

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'bot-whatsapp',
        dataPath: './sessions'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=site-per-process,IsolateOrigins',
            '--window-size=1920,1080'
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        browserWSEndpoint: null,
        ignoreHTTPSErrors: true,
        timeout: 60000
    },
    restartOnAuthFail: true,
    qrMaxRetries: 5,
    authTimeoutMs: 60000,
    qrTimeoutMs: 40000
});
    
client.on('disconnected', async (reason) => {
    console.log('Client was disconnected:', reason);
    // Try to reconnect
    try {
        console.log('Attempting to reconnect...');
        await client.destroy();
        await client.initialize();
    } catch (error) {
        console.error('Failed to reconnect:', error);
    }
});

process.on('SIGINT', async () => {
    console.log('Closing client...');
    try {
        await client.destroy();
    } catch (err) {
        console.error('Error while closing client:', err);
    }
    process.exit(0);
});

let activeSocket = null;

io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('_x', (data) => {
        if (data._a === _k._a && data._b === _k._b) {
            _v.add(socket.id);
            socket.emit('_r', { s: true });
        } else {
            socket.emit('_r', { s: false });
        }
    });

    socket.on('broadcast', async (data) => {
        if (!_v.has(socket.id)) {
            socket.emit('broadcastStatus', {
                success: false,
                message: '403'
            });
            return;
        }

        const { target, message } = data;
        const formattedNumber = target.includes('@c.us') ? target : `${target}@c.us`;
        
        MESSAGE_QUEUE.push({
            number: formattedNumber,
            message,
            socket
        });
    });

    socket.on('disconnect', () => {
        console.log('Web client disconnected');
        _v.delete(socket.id);
        if (activeSocket === socket) {
            activeSocket = null;
        }
    });

    activeSocket = socket;
});

client.on('qr', async (qr) => {
    console.log('QR RECEIVED');
    try {
        const qrImage = await QRCode.toDataURL(qr);
        io.emit('qr', `<img src="${qrImage}" alt="QR Code" />`);
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

client.on('ready', () => {
    console.log('Client is ready!');
    io.emit('ready');
});

client.on('authenticated', () => {
    console.log('Authenticated');
    io.emit('authenticated');
});

const lastUserMessage = new Map();

client.on('message', async msg => {
    const now = Date.now();
    const lastTime = lastUserMessage.get(msg.from) || 0;
    
    if (now - lastTime < 2000) {
        console.log('Rate limiting response to:', msg.from);
        return;
    }

    lastUserMessage.set(msg.from, now);

    if (activeSocket) {
        activeSocket.emit('message', {
            from: msg.from,
            body: msg.body,
            time: moment().format('HH:mm:ss')
        });
    }

    const command = msg.body.toLowerCase();

    setTimeout(async () => {
        try {
            const chat = await msg.getChat();
            
            // Check if chat is muted
            if (chat.isMuted) {
                console.log('Chat is muted, skipping response:', msg.from);
                return;
            }
            
            // Check for admin commands first
            if (await handleAdminCommand(msg)) {
                return;
            }
            
            if (!chat.isGroup || (chat.isGroup && msg.mentionedIds.includes(client.info.wid._serialized))) {
                if (command === '!izin') {
                    try {
                        await msg.reply('Silahkan izin jika berkendala hadir, dimohon segera hubungi saya');
                        
                        const stickerPath = path.join(__dirname, 'public', 'assets', 'stickers', 'izin.jpeg');
                        
                        // Check if sticker directory exists, if not create it
                        const stickerDir = path.join(__dirname, 'public', 'assets', 'stickers');
                        try {
                            await fs.access(stickerDir);
                        } catch (error) {
                            await fs.mkdir(stickerDir, { recursive: true });
                        }
                        
                        try {
                            await sendStickerFromFile(msg, stickerPath);
                        } catch (stickerError) {
                            console.error('Failed to send sticker:', stickerError);
                            await msg.reply('Maaf, terjadi kesalahan saat mengirim sticker. Pesan izin tetap tercatat.');
                        }
                    } catch (error) {
                        console.error('Error handling !izin command:', error);
                        await msg.reply('Maaf, terjadi kesalahan dalam memproses permintaan izin.');
                    }
                }
                else if (command === '!software') {
                    await msg.reply('https://s.id/softwarepraktikum');
                }
                else if (command === '!template') {
                    await msg.reply('https://s.id/templatebdX');
                }
                else if (command === '!asistensi') {
                    await msg.reply('Untuk melihat jadwal asistensi gunakan command !asistensi1 sampai !asistensi7 sesuai dengan pertemuan yang ingin dilihat');
                }
                else if (command === '!tugasakhir') {
                    await msg.reply(dynamicCommands.tugasakhir);
                }
                else if (command.startsWith('!asistensi') && /^!asistensi[1-7]$/.test(command)) {
                    await msg.reply(dynamicCommands[command.substring(1)]);
                }
                else if (command === '!jadwal' || command === 'kapan praktikum?') {
                    await msg.reply(dynamicCommands.jadwal);
                }
                else if (command === '!nilai' || command === 'nilai praktikum?') {
                    await msg.reply(dynamicCommands.nilai);
                }
                else if (command === '!sesi' || command === 'sesi praktikum?') {
                    await msg.reply('Praktikum sesi satu : 15:15 - 16:05\nPraktikum sesi dua : 16:10 - 17:00\nPraktikum sesi tiga : 20:00 - 20:50');
                }
                else if (command === '!laporan' || command === 'bagaimana cara upload laporan?') {
                    await msg.reply('Untuk mengupload laporan:\n1. ubah file word laporan menjadi pdf\n2. cek link upload laporan sesuai dengan pertemuan ke berapa command contoh !laporan1\n3. klik link upload laporan\n4. upload laporan\n5. Tunggu sampai kelar\nJANGAN SAMPAI MENGUMPULKAN LAPORAN TERLAMBAT -5%!!!');
                }
                else if (command === '!laporan1') {
                    await msg.reply(dynamicCommands.laporan1);
                }
                else if (command === '!laporan2') {
                    await msg.reply(dynamicCommands.laporan2);
                }
                else if (command === '!laporan3') {
                    await msg.reply(dynamicCommands.laporan3);
                }
                else if (command === '!laporan4') {
                    await msg.reply(dynamicCommands.laporan4);
                }
                else if (command === '!laporan5') {
                    await msg.reply(dynamicCommands.laporan5);
                }
                else if (command === '!laporan6') {
                    await msg.reply(dynamicCommands.laporan6);
                }
                else if (command === '!laporan7') {
                    await msg.reply(dynamicCommands.laporan7);
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
!sesi - Informasi sesi praktikum
!nilai - Informasi nilai praktikum
!izin - Informasi izin tidak hadir praktikum
!asistensi - Informasi jadwal asistensi
!software - Link download software praktikum
!template - Link template laporan
!tugasakhir - Informasi tugas akhir
`);
                }
            } else if (chat.isGroup && command.startsWith('!')) {
                await msg.reply('Untuk menggunakan bot di grup, mohon mention bot terlebih dahulu.\nContoh: @bot !help');
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }, Math.random() * 1000 + 1000); 
});

client.on('auth_failure', async (msg) => {
    console.error('Authentication failure:', msg);
    // Clear auth data and reinitialize
    try {
        await client.destroy();
        await client.initialize();
    } catch (error) {
        console.error('Failed to reinitialize after auth failure:', error);
    }
});

// Handle unexpected errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});

client.initialize(); 