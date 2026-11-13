// SQLite-backed Durable Object; only a binding may invoke the coordinator.
const DAY = 86400000, TTL = 3600000, LEASE = 30000;
const CLIENT_WINDOW = 60000, CLIENT_LIMIT = 10, MAX_CLIENTS = 256, MAX_CACHE = 32;
const MAX_BYTES = 96 * 1024, UPSTREAM_TIMEOUT = 9000;
const reply = (value, status = 200, retry) => Response.json(value, {status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  ...(retry ? {'Retry-After': String(Math.max(1, Math.ceil(retry)))} : {})
}});
const failure = (status = 503, retry) => reply({error: 'Football data temporarily unavailable'}, status, retry);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date + 'T00:00:00Z')) &&
  new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
const freshLedger = now => ({day: new Date(now).toISOString().slice(0, 10), used: 0, pending: {}, cache: [], blockedUntil: 0});

function retrySeconds(header, now) {
  const seconds = /^\d+$/.test(header || '') ? Number(header) : (Date.parse(header) - now) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.ceil(seconds)) : 60;
}

async function readJSON(response) {
  if (!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) throw Error('shape');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('size');
  const reader = response.body?.getReader();
  if (!reader) throw Error('body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validatedData(data, secret) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.response) ||
      !Number.isSafeInteger(data.results) || data.results !== data.response.length) throw Error('shape');
  const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
  const id = value => Number.isSafeInteger(value) && value > 0;
  const goal = value => value === null || (Number.isSafeInteger(value) && value >= 0);
  const response = data.response.map(match => {
    if (!match || !id(match.fixture?.id) || !name(match.fixture?.date) ||
        !Number.isFinite(Date.parse(match.fixture.date)) || !name(match.fixture?.status?.short) ||
        !id(match.league?.id) || !name(match.league?.name) ||
        !id(match.teams?.home?.id) || !name(match.teams?.home?.name) ||
        !id(match.teams?.away?.id) || !name(match.teams?.away?.name) ||
        !goal(match.goals?.home) || !goal(match.goals?.away)) throw Error('shape');
    // Return only fields used by the current Match Centre.
    return {
      fixture: {id: match.fixture.id, date: match.fixture.date, status: {short: match.fixture.status.short}},
      league: {id: match.league.id, name: match.league.name},
      teams: {home: {id: match.teams.home.id, name: match.teams.home.name},
        away: {id: match.teams.away.id, name: match.teams.away.name}},
      goals: {home: match.goals.home, away: match.goals.away}
    };
  });
  const result = {response, results: response.length, paging: null};
  if (JSON.stringify(result).includes(secret)) throw Error('sensitive');
  return result;
}

export class FootballQuota {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    // Active work only: NOT the global quota. Persistent leases cover restarts.
    this.inflight = new Map();
  }

  async fetch(request) {
    try {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/fixtures') return failure(400);
      const raw = await request.text();
      if (raw.length > 256) return failure(400);
      const {date, client} = JSON.parse(raw);
      if (!validDate(date) || typeof client !== 'string' || client.length > 64) return failure(400);
      const budget = Number(this.env.API_FOOTBALL_DAILY_BUDGET);
      if (typeof this.env.API_FOOTBALL_KEY !== 'string' || !this.env.API_FOOTBALL_KEY ||
          !Number.isSafeInteger(budget) || budget < 1 || budget > 100000) return failure();
      const now = Date.now();
      // An IP is a weak abuse signal, not authenticated identity. Persist a
      // rotating daily digest, never the address itself.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(new Date(now).toISOString().slice(0, 10) + '|' + client));
      const token = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const permitted = await this.storage.transaction(async tx => {
        const clients = (await tx.get('clients')) || {};
        for (const [key, value] of Object.entries(clients)) if (value.until <= now) delete clients[key];
        if (!clients[token] && Object.keys(clients).length >= MAX_CLIENTS) return false;
        const value = clients[token] || {count: 0, until: now + CLIENT_WINDOW};
        if (value.count >= CLIENT_LIMIT) return false;
        value.count++; clients[token] = value;
        await tx.put('clients', clients);
        return true;
      });
      if (!permitted) return reply({error: 'Too many requests. Try again later.'}, 429, 60);
      const key = 'fixtures:' + date;
      let task = this.inflight.get(key);
      if (!task) {
        task = this.run(key, date, budget);
        this.inflight.set(key, task);
        task.finally(() => { if (this.inflight.get(key) === task) this.inflight.delete(key); }).catch(() => {});
      }
      return (await task).clone();
    } catch { return failure(); }
  }

  async run(key, date, budget) {
    try {
      const lease = crypto.randomUUID();
      const reservation = await this.storage.transaction(async tx => {
        const now = Date.now();
        const cached = await tx.get(key);
        if (cached && cached.expiresAt > now) return {cached: cached.data};
        const ledger = (await tx.get('ledger')) || freshLedger(now);
        const day = new Date(now).toISOString().slice(0, 10);
        if (ledger.day !== day) { ledger.day = day; ledger.used = 0; }
        for (const [pendingKey, value] of Object.entries(ledger.pending))
          if (value.until <= now) delete ledger.pending[pendingKey];
        if (ledger.blockedUntil > now) return {status: 429, retry: (ledger.blockedUntil - now) / 1000};
        if (ledger.pending[key]) return {status: 503, retry: (ledger.pending[key].until - now) / 1000};
        if (ledger.used >= budget) return {status: 429, retry: (DAY - now % DAY) / 1000};
        if (Object.keys(ledger.pending).length >= 32) return {status: 503, retry: 1};
        ledger.used++;
        ledger.pending[key] = {lease, until: now + LEASE};
        // Commit before the network call. Transaction retries NEVER fetch.
        await tx.put('ledger', ledger);
        return {reserved: true};
      });
      if (reservation.cached) return reply(reservation.cached);
      if (!reservation.reserved) return failure(reservation.status, reservation.retry);
      let outcome, timer;
      const controller = new AbortController();
      try {
        // Bound headers AND body reads. No retries/refunds for ambiguous errors.
        const timeout = new Promise(resolve => { timer = setTimeout(() => {
          controller.abort(); resolve({status: 504});
        }, UPSTREAM_TIMEOUT); });
        outcome = await Promise.race([this.upstream(date, controller.signal), timeout]);
      } catch { outcome = {status: controller.signal.aborted ? 504 : 502}; }
      finally { clearTimeout(timer); }
      await this.storage.transaction(async tx => {
        const ledger = await tx.get('ledger');
        if (!ledger || ledger.pending[key]?.lease !== lease) throw Error('lease');
        delete ledger.pending[key];
        if (outcome.status === 429) ledger.blockedUntil = Math.max(ledger.blockedUntil, Date.now() + outcome.retry * 1000);
        if (outcome.data) {
          ledger.cache = ledger.cache.filter(entry => entry !== key);
          ledger.cache.push(key);
          while (ledger.cache.length > MAX_CACHE) await tx.delete(ledger.cache.shift());
          await tx.put(key, {expiresAt: Date.now() + TTL, data: outcome.data});
        }
        await tx.put('ledger', ledger);
      });
      return outcome.data ? reply(outcome.data) : failure(outcome.status, outcome.retry);
    } catch {
      // Fail closed on storage errors. Committed reservations are never
      // refunded; failed completion writes leave the persistent lease intact.
      return failure();
    }
  }

  async upstream(date, signal) {
    const response = await fetch('https://v3.football.api-sports.io/fixtures?date=' + date, {
      headers: {'x-apisports-key': this.env.API_FOOTBALL_KEY, accept: 'application/json'},
      signal, redirect: 'error'
    });
    if (response.status === 429) return {status: 429, retry: retrySeconds(response.headers.get('Retry-After'), Date.now())};
    if (!response.ok) return {status: 502};
    const data = await readJSON(response);
    if (data?.errors != null) {
      if (typeof data.errors !== 'object') throw Error('errors');
      if (Object.keys(data.errors).length) return /rate.?limit|too many requests/i.test(JSON.stringify(data.errors))
        ? {status: 429, retry: retrySeconds(response.headers.get('Retry-After'), Date.now())} : {status: 422};
    }
    const result = validatedData(data, this.env.API_FOOTBALL_KEY);
    result.updatedAt = new Date().toISOString();
    result.freshnessSeconds = TTL / 1000;
    return {data: result};
  }
}

export default {fetch() { return new Response('Not found', {status: 404}); }};
