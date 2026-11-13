import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FootballQuota} from '../workers/football-quota/src/index.mjs';

const source = await readFile(new URL('../functions/api/football.js', import.meta.url), 'utf8');
export const {onRequestGet} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const copy = value => value === undefined ? undefined : structuredClone(value);

// Serializable transactions, rollback on failure, isolated values and an
// optional callback replay. No Cloudflare or provider network is used.
export class MockStorage {
  data = new Map();
  tail = Promise.resolve();
  fail = () => false;
  replay = false;
  async transaction(callback) {
    const operation = this.tail.then(async () => {
      const attempt = async commit => {
        const values = new Map([...this.data].map(([key, value]) => [key, copy(value)]));
        const writes = [];
        const tx = {
          get: async key => copy(values.get(key)),
          put: async (key, value) => { writes.push(key); values.set(key, copy(value)); },
          delete: async key => { writes.push(key); values.delete(key); }
        };
        const result = await callback(tx);
        if (this.fail(writes)) throw Error('mock storage failure');
        if (commit) this.data = values;
        return result;
      };
      if (this.replay) await attempt(false);
      return attempt(true);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}

export const validPayload = () => ({errors: [], results: 1, response: [{
  fixture: {id: 1, date: '2026-11-13T12:00:00+00:00', status: {short: 'FT'}},
  league: {id: 2, name: 'Mock league'},
  teams: {home: {id: 3, name: 'Home'}, away: {id: 4, name: 'Away'}},
  goals: {home: 0, away: 0}
}]});

export function harness({budget = 3, provider = async () => Response.json(validPayload()),
    storage = new MockStorage(), key = 'mock-only-credential'} = {}) {
  const oldFetch = globalThis.fetch;
  const env = {API_FOOTBALL_KEY: key, API_FOOTBALL_DAILY_BUDGET: String(budget)};
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/v3\.football\.api-sports\.io\/fixtures\?date=\d{4}-\d{2}-\d{2}$/);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-apisports-key'], key);
    calls.push(String(url));
    return provider(url, options);
  };
  let coordinator = new FootballQuota({storage}, env);
  const binding = {
    idFromName(name) { assert.equal(name, 'api-football-global-v1'); return name; },
    get() { return {fetch: (url, init) => coordinator.fetch(new Request(url, init))}; }
  };
  return {
    storage, calls, env, binding,
    restart() { coordinator = new FootballQuota({storage}, env); },
    direct(date, client = '127.0.0.1') {
      return coordinator.fetch(new Request('https://football-quota.internal/fixtures', {
        method: 'POST', body: JSON.stringify({date, client})
      }));
    },
    request(query = 'endpoint=fixtures&date=2026-11-13', {origin = 'https://mock.invalid', client = '127.0.0.1', bound = true} = {}) {
      return onRequestGet({request: new Request(origin + '/api/football?' + query, {
        headers: {'CF-Connecting-IP': client}
      }), env: bound ? {FOOTBALL_QUOTA: binding} : {}});
    },
    close() { globalThis.fetch = oldFetch; }
  };
}

export async function until(predicate) {
  for (let i = 0; i < 1000; i++) {
    if (predicate()) return;
    await new Promise(setImmediate);
  }
  throw Error('mock condition not reached');
}
