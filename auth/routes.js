const express=require('express');const bcrypt=require('bcryptjs');const db=require('../db');const {issueTokens,sha256}=require('./tokens');
// С6: обмеження невдалих входів за IP (демонстраційний in-memory limiter).
const failedLogins = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
function loginLimiter(req, res, next) {
 const key = req.ip;
 const now = Date.now();
 const entry = failedLogins.get(key);
 if (entry && now - entry.started < WINDOW_MS && entry.count >= MAX_FAILURES) {
  return res.status(429).json({error:'too_many_attempts'});
 }
 if (entry && now - entry.started >= WINDOW_MS) failedLogins.delete(key);
 req.loginRateKey = key;
 next();
}
function registerFailure(req) {
 const key = req.loginRateKey;
 const now = Date.now();
 const entry = failedLogins.get(key);
 if (!entry || now - entry.started >= WINDOW_MS) failedLogins.set(key,{started:now,count:1});
 else entry.count++;
}
const router=express.Router();const DUMMY=bcrypt.hashSync('not-a-real-password',10);
router.post('/login',loginLimiter,async(req,res,next)=>{try{
 const {username,password}=req.body||{};if(typeof username!=='string'||typeof password!=='string')return res.status(400).json({error:'invalid_request'});
 const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
 const ok=await bcrypt.compare(password,user?.password_hash||DUMMY);
 if(!user||!ok){registerFailure(req);return res.status(401).json({error:'invalid_credentials'});}
 res.json({...issueTokens(user),role:user.role,username:user.username});
}catch(e){next(e)}});
router.post('/refresh',(req,res,next)=>{try{
 const {refreshToken}=req.body||{};if(typeof refreshToken!=='string')return res.status(400).json({error:'invalid_request'});
 const rotate=db.transaction(()=>{
 const row=db.prepare('SELECT * FROM refresh_tokens WHERE token_hash=?').get(sha256(refreshToken));
 if(!row||row.revoked||row.expires_at<=Date.now())return null;
 const result=db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE id=? AND revoked=0').run(row.id);
 if(!result.changes)return null;
 const user=db.prepare('SELECT id,username,role FROM users WHERE id=?').get(row.user_id);
 return user?{...issueTokens(user),role:user.role,username:user.username}:null;
 });const tokens=rotate();if(!tokens)return res.status(401).json({error:'invalid_refresh_token'});res.json(tokens);
}catch(e){next(e)}});
module.exports=router;
