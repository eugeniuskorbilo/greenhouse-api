
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const Database = require('better-sqlite3');
const mqtt = require('mqtt');
const jwt = require('jsonwebtoken');
const { Aedes } = require('aedes');

const { startMqttBridge } = require('./realtime/bridge');

const TEST_SECRET =
  'pr7-integration-test-secret-at-least-32-characters';

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, timeout = 3000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (check()) return;
    await delay(20);
  }

  throw new Error('Timeout: telemetry was not saved');
}

function waitForSubscription(broker, topic, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      broker.off('subscribe', onSubscribe);
      reject(new Error('MQTT subscription timeout'));
    }, timeout);

    function onSubscribe(subscriptions) {
      if (subscriptions.some(item => item.topic === topic)) {
        clearTimeout(timer);
        broker.off('subscribe', onSubscribe);
        resolve();
      }
    }

    broker.on('subscribe', onSubscribe);
  });
}

function closeMqttClient(client) {
  return new Promise(resolve => {
    if (!client) return resolve();

    const timer = setTimeout(resolve, 2000);

    try {
      client.end(true, () => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function closeServer(server) {
  return new Promise(resolve => {
    if (!server || !server.listening) return resolve();

    const timer = setTimeout(resolve, 2000);

    try {
      server.closeAllConnections?.();

      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function closeBroker(broker) {
  return new Promise(resolve => {
    if (!broker) return resolve();

    const timer = setTimeout(resolve, 2000);

    try {
      broker.close(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

test(
  'ПР7: MQTT -> SQLite -> REST',
  { timeout: 15000 },
  async t => {

    let db = null;
    let broker = null;
    let mqttServer = null;
    let subscriber = null;
    let publisher = null;
    let api = null;

    const oldMqttUrl = process.env.MQTT_URL;
    const oldSecret = process.env.JWT_SECRET;

    // Єдиний блок очищення ресурсів.
    // Порядок важливий: клієнти -> сервери -> брокер -> БД.
    t.after(async () => {
      console.log('ПР7: завершення з’єднань...');

      await closeMqttClient(publisher);
      await closeMqttClient(subscriber);

      await closeServer(api);
      await closeServer(mqttServer);
      await closeBroker(broker);

      if (db && db.open) {
        db.close();
      }

      if (oldMqttUrl === undefined) {
        delete process.env.MQTT_URL;
      } else {
        process.env.MQTT_URL = oldMqttUrl;
      }

      if (oldSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = oldSecret;
      }

      console.log('ПР7: ресурси закрито');
    });

    // 1. SQLite в оперативній пам'яті
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        ts INTEGER NOT NULL
      );

      CREATE INDEX idx_telemetry_lookup
      ON telemetry(device_id, metric, ts, id);
    `);

    // 2. Локальний MQTT-брокер
    broker = await Aedes.createBroker();

    mqttServer = net.createServer(socket => {
      broker.handle(socket);
    });

    await new Promise((resolve, reject) => {
      mqttServer.once('error', reject);
      mqttServer.listen(0, '127.0.0.1', resolve);
    });

    const mqttPort = mqttServer.address().port;
    const mqttUrl = `mqtt://127.0.0.1:${mqttPort}`;

    console.log('Aedes started:', mqttUrl);

    // 3. MQTT bridge
    process.env.MQTT_URL = mqttUrl;

    const io = {
      to: () => ({
        emit: () => {}
      })
    };

    const subscriptionReady = waitForSubscription(
      broker,
      'greenhouse/+/telemetry'
    );

    subscriber = startMqttBridge(io, db);

    await subscriptionReady;

    console.log('MQTT subscription: PASS');

    // 4. MQTT publisher
    publisher = mqtt.connect(mqttUrl, {
      connectTimeout: 2500,
      reconnectPeriod: 0
    });

    await new Promise((resolve, reject) => {
      publisher.once('connect', resolve);
      publisher.once('error', reject);
    });

    const timestamp = 1795000000000;

    await new Promise((resolve, reject) => {
      publisher.publish(
        'greenhouse/bed-test/telemetry',
        JSON.stringify({
          metric: 'soil_moisture',
          value: 27.5,
          ts: timestamp
        }),
        { qos: 1 },
        error => error ? reject(error) : resolve()
      );
    });

    // 5. MQTT -> SQLite
    await waitFor(() => {
      const row = db.prepare(
        'SELECT COUNT(*) AS total FROM telemetry'
      ).get();

      return row.total === 1;
    });

    const saved = db.prepare(`
      SELECT device_id, metric, value, ts
      FROM telemetry
      WHERE device_id = ?
    `).get('bed-test');

    assert.ok(saved);
    assert.equal(saved.device_id, 'bed-test');
    assert.equal(saved.metric, 'soil_moisture');
    assert.equal(saved.value, 27.5);
    assert.equal(saved.ts, timestamp);

    console.log('MQTT -> SQLite: PASS');

    // 6. Підключення REST API до тестової SQLite
    const dbPath = require.resolve('./db');
    const oldDbCache = require.cache[dbPath];

    process.env.JWT_SECRET = TEST_SECRET;

    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: db
    };

    let app;

    try {
      app = require('./server');
    } finally {
      if (oldDbCache) {
        require.cache[dbPath] = oldDbCache;
      } else {
        delete require.cache[dbPath];
      }
    }

    api = app.listen(0, '127.0.0.1');

    await new Promise(resolve => {
      api.once('listening', resolve);
    });

    const apiPort = api.address().port;

    const token = jwt.sign(
      {
        sub: 'pr7-test',
        username: 'test-agronomist',
        role: 'agronomist'
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '5m'
      }
    );

    const request = path => fetch(
      `http://127.0.0.1:${apiPort}${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    // 7. REST 200
    const response = await request(
      '/api/v1/telemetry?device=bed-test&metric=soil_moisture'
    );

    assert.equal(response.status, 200);

    const data = await response.json();

    assert.equal(data.device, 'bed-test');
    assert.equal(data.metric, 'soil_moisture');
    assert.equal(data.points.length, 1);
    assert.equal(data.points[0].value, 27.5);

    console.log('REST 200: PASS');

    // 8. REST 400
    const invalid = await request(
      '/api/v1/telemetry?device=bed-test&metric=unknown'
    );

    assert.equal(invalid.status, 400);

    console.log('REST 400: PASS');

    // 9. REST 404
    const missing = await request(
      '/api/v1/telemetry?device=missing&metric=soil_moisture'
    );

    assert.equal(missing.status, 404);

    console.log('REST 404: PASS');

    // 10. Фільтрація за часом
    const filtered = await request(
      `/api/v1/telemetry?device=bed-test` +
      `&metric=soil_moisture&from=${timestamp + 1}`
    );

    assert.equal(filtered.status, 200);

    const filteredData = await filtered.json();

    assert.equal(filteredData.points.length, 0);

    console.log('REST time filter: PASS');

    // 11. Список пристроїв
    const devicesResponse = await request(
      '/api/v1/devices'
    );

    assert.equal(devicesResponse.status, 200);

    const devices = await devicesResponse.json();

    assert.deepEqual(devices, [
      {
        id: 'bed-test',
        name: 'bed-test',
        zone: 'bed-test'
      }
    ]);

    console.log('REST devices: PASS');

    console.log('Інтеграційний тест завершено');
  }
);
