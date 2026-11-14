// Local only. Requires the pinned Wrangler toolchain documented in setup.
// No Cloudflare credentials, remote bindings, deployment or live upstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdtemp, readdir, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';

const tools = process.env.PHASE2_RUNTIME_TOOLS;
const require = createRequire(tools ? pathToFileURL(resolve(tools, 'package.json')) : import.meta.url);
const wranglerPath = require.resolve('wrangler/package.json');
assert.equal(require(wranglerPath).version, '4.162.0', 'Use the documented, pinned Wrangler toolchain');
const wranglerRequire = createRequire(wranglerPath);
const {Miniflare, convertV4MiniflareOptions} = wranglerRequire('miniflare');
const worker = await readFile(new URL('../workers/football-quota/src/index.mjs', import.meta.url), 'utf8');
const pages = await readFile(new URL('../functions/api/football.js', import.meta.url), 'utf8');
const fakeKey = 'local-runtime-mock-credential';
const payload = () => ({errors: [], results: 1, response: [{
  fixture: {id: 1, date: '2026-11-13T12:00:00Z', status: {short: 'FT'}},
  league: {id: 2, name: 'Mock league'},
  teams: {home: {id: 3, name: 'Home'}, away: {id: 4, name: 'Away'}},
  goals: {home: 0, away: 0}
}]});
const totals = {mockCalls: 0, blockedUnexpectedDestinations: 0};

async function harness(t, {budget = 3, provider = async () => Response.json(payload())} = {}) {
  const persistence = await mkdtemp(join(tmpdir(), 'plus-football-workerd-'));
  const stats = {calls: 0, unexpected: 0};
  let mf;
  async function start(nextBudget) {
    if (mf) { await mf.dispose(); mf = undefined; }
    const options = convertV4MiniflareOptions({
      compatibilityDate: '2026-11-13',
      workers: [{
        name: 'pages-test', modules: true,
        script: pages + '\nexport default {fetch(request,env){return onRequestGet({request,env})}};',
        durableObjects: {FOOTBALL_QUOTA: {className: 'FootballQuota', scriptName: 'coordinator', useSQLite: true}},
        outboundService: async () => {
          stats.unexpected++; totals.blockedUnexpectedDestinations++;
          return new Response('Blocked local test egress', {status: 502});
        }
      }, {
        name: 'coordinator', modules: true, script: worker,
        durableObjects: {FOOTBALL_QUOTA: {className: 'FootballQuota', useSQLite: true}},
        bindings: {API_FOOTBALL_KEY: fakeKey, API_FOOTBALL_DAILY_BUDGET: String(nextBudget)},
        // Every outbound fetch is intercepted. There is no network fallback,
        // even if the Worker accidentally follows Location to another origin.
        outboundService: async request => {
          const url = new URL(request.url);
          if (url.origin !== 'https://v3.football.api-sports.io' || url.pathname !== '/fixtures') {
            stats.unexpected++; totals.blockedUnexpectedDestinations++;
            return new Response('Blocked local test egress', {status: 502});
          }
          assert.equal(request.headers.get('x-apisports-key'), fakeKey);
          stats.calls++; totals.mockCalls++;
          return provider(request);
        }
      }]
    });
    // Miniflare 5 uses resourcePersistencePath; old v4 per-resource persist
    // options are not sufficient for SQLite persistence across instances.
    mf = new Miniflare({...options, resourcePersistencePath: persistence});
    await mf.ready;
  }
  t.after(async () => {
    try { if (mf) await mf.dispose(); }
    finally { await rm(persistence, {recursive: true, force: true}); }
  });
  await start(budget);
  return {
    stats, persistence, restart: start,
    request(date = '2026-11-13', {client = '192.0.2.1', origin = 'https://local.invalid'} = {}) {
      return mf.dispatchFetch(origin + '/api/football?endpoint=fixtures&date=' + date,
        {headers: {'CF-Connecting-IP': client}});
    },
    query(query) { return mf.dispatchFetch('https://local.invalid/api/football?' + query); }
  };
}

test('workerd: Pages binding and budget zero fail closed, invalid queries return 400', async t => {
  const h = await harness(t, {budget: 0});
  assert.equal((await h.request()).status, 503);
  assert.equal((await h.request('2026-11-31')).status, 400);
  assert.equal((await h.query('endpoint=fixtures&date=2026-11-13&date=2026-11-14')).status, 400);
  assert.equal(h.stats.calls, 0); assert.equal(h.stats.unexpected, 0);
});

test('workerd: success, concurrent same date and origin-independent cache', async t => {
  const h = await harness(t, {provider: async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    return Response.json(payload());
  }});
  const responses = await Promise.all(Array.from({length: 8}, (_, i) =>
    h.request('2026-11-13', {client: '192.0.2.' + (i + 1), origin: 'https://host' + i + '.invalid'})));
  assert(responses.every(response => response.status === 200));
  const data = await responses[0].json();
  assert.equal(data.response[0].teams.home.name, 'Home');
  assert.deepEqual(data.response[0].goals, {home: 0, away: 0});
  assert.equal(data.freshnessSeconds, 3600);
  assert(Number.isFinite(Date.parse(data.updatedAt)));
  assert.equal((await h.query('date=2026-11-13&endpoint=fixtures')).status, 200);
  assert.equal(h.stats.calls, 1); assert.equal(h.stats.unexpected, 0);
});

test('workerd: concurrent distinct dates cannot exceed SQLite budget', async t => {
  const h = await harness(t, {budget: 3});
  const responses = await Promise.all(Array.from({length: 8}, (_, i) =>
    h.request('2026-11-' + String(i + 1).padStart(2, '0'), {client: '198.51.100.' + i})));
  assert.equal(responses.filter(response => response.status === 200).length, 3);
  assert.equal(responses.filter(response => response.status === 429).length, 5);
  assert.equal(h.stats.calls, 3); assert.equal(h.stats.unexpected, 0);
});

test('workerd: quota and valid cache persist across full runtime restart', async t => {
  const h = await harness(t, {budget: 1});
  const first = await (await h.request()).json();
  await h.restart(1);
  assert.equal((await h.request('2026-11-14')).status, 429);
  assert.deepEqual(await (await h.request()).json(), first);
  assert.equal(h.stats.calls, 1);
  let sqliteFiles = 0;
  for (const file of await readdir(h.persistence, {recursive: true})) {
    if (!file.endsWith('.sqlite')) continue;
    const bytes = await readFile(join(h.persistence, file));
    if (bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) sqliteFiles++;
  }
  assert(sqliteFiles > 0, 'SQLite database files must exist on disk');
});

test('workerd: budget zero still blocks an existing valid cache', async t => {
  const h = await harness(t, {budget: 1});
  assert.equal((await h.request()).status, 200);
  await h.restart(0);
  assert.equal((await h.request()).status, 503);
  assert.equal(h.stats.calls, 1); assert.equal(h.stats.unexpected, 0);
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`workerd: HTTP ${status} never follows Location or caches valid-looking redirect JSON`, async t => {
    const h = await harness(t, {budget: 2, provider: async () => Response.json(payload(), {
      status, headers: {Location: 'https://redirect.invalid/private-destination'}
    })});
    const first = await h.request();
    assert.equal(first.status, 502);
    assert.equal(first.headers.get('Location'), null);
    const text = await first.text();
    assert(!text.includes(fakeKey)); assert(!text.includes('private-destination'));
    assert.equal(h.stats.calls, 1); assert.equal(h.stats.unexpected, 0);
    await h.restart(2);
    assert.equal((await h.request()).status, 502); // fresh charged attempt, not cache
    assert.equal(h.stats.calls, 2); assert.equal(h.stats.unexpected, 0);
    assert.equal((await h.request('2026-11-14')).status, 429);
    assert.equal(h.stats.calls, 2);
  });
}

test('workerd: all upstream requests were intercepted; no redirect destination was contacted', () => {
  assert(totals.mockCalls > 0);
  assert.equal(totals.blockedUnexpectedDestinations, 0);
  console.log('Local mock calls:', totals.mockCalls, '; unexpected destinations:', totals.blockedUnexpectedDestinations);
});
