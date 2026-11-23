const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const db=require('../db');
db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)`);
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
function issueTokens(user){
 const accessToken=jwt.sign({sub:String(user.id),role:user.role},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:process.env.ACCESS_TTL||'15m'});
 const {iat,exp}=jwt.decode(accessToken);const refreshToken=crypto.randomBytes(32).toString('hex');
 db.prepare('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)').run(user.id,sha256(refreshToken),Date.now()+Number(process.env.REFRESH_TTL_DAYS||7)*86400000);
 return {accessToken,refreshToken,tokenType:'Bearer',expiresIn:exp-iat};
}
module.exports={issueTokens,sha256};
