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

// Add retry utility function at the top level
async function retryOperation(operation, maxRetries = 3, delay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.log(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
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

        // Add delay before processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const imageData = await fs.readFile(imagePath);
        const base64Image = imageData.toString('base64');
        
        // Process media with retry
        const stickerData = await retryOperation(async () => {
            return await processMediaForSticker(base64Image, false);
        });
        
        const stickerMedia = new MessageMedia('image/webp', stickerData);
        
        // Check client state before sending
        if (!client.pupPage || !client.info) {
            console.log('Client not ready, attempting to reconnect...');
            await handleReconnect();
            throw new Error('Client reconnecting, please try again');
        }
        
        // Add delay before sending
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send sticker with retry
        return await retryOperation(async () => {
            return await msg.reply(stickerMedia, null, { sendMediaAsSticker: true });
        }, 5, 2000); // Increase retries to 5 with 2 second delay
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
        dataPath: '/app/sessions',
        backupSyncIntervalMs: 300000
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
            '--disable-features=site-per-process',
            '--window-size=800,600',
            '--single-process',
            '--no-zygote',
            '--disable-features=AudioServiceOutOfProcess',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--ignore-certificate-errors',
            '--disable-infobars',
            '--disable-notifications',
            '--force-color-profile=srgb',
            '--disable-features=TranslateUI',
            '--disable-features=GlobalMediaControls',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-domain-reliability',
            '--disable-features=Translate',
            '--disable-hang-monitor',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-web-security',
            '--disable-zero-browsers-open-for-tests',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--no-default-browser-check',
            '--no-experiments',
            '--no-pings',
            '--no-proxy-server',
            '--no-service-autorun',
            '--password-store=basic'
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
    qrMaxRetries: 0,
    authTimeoutMs: 0,
    qrTimeoutMs: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    bypassCSP: true,
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
        // Check client state with more detailed logging
        if (!client.pupPage || !client.info) {
            console.log('Client state check failed:');
            console.log('pupPage exists:', !!client.pupPage);
            console.log('info exists:', !!client.info);
            await handleReconnect();
            return;
        }

        // Verify page is still connected
        try {
            await client.pupPage.evaluate(() => true);
        } catch (pageError) {
            console.log('Page evaluation failed, reconnecting...');
            await handleReconnect();
            return;
        }

        // Get chat before anything else
        const chat = await msg.getChat();
        
        if (chat.isMuted) {
            console.log('Chat is muted, skipping response:', msg.from);
            return;
        }

        // Rate limiting check with longer window
        const now = Date.now();
        const lastTime = lastUserMessage.get(msg.from) || 0;
        
        if (now - lastTime < 3000) { // Increased to 3 seconds
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

        // Check for admin commands first
        if (await handleAdminCommand(msg)) {
            console.log('Admin command handled');
            return;
        }

        const command = msg.body.toLowerCase();
        console.log('Processing command:', command);

        // Process commands for both private and group chats if they start with !
        if (command.startsWith('!')) {
            console.log('Processing command in chat:', command);
            
            try {
                // Process !izin command with enhanced error handling
                if (command === '!izin') {
                    console.log('Processing !izin command');
                    try {
                        // Send text response first with longer timeout
                        await retryOperation(async () => {
                            await msg.reply('Silahkan izin jika berkendala hadir, dimohon segera hubungi saya');
                        }, 5, 3000); // 5 retries, 3 second delay
                        
                        // Add longer delay before sticker
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        const stickerPath = path.join(__dirname, 'public', 'assets', 'stickers', 'izin.jpeg');
                        
                        // Verify client is still connected before sending sticker
                        if (!client.pupPage || !client.info) {
                            throw new Error('Client disconnected before sending sticker');
                        }
                        
                        try {
                            await sendStickerFromFile(msg, stickerPath);
                            console.log('Sticker sent successfully');
                            
                            // Add longer delay after sending sticker
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        } catch (stickerError) {
                            console.error('Failed to send sticker:', stickerError);
                            if (stickerError.message.includes('Session closed')) {
                                await handleReconnect();
                            } else {
                                await retryOperation(async () => {
                                    await msg.reply('Maaf, terjadi kesalahan saat mengirim sticker. Pesan izin tetap tercatat.');
                                }, 5, 3000);
                            }
                        }
                    } catch (error) {
                        console.error('Error in !izin command:', error);
                        if (error.message.includes('Session closed') || error.message.includes('Target closed')) {
                            await handleReconnect();
                        }
                    }
                    return;
                }

                // Handle other commands with retry logic
                switch (command) {
                    case '!software':
                        await retryOperation(() => msg.reply('https://s.id/softwarepraktikum'));
                        break;
                    case '!template':
                        await retryOperation(() => msg.reply('https://s.id/templatebdX'));
                        break;
                    case '!asistensi':
                        await retryOperation(() => msg.reply('Untuk melihat jadwal asistensi gunakan command !asistensi1 sampai !asistensi7 sesuai dengan pertemuan yang ingin dilihat'));
                        break;
                    case '!tugasakhir':
                        await retryOperation(() => msg.reply(dynamicCommands.tugasakhir));
                        break;
                    case '!jadwal':
                    case 'kapan praktikum?':
                        await retryOperation(() => msg.reply(dynamicCommands.jadwal));
                        break;
                    case '!nilai':
                    case 'nilai praktikum?':
                        await retryOperation(() => msg.reply(dynamicCommands.nilai));
                        break;
                    case '!sesi':
                    case 'sesi praktikum?':
                        await retryOperation(() => msg.reply('Praktikum sesi satu : 15:15 - 16:05\nPraktikum sesi dua : 16:10 - 17:00\nPraktikum sesi tiga : 20:00 - 20:50'));
                        break;
                    case '!laporan':
                    case 'bagaimana cara upload laporan?':
                        await retryOperation(() => msg.reply('Untuk mengupload laporan:\n1. ubah file word laporan menjadi pdf\n2. cek link upload laporan sesuai dengan pertemuan ke berapa command contoh !laporan1\n3. klik link upload laporan\n4. upload laporan\n5. Tunggu sampai kelar\nJANGAN SAMPAI MENGUMPULKAN LAPORAN TERLAMBAT -5%!!!'));
                        break;
                    case '!help':
                    case '!bantuan':
                        await retryOperation(() => msg.reply(`Daftar perintah yang tersedia:
!jadwal - Informasi jadwal praktikum
!laporan - Cara upload laporan
!sesi - Informasi sesi praktikum
!nilai - Informasi nilai praktikum
!izin - Informasi izin tidak hadir praktikum
!asistensi - Informasi jadwal asistensi
!software - Link download software praktikum
!template - Link template laporan
!tugasakhir - Informasi tugas akhir`));
                        break;
                    default:
                        if (command.startsWith('!asistensi') && /^!asistensi[1-7]$/.test(command)) {
                            await retryOperation(() => msg.reply(dynamicCommands[command.substring(1)]));
                        } else if (command.startsWith('!laporan') && /^!laporan[1-7]$/.test(command)) {
                            await retryOperation(() => msg.reply(dynamicCommands[command]));
                        }
                        break;
                }
            } catch (cmdError) {
                console.error('Error executing command:', cmdError);
                try {
                    await retryOperation(() => msg.reply('Maaf, terjadi kesalahan dalam memproses perintah. Silakan coba lagi.'));
                } catch (replyError) {
                    console.error('Failed to send error message:', replyError);
                    // If we can't send the error message, try to reconnect
                    await handleReconnect();
                }
            }
        }
    } catch (error) {
        console.error('Critical error in message handler:', error);
        if (error.message.includes('Session closed') || error.message.includes('Target closed')) {
            await handleReconnect();
        }
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
    const RECONNECT_INTERVAL = 30000; // Reduced to 30 seconds

    if (!botState.reconnectAttempts) {
        botState.reconnectAttempts = 0;
    }

    if (botState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached, restarting process...');
        process.exit(1);
    }

    botState.reconnectAttempts++;
    console.log(`Attempting to reconnect (attempt ${botState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    try {
        if (client.pupPage) {
            await client.pupPage.close().catch(() => {});
        }
        if (client.pupBrowser) {
            await client.pupBrowser.close().catch(() => {});
        }
        await client.destroy();
        console.log('Previous client instance destroyed');
    } catch (error) {
        console.error('Error destroying previous client instance:', error);
    }

    // Wait before attempting to reconnect
    await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));

    try {
        await initializeClient();
        if (botState.isAuthenticated) {
            botState.reconnectAttempts = 0; // Reset counter on successful reconnection
            console.log('Reconnection successful, session restored');
        }
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        await handleReconnect();
    }
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