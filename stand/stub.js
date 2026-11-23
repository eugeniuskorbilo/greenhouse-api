const express=require('express');
const app=express();app.use(express.json());
const mode={fail:0,delay:0},commands=new Map(),byKey=new Map();let version=1;
app.post('/__stub/mode',(req,res)=>{Object.assign(mode,{fail:0,delay:0},req.body);res.json(mode)});
app.use('/api/v1',async(req,res,next)=>{
  if(mode.delay)await new Promise(r=>setTimeout(r,mode.delay));
  if(mode.fail)return res.status(mode.fail).json({error:'simulated'});
  next();
});
app.get('/api/v1/health',(req,res)=>res.json({ok:true}));
app.put('/api/v1/devices/:id/threshold',(req,res)=>{
  const v=req.body?.soilMoistureMin;
  if(!Number.isInteger(v)||v<10||v>60)return res.status(422).json({error:'soilMoistureMin: 10..60'});
  res.json({deviceId:req.params.id,soilMoistureMin:v,version:++version});
});
app.post('/api/v1/devices/:id/commands',(req,res)=>{
  const key=req.get('Idempotency-Key');
  if(!key)return res.status(400).json({error:'Idempotency-Key required'});
  if(byKey.has(key))return res.status(200).json({commandId:byKey.get(key),replayed:true});
  const commandId='c'+(commands.size+1);
  commands.set(commandId,{status:'accepted',at:Date.now()});byKey.set(key,commandId);
  console.log('COMMAND',commandId,JSON.stringify(req.body));
  res.status(202).json({commandId,status:'accepted'});
});
app.get('/api/v1/commands/:cid',(req,res)=>{
  const c=commands.get(req.params.cid);
  if(!c)return res.status(404).json({error:'not found'});
  if(Date.now()-c.at>2000)c.status='acknowledged';
  res.json({commandId:req.params.cid,status:c.status});
});
app.listen(3000,'0.0.0.0',()=>console.log('stub on :3000'));
