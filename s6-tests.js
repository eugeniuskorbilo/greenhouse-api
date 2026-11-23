// СР6: перевірка мінімізації /devices та обмеження спроб входу
// Запускати окремо від tests.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.TEST_BASE_URL || 'http://localhost:4000';

test('СР6: обмеження невдалих спроб входу', async () => {
  const login = async () => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 's6_nonexistent_user',
        password: 'wrong_password'
      })
    });

    return {
      status: response.status,
      data: await response.json()
    };
  };

  let blocked = false;

  for (let i = 1; i <= 6; i++) {
    const result = await login();

    console.log(`Спроба ${i}: HTTP ${result.status}`);

    if (result.status === 429) {
      assert.equal(result.data.error, 'too_many_attempts');
      blocked = true;
      break;
    }

    assert.equal(result.status, 401, `Спроба ${i}`);
  }

  assert.ok(
    blocked,
    'Після п’яти невдалих спроб сервер повинен повернути HTTP 429'
  );

  // Перевіряємо, що наступна спроба також заблокована
  const nextAttempt = await login();

  assert.equal(nextAttempt.status, 429);
  assert.equal(nextAttempt.data.error, 'too_many_attempts');

  console.log('СР6: обмеження входу працює успішно');
});