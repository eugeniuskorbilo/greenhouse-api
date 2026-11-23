const express=require('express');const db=require('./db');const {requireRole}=require('./auth/middleware');const router=express.Router();
db.exec(`CREATE TABLE IF NOT EXISTS thresholds(device_id TEXT NOT NULL,metric TEXT NOT NULL,value REAL NOT NULL,updated_by INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(device_id,metric));CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,old_value TEXT,new_value TEXT,ts TEXT NOT NULL)`);
router.put('/:id/threshold',requireRole('agronomist'),(req,res,next)=>{try{
 const {metric,value}=req.body||{};if(metric!=='soil_moisture'||typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)return res.status(400).json({error:'invalid_threshold'});
 const device=req.params.id;if(!/^[a-zA-Z0-9_-]{1,64}$/.test(device))return res.status(400).json({error:'invalid_device'});
 db.transaction(()=>{
 const old=db.prepare('SELECT value FROM thresholds WHERE device_id=? AND metric=?').get(device,metric);
 db.prepare(`INSERT INTO thresholds(device_id,metric,value,updated_by,updated_at) VALUES(?,?,?,?,datetime('now')) ON CONFLICT(device_id,metric) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(device,metric,value,Number(req.user.sub));
 db.prepare(`INSERT INTO audit_log(user_id,action,target,old_value,new_value,ts) VALUES(?,?,?,?,?,datetime('now'))`).run(Number(req.user.sub),'threshold:update',device,JSON.stringify(old?.value??null),JSON.stringify(value));
 })();res.json({device,metric,value});
}catch(e){next(e)}});
router.get('/:id/threshold',(req,res)=>res.json(db.prepare('SELECT metric,value,updated_at FROM thresholds WHERE device_id=?').all(req.params.id)));
module.exports=router;
