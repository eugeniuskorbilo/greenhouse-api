const fs=require('fs');
const path=require('path');
const admin=require('firebase-admin');
const db=require('./db');
db.exec(`CREATE TABLE IF NOT EXISTS push_tokens(token TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`);
let ready=false;
const key=path.join(__dirname,'serviceAccountKey.json');
if(fs.existsSync(key)) {
  try {admin.initializeApp({credential:admin.credential.cert(require(key))});ready=true;console.log('FCM enabled');}
  catch(e){console.error('FCM init:',e.message);}
} else console.log('FCM disabled: add serviceAccountKey.json for real push delivery');
const previous=new Map();
function registerRoute(app){
  app.use(require('express').json());
  app.post('/api/v1/push/register',(req,res)=>{
    const token=req.body?.token;
    if(typeof token!=='string'||token.length<20||token.length>4096)return res.status(400).json({error:'Invalid token'});
    db.prepare('INSERT OR REPLACE INTO push_tokens(token,created_at) VALUES (?,?)').run(token,Date.now());
    res.json({ok:true,fcm_enabled:ready});
  });
}
async function checkThreshold(payload){
  if(payload.metric!=='soil_moisture')return;
  const key=payload.device_id;
  const last=previous.get(key);
  previous.set(key,payload.value);
  // Only transition from normal to below 30 triggers a push.
  if(last===undefined||last<30||payload.value>=30||!ready)return;
  const tokens=db.prepare('SELECT token FROM push_tokens').all().map(x=>x.token);
  if(!tokens.length)return;
  const message={notification:{title:'Низька вологість ґрунту',body:`${key}: ${payload.value.toFixed(1)} %`},data:{bed_id:key,device_id:key,metric:'soil_moisture'},tokens};
  try {
    const result=await admin.messaging().sendEachForMulticast(message);
    console.log('FCM sent:',result.successCount,'failed:',result.failureCount);
  }catch(e){console.error('FCM delivery:',e.message);}
}
module.exports={registerRoute,checkThreshold};
