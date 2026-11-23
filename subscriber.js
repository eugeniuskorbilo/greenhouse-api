const mqtt = require('mqtt');
const db = require('./db');
const allowed = new Set(['temperature', 'humidity', 'soil_moisture', 'light']);
const insert = db.prepare('INSERT INTO telemetry(device_id,metric,value,ts) VALUES (?,?,?,?)');
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883');
client.on('connect', () => client.subscribe('greenhouse/+/telemetry', {qos:1}, err => {
 if (err) console.error('Помилка підписки:', err.message);
 else console.log('Підписано на greenhouse/+/telemetry');
}));
client.on('message', (topic, payload) => {
 try {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'greenhouse' || !parts[1] || parts[2] !== 'telemetry') return;
  const data = JSON.parse(payload.toString());
  if (!allowed.has(data.metric) || typeof data.value !== 'number' || !Number.isFinite(data.value)) throw Error('Некоректна метрика або значення');
  const ts = data.ts == null ? Date.now() : data.ts;
  if (!Number.isSafeInteger(ts) || ts < 0) throw Error('Некоректний ts');
  insert.run(parts[1], data.metric, data.value, ts);
  console.log('Збережено:', parts[1], data.metric, data.value, ts);
 } catch (err) {console.error('Помилка телеметрії:', err.message);}
});
client.on('error', err => console.error('MQTT:', err.message));
