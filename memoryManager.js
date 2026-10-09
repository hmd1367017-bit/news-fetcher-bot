const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const readline = require('readline');

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function getAccessToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) {
                    console.error('Error retrieving access token', err);
                    return reject(err);
                }
                oAuth2Client.setCredentials(token);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
                console.log('Token stored to', TOKEN_PATH);
                resolve(oAuth2Client);
            });
        });
    });
}

// ডিসকর্ড ক্লায়েন্ট এবং লগ চ্যানেল ইনস্ট্যান্স গ্লোবালি রাখার জন্য
let discordClientInstance = null;
let logChannelId = null;

// ডিসকর্ড চ্যানেলে লগ পাঠানোর হেল্পার ফাংশন
async function sendDiscordLog(message) {
    if (!discordClientInstance || !logChannelId) return;
    try {
        const channel = await discordClientInstance.channels.fetch(logChannelId);
        if (channel) {
            await channel.send(message);
        }
    } catch (error) {
        console.error('Failed to send log to Discord channel:', error);
    }
}

// গুগল ড্রাইভ থেকে ডাটাবেস রিস্টোর (ডাউনলোড) করার ফাংশন
async function restoreBackupFromDrive() {
    console.log("Checking for existing backup on Google Drive to restore...");
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            console.log("Credentials file not found, skipping restore.");
            await sendDiscordLog("⚠️ **Google Drive Restore Skipped:** Credentials file not found.");
            return;
        }

        const content = fs.readFileSync(CREDENTIALS_PATH);
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        if (fs.existsSync(TOKEN_PATH)) {
            const token = fs.readFileSync(TOKEN_PATH);
            oAuth2Client.setCredentials(JSON.parse(token));
        } else {
            await getAccessToken(oAuth2Client);
        }

        const driveService = google.drive({ version: 'v3', auth: oAuth2Client });

        // ড্রাইভ ফোল্ডার থেকে 'chat_history_backup.db' ফাইলটি খোঁজা
        const res = await driveService.files.list({
            q: "name = 'chat_history_backup.db' and trashed = false",
            fields: 'files(id, name)',
        });

        const files = res.data.files;
        if (files && files.length > 0) {
            const fileId = files[0].id;
            console.log(`Found backup file on Google Drive (ID: ${fileId}). Downloading...`);

            const destPath = path.resolve(__dirname, 'chat_history.db');
            const dest = fs.createWriteStream(destPath);

            const fileStream = await driveService.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            await new Promise((resolve, reject) => {
                fileStream.data
                    .on('end', async () => {
                        console.log('✅ Database successfully restored from Google Drive!');
                        await sendDiscordLog(`✅ **Google Drive Restore Successful!**\nPrevious chat history database restored from Drive. File ID: \`${fileId}\``);
                        resolve();
                    })
                    .on('error', async err => {
                        console.error('Error downloading file:', err);
                        await sendDiscordLog(`❌ **Google Drive Restore Failed!**\nError during stream download: \`${err.message}\``);
                        reject(err);
                    })
                    .pipe(dest);
            });
        } else {
            console.log('No backup file found on Google Drive.');
            await sendDiscordLog("ℹ️ **Google Drive Restore Notice:** No existing backup file found on Google Drive.");
        }
    } catch (error) {
        const errorMsg = `❌ **Google Drive Restore Failed!**\nError: \`${error.message}\``;
        console.error(errorMsg);
        await sendDiscordLog(errorMsg);
    }
}

// ১. SQLite ডাটাবেজ সেটআপ ও ইনিশিয়ালাইজেশন ফাংশন
let db = null;
const userMemory = new Map();
const MAX_MEMORY_LIMIT = 20; 
let hasNewData = false;

async function initDatabase() {
    const dbPath = path.resolve(__dirname, 'chat_history.db');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('Database connection error:', err.message);
        else console.log('Connected to the SQLite database.');
    });

    // ডাটাবেজ টেবিল তৈরি
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// ডিসকর্ড ক্লায়েন্ট এবং লগ চ্যানেল সেট করার ফাংশন
async function initMemoryLogger(client, channelId) {
    discordClientInstance = client;
    logChannelId = channelId;
    
    // ডিসকর্ড ক্লায়েন্ট ও লগ চ্যানেল সেট হওয়ার পরেই ড্রাইভ রিস্টোর কল করা হবে 
    // যাতে লগ মেসেজগুলো সরাসরি চ্যানেলে পাঠাতে পারে।
    await initDatabase();
    await restoreBackupFromDrive();
    await loadMemoryFromDatabase();
}

// ইউজারের মেমোরি থেকে বর্তমান চ্যাট হিস্ট্রি নেওয়ার নিখুঁত ফাংশন
function getUserMemory(userId) {
    if (!userMemory.has(userId)) {
        userMemory.set(userId, []);
    }
    return userMemory.get(userId);
}

// ইউজারের মেমোরি আপডেট বা সেভ করার ফাংশন
function saveUserMemory(userId, history) {
    if (history.length > MAX_MEMORY_LIMIT) {
        const oldestMessage = history.shift(); 
        
        if (db) {
            const query = `INSERT INTO messages (user_id, username, message) VALUES (?, ?, ?)`;
            db.run(query, [userId, oldestMessage.username || "User", oldestMessage.content || oldestMessage.message], (err) => {
                if (err) {
                    console.error('Error saving old message to DB:', err.message);
                } else {
                    hasNewData = true; 
                }
            });
        }
    }
    userMemory.set(userId, history);
}

// ২. গুগল ড্রাইভে ব্যাকআপ পাঠানোর ফাংশন (OAuth 2.0)
async function uploadBackupToDrive() {
    console.log("Background check: Checking for new data to backup...");
    
    if (!hasNewData) {
        console.log('No new data to backup.');
        return;
    }

    try {
        const content = fs.readFileSync(CREDENTIALS_PATH);
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        if (fs.existsSync(TOKEN_PATH)) {
            const token = fs.readFileSync(TOKEN_PATH);
            oAuth2Client.setCredentials(JSON.parse(token));
        } else {
            await getAccessToken(oAuth2Client);
        }

        const driveService = google.drive({ version: 'v3', auth: oAuth2Client });
        const filePath = path.resolve(__dirname, 'chat_history.db');

        const res = await driveService.files.list({
            q: "name = 'chat_history_backup.db' and trashed = false",
            fields: 'files(id, name)',
        });

        const files = res.data.files;
        let fileId = null;

        const media = {
            mimeType: 'application/octet-stream',
            body: fs.createReadStream(filePath),
        };

        if (files && files.length > 0) {
            fileId = files[0].id;
            await driveService.files.update({
                fileId: fileId,
                media: media,
            });
        } else {
            const fileMetadata = {
                name: 'chat_history_backup.db',
                parents: ['1CxIob1_xahmrw_JEwjWZfoDYefI0C6x7']
            };
            const response = await driveService.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id',
            });
            fileId = response.data.id;
        }
        
        const successMsg = `✅ **Google Drive Backup Successful!**\nNew chat data found and database file uploaded. File ID: \`${fileId}\``;
        console.log(successMsg);
        await sendDiscordLog(successMsg);
        
        hasNewData = false; 
    } catch (error) {
        const errorMsg = `❌ **Google Drive Backup Failed!**\nError: \`${error.message}\``;
        console.error(errorMsg);
        await sendDiscordLog(errorMsg);
    }
}

// ডাটাবেজ থেকে পুরনো চ্যাটগুলো মেমরিতে (userMemory) লোড করার ফাংশন
async function loadMemoryFromDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        
        db.all(`SELECT user_id, username, message FROM messages ORDER BY id ASC`, [], (err, rows) => {
            if (err) {
                console.error('Error loading memory from DB:', err.message);
                return reject(err);
            }
            
            // ডাটাবেজের মেসেজগুলো ইউজারের আইডি অনুযায়ী মেমরিতে সাজিয়ে নেওয়া
            rows.forEach(row => {
                if (!userMemory.has(row.user_id)) {
                    userMemory.set(row.user_id, []);
                }
                const history = userMemory.get(row.user_id);
                history.push({ role: 'user', content: row.message, username: row.username });
                
                // মেমোরি লিমিট বজায় রাখা
                if (history.length > MAX_MEMORY_LIMIT) {
                    history.shift();
                }
            });
            
            console.log('✅ Previous chat memories successfully loaded into RAM (userMemory)!');
            resolve();
        });
    });
}

// ৩. প্রতি ৩ মিনিট পর পর চেক করবে
setInterval(() => {
    uploadBackupToDrive();
}, 3 * 60 * 1000);

module.exports = { getUserMemory, saveUserMemory, initMemoryLogger };
