// Historical demonstration data for testing 7-day chart and LTTB.
// Not a claim that real sensors produced these readings.
const db=require('../db');const insert=db.prepare('INSERT INTO telemetry(device_id,metric,value,ts) VALUES (?,?,?,?)');
const exists=db.prepare('SELECT COUNT(*) AS n FROM telemetry WHERE device_id=? AND metric=?');
const now=Date.now();const step=60000;const total=10080;
const seed=db.transaction(()=>{
 for(const device of ['bed-a','bed-b']){
  for(const metric of ['soil_moisture','temperature','humidity','light']){
   if(exists.get(device,metric).n){console.log('Already present, skipped',device,metric);continue;}
   const n=metric==='soil_moisture'?total:1440;
   for(let i=0;i<n;i++){
    const t=now-(n-i)*step;
    const wave=Math.sin(i/30)+.35*Math.sin(i/7);
    let value=metric==='soil_moisture'?38+11*wave:metric==='temperature'?27+5*wave:metric==='humidity'?57+13*wave:11000+4200*wave;
    if(metric==='soil_moisture'&&i===Math.floor(n*.63))value=12.5;
    insert.run(device,metric,Math.round(value*10)/10,t);
   }
   console.log('Seeded',device,metric,n);
  }
 }
});seed();db.close();
