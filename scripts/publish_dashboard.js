const mqtt=require('mqtt');
const device=process.argv[2]||'bed-a';const mode=process.argv[3]||'once';
const count=mode==='fast'?50:mode==='loop'?Infinity:12;const delay=mode==='fast'?200:1000;
const client=mqtt.connect(process.env.MQTT_URL||'mqtt://localhost:1883');let n=0;
client.on('connect',()=>{
 console.log(`Dashboard telemetry -> ${device}; ${mode}; interval ${delay}ms`);
 const timer=setInterval(()=>{
  const wave=Math.sin(n/4),samples={temperature:Math.round((30+wave*5)*10)/10,humidity:Math.round(58+wave*12),soil_moisture:Math.round((34+wave*12)*10)/10,light:Math.round(12000+wave*5000)};
  const ts=Date.now();
  for(const [metric,value]of Object.entries(samples))client.publish(`greenhouse/${device}/telemetry`,JSON.stringify({metric,value,ts}),{qos:1});
  console.log(n+1,samples);n++;
  if(n>=count){clearInterval(timer);setTimeout(()=>client.end(),400);}
 },delay);
});
client.on('error',err=>console.error(err.message));
