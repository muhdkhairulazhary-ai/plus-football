import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import publicWorker from '../workers/football-quota/src/index.mjs';
import {harness, MockStorage, validPayload, until, onRequestGet} from './helpers.mjs';

const query = date => 'endpoint=fixtures&date=' + date;
const use = (t, options) => { const h = harness(options); t.after(() => h.close()); return h; };

test('same date across clients and origins coalesces one upstream attempt', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = use(t, {provider: async () => { await gate; return Response.json(validPayload()); }});
  const pending = Array.from({length: 30}, (_, i) => h.request(query('2026-11-13'), {client: '192.0.2.' + i, origin: 'https://host' + i + '.invalid'}));
  await until(() => h.calls.length === 1);
  release();
  const responses = await Promise.all(pending);
  assert(responses.every(r => r.status === 200));
  assert.equal(h.calls.length, 1);
  assert.equal(h.storage.data.get('ledger').used, 1);
  assert.equal((await responses[0].json()).results, 1);
  assert.equal((await responses[1].json()).results, 1); // independent clones
});

test('concurrent distinct dates cannot exceed durable global budget', async t => {
  const h = use(t, {budget: 3});
  const responses = await Promise.all(Array.from({length: 20}, (_, i) => h.request(query('2026-11-' + String(i + 1).padStart(2, '0')), {client: '192.0.2.' + i})));
  assert.equal(responses.filter(r => r.status === 200).length, 3);
  assert.equal(responses.filter(r => r.status === 429).length, 17);
  assert.equal(h.calls.length, 3);
  assert.equal(h.storage.data.get('ledger').used, 3);
});

test('budget survives new coordinator and resets exactly at UTC midnight', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T23:59:59Z')});
  const h = use(t, {budget: 1});
  assert.equal((await h.request(query('2026-11-13'))).status, 200);
  h.restart();
  const blocked = await h.request(query('2026-11-14'));
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('Retry-After'), '1');
  t.mock.timers.tick(1000);
  assert.equal((await h.request(query('2026-11-14'))).status, 200);
  assert.equal(h.calls.length, 2);
  assert.equal(h.storage.data.get('ledger').day, '2026-11-14');
  assert.equal(h.storage.data.get('ledger').used, 1);
});

test('binding, key and explicitly configured budget fail closed', async t => {
  const h = use(t);
  assert.equal((await h.request(undefined, {bound: false})).status, 503);
  for (const value of ['', undefined]) {
    h.env.API_FOOTBALL_KEY = value;
    assert.equal((await h.request()).status, 503);
  }
  h.env.API_FOOTBALL_KEY = 'mock-only-credential';
  for (const value of ['0', '-1', '1.5', 'invalid', undefined]) {
    h.env.API_FOOTBALL_DAILY_BUDGET = value;
    assert.equal((await h.request()).status, 503);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.storage.data.size, 0);
});

test('invalid contract rejected before binding or reservation', async t => {
  const h = use(t);
  for (const q of ['', 'endpoint=fixtures', 'date=2026-11-13',
    query('2026-11-13') + '&date=2026-11-14', query('2026-11-13') + '&%64ate=2026-11-14',
    query('2026-11-13') + '&endpoint=fixtures', query('2026-11-13') + '&x=1',
    'endpoint=standings&date=2026-11-13', query('2026-02-29'), query('2026-11-31'),
    query('2026-13-01'), query('2026-11-13x'), query('')]) {
    assert.equal((await h.request(q, {bound: false})).status, 400, q);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.storage.data.size, 0);
});

test('persistent cache ignores origin/order, costs no budget, expires after one hour', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t);
  const first = await (await h.request()).json();
  h.restart();
  const second = await (await h.request('date=2026-11-13&endpoint=fixtures', {origin: 'https://other.invalid'})).json();
  assert.deepEqual(second, first); assert.equal(h.calls.length, 1);
  assert.equal(first.freshnessSeconds, 3600); assert.equal(first.updatedAt, '2026-11-13T10:00:00.000Z');
  t.mock.timers.tick(3600000);
  assert.equal((await h.request()).status, 200);
  assert.equal(h.calls.length, 2);
});

test('429 Retry-After propagates safely and cooldown persists across restarts', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t, {provider: async () => new Response('private provider details', {status: 429, headers: {'Retry-After': '120'}})});
  const first = await h.request();
  assert.equal(first.status, 429); assert.equal(first.headers.get('Retry-After'), '120');
  assert(!((await first.text()).includes('private')));
  h.restart();
  assert.equal((await h.request(query('2026-11-14'))).status, 429);
  assert.equal(h.calls.length, 1);
  assert.equal(h.storage.data.get('ledger').used, 1);
  assert.equal(h.storage.data.has('fixtures:2026-11-13'), false);
  t.mock.timers.tick(120000);
  await h.request(); assert.equal(h.calls.length, 2);
});

test('Retry-After HTTP date supported; invalid values default safely', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t, {provider: async () => new Response('', {status: 429, headers: {'Retry-After': 'Fri, 13 Nov 2026 10:02:00 GMT'}})});
  assert.equal((await h.request()).headers.get('Retry-After'), '120');
  h.close();
  const other = harness({provider: async () => new Response('', {status: 429, headers: {'Retry-After': 'invalid'}})});
  try { assert.equal((await other.request()).headers.get('Retry-After'), '60'); } finally { other.close(); }
});

test('malformed JSON, shape, provider errors, oversized data and network errors stay private and consume reservations', async t => {
  for (const provider of [
    async () => new Response('{invalid mock-only-credential', {headers: {'Content-Type': 'application/json'}}),
    async () => Response.json({response: 'invalid', results: 1}),
    async () => Response.json({response: [null], results: 1}),
    async () => Response.json({response: [], results: 1}),
    async () => Response.json({errors: {coverage: 'mock-only-credential'}}),
    async () => new Response('x'.repeat(100000), {headers: {'Content-Type': 'application/json'}}),
    async () => { throw Error('network mock-only-credential'); },
    async () => { const data = validPayload(); data.response[0].teams.home.name = 'mock-only-credential'; return Response.json(data); }
  ]) {
    const h = harness({budget: 1, provider});
    try {
      const response = await h.request();
      assert([422, 502].includes(response.status));
      assert(!(await response.text()).includes('mock-only-credential'));
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(h.storage.data.get('ledger').used, 1);
      assert.equal(h.storage.data.has('fixtures:2026-11-13'), false);
      assert.equal((await h.request()).status, 429);
      assert.equal(h.calls.length, 1);
    } finally { h.close(); }
  }
});

test('provider rate-limit JSON produces 429 without exposing details', async t => {
  const h = use(t, {provider: async () => Response.json({errors: {rateLimit: 'mock-only-credential'}})});
  const response = await h.request(); assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert(!(await response.text()).includes('mock-only-credential'));
});

test('timeout includes stalled response body, aborts and counts attempt', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: Date.parse('2026-11-13T10:00:00Z')});
  let signal;
  const h = use(t, {provider: async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({start() {}}), {headers: {'Content-Type': 'application/json'}});
  }});
  const pending = h.request();
  await until(() => h.calls.length === 1);
  t.mock.timers.tick(9000);
  const response = await pending;
  assert.equal(response.status, 504); assert.equal(signal.aborted, true);
  assert.equal(h.storage.data.get('ledger').used, 1);
  assert.equal(h.storage.data.has('fixtures:2026-11-13'), false);
});

test('restart during active lease does not duplicate an ambiguous upstream request', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = use(t, {provider: async () => { await gate; return Response.json(validPayload()); }});
  const original = h.request(); await until(() => h.calls.length === 1);
  h.restart();
  const waiting = await h.request();
  assert.equal(waiting.status, 503); assert(waiting.headers.has('Retry-After'));
  assert.equal(h.calls.length, 1);
  release(); assert.equal((await original).status, 200);
  assert.equal((await h.request()).status, 200); assert.equal(h.calls.length, 1);
});

test('transaction replay never duplicates fetch or budget reservation', async t => {
  const storage = new MockStorage(); storage.replay = true;
  const h = use(t, {storage});
  assert.equal((await h.request()).status, 200);
  assert.equal(h.calls.length, 1); assert.equal(storage.data.get('ledger').used, 1);
});

test('failed reservation rolls back and makes zero upstream calls', async t => {
  const storage = new MockStorage(); storage.fail = writes => writes.includes('ledger');
  const h = use(t, {storage});
  assert.equal((await h.request()).status, 503);
  assert.equal(h.calls.length, 0); assert.equal(storage.data.has('ledger'), false);
});

test('failed cache commit keeps consumed slot and lease; no immediate retry', async t => {
  const storage = new MockStorage(); storage.fail = writes => writes.some(key => key.startsWith('fixtures:'));
  const h = use(t, {storage});
  assert.equal((await h.request()).status, 503);
  assert.equal(storage.data.get('ledger').used, 1);
  assert(storage.data.get('ledger').pending['fixtures:2026-11-13']);
  h.restart(); assert.equal((await h.request()).status, 503);
  assert.equal(h.calls.length, 1);
});

test('per-client controls include cache hits and expire; raw IP is not stored', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t);
  for (let i = 0; i < 10; i++) assert.equal((await h.request()).status, 200);
  assert.equal((await h.request()).status, 429); assert.equal(h.calls.length, 1);
  assert(!JSON.stringify([...h.storage.data]).includes('127.0.0.1'));
  t.mock.timers.tick(60000); assert.equal((await h.request()).status, 200);
});

test('bounded client table fails closed instead of evicting active rate limits', async t => {
  const h = use(t);
  for (let i = 0; i < 256; i++) assert.equal((await h.request(undefined, {client: 'client-' + i})).status, 200);
  assert.equal((await h.request(undefined, {client: 'new-client'})).status, 429);
  assert.equal(Object.keys(h.storage.data.get('clients')).length, 256);
  assert.equal(h.calls.length, 1);
});

test('public Worker is not an alternate upstream proxy', () => {
  assert.equal(publicWorker.fetch(new Request('https://worker.invalid/fixtures')).status, 404);
});

test('broken binding and non-GET handler input never reach provider', async t => {
  const h = use(t);
  const req = new Request('https://mock.invalid/api/football?' + query('2026-11-13'));
  assert.equal((await onRequestGet({request: req, env: {FOOTBALL_QUOTA: {
    idFromName() { throw Error('private binding details'); }
  }}})).status, 503);
  assert.equal((await onRequestGet({request: new Request(req.url, {method: 'POST'}), env: {}})).status, 400);
  assert.equal(h.calls.length, 0);
});

test('expired abandoned lease permits only a newly charged attempt', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t);
  h.storage.data.set('ledger', {day: '2026-11-13', used: 1,
    pending: {'fixtures:2026-11-13': {lease: 'abandoned', until: Date.now() + 30000}},
    cache: [], blockedUntil: 0});
  assert.equal((await h.request()).status, 503); assert.equal(h.calls.length, 0);
  t.mock.timers.tick(30000);
  assert.equal((await h.request()).status, 200);
  assert.equal(h.calls.length, 1); assert.equal(h.storage.data.get('ledger').used, 2);
});

test('cache eviction bounds durable response entries', async t => {
  const h = use(t, {budget: 40});
  for (let i = 0; i < 33; i++) {
    const date = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
    assert.equal((await h.request(query(date), {client: 'cache-client-' + i})).status, 200);
  }
  assert.equal(h.storage.data.get('ledger').cache.length, 32);
  assert.equal([...h.storage.data.keys()].filter(key => key.startsWith('fixtures:')).length, 32);
  assert.equal(h.storage.data.has('fixtures:2026-10-01'), false);
  assert.equal(h.storage.data.get('ledger').used, 33);
});

test('active leases are bounded before another reservation', async t => {
  const h = use(t, {budget: 100});
  const pending = Object.fromEntries(Array.from({length: 32}, (_, i) => ['fixtures:busy-' + i, {lease: String(i), until: Date.now() + 30000}]));
  h.storage.data.set('ledger', {day: new Date().toISOString().slice(0, 10), used: 32, pending, cache: [], blockedUntil: 0});
  assert.equal((await h.request()).status, 503); assert.equal(h.calls.length, 0);
  assert.equal(h.storage.data.get('ledger').used, 32);
});

test('timeout before headers consumes one slot and does not retry', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: Date.parse('2026-11-13T10:00:00Z')});
  const h = use(t, {budget: 1, provider: async () => new Promise(() => {})});
  const pending = h.request(); await until(() => h.calls.length === 1);
  t.mock.timers.tick(9000);
  assert.equal((await pending).status, 504);
  assert.equal((await h.request()).status, 429); assert.equal(h.calls.length, 1);
});

test('configuration templates stay disabled and specify SQLite migration', async () => {
  const worker = await readFile(new URL('../workers/football-quota/wrangler.example.toml', import.meta.url), 'utf8');
  const pages = await readFile(new URL('../docs/cloudflare-pages.phase2.example.toml', import.meta.url), 'utf8');
  assert.match(worker, /new_sqlite_classes\s*=\s*\["FootballQuota"\]/);
  assert.match(worker, /API_FOOTBALL_DAILY_BUDGET\s*=\s*"0"/);
  assert.match(worker, /workers_dev\s*=\s*false/);
  assert.match(pages, /env\.preview\.durable_objects\.bindings/);
  assert(!worker.includes('API_FOOTBALL_KEY ='));
});

test('actual Match Centre date handler accepts coordinator response and rejects impossible date', async t => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  const h = use(t); let callback, frontendCalls = 0;
  const element = () => ({value: '', disabled: false, children: [], textContent: '',
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    addEventListener(_, fn) { callback = fn; }});
  const elements = {apiMatchDate: element(), apiMatchCheck: element(), apiMatchResults: element()};
  const context = {
    Date, Intl, AbortController, setTimeout, clearTimeout,
    document: {getElementById: id => elements[id], createElement: () => element()},
    fetch: async url => { frontendCalls++; return h.request(new URL(url, 'https://mock.invalid').search.slice(1)); }
  };
  const section = script.slice(script.indexOf('const apiDate='), script.indexOf('const sportsBase='));
  const safe = script.slice(script.indexOf('function safeText('), script.indexOf('async function loadScores('));
  vm.runInNewContext(safe + section, context);
  elements.apiMatchDate.value = '2026-11-13'; await callback();
  const text = node => node.textContent + ' ' + node.children.map(text).join(' ');
  assert(text(elements.apiMatchResults).includes('Home vs Away'));
  assert(text(elements.apiMatchResults).includes('0 - 0'));
  assert.equal(elements.apiMatchCheck.disabled, false);
  elements.apiMatchDate.value = '2026-11-31'; await callback();
  assert(text(elements.apiMatchResults).includes('Pilih tarikh yang sah.'));
  assert.equal(frontendCalls, 1); assert.equal(h.calls.length, 1);
});
