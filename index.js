const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment');
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

// Inisialisasi Express
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        server: 'OK',
        whatsapp: {
            ready: botState.isReady,
            authenticated: botState.isAuthenticated,
            lastPing: botState.lastPing ? new Date(botState.lastPing).toISOString() : null
        },
        uptime: process.uptime()
    };

    if (!botState.isReady || !botState.isAuthenticated) {
        return res.status(503).json(status);
    }

    res.status(200).json(status);
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
        dataPath: './sessions',
        backupSyncIntervalMs: 300000
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--aggressive-cache-discard',
            '--disable-cache',
            '--disable-application-cache',
            '--disable-offline-load-stale-cache',
            '--disk-cache-size=0',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list',
            '--window-size=1280,720'
        ],
        defaultViewport: {
            width: 1280,
            height: 720
        },
        executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
        ignoreHTTPSErrors: true,
        timeout: 120000,
        protocolTimeout: 120000
    },
    webVersion: '2.2408.52',
    restartOnAuthFail: true,
    qrMaxRetries: 5,
    authTimeoutMs: 120000,
    qrTimeoutMs: 120000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 120000,
    bypassCSP: true
});

// Track bot state
let botState = {
    isReady: false,
    isAuthenticated: false,
    lastQR: null,
    sessionExists: false,
    reconnectAttempts: 0,
    lastPing: Date.now()
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
    console.log('QR RECEIVED, checking authentication state...');
    
    // Double check authentication state
    if (botState.isAuthenticated || botState.isReady) {
        console.log('Already authenticated, ignoring QR code');
        return;
    }

    try {
        const qrImage = await QRCode.toDataURL(qr);
        botState.lastQR = `<img src="${qrImage}" alt="QR Code" />`;
        io.emit('qr', botState.lastQR);
        console.log('QR code emitted to client');
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

client.on('authenticated', async () => {
    console.log('Client authenticated');
    botState.isAuthenticated = true;
    botState.lastQR = null; // Clear QR code
    io.emit('authenticated');
    
    // Force clear any existing intervals
    if (global.pingInterval) {
        clearInterval(global.pingInterval);
        global.pingInterval = null;
    }
    
    // Start fresh connection check
    startConnectionCheck();
    
    // Try to initialize immediately
    try {
        console.log('Authentication successful, initializing client...');
        if (!botState.isReady) {
            // Load chats in background
            client.getChats().catch(error => {
                console.error('Error loading initial chats:', error);
            });
            
            // Verify connection
            const page = client.pupPage;
            if (page) {
                await page.evaluate(() => console.log('Page is responsive after authentication'));
            }
        }
    } catch (error) {
        console.error('Error during post-authentication initialization:', error);
    }
});

client.on('ready', async () => {
    console.log('Client is ready!');
    botState.isReady = true;
    botState.isAuthenticated = true;
    botState.reconnectAttempts = 0;
    io.emit('ready');
    
    try {
        // Verify WhatsApp connection
        const page = client.pupPage;
        if (page) {
            await page.evaluate(() => {
                console.log('WhatsApp Web page is fully loaded');
                return true;
            });
        }
        
        // Load initial chats
        const chats = await client.getChats();
        console.log(`Loaded ${chats.length} chats successfully`);
        
    } catch (error) {
        console.error('Error in ready event:', error);
        // Don't throw the error, just log it
    }
});

// Update handleReconnect to be simpler
async function handleReconnect() {
    const MAX_RECONNECT_ATTEMPTS = 3;
    
    if (botState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached, restarting process...');
        process.exit(1);
    }

    botState.reconnectAttempts++;
    console.log(`Attempting to reconnect (attempt ${botState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    try {
        await client.destroy();
        await new Promise(resolve => setTimeout(resolve, 5000));
        await client.initialize();
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        if (botState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(handleReconnect, 5000);
        }
    }
}

// Update connection check to be more robust
function startConnectionCheck() {
    if (global.pingInterval) {
        clearInterval(global.pingInterval);
        global.pingInterval = null;
    }
    
    global.pingInterval = setInterval(async () => {
        if (!botState.isAuthenticated) {
            console.log('Not authenticated, skipping connection check');
            return;
        }
        
        try {
            if (!client.pupPage) {
                throw new Error('No pupPage available');
            }
            
            const isOnline = await client.pupPage.evaluate(() => {
                return window.Store && window.Store.State ? true : false;
            });
            
            if (!isOnline) {
                throw new Error('WhatsApp Store not available');
            }
            
            botState.lastPing = Date.now();
            console.log('Connection verified:', new Date().toISOString());
        } catch (error) {
            console.log('Connection check failed:', error.message);
            if (Date.now() - botState.lastPing > 60000) {
                console.log('Connection lost for over 60 seconds, attempting to reconnect...');
                handleReconnect();
            }
        }
    }, 30000);
}

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

client.on('message_create', (msg) => {
    console.log('=== RAW MESSAGE CREATE EVENT ===');
    console.log({
        fromMe: msg.fromMe,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        type: msg.type,
        timestamp: new Date().toISOString()
    });
});

client.on('message', async msg => {
    // Immediate logging of raw message
    console.log('=== MESSAGE EVENT TRIGGERED ===');
    console.log('Message details:', {
        from: msg.from,
        body: msg.body,
        hasQuoted: !!msg.hasQuotedMsg,
        timestamp: new Date().toISOString()
    });

    try {
        // Verify client state
        if (!botState.isReady) {
            console.log('Bot not ready, message ignored');
            return;
        }

        // Basic command check
        const command = msg.body.toLowerCase();
        console.log('Processing command:', command);

        // Simple test response for any message starting with !
        if (command.startsWith('!')) {
            try {
                console.log('Attempting to reply to command:', command);
                await msg.reply('Received your command: ' + command);
                console.log('Reply sent successfully');
            } catch (replyError) {
                console.error('Error sending reply:', replyError);
                // Try alternative send method
                const chat = await msg.getChat();
                await chat.sendMessage('Received your command: ' + command);
                console.log('Reply sent via alternative method');
            }
        }

        // Continue with the rest of your message handling...

        // Check client state
        if (!client.pupPage || !client.info) {
            console.log('Client not fully initialized, attempting to recover...');
            try {
                await client.initialize();
                console.log('Client reinitialized successfully');
            } catch (error) {
                console.error('Failed to reinitialize client:', error);
                return;
            }
        }

        // Wait for client to be ready
        if (!botState.isReady) {
            console.log('Client not ready, waiting...');
            return;
        }

        // Get chat before anything else
        let chat;
        try {
            chat = await msg.getChat();
            console.log('Chat retrieved:', {
                name: chat.name,
                id: chat.id._serialized,
                isGroup: chat.isGroup
            });
        } catch (chatError) {
            console.error('Error getting chat:', chatError);
            return;
        }
        
        // Check if chat is muted
        if (chat.isMuted) {
            console.log('Chat is muted, skipping response:', msg.from);
            return;
        }

        // Rate limiting check
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

        // Check for admin commands first
        if (ADMIN_NUMBERS.includes(msg.from)) {
            console.log('Admin command check for:', msg.from);
            if (await handleAdminCommand(msg)) {
                console.log('Admin command handled successfully');
                return;
            }
        }

        // Process commands for both private and group chats
        if (command.startsWith('!') || 
            ['kapan praktikum?', 'nilai praktikum?', 'sesi praktikum?', 
             'bagaimana cara upload laporan?', 'siapa yang membuat kamu?', 
             'gimana saya mengontak anda?'].includes(command)) {
            
            console.log('Valid command detected:', command);
            
            try {
                let response = null;

                // Command processing with debug logging
                console.log('Determining response for command:', command);
                
                if (command === '!help' || command === '!bantuan') {
                    response = `Daftar perintah yang tersedia:
!jadwal - Informasi jadwal praktikum
!laporan - Cara upload laporan
!sesi - Informasi sesi praktikum
!nilai - Informasi nilai praktikum
!izin - Informasi izin tidak hadir praktikum
!asistensi - Informasi jadwal asistensi
!software - Link download software praktikum
!template - Link template laporan
!tugasakhir - Informasi tugas akhir`;
                }
                else if (command === '!izin') {
                    response = 'Silahkan izin jika berkendala hadir, dimohon segera hubungi saya';
                }
                else if (command === '!software') {
                    response = 'https://s.id/softwarepraktikum';
                }
                else if (command === '!template') {
                    response = 'https://s.id/templatebdX';
                }
                else if (command === '!asistensi') {
                    response = 'Untuk melihat jadwal asistensi gunakan command !asistensi1 sampai !asistensi7 sesuai dengan pertemuan yang ingin dilihat';
                }
                else if (command === '!tugasakhir') {
                    response = dynamicCommands.tugasakhir;
                }
                else if (command.startsWith('!asistensi') && /^!asistensi[1-7]$/.test(command)) {
                    response = dynamicCommands[command.substring(1)];
                }
                else if (command === '!jadwal' || command === 'kapan praktikum?') {
                    response = dynamicCommands.jadwal;
                }
                else if (command === '!nilai' || command === 'nilai praktikum?') {
                    response = dynamicCommands.nilai;
                }
                else if (command === '!sesi' || command === 'sesi praktikum?') {
                    response = 'Praktikum sesi satu : 15:15 - 16:05\nPraktikum sesi dua : 16:10 - 17:00\nPraktikum sesi tiga : 20:00 - 20:50';
                }
                else if (command === '!laporan' || command === 'bagaimana cara upload laporan?') {
                    response = 'Untuk mengupload laporan:\n1. ubah file word laporan menjadi pdf\n2. cek link upload laporan sesuai dengan pertemuan ke berapa command contoh !laporan1\n3. klik link upload laporan\n4. upload laporan\n5. Tunggu sampai kelar\nJANGAN SAMPAI MENGUMPULKAN LAPORAN TERLAMBAT -5%!!!';
                }
                else if (command.startsWith('!laporan') && /^!laporan[1-7]$/.test(command)) {
                    response = dynamicCommands[command.substring(1)];
                }
                else if (command === '!who made you' || command === 'siapa yang membuat kamu?') {
                    response = 'I have been made by @unlovdman atas izin allah\nSaya dibuat oleh @unlovdman atas izin allah';
                }
                else if (command === '!contact' || command === 'gimana saya mengontak anda?') {
                    response = 'you can visit my portofolio web app https://unlovdman.vercel.app/ for more information';
                }

                if (response) {
                    console.log('Preparing to send response for command:', command);
                    try {
                        await msg.reply(response);
                        console.log('Response sent successfully:', {
                            command: command,
                            responseLength: response.length
                        });
                    } catch (replyError) {
                        console.error('Error sending reply:', replyError);
                        // Try alternative send method
                        await chat.sendMessage(response);
                        console.log('Response sent via alternative method');
                    }
                } else {
                    console.log('No response generated for command:', command);
                }
            } catch (cmdError) {
                console.error('Error executing command:', cmdError);
                try {
                    await msg.reply('Maaf, terjadi kesalahan dalam memproses perintah. Silakan coba lagi.');
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        } else {
            console.log('Message not recognized as command:', command);
        }
    } catch (error) {
        console.error('Critical error in message handler:', error);
        try {
            await msg.reply('Maaf, terjadi kesalahan sistem. Silakan coba beberapa saat lagi.');
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
});

// Add more event listeners for debugging
client.on('message_ack', (msg, ack) => {
    console.log('Message acknowledgement:', {
        from: msg.from,
        to: msg.to,
        body: msg.body,
        ack: ack
    });
});

client.on('message_revoke_everyone', async (after, before) => {
    console.log('Message revoked:', {
        before: before ? before.body : null,
        after: after.body
    });
});

// Add state change logging
client.on('change_state', state => {
    console.log('Client state changed to:', state);
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
        console.log('Problematic state detected, attempting to reconnect...');
        handleReconnect();
    }
});

// Add connection state logging
client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
    botState.isReady = false;
    if (reason === 'NAVIGATION' || reason === 'TIMEOUT') {
        console.log('Disconnection due to navigation or timeout, attempting immediate reconnect...');
        handleReconnect();
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

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Initialize the client
async function initializeClient() {
    try {
        console.log('Starting WhatsApp client initialization...');
        
        // Ensure sessions directory exists
        const sessionsPath = './sessions';
        try {
            await fs.access(sessionsPath);
            console.log('Sessions directory exists');
        } catch (error) {
            console.log('Creating sessions directory...');
            await fs.mkdir(sessionsPath, { recursive: true });
        }

        // Ensure store directory exists
        const storePath = './sessions/.store';
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

// Update the startBot function
async function startBot() {
    try {
        // Check if sessions directory exists and has content
        const sessionsPath = './sessions';
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