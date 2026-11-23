
'use strict';

function needsIrrigation(soilMoisture, threshold = 30) {
  if (
    typeof soilMoisture !== 'number' ||
    !Number.isFinite(soilMoisture)
  ) {
    throw new TypeError('soilMoisture must be a finite number');
  }

  if (soilMoisture < 0 || soilMoisture > 100) {
    throw new RangeError('soilMoisture must be in range 0..100');
  }

  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold)
  ) {
    throw new TypeError('threshold must be a finite number');
  }

  if (threshold < 0 || threshold > 100) {
    throw new RangeError('threshold must be in range 0..100');
  }

  return soilMoisture < threshold;
}

/**
 * Знаходить періоди, коли вологість ґрунту нижча за поріг.
 *
 * Вхідні дані:
 * [
 *   { ts: 1000, value: 25 },
 *   { ts: 61000, value: 35 }
 * ]
 *
 * Результат:
 * [
 *   {
 *     start: 1000,
 *     end: 61000,
 *     duration_min: 1,
 *     min_value: 25
 *   }
 * ]
 *
 * Якщо період не завершився, end і duration_min = null.
 * Дані мають бути відсортовані за ts.
 */
function findBelowThreshold(series, threshold = 30) {
  if (!Array.isArray(series)) {
    throw new TypeError('series must be an array');
  }

  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold)
  ) {
    throw new TypeError('threshold must be a finite number');
  }

  if (threshold < 0 || threshold > 100) {
    throw new RangeError('threshold must be in range 0..100');
  }

  const periods = [];
  let current = null;
  let previousTs = -Infinity;

  for (const point of series) {
    if (
      point === null ||
      typeof point !== 'object' ||
      Array.isArray(point)
    ) {
      throw new TypeError('Each point must be an object');
    }

    const { ts, value } = point;

    if (!Number.isSafeInteger(ts) || ts < 0) {
      throw new RangeError('ts must be a non-negative safe integer');
    }

    if (ts < previousTs) {
      throw new RangeError('series must be sorted by ts');
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('value must be a finite number');
    }

    if (value < 0 || value > 100) {
      throw new RangeError('value must be in range 0..100');
    }

    previousTs = ts;

    if (value < threshold) {
      if (current === null) {
        current = {
          start: ts,
          end: null,
          duration_min: null,
          min_value: value
        };
      } else {
        current.min_value = Math.min(current.min_value, value);
      }
    } else if (current !== null) {
      current.end = ts;
      current.duration_min = Math.round(
        (ts - current.start) / 60000
      );

      periods.push(current);
      current = null;
    }
  }

  if (current !== null) {
    periods.push(current);
  }

  return periods;
}

module.exports = {
  needsIrrigation,
  findBelowThreshold
};
