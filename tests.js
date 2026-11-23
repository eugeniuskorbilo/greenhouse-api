
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');

const BASE = (process.env.TEST_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const USER_AGRO = process.env.TEST_AGRO_USER || 'agro1';
const PASS_AGRO = process.env.TEST_AGRO_PASSWORD || 'Agro#2026';
const USER_VIEW = process.env.TEST_VIEW_USER || 'viewer1';
const PASS_VIEW = process.env.TEST_VIEW_PASSWORD || 'View#2026';
const DEVICE = process.env.TEST_DEVICE || 'bed-a';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  return { status: response.status, headers: response.headers, data };
}

async function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

function socketAttempt(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      autoConnect: false,
      reconnection: false,
      timeout: 3500,
      auth: token === undefined ? {} : { token },
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO timeout'));
    }, 5000);

    const done = result => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve(result);
    };

    socket.once('connect', () => done({ connected: true }));
    socket.once('connect_error', err =>
      done({ connected: false, error: err.message })
    );

    socket.connect();
  });
}

test('ПР6: інтеграційні перевірки REST, JWT, Socket.IO та аудиту', async t => {
  let agro, viewer, oldThreshold;

  await t.test('01. Health check → 200', async () => {
    const r = await request('/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
  });

  await t.test('02. Вхід агронома → 200 та JWT', async () => {
    const r = await login(USER_AGRO, PASS_AGRO);
    assert.equal(r.status, 200);
    assert.equal(r.data.role, 'agronomist');
    assert.ok(r.data.accessToken);
    assert.ok(r.data.refreshToken);
    agro = r.data;
  });

  await t.test('03. Вхід переглядача → 200 та JWT', async () => {
    const r = await login(USER_VIEW, PASS_VIEW);
    assert.equal(r.status, 200);
    assert.equal(r.data.role, 'viewer');
    assert.ok(r.data.accessToken);
    viewer = r.data;
  });

  await t.test('04. GET /devices без токена → 401 missing_token', async () => {
    const r = await request('/devices');
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'missing_token');
    assert.match(r.headers.get('www-authenticate') || '', /Bearer/i);
  });

  await t.test('05. GET /devices з хибним JWT → 401 invalid_token', async () => {
    const r = await request('/devices', { token: 'x.y.z' });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_token');
  });

  await t.test('06. GET /devices з JWT viewer → 200', async () => {
    const r = await request('/devices', { token: viewer.accessToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
    assert.ok(r.data.every(d => Object.keys(d).sort().join(',') === 'id,name,zone'));
  });

  await t.test('07. Хибний пароль → 401 invalid_credentials', async () => {
    const r = await login(USER_VIEW, 'incorrect-password');
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_credentials');
  });

  await t.test('08. Viewer змінює поріг → 403 forbidden', async () => {
    const r = await request(`/devices/${DEVICE}/threshold`, {
      method: 'PUT',
      token: viewer.accessToken,
      body: { metric: 'soil_moisture', value: 30 },
    });

    assert.equal(r.status, 403);
    assert.equal(r.data.error, 'forbidden');
  });

  await t.test('09. Agronomist змінює поріг → 200', async () => {
    const prior = await request(`/devices/${DEVICE}/threshold`, {
      token: agro.accessToken,
    });

    assert.equal(prior.status, 200);
    oldThreshold = prior.data.find(
      x => x.metric === 'soil_moisture'
    )?.value;

    const r = await request(`/devices/${DEVICE}/threshold`, {
      method: 'PUT',
      token: agro.accessToken,
      body: { metric: 'soil_moisture', value: 30 },
    });

    assert.equal(r.status, 200);
    assert.equal(r.data.value, 30);
  });

  await t.test('10. Поріг 150% → 400 invalid_threshold', async () => {
    const r = await request(`/devices/${DEVICE}/threshold`, {
      method: 'PUT',
      token: agro.accessToken,
      body: { metric: 'soil_moisture', value: 150 },
    });

    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'invalid_threshold');
  });

  await t.test('11. Socket.IO без JWT → missing_token', async () => {
    const r = await socketAttempt();
    assert.equal(r.connected, false);
    assert.equal(r.error, 'missing_token');
  });

  await t.test('12. Socket.IO з хибним JWT → invalid_token', async () => {
    const r = await socketAttempt('x.y.z');
    assert.equal(r.connected, false);
    assert.equal(r.error, 'invalid_token');
  });

  await t.test('13. Socket.IO з валідним JWT → підключено', async () => {
    const r = await socketAttempt(viewer.accessToken);
    assert.equal(r.connected, true);
  });

  await t.test('14. Refresh → 200 і нова пара токенів', async () => {
    const r = await request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: viewer.refreshToken },
    });

    assert.equal(r.status, 200);
    assert.ok(r.data.accessToken);
    assert.ok(r.data.refreshToken);
    assert.notEqual(r.data.refreshToken, viewer.refreshToken);
  });

  await t.test('15. Повторне використання refresh → 401', async () => {
    const r = await request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: viewer.refreshToken },
    });

    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_refresh_token');
  });

  await t.test('16. Viewer не бачить аудит → 403', async () => {
    const r = await request('/audit', { token: viewer.accessToken });
    assert.equal(r.status, 403);
    assert.equal(r.data.error, 'forbidden');
  });

  await t.test('17. Agronomist бачить аудит → 200, записи змін', async () => {
    const r = await request('/audit', { token: agro.accessToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
    assert.ok(r.data.some(
      x => x.action === 'threshold:update' && x.target === DEVICE
    ));
    console.log(`    Записів у журналі: ${r.data.length}`);
  });

  if (oldThreshold !== undefined && oldThreshold !== 30) {
    await t.test('18. Відновлення попереднього порогу', async () => {
      const r = await request(`/devices/${DEVICE}/threshold`, {
        method: 'PUT',
        token: agro.accessToken,
        body: { metric: 'soil_moisture', value: oldThreshold },
      });

      assert.equal(r.status, 200);
    });
  }
});
