require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { startMqttBridge } = require('./realtime/bridge');
const db = require('./db');
const app = express();
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error('Set JWT_SECRET (at least 32 characters) in .env');
const jwt=require('jsonwebtoken');
const {authenticate}=require('./auth/middleware');
app.use(express.json());
app.get('/api/v1/health', (req, res) => {
  let sqlite = false;

  try {
    db.prepare('SELECT 1').get();
    sqlite = true;
  } catch (err) {
    console.error('SQLite health check:', err.message);
  }

  const mqtt = Boolean(
    globalThis.greenhouseMqttClient &&
    globalThis.greenhouseMqttClient.connected
  );

  const ok = sqlite && mqtt;

  res.status(ok ? 200 : 503).json({
    ok,
    sqlite: sqlite ? 'up' : 'down',
    mqtt: mqtt ? 'up' : 'down'
  });
});
app.use('/api/v1/auth',require('./auth/routes'));
app.use('/api/v1',authenticate);
app.use('/api/v1/devices',require('./thresholds'));
app.use('/api/v1/audit',require('./audit'));

const metrics = new Set(['temperature','humidity','soil_moisture','light']);
const bad = (res, message) => res.status(400).json({error:message});
const single = x => typeof x === 'string' && x.length > 0;
function numberParam(x, name, res, required=false) {
 if (x === undefined && !required) return undefined;
 if (!single(x) || !Number.isFinite(Number(x))) {bad(res, `Р СџР В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚ ${name} Р СР В°РЎвЂќ Р В±РЎС“РЎвЂљР С‘ РЎвЂЎР С‘РЎРѓР В»Р С•Р С`); return null;}
 return Number(x);
}
function validateBase(req,res,next) {
 const {device,metric,from,to} = req.query;
 if (!single(device) || !single(metric)) return bad(res,'Р СџР В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚Р С‘ device РЎвЂ“ metric Р С•Р В±Р С•Р Р†РІР‚в„ўРЎРЏР В·Р С”Р С•Р Р†РЎвЂ“');
 if (!metrics.has(metric)) return bad(res,'Р СњР ВµР Р†РЎвЂ“Р Т‘Р С•Р СР В° Р СР ВµРЎвЂљРЎР‚Р С‘Р С”Р В°');
 const f=numberParam(from,'from',res), t=numberParam(to,'to',res);
 if (f === null || t === null) return;
 if ((f !== undefined && (!Number.isSafeInteger(f)||f<0)) || (t !== undefined && (!Number.isSafeInteger(t)||t<0))) return bad(res,'from/to Р СР В°РЎР‹РЎвЂљРЎРЉ Р В±РЎС“РЎвЂљР С‘ Р Р…Р ВµР Р†РЎвЂ“Р Т‘РІР‚в„ўРЎвЂќР СР Р…Р С‘Р СР С‘ РЎвЂ РЎвЂ“Р В»Р С‘Р СР С‘ Р СРЎвЂ“Р В»РЎвЂ“РЎРѓР ВµР С”РЎС“Р Р…Р Т‘Р В°Р СР С‘');
 if (f !== undefined && t !== undefined && f>t) return bad(res,'from Р Р…Р Вµ Р СР С•Р В¶Р Вµ Р С—Р ВµРЎР‚Р ВµР Р†Р С‘РЎвЂ°РЎС“Р Р†Р В°РЎвЂљР С‘ to');
 req.range={from:f,to:t}; next();
}
function ensureDevice(req,res,next) {
 if (!db.prepare('SELECT 1 FROM telemetry WHERE device_id=? LIMIT 1').get(req.query.device)) return res.status(404).json({error:`Р СџРЎР‚Р С‘РЎРѓРЎвЂљРЎР‚РЎвЂ“Р в„– "${req.query.device}" Р Р…Р Вµ Р В·Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С•`});
 next();
}
function filters(req) {
 const clauses=['device_id=?','metric=?'];
 const args=[req.query.device,req.query.metric];
 if (req.range.from !== undefined) {clauses.push('ts>=?');args.push(req.range.from);}
 if (req.range.to !== undefined) {clauses.push('ts<=?');args.push(req.range.to);}
 return {where:clauses.join(' AND '),args};
}
// Р РЋ6: Р СРЎвЂ“Р Р…РЎвЂ“Р СРЎвЂ“Р В·Р В°РЎвЂ РЎвЂ“РЎРЏ Р Т‘Р В°Р Р…Р С‘РЎвЂ¦ РІР‚вЂќ Р В»Р С‘РЎв‚¬Р Вµ id, name, zone; Р В±Р ВµР В· Р Р†Р Р…РЎС“РЎвЂљРЎР‚РЎвЂ“РЎв‚¬Р Р…РЎвЂ“РЎвЂ¦ Р С—Р С•Р В»РЎвЂ“Р Р†.
app.get('/api/v1/devices',(req,res)=>res.json(
 db.prepare('SELECT DISTINCT device_id FROM telemetry ORDER BY device_id').all()
   .map(({device_id})=>({id:device_id,name:device_id,zone:device_id}))
));
app.get('/api/v1/telemetry',validateBase,ensureDevice,(req,res)=>{
 const {device,metric,agg,interval,cursor,limit}=req.query;
 const {where,args}=filters(req);
 if (agg !== undefined || interval !== undefined) {
  if (agg !== 'avg' || interval !== '1h' || metric !== 'soil_moisture') return bad(res,'Р СџРЎвЂ“Р Т‘РЎвЂљРЎР‚Р С‘Р СРЎС“РЎвЂќРЎвЂљРЎРЉРЎРѓРЎРЏ Р В»Р С‘РЎв‚¬Р Вµ agg=avg&interval=1h Р Т‘Р В»РЎРЏ soil_moisture');
  if (cursor !== undefined || limit !== undefined) return bad(res,'Р С’Р С–РЎР‚Р ВµР С–Р В°РЎвЂ РЎвЂ“РЎР‹ РЎвЂљР В° Р С—Р В°Р С–РЎвЂ“Р Р…Р В°РЎвЂ РЎвЂ“РЎР‹ Р Р…Р Вµ Р СР С•Р В¶Р Р…Р В° Р С—Р С•РЎвЂќР Т‘Р Р…РЎС“Р Р†Р В°РЎвЂљР С‘');
  const buckets=db.prepare(`SELECT (CAST(ts / 3600000 AS INTEGER)*3600000) AS bucket_start, ROUND(AVG(value),3) AS avg, COUNT(*) AS count FROM telemetry WHERE ${where} GROUP BY bucket_start ORDER BY bucket_start ASC`).all(...args);
  return res.json({device,metric,interval,buckets});
 }
 let pageLimit=500;
 if (limit !== undefined) {
  const n=numberParam(limit,'limit',res,true);if(n===null)return;
  if(!Number.isSafeInteger(n)||n<1||n>1000)return bad(res,'limit Р СР В°РЎвЂќ Р В±РЎС“РЎвЂљР С‘ РЎвЂ РЎвЂ“Р В»Р С‘Р С РЎвЂЎР С‘РЎРѓР В»Р С•Р С Р Р†РЎвЂ“Р Т‘ 1 Р Т‘Р С• 1000');
  pageLimit=n;
 }
 let cursorTs,cursorId;
 if(cursor !== undefined) {
  if (!single(cursor)) return bad(res,'Р СњР ВµР С”Р С•РЎР‚Р ВµР С”РЎвЂљР Р…Р С‘Р в„– cursor');
  const parts=cursor.split(':');
  if(parts.length!==2 || !parts.every(p=>/^\d+$/.test(p)))return bad(res,'cursor Р СР В°РЎвЂќ РЎвЂћР С•РЎР‚Р СР В°РЎвЂљ ts:id');
  [cursorTs,cursorId]=parts.map(Number);
  if(!Number.isSafeInteger(cursorTs)||!Number.isSafeInteger(cursorId))return bad(res,'Р СњР ВµР С”Р С•РЎР‚Р ВµР С”РЎвЂљР Р…Р С‘Р в„– cursor');
 }
 const clauses=[where],values=[...args];
 if(cursorTs!==undefined){clauses.push('(ts > ? OR (ts = ? AND id > ?))');values.push(cursorTs,cursorTs,cursorId);}
 const rows=db.prepare(`SELECT id,ts,value FROM telemetry WHERE ${clauses.join(' AND ')} ORDER BY ts ASC,id ASC LIMIT ?`).all(...values,pageLimit+1);
 const hasMore=rows.length>pageLimit;
 const shown=rows.slice(0,pageLimit);
 const last=shown.at(-1);
 res.json({device,metric,points:shown.map(({ts,value})=>({ts,value})),next_cursor:hasMore?`${last.ts}:${last.id}`:null});
});
app.get('/api/v1/alerts',validateBase,ensureDevice,(req,res)=>{
 const {device,metric,threshold}=req.query;
 if(metric!=='soil_moisture')return bad(res,'alerts Р С—РЎвЂ“Р Т‘РЎвЂљРЎР‚Р С‘Р СРЎС“РЎвЂќ Р В»Р С‘РЎв‚¬Р Вµ soil_moisture');
 const level=numberParam(threshold,'threshold',res,true);
 if(level===null)return;
 if(level<0||level>100)return bad(res,'threshold Р СР В°РЎвЂќ Р В±РЎС“РЎвЂљР С‘ Р Р†РЎвЂ“Р Т‘ 0 Р Т‘Р С• 100');
 const {where,args}=filters(req);
 const rows=db.prepare(`SELECT ts,value FROM telemetry WHERE ${where} ORDER BY ts,id`).all(...args);
 const periods=[];let current=null;
 for(const row of rows){
  if(row.value<level){
   if(!current)current={start:row.ts,end:null,duration_min:null,min_value:row.value};
   else current.min_value=Math.min(current.min_value,row.value);
  }else if(current){
   current.end=row.ts;
   current.duration_min=Math.round((row.ts-current.start)/60000);
   periods.push(current);current=null;
  }
 }
 if(current)periods.push(current);
 res.json({device,metric,threshold:level,periods});
});
app.get('/metrics', (req,res) => {
  const count = globalThis.greenhouseIo?.engine?.clientsCount ?? 0;
  res.type('text/plain').send(`greenhouse_subscribers ${count}` + '\n');
});
app.use((req,res)=>res.status(404).json({error:'Р СљР В°РЎР‚РЎв‚¬РЎР‚РЎС“РЎвЂљ Р Р…Р Вµ Р В·Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С•'}));
if(require.main===module){
 const port=Number(process.env.PORT)||4000;
 const httpServer=http.createServer(app);
 const io=new Server(httpServer,{cors:{origin:['http://localhost:5173','http://127.0.0.1:5173']}});
 io.use((socket,next)=>{
  const token=socket.handshake.auth?.token;
  if(!token)return next(new Error('missing_token'));
  try{socket.data.user=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});next();}
  catch(e){next(new Error(e.name==='TokenExpiredError'?'token_expired':'invalid_token'));}
 });
 io.on('connection',socket=>{
  const ms=Math.max(0,socket.data.user.exp*1000-Date.now());
  const timer=setTimeout(()=>socket.disconnect(true),ms);
  socket.on('disconnect',()=>clearTimeout(timer));
  socket.on('bed:subscribe',(bed,ack)=>{
   if(typeof bed!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(bed)) {if(typeof ack==='function')ack({ok:false,error:'Invalid bed'});return;}
   for(const room of socket.rooms)if(room.startsWith('greenhouse:'))socket.leave(room);
   socket.join(`greenhouse:${bed}`);
   if(typeof ack==='function')ack({ok:true,bed});
  });
 });
 
globalThis.greenhouseIo=io; const bridge=startMqttBridge(io,db); globalThis.greenhouseMqttClient=bridge;
 httpServer.listen(port,()=>console.log(`API + Socket.IO: http://localhost:${port}`));
 const shutdown=()=>{bridge.end(true);io.close();httpServer.close(()=>process.exit(0));};
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
module.exports=app;

