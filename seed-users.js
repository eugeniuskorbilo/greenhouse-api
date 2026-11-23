require('dotenv').config();const bcrypt=require('bcryptjs');const db=require('./db');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('agronomist','viewer')))`);
const ins=db.prepare('INSERT OR IGNORE INTO users(username,password_hash,role) VALUES(?,?,?)');
ins.run('agro1',bcrypt.hashSync('Agro#2026',10),'agronomist');ins.run('viewer1',bcrypt.hashSync('View#2026',10),'viewer');
console.log(db.prepare('SELECT id,username,role FROM users').all());
