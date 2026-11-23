
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIN_LINES = 80;
const MIN_BRANCHES = 70;

const file = path.join(__dirname, '..', 'coverage.json');

if (!fs.existsSync(file)) {
  console.error('FAIL: coverage.json не знайдено');
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(file, 'utf8'));

const lines = coverage.totals?.coveredLinePercent;
const branches = coverage.totals?.coveredBranchPercent;

if (!Number.isFinite(lines) || !Number.isFinite(branches)) {
  console.error('FAIL: немає коректних даних покриття');
  process.exit(1);
}

console.log(`Lines: ${lines.toFixed(2)}% (minimum ${MIN_LINES}%)`);
console.log(`Branches: ${branches.toFixed(2)}% (minimum ${MIN_BRANCHES}%)`);

if (lines < MIN_LINES || branches < MIN_BRANCHES) {
  console.error('FAIL: пороги покриття не виконані');
  process.exit(1);
}

console.log('PASS: пороги покриття виконані');
