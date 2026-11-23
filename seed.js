const db=require('./db');
const insert=db.prepare('INSERT INTO telemetry(device_id,metric,value,ts) VALUES (?,?,?,?)');
const base=Date.UTC(2026,10,17,10,0,0);
const samples=[
 ['gh-01','soil_moisture',42,0],['gh-01','soil_moisture',29,5],
 ['gh-01','soil_moisture',27,10],['gh-01','soil_moisture',24,15],
 ['gh-01','soil_moisture',31,20],['gh-01','soil_moisture',28,25],
 ['gh-01','soil_moisture',26,30],['gh-01','soil_moisture',30,35],
 ['gh-01','soil_moisture',25,40],
 ['gh-01','temperature',24.3,0],['gh-01','temperature',24.5,5],
 ['gh-01','humidity',61.2,0],['gh-01','light',850,0],
 ['gh-02','temperature',23.1,0],['gh-02','humidity',65.0,0],
 ['gh-02','soil_moisture',39.2,0],['gh-02','light',920,0]
];
const transaction=db.transaction(()=>{
 db.prepare('DELETE FROM telemetry').run();
 for(const [device,metric,value,minutes] of samples)insert.run(device,metric,value,base+minutes*60000);
});
transaction();console.log(`Завантажено ${samples.length} тестових показань`);
