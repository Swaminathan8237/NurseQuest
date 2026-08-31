const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../utils/analytics');

test('sumField totals numeric report fields safely', () => {
  const units = [
    { totalPoints: 10, attempts: '2' },
    { totalPoints: '15.5', attempts: 3 },
    { totalPoints: null, attempts: undefined },
    {},
  ];

  assert.equal(analytics.sumField(units, 'totalPoints'), 25.5);
  assert.equal(analytics.sumField(units, 'attempts'), 5);
});

test('sumField handles invalid or missing rows without NaN', () => {
  assert.equal(analytics.sumField(null, 'totalPoints'), 0);
  assert.equal(analytics.sumField([], 'totalPoints'), 0);
  assert.equal(analytics.sumField([{ totalPoints: 'invalid' }, null], 'totalPoints'), 0);
});
