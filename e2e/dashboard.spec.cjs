const { test, expect } = require('@playwright/test');

const session = {
  accessToken: 'pr7-e2e-access-token',
  refreshToken: 'pr7-e2e-refresh-token',
  username: 'agro1',
  role: 'agronomist'
};

async function setupApi(page, failure = false) {
  // One handler for all API calls: Playwright runs overlapping routes in reverse order.
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/v1/auth/login') {
      return route.fulfill({ status: 200, json: session });
    }

    if (failure) {
      return route.abort('failed');
    }

    if (/^\/api\/v1\/devices\/[^/]+\/threshold$/.test(path)) {
      return route.fulfill({ status: 200, json: [{ metric: 'soil_moisture', value: 30 }] });
    }

    if (path === '/api/v1/telemetry') {
      const metric = url.searchParams.get('metric');
      const values = {
        temperature: 23.5,
        humidity: 62,
        soil_moisture: 41,
        light: 8500
      };
      if (!Object.hasOwn(values, metric)) {
        return route.fulfill({ status: 400, json: { error: 'Invalid metric' } });
      }
      return route.fulfill({
        status: 200,
        json: {
          device: url.searchParams.get('device'),
          metric,
          points: [{ ts: Date.now() - 60000, value: values[metric] }],
          next_cursor: null
        }
      });
    }

    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}

async function openDashboard(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Увійти' })).toBeVisible();
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: /Агромоніторинг/ })).toBeVisible();
}

test('E2E 1: показники вологості відображаються', async ({ page }) => {
  await setupApi(page);
  await openDashboard(page);

  const soilCard = page.getByTestId('device-card').filter({ hasText: 'Вологість ґрунту' });
  await expect(soilCard).toBeVisible();
  await expect(soilCard.locator('.card-number')).toContainText('41');

  await page.screenshot({ path: 'e2e/success.png', fullPage: true });
  console.log('E2E 1: PASS');
});

test('E2E 2: помилка при недоступності REST API', async ({ page }) => {
  await setupApi(page, true);
  await openDashboard(page);

  await expect(page.getByTestId('connection-error')).toBeVisible({ timeout: 12000 });
  await expect(page.getByTestId('device-card')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/error.png', fullPage: true });
  console.log('E2E 2: PASS');
});
