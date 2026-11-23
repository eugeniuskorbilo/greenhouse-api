
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  needsIrrigation,
  findBelowThreshold
} = require('./logic');

describe('ПР7: Unit-тести needsIrrigation', () => {

  test('Норма: 45% — полив не потрібен', () => {
    assert.equal(needsIrrigation(45), false);
  });

  test('Межа: рівно 30% — полив не потрібен', () => {
    assert.equal(needsIrrigation(30), false);
  });

  test('Нижче порога: 29.9% — полив потрібен', () => {
    assert.equal(needsIrrigation(29.9), true);
  });

  test('Індивідуальний поріг: 40%', () => {
    assert.equal(needsIrrigation(35, 40), true);
    assert.equal(needsIrrigation(45, 40), false);
  });

  test('Від’ємна вологість — RangeError', () => {
    assert.throws(() => needsIrrigation(-5), RangeError);
  });

  test('NaN — TypeError', () => {
    assert.throws(() => needsIrrigation(NaN), TypeError);
  });

  test('Рядок замість числа — TypeError', () => {
    assert.throws(() => needsIrrigation('abc'), TypeError);
  });

  test('Вологість понад 100% — RangeError', () => {
    assert.throws(() => needsIrrigation(105), RangeError);
  });

  test('Некоректний поріг — виняток', () => {
    assert.throws(() => needsIrrigation(-10), RangeError);
    assert.throws(() => needsIrrigation('30'), TypeError);
  });

});

describe('СР7: Unit-тести findBelowThreshold', () => {

  test('Порожня серія повертає порожній масив', () => {
    assert.deepEqual(findBelowThreshold([], 30), []);
  });

  test('Усі значення в нормі — періодів немає', () => {
    const series = [
      { ts: 0, value: 45 },
      { ts: 60000, value: 30 },
      { ts: 120000, value: 70 }
    ];

    assert.deepEqual(findBelowThreshold(series, 30), []);
  });

  test('Один завершений період низької вологості', () => {
    const series = [
      { ts: 0, value: 25 },
      { ts: 60000, value: 20 },
      { ts: 120000, value: 35 }
    ];

    assert.deepEqual(findBelowThreshold(series, 30), [
      {
        start: 0,
        end: 120000,
        duration_min: 2,
        min_value: 20
      }
    ]);
  });

  test('Незавершений період наприкінці серії', () => {
    const series = [
      { ts: 0, value: 50 },
      { ts: 60000, value: 25 },
      { ts: 120000, value: 15 }
    ];

    assert.deepEqual(findBelowThreshold(series, 30), [
      {
        start: 60000,
        end: null,
        duration_min: null,
        min_value: 15
      }
    ]);
  });

  test('Два окремі періоди не перетинаються', () => {
    const series = [
      { ts: 0, value: 20 },
      { ts: 60000, value: 40 },
      { ts: 120000, value: 25 },
      { ts: 180000, value: 45 }
    ];

    assert.deepEqual(findBelowThreshold(series, 30), [
      {
        start: 0,
        end: 60000,
        duration_min: 1,
        min_value: 20
      },
      {
        start: 120000,
        end: 180000,
        duration_min: 1,
        min_value: 25
      }
    ]);
  });

  test('Значення рівно на порозі завершує період', () => {
    const series = [
      { ts: 0, value: 29.9 },
      { ts: 60000, value: 30 }
    ];

    const periods = findBelowThreshold(series, 30);

    assert.equal(periods.length, 1);
    assert.equal(periods[0].end, 60000);
    assert.equal(periods[0].duration_min, 1);
  });

  test('Мінімальне значення визначається правильно', () => {
    const series = [
      { ts: 0, value: 28 },
      { ts: 60000, value: 12 },
      { ts: 120000, value: 21 },
      { ts: 180000, value: 50 }
    ];

    const periods = findBelowThreshold(series, 30);

    assert.equal(periods[0].min_value, 12);
  });

  test('Некоректні значення вологості відхиляються', () => {
    assert.throws(
      () => findBelowThreshold([{ ts: 0, value: -1 }]),
      RangeError
    );

    assert.throws(
      () => findBelowThreshold([{ ts: 0, value: 101 }]),
      RangeError
    );

    assert.throws(
      () => findBelowThreshold([{ ts: 0, value: NaN }]),
      TypeError
    );
  });

  test('Невпорядковані часові позначки відхиляються', () => {
    const series = [
      { ts: 120000, value: 20 },
      { ts: 60000, value: 25 }
    ];

    assert.throws(
      () => findBelowThreshold(series, 30),
      RangeError
    );
  });

  test('Некоректні аргументи викликають винятки', () => {
    assert.throws(
      () => findBelowThreshold(null, 30),
      TypeError
    );

    assert.throws(
      () => findBelowThreshold([], -5),
      RangeError
    );

    assert.throws(
      () => findBelowThreshold([], '30'),
      TypeError
    );

    assert.throws(
      () => findBelowThreshold([{ ts: -1, value: 20 }]),
      RangeError
    );
  });

});
