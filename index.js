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

    if (command.startsWith('!update')) {
        if (parts.length < 3) {
            await msg.reply('Format: !update <command_name> <new_value>\nExample: !update laporan1 https://example.com');
            return true;
        }

        const commandToUpdate = parts[1].toLowerCase();
        const newValue = parts.slice(2).join(' ');
        
        if (dynamicCommands.hasOwnProperty(commandToUpdate)) {
            const oldValue = dynamicCommands[commandToUpdate];
            dynamicCommands[commandToUpdate] = newValue;
            await msg.reply(`✅ Command *${commandToUpdate}* has been updated\n\nOld value:\n${oldValue}\n\nNew value:\n${newValue}`);
            return true;
        } else {
            const availableCommands = Object.keys(dynamicCommands).join('\n');
            await msg.reply(`❌ Invalid command name: *${commandToUpdate}*\n\nAvailable commands:\n${availableCommands}`);
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
const DELAY_BETWEEN_MESSAGES = 2000; // 3 detik delay antar pesan
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
        dataPath: '/app/sessions',
        backupSyncIntervalMs: 300000,
        dataStore: {
            storePath: '/app/sessions/.store'
        }
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
            '--disable-blink-features=AutomationControlled',
            '--disable-sync',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-translate',
            '--disable-component-extensions-with-background-pages',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--disable-features=Translate',
            '--disable-features=GlobalMediaControls',
            '--disable-crash-reporter',
            '--disable-breakpad',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa',
            '--disable-gl-drawing-for-tests',
            '--disable-dev-profile',
            '--disable-software-rasterizer',
            '--disable-extensions-http-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-popup-blocking',
            '--disable-hang-monitor',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-sync-preferences',
            '--disable-sync-types',
            '--disable-threaded-scrolling',
            '--disable-web-security',
            '--disable-zero-browsers-open-for-tests',
            '--enable-automation',
            '--disable-prompt-on-repost',
            '--disable-domain-reliability',
            '--disable-browser-side-navigation',
            '--disable-features=InterestFeedContentSuggestions',
            '--disable-features=InterestFeedV2',
            '--disable-features=AutofillServerCommunication',
            '--disable-features=ChromeWhatsNewUI',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--no-experiments',
            '--no-pings',
            '--password-store=basic'
        ],
        defaultViewport: {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: true,
            isMobile: false
        },
        executablePath: '/usr/bin/chromium',
        browserWSEndpoint: null,
        ignoreHTTPSErrors: true,
        timeout: 120000,
        protocolTimeout: 120000,
        waitForInitialPage: true,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
    },
    webVersion: '2.2408.52',
    webVersionCache: {
        type: 'none'
    },
    restartOnAuthFail: true,
    qrMaxRetries: 5,
    authTimeoutMs: 120000,
    qrTimeoutMs: 60000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    bypassCSP: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    linkPreviewApiServers: ['https://preview.whatsapp.com/api/v1/preview']
});

// Track bot state
let botState = {
    isReady: false,
    isAuthenticated: false,
    lastQR: null,
    sessionExists: false,
    reconnectAttempts: 0
};

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Web client connected');
    
    // Send current bot state to new connections
    if (botState.isReady) {
        socket.emit('ready');
    } else if (botState.isAuthenticated) {
        socket.emit('authenticated');
    } else if (botState.lastQR && !botState.isAuthenticated) {
        socket.emit('qr', botState.lastQR);
    }
    
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
        if (socket === activeSocket) {
            activeSocket = null;
        }
    });

    activeSocket = socket;
});

// Update client event handlers
client.on('qr', async (qr) => {
    if (botState.isAuthenticated) {
        console.log('QR received while authenticated, ignoring...');
        return;
    }
    console.log('QR RECEIVED');
    try {
        const qrImage = await QRCode.toDataURL(qr);
        botState.lastQR = `<img src="${qrImage}" alt="QR Code" />`;
        io.emit('qr', botState.lastQR);
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

client.on('authenticated', () => {
    console.log('Client authenticated');
    botState.isAuthenticated = true;
    botState.lastQR = null;
    io.emit('authenticated');
});

client.on('ready', async () => {
    console.log('Client is ready');
    botState.isReady = true;
    botState.isAuthenticated = true;
    botState.lastQR = null;
    
    try {
        // Add longer delay before loading chats
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Wrap chat loading in retry logic
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
            try {
                const chats = await client.getChats();
                console.log(`Loaded ${chats.length} chats`);
                io.emit('ready');
                break;
            } catch (error) {
                retries++;
                console.error(`Error loading chats (attempt ${retries}/${maxRetries}):`, error);
                if (retries === maxRetries) {
                    console.log('Failed to load chats, but continuing with bot operation');
                    io.emit('ready');
                } else {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
                }
            }
        }
    } catch (error) {
        console.error('Error in ready event:', error);
        // Don't throw the error, just log it and continue
        io.emit('ready');
    }
});

client.on('disconnected', async (reason) => {
    console.log('Client disconnected:', reason);
    botState.isReady = false;
    // Keep authentication state
    if (!botState.isAuthenticated) {
        await handleReconnect();
    } else {
        // Try to reconnect while preserving session
        try {
            await client.initialize();
        } catch (error) {
            console.error('Failed to reconnect:', error);
            await handleReconnect();
        }
    }
});

// Handle process signals
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal');
    try {
        await client.destroy();
        console.log('Client destroyed successfully');
    } catch (error) {
        console.error('Error destroying client:', error);
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT signal');
    try {
        await client.destroy();
        console.log('Client destroyed successfully');
    } catch (error) {
        console.error('Error destroying client:', error);
    }
    process.exit(0);
});

let activeSocket = null;

const lastUserMessage = new Map();

client.on('message', async msg => {
    try {
        // Wait for client to be ready
        if (!client.info) {
            console.log('Client info not yet available, waiting...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            if (!client.info) {
                console.log('Client still not ready, attempting reconnection...');
                await handleReconnect();
                return;
            }
        }

        // Get chat before anything else
        let chat;
        try {
            chat = await msg.getChat();
        } catch (error) {
            console.error('Error getting chat:', error);
            await handleReconnect();
            return;
        }
        
        // Check if chat is muted
        if (chat.isMuted) {
            console.log('Chat is muted, skipping response:', msg.from);
            return;
        }

        // Rate limiting check with increased threshold for stability
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

        // Check for admin commands first with error handling
        try {
            if (await handleAdminCommand(msg)) {
                console.log('Admin command handled successfully');
                return;
            }
        } catch (adminError) {
            console.error('Error handling admin command:', adminError);
            await msg.reply('Error processing admin command. Please try again.');
            return;
        }

        const command = msg.body.toLowerCase();
        console.log('Processing command:', command);

        // Process commands with better error handling
        if (command.startsWith('!')) {
            console.log('Processing command in chat:', command);
            
            try {
                // Add delay between commands to prevent overload
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (command === '!izin') {
                    console.log('Processing !izin command');
                    await msg.reply('Silahkan izin jika berkendala hadir, dimohon segera hubungi saya');
                    console.log('Sent initial !izin response');
                    
                    const stickerPath = path.join(__dirname, 'public', 'assets', 'stickers', 'izin.jpeg');
                    console.log('Sticker path:', stickerPath);
                    
                    try {
                        await fs.access(path.dirname(stickerPath));
                    } catch (error) {
                        console.log('Creating sticker directory');
                        await fs.mkdir(path.dirname(stickerPath), { recursive: true });
                    }
                    
                    try {
                        await sendStickerFromFile(msg, stickerPath);
                        console.log('Sticker sent successfully');
                    } catch (stickerError) {
                        console.error('Failed to send sticker:', stickerError);
                        await msg.reply('Maaf, terjadi kesalahan saat mengirim sticker. Pesan izin tetap tercatat.');
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
            } catch (cmdError) {
                console.error('Error executing command:', cmdError);
                await msg.reply('Maaf, terjadi kesalahan dalam memproses perintah. Silakan coba lagi.');
            }
        }
    } catch (error) {
        console.error('Critical error in message handler:', error);
    }
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

// Initialize the client
async function initializeClient() {
    try {
        console.log('Starting WhatsApp client initialization...');
        
        // Ensure sessions directory exists
        const sessionsPath = '/app/sessions';
        try {
            await fs.access(sessionsPath);
            console.log('Sessions directory exists');
        } catch (error) {
            console.log('Creating sessions directory...');
            await fs.mkdir(sessionsPath, { recursive: true });
        }

        // Ensure store directory exists
        const storePath = '/app/sessions/.store';
        try {
            await fs.access(storePath);
            console.log('Store directory exists');
        } catch (error) {
            console.log('Creating store directory...');
            await fs.mkdir(storePath, { recursive: true });
        }

        // Initialize the client with retry logic
        let initAttempts = 0;
        const maxInitAttempts = 3;

        while (initAttempts < maxInitAttempts) {
            try {
                console.log(`Attempting to initialize client (attempt ${initAttempts + 1}/${maxInitAttempts})...`);
                await client.initialize();
                console.log('Client initialized successfully');
                break;
            } catch (initError) {
                initAttempts++;
                console.error(`Initialization attempt ${initAttempts} failed:`, initError);

                if (initAttempts === maxInitAttempts) {
                    throw initError;
                }

                // Only clear data if we haven't authenticated yet and no existing session
                if (!botState.isAuthenticated && !botState.sessionExists) {
                    console.log('No valid session found, clearing browser data...');
                    try {
                        const browserDataPath = path.join(sessionsPath, 'bot-whatsapp/Default');
                        await fs.rm(browserDataPath, { recursive: true, force: true }).catch(() => {});
                        console.log('Cleared browser data');
                    } catch (error) {
                        console.error('Error clearing browser data:', error);
                    }
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } catch (error) {
        console.error('Failed to initialize client:', error);
        throw error;
    }
}

// Add reconnection handler
async function handleReconnect() {
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_INTERVAL = 30000; // 30 seconds

    if (!botState.reconnectAttempts) {
        botState.reconnectAttempts = 0;
    }

    if (botState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached, restarting process...');
        try {
            await client.destroy();
        } catch (error) {
            console.error('Error destroying client during restart:', error);
        }
        process.exit(1);
    }

    botState.reconnectAttempts++;
    console.log(`Attempting to reconnect (attempt ${botState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    try {
        // First try to destroy the existing client
        try {
            await client.destroy();
            console.log('Previous client instance destroyed');
        } catch (error) {
            console.error('Error destroying previous client instance:', error);
        }

        // Clear any existing sessions if we're having persistent issues
        if (botState.reconnectAttempts > 2) {
            try {
                const sessionsPath = '/app/sessions';
                const browserDataPath = path.join(sessionsPath, 'bot-whatsapp/Default');
                await fs.rm(browserDataPath, { recursive: true, force: true }).catch(() => {});
                console.log('Cleared browser data for fresh start');
            } catch (error) {
                console.error('Error clearing browser data:', error);
            }
        }

        // Wait before attempting to reconnect
        console.log(`Waiting ${RECONNECT_INTERVAL/1000} seconds before reconnecting...`);
        await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));

        // Initialize new client
        console.log('Initializing new client...');
        await initializeClient();
        
        // If we get here, reset the reconnect counter
        if (client.info) {
            console.log('Reconnection successful!');
            botState.reconnectAttempts = 0;
            botState.isReady = true;
            botState.isAuthenticated = true;
            return true;
        }
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        // Try again recursively
        return await handleReconnect();
    }
    return false;
}

// Update the startBot function
async function startBot() {
    try {
        // Check if sessions directory exists and has content
        const sessionsPath = '/app/sessions';
        try {
            await fs.access(path.join(sessionsPath, 'bot-whatsapp'));
            botState.sessionExists = true;
            console.log('Existing session found');
        } catch (error) {
            console.log('No existing session found');
        }

        await initializeClient();
    } catch (error) {
        console.error('Error starting bot:', error);
        process.exit(1);
    }
}

// Start the server and bot
server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    startBot();
}); 