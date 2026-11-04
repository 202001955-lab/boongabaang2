const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const SHOP = '00000000-0000-4000-8000-000000000010';
const GPS = { latitude: 37.3947, longitude: 127.1112 };
const now = () => new Date().toISOString();
const shop = (extra = {}) => ({
  id: SHOP, area: '판교', name: '테스트 붕어빵', world_x: 4, world_z: 0,
  landmark: '역 1번 출구', price_text: '3개 2,000원', created_by: OTHER,
  created_at: now(), lat: GPS.latitude, lng: GPS.longitude,
  shop_menu: [{ menu: '팥' }], shop_photos: [], reviews: [], ...extra,
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const assets = new Map([
  ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', [require.resolve('three'), 'application/javascript']],
  ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js', [path.join(path.dirname(require.resolve('@supabase/supabase-js/package.json')), 'dist/umd/supabase.js'), 'application/javascript']],
  ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', [require.resolve('leaflet'), 'application/javascript']],
  ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', [path.join(path.dirname(require.resolve('leaflet')), 'leaflet.css'), 'text/css']],
]);

// A per-test HTTP/WebSocket backend. The application runs its real Supabase,
// Three.js and Leaflet libraries; no application globals or handlers are replaced.
class Backend {
  constructor() {
    this.shops = [shop()];
    this.sightings = [{ id: 'seen-1', shop_id: SHOP, user_id: OTHER, status: 'seen', created_at: now() }];
    this.reviews = [];
    this.calls = [];
    this.frames = [];
    this.channels = [];
    this.failures = new Map();
    this.gates = new Map();
    this.config = 'online';
    this.authFails = false;
    this.mapFails = false;
    this.searchFails = false;
  }
  fail(key, message = 'offline') { this.failures.set(key, message); }
  recover(key) { this.failures.delete(key); }
  hold(key) {
    let release;
    this.gates.set(key, new Promise(resolve => { release = resolve; }));
    return () => { this.gates.delete(key); release(); };
  }
  requests(key) { return this.calls.filter(c => c.key === key); }
  async http(route) {
    const req = route.request(), url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    const method = req.method();
    const key = method + ' ' + table;
    const body = req.postDataJSON();
    this.calls.push({ key, body, url: url.toString() });
    const reply = (json, status = 200, headers = {}) => route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*', ...headers } });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const gate = this.gates.get(key);
    if (gate) await gate;
    if (this.failures.has(key)) return reply({ message: this.failures.get(key), code: 'P0001' }, 400);
    if (url.pathname.startsWith('/auth/')) {
      if (this.authFails) return reply({ msg: 'Authentication unavailable' }, 503);
      const user = { id: USER, aud: 'authenticated', role: 'authenticated', is_anonymous: true };
      const encode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
      const jwt = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: USER, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.test-signature';
      return reply({ access_token: jwt, refresh_token: 'test-refresh-only', token_type: 'bearer', expires_in: 3600, user });
    }
    if (method === 'GET') {
      let rows = table === 'shops' ? this.shops.map(s => ({ ...s, reviews: this.reviews.filter(r => r.shop_id === s.id) })) : table === 'sightings' ? this.sightings : table === 'reviews' ? this.reviews : [];
      for (const [field, filter] of url.searchParams) {
        if (filter.startsWith('eq.')) rows = rows.filter(r => String(r[field]) === filter.slice(3));
        if (filter.startsWith('in.(')) rows = rows.filter(r => filter.slice(4, -1).split(',').includes(String(r[field])));
        if (filter.startsWith('gte.')) rows = rows.filter(r => r[field] >= (typeof r[field] === 'number' ? +filter.slice(4) : filter.slice(4)));
        if (filter.startsWith('lte.')) rows = rows.filter(r => r[field] <= (typeof r[field] === 'number' ? +filter.slice(4) : filter.slice(4)));
      }
      if (table === 'reviews') rows = rows.slice().sort((a,b) => b.created_at.localeCompare(a.created_at));
      const total = rows.length;
      const offset = +(url.searchParams.get('offset') || 0), limit = +(url.searchParams.get('limit') || total || 1);
      rows = rows.slice(offset, offset + limit);
      return reply(rows, 200, { 'content-range': `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}`, 'access-control-expose-headers': 'content-range' });
    }
    if (method === 'POST') {
      if (table === 'shops') {
        const row = shop({ ...body, id: '00000000-0000-4000-8000-000000000011', created_by: USER, shop_menu: [] });
        this.shops.push(row);
        return reply({ id: row.id }, 201);
      }
      if (table === 'shop_menu') {
        for (const menu of body) this.shops.find(s => s.id === menu.shop_id)?.shop_menu.push({ menu: menu.menu });
      }
      if (table === 'sightings') this.sightings.push({ ...body, id: 'test-sighting', user_id: USER, created_at: now() });
      if (table === 'reviews') {
        this.reviews = this.reviews.filter(r => !(r.shop_id === body.shop_id && r.user_id === USER));
        this.reviews.unshift({ ...body, user_id: USER, created_at: now() });
      }
      return reply(null, 201);
    }
    throw new Error('Unhandled mock API request: ' + key);
  }
  websocket(ws) {
    ws.onMessage(raw => {
      const frame = JSON.parse(String(raw));
      this.frames.push(frame);
      const reply = response => ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, payload: { status: 'ok', response } }));
      if (frame.event === 'phx_join') {
        const filters = (frame.payload.config.postgres_changes || []).map((f, index) => ({ ...f, id: index + 1 }));
        this.channels.push({ ws, topic: frame.topic, filters });
        reply({ postgres_changes: filters });
        ws.send(JSON.stringify({ topic: frame.topic, event: 'presence_state', payload: {}, ref: null }));
      } else if (frame.event === 'heartbeat' || frame.event === 'phx_leave' || frame.event === 'presence') reply({});
    });
  }
  send(event, payload) {
    const channel = this.channels.at(-1);
    if (!channel) throw new Error('No realtime subscription');
    channel.ws.send(JSON.stringify({ topic: channel.topic, event, payload, ref: null }));
  }
  change(table, row, type = 'INSERT') {
    const channel = this.channels.at(-1);
    const ids = channel.filters.filter(f => f.table === table).map(f => f.id);
    this.send('postgres_changes', { ids, data: { schema: 'public', table, type, commit_timestamp: now(), columns: [], record: row, old_record: {}, errors: null } });
  }
}

const test = base.extend({
  backend: async ({ context, page }, use) => {
    const backend = new Backend();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.routeWebSocket(/.*/, ws => {
      if (new URL(ws.url()).hostname === 'bungzone.test') backend.websocket(ws);
      else { external.push(ws.url()); ws.close(); }
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/config' && url.hostname === '127.0.0.1') {
        backend.calls.push({ key: 'GET config' });
        if (backend.config === 'offline') return route.abort('failed');
        return route.fulfill({ status: backend.config === 'unconfigured' ? 503 : 200, json: backend.config === 'unconfigured' ? { error: 'not_configured' } : { url: 'https://bungzone.test', anon: 'test-public-key' } });
      }
      if (url.hostname === '127.0.0.1') return route.continue();
      if (assets.has(url.href)) {
        if (backend.mapFails && url.href.includes('leaflet.min.js')) return route.abort('failed');
        const [file, contentType] = assets.get(url.href);
        return route.fulfill({ body: fs.readFileSync(file), contentType });
      }
      if (url.hostname === 'bungzone.test') return backend.http(route);
      if (url.hostname === 'tile.openstreetmap.org') return route.fulfill({ body: png, contentType: 'image/png' });
      if (url.hostname === 'nominatim.openstreetmap.org') return route.fulfill({ json: backend.searchFails ? [] : [{ lat: String(GPS.latitude), lon: String(GPS.longitude) }] });
      if (url.hostname === 'photon.komoot.io') return route.fulfill({ json: { features: [] } });
      external.push(url.href);
      return route.abort('blockedbyclient');
    });
    // Only preference setup: user journeys still enter through the actual UI.
    await context.addInitScript(() => {
      if (!localStorage.getItem('e2e-preferences')) {
        localStorage.setItem('bz_mute', '1');
        localStorage.setItem('bz_lg2', '1');
        localStorage.setItem('e2e-preferences', '1');
      }
    });
    await use(backend);
    expect(errors, 'uncaught browser exceptions').toEqual([]);
    expect(external, 'unmocked external traffic').toEqual([]);
  },
  app: async ({ page, backend }, use) => {
    await use({
      async open(mode = 'online') { await page.goto(mode === 'demo' ? '/world/index.html?mode=demo' : '/'); await expect(page.locator('#connection-note')).not.toHaveText('동네 연결을 확인하고 있어요.'); },
      async chooseArea(area = '판교') {
        await page.getByRole('button', { name: '입장하기', exact: true }).click();
        await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('테스트냥');
        await page.getByRole('button', { name: '다음', exact: true }).click();
        if (await page.locator('#ask').isVisible()) {
          await page.getByRole('button', { name: '위치 허용이 어렵다면 역 이름으로 찾기' }).click();
          await page.getByRole('textbox', { name: '지역 이름' }).fill(area);
          await page.getByRole('button', { name: '이 역 주변 보기' }).click();
        }
      },
      async enter(mode = 'online', area = '판교') {
        await this.open(mode); await this.chooseArea(area); await this.finishEntry();
      },
      async finishEntry() {
        await page.locator('#go').click();
        // Wait for the scheduled tutorial instead of racing isVisible(). Empty
        // worlds intentionally skip it; populated worlds schedule it after entry.
        if (await page.locator('#b1').isEnabled()) {
          const tutorial = page.getByRole('button', { name: '튜토리얼 건너뛰기', exact: true });
          if (!(await page.evaluate(() => localStorage.getItem('bz_tut4')))) await tutorial.click();
        }
        await expect(page.locator('#world-status')).toBeVisible();
      },
      async details() { await page.getByRole('button', { name: '👀 구경하기', exact: true }).click(); await expect(page.locator('#bub')).toBeVisible(); },
      async menu(name) { await page.getByRole('button', { name: '더보기', exact: true }).click(); await page.getByRole('button', { name, exact: true }).click(); },
    });
  },
});
module.exports = { test, expect, shop, GPS, USER, OTHER, SHOP };
