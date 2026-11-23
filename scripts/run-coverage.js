
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const MIN_LINES = 80;
const MIN_BRANCHES = 70;

const TEST_FILES = [
  'logic.test.js',
  'integration.test.js',
  'api.test.js',
  'negative.test.js'
];

console.log('СР7: запуск тестів із контролем покриття\n');

const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    '--experimental-test-coverage',
    ...TEST_FILES
  ],
  {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true
  }
);

const stdout = result.stdout || '';
const stderr = result.stderr || '';

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

if (result.error) {
  console.error('\nFAIL: не вдалося завершити тестування');
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\nFAIL: один або декілька тестів не пройшли');
  process.exit(1);
}

// Шукаємо підсумковий рядок таблиці покриття Node.js.
// Приклад:
// all files | 84.53 | 81.41 | 84.62 |

const ansiPattern = /\x1b\[[0-9;]*m/g;
const cleanOutput = stdout.replace(ansiPattern, '');

const match = cleanOutput.match(
  /^\s*(?:ℹ\s*)?all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/mi
);

if (!match) {
  console.error('\nFAIL: не знайдено підсумок покриття');
  console.error('Перевір версію Node.js та формат звіту');
  process.exit(1);
}

const lines = Number(match[1]);
const branches = Number(match[2]);
const functions = Number(match[3]);

if (![lines, branches, functions].every(Number.isFinite)) {
  console.error('\nFAIL: некоректні показники покриття');
  process.exit(1);
}

console.log('\n========================================');
console.log('СР7: АВТОМАТИЧНИЙ КОНТРОЛЬ ПОКРИТТЯ');
console.log('========================================');

console.log(
  `Рядки:    ${lines.toFixed(2)}% / мінімум ${MIN_LINES}%`
);
console.log(
  `Гілки:    ${branches.toFixed(2)}% / мінімум ${MIN_BRANCHES}%`
);
console.log(
  `Функції:  ${functions.toFixed(2)}% (інформаційно)`
);

const linesPassed = lines >= MIN_LINES;
const branchesPassed = branches >= MIN_BRANCHES;

console.log(
  `\nРядки: ${linesPassed ? 'PASS' : 'FAIL'}`
);
console.log(
  `Гілки: ${branchesPassed ? 'PASS' : 'FAIL'}`
);

if (!linesPassed || !branchesPassed) {
  console.error('\nFAIL: пороги покриття не виконані');
  process.exit(1);
}

console.log('\nPASS: усі тести та пороги покриття виконані!');
