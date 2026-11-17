const test = require('node:test');
const assert = require('node:assert/strict');
const { createActivityWindow } = require('../src/lib/activityWindow');

test('starts idle, expires after inactivity, and resumes on the next request', () => {
  let time = 0;
  const activity = createActivityWindow({ idleMs: 60000, now: () => time });
  assert.equal(activity.isActive(), false);
  activity.touch();
  assert.equal(activity.isActive(), true);
  time = 59999;
  assert.equal(activity.isActive(), true);
  time = 60000;
  assert.equal(activity.isActive(), false);
  activity.touch();
  assert.equal(activity.isActive(), true);
});
