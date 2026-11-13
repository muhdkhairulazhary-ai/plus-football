// Run: node --test tests/phase1.test.mjs
// No live API requests. All Cloudflare and upstream calls are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

const validateDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  Number.isFinite(Date.parse(d+'T00:00:00Z')) &&
  new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d;

async function request(query) {
  const h = harness();
  try {
    const response = await h.request(query);
    return { status: response.status, calls: h.calls.length };
  } finally {
    h.close();
  }
}
test('valid date is accepted by calendar logic', () => {
  assert.equal(validateDate('2026-11-13'), true);
  assert.equal(validateDate('2024-02-29'), true);
});
test('invalid dates are rejected by calendar logic', () => {
  for (const d of ['2026-02-29','2026-11-31','2026-13-01','garbage','2026-11-13x'])
    assert.equal(validateDate(d), false, d);
});
test('valid date reaches mocked upstream exactly once', async () => {
  assert.deepEqual(await request('endpoint=fixtures&date=2026-11-13'), {status:200,calls:1});
});
test('invalid dates never reach upstream', async () => {
  for (const date of ['garbage','2026-02-29','2026-11-31','2026-13-01']) {
    const result = await request('endpoint=fixtures&date='+date);
    assert.deepEqual(result,{status:400,calls:0});
  }
});
test('duplicate, extra and missing parameters are rejected', async () => {
  for (const query of [
    'endpoint=fixtures&date=2026-11-13&date=2026-11-14',
    'endpoint=fixtures&date=2026-11-13&team=1',
    'endpoint=fixtures&date=2026-11-13&endpoint=fixtures',
    'endpoint=fixtures',
    'endpoint=standings&date=2026-11-13'
  ]) assert.deepEqual(await request(query),{status:400,calls:0},query);
});
