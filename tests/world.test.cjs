const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/world/index.html'), 'utf8');

// Run the shipped scripts together. Only DOM, rendering, timers and network are
// replaced, so regressions in the original event handlers remain observable.
async function world({ demo = false, configFailure = false } = {}) {
  const nodes = new Map();
  function element() {
    return { style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', hidden: false,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this[k] = v; }, addEventListener() {}, appendChild() {}, insertBefore() {},
      insertAdjacentHTML() {}, querySelectorAll() { return []; }, querySelector() { return element(); },
      click() { return this.onclick?.(); }, getBoundingClientRect() { return { top: 0, left: 0, width: 40, height: 40 }; } };
  }
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const control = { rows: [], loadError: null, reportError: null, reports: 0, configReads: 0, holdReport: null, holdLoad: null, sightingError: null };
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: 'test-user' } } } }; } },
    from(table) {
      const q = {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        in() { return this; }, gte() { return this; }, upsert() { return this; },
        async insert() { control.reports++; if (control.holdReport) await control.holdReport; return { error: control.reportError }; },
        then(ok, no) { return (async () => { if (table === 'shops' && control.holdLoad) await control.holdLoad; return { data: table === 'shops' ? control.rows : [], error: table === 'shops' ? control.loadError : table === 'sightings' ? control.sightingError : null }; })().then(ok, no); }
      };
      return q;
    },
    channel() { return { on() { return this; }, subscribe(cb) { cb('SUBSCRIBED'); return this; }, track() { return Promise.resolve(); }, untrack() {} }; },
    removeChannel() {}
  };
  const context = vm.createContext({
    console: { warn() {}, log() {} }, URLSearchParams, crypto: { randomUUID: () => 'test-session' },
    THREE: { Raycaster: class {}, Vector2: class {} },
    document: { getElementById: $, querySelector: () => element(), querySelectorAll: () => [],
      createElement: element, addEventListener() {}, body: element(), head: element() },
    location: { search: demo ? '?mode=demo' : '', href: 'http://localhost/world/index.html' },
    navigator: { userAgent: 'test' }, localStorage: storage, sessionStorage: storage,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() {}, addEventListener() {},
    supabase: { createClient: () => client },
    async fetch() { control.configReads++; if (configFailure) throw new Error('offline'); return { ok: true, status: 200, json: async () => ({ url: 'https://example.invalid', anon: 'test-only' }) }; }
  });
  context.window = context;
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = /src="([^"]+)"/.exec(script[1])?.[1];
    if (src?.startsWith('/world/')) vm.runInContext(fs.readFileSync(path.join(root, 'public', src), 'utf8'), context);
    else if (!src) vm.runInContext(script[2], context);
  }
  await context.LIVE.initP;
  const run = code => vm.runInContext(code, context);
  run("stall=()=>{};lab=()=>{};LL={lat:37,lng:127};");
  return { $, control, context, run };
}

const shop = { id: 'shop-1', name: '테스트 가게', world_x: 10, world_z: 5, created_at: '2026-01-01T00:00:00Z' };

test('explicit demo mode works without requesting server configuration', async () => {
  const w = await world({ demo: true });
  assert.equal(w.control.configReads, 0);
  assert.equal(w.context.LIVE.on, false);
  assert.match(w.$('connection-note').textContent, /체험 모드/);
});

test('connection failure is described as demo data, not live shops', async () => {
  const w = await world({ configFailure: true });
  assert.equal(w.context.LIVE.on, false);
  assert.match(w.$('connection-note').textContent, /연결이 어려워/);
  w.run('finishScan()');
  assert.match(w.$('sm').textContent, /실제 가게.*아니에요/);
});

test('empty world disables unavailable actions and direct handlers do not throw', async () => {
  const w = await world();
  w.run("running=true;LIVE.loadState='ready';refreshWorldUI()");
  for (const id of ['b1', 'b2', 'b3']) assert.equal(w.$(id).disabled, true);
  assert.doesNotThrow(() => w.$('b1').onclick());
  assert.doesNotThrow(() => w.$('b3').onclick());
  assert.equal(w.$('world-empty').hidden, false);
  assert.equal(w.$('cmp').style.visibility, 'hidden');
});

test('failed list load stays distinct from an empty area and supports retry', async () => {
  const w = await world();
  w.control.loadError = { message: 'offline' };
  w.run("running=true;area='테스트역'");
  await w.context.LIVE.load('테스트역');
  w.run('finishScan()');
  assert.match(w.$('st').textContent, /불러오지 못했어요/);
  assert.equal(w.$('empty-action').textContent, '다시 불러오기');
  w.control.loadError = null;
  w.control.rows = [shop];
  await w.$('empty-action').onclick();
  assert.equal(w.context.LIVE.loadState, 'ready');
  assert.equal(w.run('spots.length'), 1);
  assert.equal(w.$('world-empty').hidden, true);
  assert.equal(w.$('b1').disabled, false);
});

test('failed sighting leaves evidence unchanged and can be retried', async () => {
  const w = await world();
  w.control.rows = [shop];
  await w.context.LIVE.load('테스트역');
  w.control.reportError = { message: 'offline' };
  await w.run("mark(0,'seen')");
  assert.equal(w.run('spots[0].ev.length'), 0);
  assert.equal(w.run('spots[0].last'), undefined);
  assert.equal(w.run('spots[0].pendingReport'), false);
  assert.match(w.$('toast').textContent, /저장하지 못했어요/);
  w.control.reportError = null;
  await w.run("mark(0,'seen')");
  assert.equal(w.run('spots[0].ev.length'), 1);
  assert.match(w.$('toast').textContent, /목격을 저장했어요/);
});

test('repeated clicks during a pending report send only one request', async () => {
  const w = await world();
  w.control.rows = [shop];
  await w.context.LIVE.load('테스트역');
  let release;
  w.control.holdReport = new Promise(resolve => { release = resolve; });
  const first = w.run("mark(0,'seen')");
  await w.run("mark(0,'not_seen')");
  assert.equal(w.control.reports, 1);
  assert.equal(w.run('spots[0].ev.length'), 0);
  release(); await first;
  assert.equal(w.run('spots[0].ev.length'), 1);
});

test('report response cannot update a new area after navigating away', async () => {
  const w = await world();
  w.control.rows = [shop];
  await w.context.LIVE.load('테스트역');
  let release;
  w.control.holdReport = new Promise(resolve => { release = resolve; });
  const request = w.run("mark(0,'seen')");
  w.run('spots=[]');
  release(); await request;
  assert.equal(w.run('spots.length'), 0);
});


test('a late shop response is ignored after leaving the area', async () => {
  const w = await world();
  let release;
  w.control.rows = [shop];
  w.control.holdLoad = new Promise(resolve => { release = resolve; });
  const request = w.context.LIVE.load('테스트역');
  w.context.LIVE.leave();
  release(); await request;
  assert.equal(w.run('spots.length'), 0);
  assert.equal(w.context.LIVE.loadState, 'idle');
});

test('failed sightings do not render shops with misleading freshness', async () => {
  const w = await world();
  w.control.rows = [shop];
  w.control.sightingError = { message: 'offline' };
  await w.context.LIVE.load('테스트역');
  assert.equal(w.context.LIVE.loadState, 'error');
  assert.equal(w.run('spots.length'), 0);
});

test('loading an area does not derive shared avatar coordinates from GPS', async () => {
  const w = await world();
  w.context.localStorage.getItem = key => key === 'bz_ll' ? '{"lat":37.001,"lng":127.001}' : null;
  await w.context.LIVE.load('내 위치 (37.00, 127.00)');
  assert.equal(w.run('P.x'), 0);
  assert.equal(w.run('P.z'), 0);
});
