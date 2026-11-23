const mqtt=require('mqtt');
const client=mqtt.connect(process.env.MQTT_URL||'mqtt://localhost:1883');
const mode=process.argv[2]||'once';
const device=process.argv[3]||'bed-a';
const total=mode==='fast'?50:mode==='once'?3:20;
const delay=mode==='fast'?200:1000;
let count=0;let timer;
client.on('connect',()=>{
 console.log(`Publishing ${total} readings to greenhouse/${device}/telemetry every ${delay} ms`);
 timer=setInterval(()=>{
  const reading={metric:'soil_moisture',value:Math.round((24+Math.sin(count/3)*7+count%4)*10)/10,ts:Date.now()};
  client.publish(`greenhouse/${device}/telemetry`,JSON.stringify(reading),{qos:1},err=>{
   if(err)console.error(err.message);else console.log(device,reading.value,reading.ts);
  });
  if(++count>=total){clearInterval(timer);setTimeout(()=>client.end(),400);}
 },delay);
});
client.on('error',e=>{console.error(e.message);process.exitCode=1;});
