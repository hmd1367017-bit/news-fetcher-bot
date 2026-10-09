const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// একটি লোকাল ডাটাবেজ ফাইল তৈরি হবে (warnings.db)
const dbPath = path.resolve(__dirname, 'warnings.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// ইউজারের ওয়ার্নিং টেবিল তৈরি করা (যদি আগে থেকে না থাকে)
db.run(`CREATE TABLE IF NOT EXISTS warnings (
  userId TEXT PRIMARY KEY,
  username TEXT,
  count INTEGER DEFAULT 0
)`);

// চ্যাট হিস্ট্রি সেভ করার জন্য নতুন টেবিল তৈরি (বট যেন পুরনো কথা মনে রাখতে পারে)
db.run(`CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ওয়ার্নিং কাউন্ট বাড়ানোর ফাংশন
function addWarning(userId, username, callback) {
  db.get(`SELECT count FROM warnings WHERE userId = ?`, [userId], (err, row) => {
    if (err) {
      return callback(err);
    }
    
    let currentCount = row ? row.count : 0;
    let newCount = currentCount + 1;

    db.run(`INSERT INTO warnings (userId, username, count) VALUES (?, ?, ?) 
            ON CONFLICT(userId) DO UPDATE SET count = ?, username = ?`,
      [userId, username, newCount, newCount, username],
      (err) => {
        callback(err, newCount);
      }
    );
  });
}

// ইউজারের বর্তমান ওয়ার্নিং দেখার ফাংশন
function getWarnings(userId, callback) {
  db.get(`SELECT count FROM warnings WHERE userId = ?`, [userId], (err, row) => {
    if (err) return callback(err, 0);
    callback(null, row ? row.count : 0);
  });
}

// ওয়ার্নিং রিসেট বা ক্লিয়ার করার ফাংশন
function clearWarnings(userId, callback) {
  db.run(`DELETE FROM warnings WHERE userId = ?`, [userId], callback);
}

// --- নতুন যোগ করা ফাংশনসমূহ (মেমোরি বা চ্যাট হিস্ট্রির জন্য) ---

// ইউজারের মেসেজ বা বটের উত্তর ডাটাবেসে সেভ করার ফাংশন
function saveMessage(userId, role, content, callback) {
    const query = `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`;
    db.run(query, [userId, role, content], (err) => {
        if (err) {
            console.error('Error saving message:', err.message);
        }
        if (callback) callback(err);
    });
}

// ইউজারের আগের সব চ্যাট হিস্ট্রি রিড করার ফাংশন
function getChatHistory(userId, callback) {
    const query = `SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id ASC`;
    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching history:', err.message);
            callback([]);
        } else {
            callback(rows);
        }
    });
}

module.exports = { 
    addWarning, 
    getWarnings, 
    clearWarnings, 
    saveMessage, 
    getChatHistory 
};
