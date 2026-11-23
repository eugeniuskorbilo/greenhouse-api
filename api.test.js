
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = 'pr7-api-testing-secret-at-least-32-characters';

test('РџР 7: REST API, JWT, thresholds, audit', { timeout: 15000 }, async t => {
  const db = new Database(':memory:');

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

    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `);

  const passwordHash = bcrypt.hashSync('TestPassword123!', 4);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(1, 'test-agronomist', passwordHash, 'agronomist');

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(2, 'test-viewer', passwordHash, 'viewer');

  const insert = db.prepare(`
    INSERT INTO telemetry (device_id, metric, value, ts)
    VALUES (?, ?, ?, ?)
  `);

  const base = 1795000000000;

  insert.run('bed-1', 'soil_moisture', 25, base);
  insert.run('bed-1', 'soil_moisture', 35, base + 60000);
  insert.run('bed-1', 'soil_moisture', 45, base + 120000);
  insert.run('bed-1', 'soil_moisture', 50, base + 180000);
  insert.run('bed-1', 'temperature', 23.5, base);
  insert.run('bed-2', 'soil_moisture', 60, base);

  const dbPath = require.resolve('./db');
  const oldDbCache = require.cache[dbPath];
  const oldSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = SECRET;

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: db
  };

  globalThis.greenhouseMqttClient = { connected: true };
  
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

  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const agronomistToken = jwt.sign(
    { sub: '1', role: 'agronomist' },
    SECRET,
    { algorithm: 'HS256', expiresIn: '5m' }
  );

  const viewerToken = jwt.sign(
    { sub: '2', role: 'viewer' },
    SECRET,
    { algorithm: 'HS256', expiresIn: '5m' }
  );

  async function request(path, options = {}) {
    const {
      token = agronomistToken,
      method = 'GET',
      body
    } = options;

    const headers = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const data = await response.json();

    return { status: response.status, data };
  }

  t.after(async () => {
    server.closeAllConnections?.();

    await new Promise(resolve => {
      server.close(resolve);
    });

    db.close();

    if (oldSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = oldSecret;
    }

    console.log('API test: resources closed');
  });

  const telemetry =
    '/api/v1/telemetry?device=bed-1&metric=soil_moisture';

  const alerts =
    '/api/v1/alerts?device=bed-1&metric=soil_moisture';

  // 1. Health check
  await t.test('Health endpoint: 200', async () => {
    const r = await request('/api/v1/health', { token: null });

    assert.equal(r.status, 200);
    assert.equal(r.data.sqlite, 'up'); assert.equal(r.data.mqtt, 'up');
  });

  // 2. JWT
  await t.test('Р‘РµР· С‚РѕРєРµРЅР°: 401', async () => {
    const r = await request('/api/v1/devices', { token: null });

    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'missing_token');
  });

  await t.test('РќРµРєРѕСЂРµРєС‚РЅРёР№ С‚РѕРєРµРЅ: 401', async () => {
    const r = await request('/api/v1/devices', {
      token: 'invalid.jwt.token'
    });

    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_token');
  });

  await t.test('РџСЂРѕСЃС‚СЂРѕС‡РµРЅРёР№ С‚РѕРєРµРЅ: 401', async () => {
    const expired = jwt.sign(
      { sub: '1', role: 'agronomist' },
      SECRET,
      { algorithm: 'HS256', expiresIn: -10 }
    );

    const r = await request('/api/v1/devices', {
      token: expired
    });

    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'token_expired');
  });

  // 3. Login
  await t.test('Login: РЅРµРєРѕСЂРµРєС‚РЅРµ С‚С–Р»Рѕ Р·Р°РїРёС‚Сѓ', async () => {
    const r = await request('/api/v1/auth/login', {
      token: null,
      method: 'POST',
      body: { username: 123 }
    });

    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_request');
  });

  await t.test('Login: РїСЂР°РІРёР»СЊРЅС– РѕР±Р»С–РєРѕРІС– РґР°РЅС–', async () => {
    const r = await request('/api/v1/auth/login', {
      token: null,
      method: 'POST',
      body: {
        username: 'test-agronomist',
        password: 'TestPassword123!'
      }
    });

    assert.equal(r.status, 200);
    assert.equal(typeof r.data.accessToken, 'string');
    assert.equal(typeof r.data.refreshToken, 'string');
    assert.equal(r.data.role, 'agronomist');
  });

  await t.test('Refresh: РІС–РґСЃСѓС‚РЅС–Р№ С‚РѕРєРµРЅ', async () => {
    const r = await request('/api/v1/auth/refresh', {
      token: null,
      method: 'POST',
      body: {}
    });

    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_request');
  });

  await t.test('Refresh: РЅРµРІС–РґРѕРјРёР№ С‚РѕРєРµРЅ', async () => {
    const r = await request('/api/v1/auth/refresh', {
      token: null,
      method: 'POST',
      body: { refreshToken: 'not-a-real-token' }
    });

    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_refresh_token');
  });

  // 4. Devices
  await t.test('Devices: СЃРїРёСЃРѕРє Р±РµР· Р·Р°Р№РІРёС… РїРѕР»С–РІ', async () => {
    const r = await request('/api/v1/devices');

    assert.equal(r.status, 200);
    assert.deepEqual(r.data, [
      { id: 'bed-1', name: 'bed-1', zone: 'bed-1' },
      { id: 'bed-2', name: 'bed-2', zone: 'bed-2' }
    ]);
  });

  // 5. Telemetry validation
  await t.test('Telemetry: РїСЂР°РІРёР»СЊРЅРёР№ Р·Р°РїРёС‚', async () => {
    const r = await request(telemetry);

    assert.equal(r.status, 200);
    assert.equal(r.data.points.length, 4);
    assert.deepEqual(
      r.data.points.map(p => p.value),
      [25, 35, 45, 50]
    );
  });

  await t.test('Telemetry: РЅРµРјР°С” device', async () => {
    const r = await request(
      '/api/v1/telemetry?metric=soil_moisture'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: РЅРµРјР°С” metric', async () => {
    const r = await request(
      '/api/v1/telemetry?device=bed-1'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: РЅРµРІС–РґРѕРјР° РјРµС‚СЂРёРєР°', async () => {
    const r = await request(
      '/api/v1/telemetry?device=bed-1&metric=pressure'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: РЅРµРІС–РґРѕРјРёР№ РїСЂРёСЃС‚СЂС–Р№', async () => {
    const r = await request(
      '/api/v1/telemetry?device=missing&metric=soil_moisture'
    );

    assert.equal(r.status, 404);
  });

  await t.test('Telemetry: РЅРµС‡РёСЃР»РѕРІРёР№ from', async () => {
    const r = await request(telemetry + '&from=abc');

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: РІС–РґвЂ™С”РјРЅРёР№ from', async () => {
    const r = await request(telemetry + '&from=-1');

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: from Р±С–Р»СЊС€Рµ to', async () => {
    const r = await request(
      telemetry + '&from=2000&to=1000'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Telemetry: С„С–Р»СЊС‚СЂ from', async () => {
    const r = await request(
      telemetry + `&from=${base + 120000}`
    );

    assert.equal(r.status, 200);
    assert.deepEqual(
      r.data.points.map(p => p.value),
      [45, 50]
    );
  });

  await t.test('Telemetry: С„С–Р»СЊС‚СЂ to', async () => {
    const r = await request(
      telemetry + `&to=${base + 60000}`
    );

    assert.equal(r.status, 200);
    assert.deepEqual(
      r.data.points.map(p => p.value),
      [25, 35]
    );
  });

  // 6. Pagination
  await t.test('Pagination: limit=2', async () => {
    const r = await request(telemetry + '&limit=2');

    assert.equal(r.status, 200);
    assert.equal(r.data.points.length, 2);
    assert.deepEqual(
      r.data.points.map(p => p.value),
      [25, 35]
    );
    assert.equal(typeof r.data.next_cursor, 'string');

    const next = await request(
      telemetry +
      '&limit=2&cursor=' +
      encodeURIComponent(r.data.next_cursor)
    );

    assert.equal(next.status, 200);
    assert.deepEqual(
      next.data.points.map(p => p.value),
      [45, 50]
    );
    assert.equal(next.data.next_cursor, null);
  });

  await t.test('Pagination: limit=0', async () => {
    const r = await request(telemetry + '&limit=0');

    assert.equal(r.status, 400);
  });

  await t.test('Pagination: limit=1001', async () => {
    const r = await request(telemetry + '&limit=1001');

    assert.equal(r.status, 400);
  });

  await t.test('Pagination: РЅРµРїСЂР°РІРёР»СЊРЅРёР№ cursor', async () => {
    const r = await request(
      telemetry + '&cursor=invalid'
    );

    assert.equal(r.status, 400);
  });

  // 7. Aggregation
  await t.test('Aggregation: avg Р·Р° РіРѕРґРёРЅСѓ', async () => {
    const r = await request(
      telemetry + '&agg=avg&interval=1h'
    );

    assert.equal(r.status, 200);
    assert.equal(r.data.interval, '1h');
    assert.ok(Array.isArray(r.data.buckets));

    const totalCount = r.data.buckets.reduce(
      (sum, bucket) => sum + bucket.count,
      0
    );

    assert.equal(totalCount, 4);
  });

  await t.test('Aggregation: РЅРµРІС–РґРѕРјРёР№ С‚РёРї', async () => {
    const r = await request(
      telemetry + '&agg=sum&interval=1h'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Aggregation: РЅРµСЃСѓРјС–СЃРЅС–СЃС‚СЊ С–Р· limit', async () => {
    const r = await request(
      telemetry + '&agg=avg&interval=1h&limit=2'
    );

    assert.equal(r.status, 400);
  });

  // 8. Alerts
  await t.test('Alerts: РїРµСЂС–РѕРґ РЅРёР·СЊРєРѕС— РІРѕР»РѕРіРѕСЃС‚С–', async () => {
    const r = await request(alerts + '&threshold=40');

    assert.equal(r.status, 200);
    assert.equal(r.data.periods.length, 1);
    assert.equal(r.data.periods[0].min_value, 25);
    assert.equal(r.data.periods[0].duration_min, 2);
  });

  await t.test('Alerts: РЅРµРїСЂР°РІРёР»СЊРЅР° РјРµС‚СЂРёРєР°', async () => {
    const r = await request(
      '/api/v1/alerts?device=bed-1&metric=temperature&threshold=40'
    );

    assert.equal(r.status, 400);
  });

  await t.test('Alerts: threshold РїРѕРЅР°Рґ 100', async () => {
    const r = await request(alerts + '&threshold=101');

    assert.equal(r.status, 400);
  });

  await t.test('Alerts: threshold РІС–РґСЃСѓС‚РЅС–Р№', async () => {
    const r = await request(alerts);

    assert.equal(r.status, 400);
  });

  // 9. Thresholds
  await t.test('Threshold: viewer РЅРµ РјР°С” РїСЂР°РІР° Р·Р°РїРёСЃСѓ', async () => {
    const r = await request('/api/v1/devices/bed-1/threshold', {
      token: viewerToken,
      method: 'PUT',
      body: {
        metric: 'soil_moisture',
        value: 40
      }
    });

    assert.equal(r.status, 403);
    assert.equal(r.data.error, 'forbidden');
  });

  await t.test('Threshold: РЅРµРєРѕСЂРµРєС‚РЅРµ Р·РЅР°С‡РµРЅРЅСЏ', async () => {
    const r = await request('/api/v1/devices/bed-1/threshold', {
      method: 'PUT',
      body: {
        metric: 'soil_moisture',
        value: 150
      }
    });

    assert.equal(r.status, 400);
  });

  await t.test('Threshold: РЅРµРєРѕСЂРµРєС‚РЅРёР№ device', async () => {
    const r = await request('/api/v1/devices/bad!id/threshold', {
      method: 'PUT',
      body: {
        metric: 'soil_moisture',
        value: 40
      }
    });

    assert.equal(r.status, 400);
  });

  await t.test('Threshold: СЃС‚РІРѕСЂРµРЅРЅСЏ', async () => {
    const r = await request('/api/v1/devices/bed-1/threshold', {
      method: 'PUT',
      body: {
        metric: 'soil_moisture',
        value: 40
      }
    });

    assert.equal(r.status, 200);
    assert.equal(r.data.value, 40);
  });

  await t.test('Threshold: С‡РёС‚Р°РЅРЅСЏ', async () => {
    const r = await request('/api/v1/devices/bed-1/threshold');

    assert.equal(r.status, 200);
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].value, 40);
  });

  await t.test('Threshold: РѕРЅРѕРІР»РµРЅРЅСЏ', async () => {
    const r = await request('/api/v1/devices/bed-1/threshold', {
      method: 'PUT',
      body: {
        metric: 'soil_moisture',
        value: 45
      }
    });

    assert.equal(r.status, 200);
    assert.equal(r.data.value, 45);
  });

  // 10. Audit
  await t.test('Audit: viewer РѕС‚СЂРёРјСѓС” 403', async () => {
    const r = await request('/api/v1/audit', {
      token: viewerToken
    });

    assert.equal(r.status, 403);
  });

  await t.test('Audit: agronomist Р±Р°С‡РёС‚СЊ Р¶СѓСЂРЅР°Р»', async () => {
    const r = await request('/api/v1/audit');

    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
    assert.equal(r.data.length, 2);
    assert.equal(r.data[0].action, 'threshold:update');
    assert.equal(r.data[0].old_value, 40);
    assert.equal(r.data[0].new_value, 45);
  });

  // 11. Unknown route
  await t.test('РќРµРІС–РґРѕРјРёР№ РјР°СЂС€СЂСѓС‚: 404', async () => {
    const r = await request('/api/v1/unknown-route');

    assert.equal(r.status, 404);
  });

  console.log('РџР 7: REST API С‚РµСЃС‚СѓРІР°РЅРЅСЏ Р·Р°РІРµСЂС€РµРЅРѕ');
});
