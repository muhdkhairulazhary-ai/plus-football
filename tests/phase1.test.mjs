// Run: node --test tests/phase1.test.mjs
// No live API requests. All Cloudflare and upstream calls are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../functions/api/football.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const validateDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  Number.isFinite(Date.parse(d+'T00:00:00Z')) &&
  new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d;

async function request(query) {
  let calls = 0;
  const oldFetch = globalThis.fetch;
  const oldCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async () => { calls++; return Response.json({response:[],results:0,paging:null}); };
  try {
    const response = await onRequestGet({
      request: new Request('https://example.test/api/football?' + query),
      env: { API_FOOTBALL_KEY: 'test-only-fake-key' }
    });
    return { status: response.status, calls };
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.caches = oldCaches;
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
