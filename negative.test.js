
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const mqtt = require('mqtt');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { Aedes } = require('aedes');
const { startMqttBridge } = require('./realtime/bridge');

const SECRET = 's7-negative-test-secret-at-least-32-characters';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await sleep(20);
  }
  throw new Error('Timeout waiting for expected result');
}

async function endClient(client) {
  if (!client) return;
  await new Promise(resolve => client.end(true, resolve));
}

test('СР7: негативні MQTT та REST сценарії', { timeout: 15000 }, async t => {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      ts INTEGER NOT NULL
    );
  `);

  const oldUrl = process.env.MQTT_URL;
  const oldSecret = process.env.JWT_SECRET;

  let broker;
  let tcpServer;
  let subscriber;
  let publisher;
  let httpServer;

  t.after(async () => {
    await endClient(publisher);
    await endClient(subscriber);

    if (httpServer) {
      httpServer.closeAllConnections?.();
      await new Promise(resolve => httpServer.close(resolve));
    }

    if (tcpServer) {
      tcpServer.closeAllConnections?.();
      await new Promise(resolve => tcpServer.close(resolve));
    }

    if (broker) {
      await new Promise(resolve => broker.close(resolve));
    }

    db.close();

    if (oldUrl === undefined) delete process.env.MQTT_URL;
    else process.env.MQTT_URL = oldUrl;

    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  broker = await Aedes.createBroker();
  tcpServer = net.createServer(socket => broker.handle(socket));

  await new Promise(resolve => {
    tcpServer.listen(0, '127.0.0.1', resolve);
  });

  const mqttUrl = `mqtt://127.0.0.1:${tcpServer.address().port}`;
  process.env.MQTT_URL = mqttUrl;

  const subscribed = new Promise(resolve => {
    broker.on('subscribe', function handler(subscriptions) {
      if (subscriptions.some(s => s.topic === 'greenhouse/+/telemetry')) {
        broker.off('subscribe', handler);
        resolve();
      }
    });
  });

  const io = { to: () => ({ emit: () => {} }) };
  subscriber = startMqttBridge(io, db);

  await subscribed;

  publisher = mqtt.connect(mqttUrl, {
    reconnectPeriod: 0,
    connectTimeout: 2500
  });

  await new Promise((resolve, reject) => {
    publisher.once('connect', resolve);
    publisher.once('error', reject);
  });

  const count = () =>
    db.prepare('SELECT COUNT(*) AS n FROM telemetry').get().n;

  async function publish(payload) {
    await new Promise((resolve, reject) => {
      publisher.publish(
        'greenhouse/bed-s7/telemetry',
        typeof payload === 'string'
          ? payload
          : JSON.stringify(payload),
        { qos: 1 },
        error => error ? reject(error) : resolve()
      );
    });
  }

  // Контрольний коректний запис
  await publish({
    metric: 'soil_moisture',
    value: 42,
    ts: 1795000000000
  });

  await waitFor(() => count() === 1);

  await t.test('Коректний MQTT payload записується', () => {
    assert.equal(count(), 1);
  });

  // Негативні MQTT-повідомлення
  const invalidPayloads = [
    ['Пошкоджений JSON', '{bad json'],
    ['Невідома метрика', {
      metric: 'pressure', value: 25, ts: 1795000000001
    }],
    ['Значення-рядок', {
      metric: 'soil_moisture', value: 'abc', ts: 1795000000002
    }],
    ['Відсутнє значення', {
      metric: 'soil_moisture', ts: 1795000000003
    }],
    ['Від’ємний timestamp', {
      metric: 'soil_moisture', value: 25, ts: -1
    }],
    ['Нечисловий timestamp', {
      metric: 'soil_moisture', value: 25, ts: 'invalid'
    }]
  ];

  for (const [name, payload] of invalidPayloads) {
    await t.test(`MQTT: ${name} відхиляється`, async () => {
      await publish(payload);

      // Перевіряємо, що обробник отримав повідомлення,
      // а некоректний запис не потрапив до БД.
      await sleep(100);
      assert.equal(count(), 1);
    });
  }

  // REST із тією самою тестовою базою
  const dbPath = require.resolve('./db');
  const previousDb = require.cache[dbPath];

  process.env.JWT_SECRET = SECRET;
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
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  }

  httpServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => httpServer.once('listening', resolve));

  const token = jwt.sign(
    { sub: '1', role: 'agronomist' },
    SECRET,
    { algorithm: 'HS256', expiresIn: '5m' }
  );

  async function get(path) {
    const response = await fetch(
      `http://127.0.0.1:${httpServer.address().port}${path}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { status: response.status, body: await response.json() };
  }

  await t.test('REST: порожнє часове вікно повертає 200 і []', async () => {
    const r = await get(
      '/api/v1/telemetry?device=bed-s7' +
      '&metric=soil_moisture&from=1795000000001'
    );

    assert.equal(r.status, 200);
    assert.deepEqual(r.body.points, []);
  });

  await t.test('REST: невідомий пристрій повертає 404', async () => {
    const r = await get(
      '/api/v1/telemetry?device=missing' +
      '&metric=soil_moisture'
    );

    assert.equal(r.status, 404);
  });

  await t.test('REST: неправильний часовий інтервал повертає 400', async () => {
    const r = await get(
      '/api/v1/telemetry?device=bed-s7' +
      '&metric=soil_moisture&from=2000&to=1000'
    );

    assert.equal(r.status, 400);
  });

  console.log('СР7: негативні MQTT та REST сценарії завершено');
});
