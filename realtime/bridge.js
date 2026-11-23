const mqtt=require('mqtt');
const allowed=new Set(['temperature','humidity','soil_moisture','light']);
function startMqttBridge(io,db){
 const insert=db.prepare('INSERT INTO telemetry(device_id,metric,value,ts) VALUES (?,?,?,?)');
 const client=mqtt.connect(process.env.MQTT_URL||'mqtt://localhost:1883');
 client.on('connect',()=>client.subscribe('greenhouse/+/telemetry',{qos:1},err=>{
  if(err)console.error('MQTT subscribe:',err.message);else console.log('MQTT subscribed: greenhouse/+/telemetry');
 }));
 client.on('message',(topic,buffer)=>{
  try{
   const parts=topic.split('/');if(parts.length!==3||parts[0]!=='greenhouse'||parts[2]!=='telemetry'||!parts[1])return;
   const data=JSON.parse(buffer.toString('utf8'));
   if(!allowed.has(data.metric)||typeof data.value!=='number'||!Number.isFinite(data.value))throw Error('Invalid metric/value');
   const ts=data.ts==null?Date.now():data.ts;
   if(!Number.isSafeInteger(ts)||ts<0)throw Error('Invalid timestamp');
   const device_id=parts[1];
   insert.run(device_id,data.metric,data.value,ts);
   const payload={device_id,bed_id:device_id,metric:data.metric,value:data.value,ts};
   io.to(`greenhouse:${device_id}`).emit('telemetry:update',payload);
   console.log('MQTT -> SQLite -> Socket.IO:',device_id,data.metric,data.value,ts);
  }catch(err){console.error('Invalid MQTT payload:',err.message);}
 });
 client.on('error',err=>console.error('MQTT error:',err.message));
 return client;
}
module.exports={startMqttBridge};
