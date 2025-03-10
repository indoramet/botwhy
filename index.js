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

// Scheduled messages storage
const scheduledMessages = new Map();

// After the scheduledMessages Map declaration
const SCHEDULES_FILE = path.join(__dirname, 'sessions', 'schedules.json');

// Function to save schedules to file
async function saveSchedules() {
    const schedulesData = Array.from(scheduledMessages.entries()).map(([id, schedule]) => ({
        id,
        groupId: schedule.groupId,
        dateTime: schedule.dateTime.toISOString(),
        message: schedule.message
    }));
    
    try {
        await fs.writeFile(SCHEDULES_FILE, JSON.stringify(schedulesData, null, 2));
    } catch (error) {
        console.error('Error saving schedules:', error);
    }
}

// Function to load schedules from file
async function loadSchedules() {
    try {
        const exists = await fs.access(SCHEDULES_FILE).then(() => true).catch(() => false);
        if (!exists) {
            return;
        }

        const data = await fs.readFile(SCHEDULES_FILE, 'utf8');
        const schedulesData = JSON.parse(data);
        
        for (const schedule of schedulesData) {
            const dateTime = new Date(schedule.dateTime);
            if (dateTime > new Date()) {  // Only schedule future messages
                await scheduleMessage(schedule.groupId, dateTime, schedule.message);
            }
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
    }
}

// Function to schedule a message
async function scheduleMessage(groupId, dateTime, message) {
    const now = new Date();
    const scheduledTime = new Date(dateTime);
    
    if (scheduledTime <= now) {
        throw new Error('Scheduled time must be in the future');
    }

    const scheduleId = `${groupId}_${scheduledTime.getTime()}`;
    const timeoutId = setTimeout(async () => {
        try {
            const chat = await client.getChatById(groupId);
            if (chat && chat.isGroup) {
                await chat.sendMessage(message);
                console.log(`Scheduled message sent to ${groupId}`);
            }
            scheduledMessages.delete(scheduleId);
            await saveSchedules();
        } catch (error) {
            console.error('Error sending scheduled message:', error);
        }
    }, scheduledTime.getTime() - now.getTime());

    scheduledMessages.set(scheduleId, {
        groupId,
        dateTime: scheduledTime,
        message,
        timeoutId
    });
    await saveSchedules();
    return scheduleId;
}

// Function to format date for display
function formatDateTime(date) {
    return moment(date).format('DD MMMM YYYY HH:mm');
}

// Extend handleAdminCommand to include scheduling commands
async function handleAdminCommand(msg) {
    const chat = await msg.getChat();
    const sender = msg.from;
    
    if (!ADMIN_NUMBERS.includes(sender)) {
        return false;
    }

    const command = msg.body.toLowerCase();
    const parts = msg.body.split(' ');

    if (command.startsWith('!update ')) {
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
    
    // Schedule a message
    // Format: !schedule <groupId> <YYYY-MM-DD HH:mm> <message>
    else if (command.startsWith('!schedule ')) {
        try {
            const groupId = parts[1];
            const dateStr = parts[2];
            const timeStr = parts[3];
            const message = parts.slice(4).join(' ');
            
            if (!groupId || !dateStr || !timeStr || !message) {
                await msg.reply('Format: !schedule <groupId> <YYYY-MM-DD> <HH:mm> <message>');
                return true;
            }

            const dateTime = moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm').toDate();
            const scheduleId = await scheduleMessage(groupId, dateTime, message);
            
            await msg.reply(`✅ Message scheduled for ${formatDateTime(dateTime)}\nSchedule ID: ${scheduleId}`);
        } catch (error) {
            await msg.reply(`❌ Error scheduling message: ${error.message}`);
        }
        return true;
    }
    
    // List scheduled messages
    else if (command === '!listschedules') {
        if (scheduledMessages.size === 0) {
            await msg.reply('No scheduled messages.');
            return true;
        }

        let response = '*Scheduled Messages:*\n\n';
        for (const [id, schedule] of scheduledMessages) {
            response += `ID: ${id}\nGroup: ${schedule.groupId}\nTime: ${formatDateTime(schedule.dateTime)}\nMessage: ${schedule.message}\n\n`;
        }
        await msg.reply(response);
        return true;
    }
    
    // Cancel a scheduled message
    else if (command.startsWith('!cancelschedule ')) {
        const scheduleId = parts[1];
        const schedule = scheduledMessages.get(scheduleId);
        
        if (!schedule) {
            await msg.reply('❌ Schedule not found.');
            return true;
        }

        clearTimeout(schedule.timeoutId);
        scheduledMessages.delete(scheduleId);
        await saveSchedules();
        await msg.reply(`✅ Scheduled message cancelled: ${scheduleId}`);
        return true;
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
        dataPath: '/app/sessions'
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
            '--window-size=800,600',
            '--single-process',
            '--no-zygote',
            '--disable-features=AudioServiceOutOfProcess',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-software-rasterizer',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-infobars',
            '--disable-notifications',
            '--use-gl=disabled',
            '--disable-setuid-sandbox',
            '--no-zygote',
            '--deterministic-fetch',
            '--disable-features=IsolateOrigins',
            '--disable-features=site-per-process',
            '--disable-blink-features=AutomationControlled'
        ],
        defaultViewport: {
            width: 800,
            height: 600,
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: true,
            isMobile: false
        },
        executablePath: '/usr/bin/chromium',
        browserWSEndpoint: null,
        ignoreHTTPSErrors: true,
        timeout: 0,
        protocolTimeout: 0
    },
    webVersionCache: {
        type: 'local',
        path: '/app/sessions/.version-cache'
    },
    restartOnAuthFail: true,
    qrMaxRetries: 5,
    authTimeoutMs: 0,
    qrTimeoutMs: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    bypassCSP: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
});
    
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function initializeClient() {
    try {
        console.log('Starting WhatsApp client initialization...');
        
        // Ensure sessions directory exists
        const sessionsPath = '/app/sessions';
        const versionCachePath = '/app/sessions/.version-cache';
        
        try {
            await fs.access(sessionsPath);
            console.log('Sessions directory exists');
        } catch (error) {
            console.log('Creating sessions directory...');
            await fs.mkdir(sessionsPath, { recursive: true });
        }

        try {
            await fs.access(versionCachePath);
            console.log('Version cache exists');
        } catch (error) {
            console.log('Creating version cache directory...');
            await fs.mkdir(path.dirname(versionCachePath), { recursive: true });
        }
        
        // Clear any existing browser data
        try {
            const browserDataPath = path.join(sessionsPath, 'bot-whatsapp/Default');
            await fs.rm(browserDataPath, { recursive: true, force: true });
            console.log('Cleared existing browser data');
        } catch (error) {
            console.log('No existing browser data to clear');
        }
        
        console.log('Initializing client...');
        await client.initialize();
        
        // Add a timeout to restart if stuck in connecting state
        setTimeout(async () => {
            if (!isClientReady) {
                console.log('Client stuck in connecting state, attempting restart...');
                try {
                    await client.destroy();
                    console.log('Client destroyed successfully');
                } catch (error) {
                    console.error('Error destroying stuck client:', error);
                }
                console.log('Exiting process for container restart...');
                process.exit(1);
            }
        }, 120000); // Increased to 120 seconds timeout
    } catch (error) {
        console.error('Failed to initialize client:', error);
        if (error.message.includes('Failed to launch') || error.message.includes('Target closed')) {
            console.log('Critical initialization error, forcing restart...');
            process.exit(1);
        }
        handleReconnect();
    }
}

async function handleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached. Restarting process...');
        process.exit(1);
        return;
    }

    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
    
    try {
        console.log('Destroying existing client...');
        await client.destroy();
        console.log('Client destroyed successfully');
    } catch (error) {
        console.error('Error destroying client:', error);
    }

    // Clear the sessions directory
    try {
        console.log('Clearing sessions directory...');
        await fs.rm('/app/sessions', { recursive: true, force: true });
        await fs.mkdir('/app/sessions', { recursive: true });
        console.log('Sessions directory cleared and recreated');
    } catch (error) {
        console.error('Error clearing sessions:', error);
    }

    // Wait before trying to reconnect
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    console.log(`Waiting ${delay}ms before reconnecting...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log('Attempting to reinitialize client...');
    await initializeClient();
}

client.on('ready', async () => {
    console.log('Client is ready!');
    isClientReady = true;
    reconnectAttempts = 0;
    try {
        // Add delay before loading chats
        await new Promise(resolve => setTimeout(resolve, 3000));
        const chats = await client.getChats();
        console.log(`Loaded ${chats.length} chats`);
        await loadSchedules();
        console.log('Loaded scheduled messages');
        io.emit('ready');
    } catch (error) {
        console.error('Error in ready event:', error);
        // Only attempt reconnect if the error is fatal
        if (error.message.includes('Protocol error') || error.message.includes('Target closed') || !isClientReady) {
            handleReconnect();
        }
    }
});

client.on('disconnected', async (reason) => {
    console.log('Client was disconnected:', reason);
    isClientReady = false;
    handleReconnect();
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

client.on('authenticated', () => {
    console.log('Authenticated');
    io.emit('authenticated');
});

const lastUserMessage = new Map();

client.on('message', async msg => {
    try {
        console.log('Received message:', {
            from: msg.from,
            body: msg.body,
            isGroup: msg._data.isGroup
        });

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
        console.log('Processing command:', command);

        try {
            const chat = await msg.getChat();
            console.log('Chat info:', {
                isGroup: chat.isGroup,
                name: chat.name,
                isMuted: chat.isMuted
            });
            
            // Check if chat is muted
            if (chat.isMuted) {
                console.log('Chat is muted, skipping response:', msg.from);
                return;
            }
            
            // Check for admin commands first
            if (await handleAdminCommand(msg)) {
                console.log('Admin command handled');
                return;
            }
            
            if (!chat.isGroup || (chat.isGroup && msg.mentionedIds.includes(client.info.wid._serialized))) {
                console.log('Processing command in chat:', command);
                
                if (command === '!izin') {
                    console.log('Processing !izin command');
                    try {
                        await msg.reply('Silahkan izin jika berkendala hadir, dimohon segera hubungi saya');
                        console.log('Sent initial !izin response');
                        
                        const stickerPath = path.join(__dirname, 'public', 'assets', 'stickers', 'izin.jpeg');
                        console.log('Sticker path:', stickerPath);
                        
                        // Check if sticker directory exists, if not create it
                        const stickerDir = path.join(__dirname, 'public', 'assets', 'stickers');
                        try {
                            await fs.access(stickerDir);
                        } catch (error) {
                            console.log('Creating sticker directory');
                            await fs.mkdir(stickerDir, { recursive: true });
                        }
                        
                        try {
                            await sendStickerFromFile(msg, stickerPath);
                            console.log('Sticker sent successfully');
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
                console.log('Group message without mention, sending hint');
                await msg.reply('Untuk menggunakan bot di grup, mohon mention bot terlebih dahulu.\nContoh: @bot !help');
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    } catch (error) {
        console.error('Critical error in message handler:', error);
    }
});

client.on('auth_failure', async (msg) => {
    console.error('Authentication failure:', msg);
    io.emit('auth_failure', 'Authentication failed');
});

client.on('change_state', state => {
    console.log('Client state changed to:', state);
});

client.on('loading_screen', (percent, message) => {
    console.log('Loading screen:', percent, message);
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

// Initialize the client
initializeClient(); 