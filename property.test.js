
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const { findBelowThreshold } = require('./logic');

test('СР7: fast-check — періоди впорядковані та не перетинаються', () => {
  const valuesArb = fc.array(
    fc.integer({ min: 0, max: 100 }),
    { minLength: 0, maxLength: 100 }
  );

  fc.assert(
    fc.property(
      valuesArb,
      fc.integer({ min: 0, max: 100 }),
      (values, threshold) => {
        const series = values.map((value, index) => ({
          ts: index * 60000,
          value
        }));

        const periods = findBelowThreshold(series, threshold);

        assert.ok(Array.isArray(periods));

        for (let i = 0; i < periods.length; i++) {
          const period = periods[i];

          assert.ok(period.start >= 0);
          assert.ok(period.min_value < threshold);

          if (period.end !== null) {
            assert.ok(period.end >= period.start);
            assert.equal(
              period.duration_min,
              (period.end - period.start) / 60000
            );
          } else {
            assert.equal(period.duration_min, null);
            assert.equal(i, periods.length - 1);
          }

          if (i > 0) {
            const previous = periods[i - 1];

            assert.notEqual(previous.end, null);
            assert.ok(previous.end <= period.start);
          }
        }
      }
    ),
    {
      numRuns: 1000,
      verbose: true
    }
  );

  console.log('fast-check: 1000 генеративних перевірок пройдено');
});
