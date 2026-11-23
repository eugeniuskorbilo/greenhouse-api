const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || 'telemetry.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS telemetry (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 device_id TEXT NOT NULL,
 metric TEXT NOT NULL,
 value REAL NOT NULL,
 ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_lookup ON telemetry(device_id, metric, ts, id);
`);
module.exports = db;

