/* 붕세권 live.js — 서버(Supabase) 연결 계층.
 * 설정이 없거나 연결에 실패하면 LIVE.on=false 로 남고, 월드는 기존 데모(혼자 하기) 모드로 동작합니다.
 * 아바타는 동네 공통 시작점에서 출발합니다. GPS에서 계산한 사용자 위치를 아바타 좌표로 공유하지 않습니다. */
(function () {
  'use strict';
  const L = window.LIVE;
  L.loadState = 'idle';
  L.realtimeState = 'idle';
  let loadVersion = 0;
  L.photos = false; // 사진 기능: 신고/관리 기능이 생기기 전까지 꺼둠
  const SCHEMA_HINT = '서버 설정을 확인해 주세요';
  let sb = null, ch = null, uid = null, peers = [], meshes = {}, sid = null, lastTrack = '', lastMv = '', lastChat = 0, qt = 0, lastQ = null;
  try { sid = sessionStorage.getItem('bz_sid') || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); sessionStorage.setItem('bz_sid', sid) } catch (e) { sid = String(Math.random()).slice(2) }

  const strs = (v, n) => String(v == null ? '' : v).slice(0, n);
  const hashStr = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) };
  const sbUrl = () => (L.cfg && L.cfg.url) || '';
  const safePhoto = u => typeof u === 'string' && u.startsWith(sbUrl() + '/storage/') ? u : null;
  const fail = (m, e) => { console.warn('[bungzone]', m, e); const d = e && (e.message || e.code) ? ' [' + String(e.message || e.code).slice(0, 70) + ']' : ''; try { say(m + d) } catch (x) { } };

  /* ---------- 1. 시작: 설정 읽기 → 클라이언트 → 익명 로그인 ---------- */
  L.initP = (async () => {
    try {
      if (new URLSearchParams(location.search).get('mode') === 'demo') { L.demoReason = 'selected'; return }
      if (window.__sbfail || !window.supabase) throw new Error('client_unavailable');
      const r = await Promise.race([fetch('/api/config', { cache: 'no-store' }), new Promise((_, j) => setTimeout(() => j('timeout'), 3000))]);
      if (r.status === 503) { L.demoReason = 'unconfigured'; return }
      if (!r.ok) throw new Error('config_unavailable');
      const c = await r.json();
      if (!c || !c.url || !c.anon) throw new Error('config_invalid');
      L.cfg = c;
      sb = window.supabase.createClient(c.url, c.anon, { realtime: { params: { eventsPerSecond: 10 } } });
      let { data } = await sb.auth.getSession();
      if (!data.session) { const x = await sb.auth.signInAnonymously(); if (x.error) throw x.error; data = x.data }
      uid = data.session ? data.session.user.id : (data.user && data.user.id);
      L.sb = sb; L.uid = uid; L.on = true;
    } catch (e) { console.warn('[bungzone] 서버 연결 실패 → 데모 모드', e && e.message || e); L.on = false; L.demoReason = 'error' }
    finally { refreshWorldUI() }
  })();

  /* ---------- 2. 동네 입장: pick 을 감싸서 연결 준비가 끝난 뒤 실행 ---------- */
  const _pick = window.pick;
  window.pick = function (a, seed) {
    L.initP.then(() => {
      leave();
      if (L.on) a = String(a).replace(/\(\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/, (m, x, y) => '(' + (+x).toFixed(2) + ', ' + (+y).toFixed(2) + ')'); // 같은 동네 사람끼리 같은 월드가 되도록 ~1km 격자로 맞춤
      _pick(a, seed);
    });
  };

  /* ---------- 3. 가게/목격/리뷰 불러오기 ---------- */
  function mkSpot(r, sights, tab) {
    const photos = (r.shop_photos || []).slice().sort((a, b) => b.created_at < a.created_at ? -1 : 1).map(p => safePhoto(p.url)).filter(Boolean);
    const ev = (sights || []).map(x => ({ t: Date.parse(x.created_at), st: x.status, sid: x.user_id }));
    const k = {
      id: r.id, n: strs(r.name, 40), x: +r.world_x, z: +r.world_z, t: Date.parse(r.created_at), ev, q: 0,
      w: ev.filter(e => e.st === 'seen').length, menu: (r.shop_menu || []).map(m => m.menu), p: strs(r.price_text, 20), land: strs(r.landmark, 30),
      photo: L.photos ? (photos[0] || null) : null, rev: (r.reviews || []).map(v => ({ rating: +v.rating, body: strs(v.body, 80), nick: strs(v.nick, 10), uid: v.user_id, t: Date.parse(v.created_at) })), user: false
    };
    k.lat = r.lat == null ? null : +r.lat; k.lng = r.lng == null ? null : +r.lng; k.addr = null; k.ll = llOf(k.x, k.z);
    return k;
  }
  L.load = async function (a) {
    if (!L.on) return;
    const version = ++loadVersion;
    L.area = a; L.loadState = 'loading'; refreshWorldUI();
    try {
      const { data, error } = await sb.from('shops').select('*,shop_menu(menu),shop_photos(url,created_at),reviews(rating,body,nick,user_id,created_at)')
        .eq('area', a).order('created_at', { referencedTable: 'reviews', ascending: false }).limit(20, { referencedTable: 'reviews' });
      if (error) throw error;
      const ids = data.map(d => d.id); let sg = [];
      if (ids.length) {
        const q = await sb.from('sightings').select('shop_id,status,user_id,created_at').in('shop_id', ids).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
        if (q.error) throw q.error;
        sg = q.data;
      }
      if (version !== loadVersion) return;
      data.forEach(r => { if (spots.some(s => s.id === r.id)) return; const k = mkSpot(r, sg.filter(x => x.shop_id === r.id)); spots.push(k); stall(k) });
      L.loadState = 'ready';
      if (!ch) join(a);
    } catch (e) {
      if (version !== loadVersion) return;
      console.warn('[bungzone] 가게 목록 로딩 실패', e);
      L.loadState = 'error';
    } finally {
      if (version === loadVersion) refreshWorldUI();
    }

  };

  /* ---------- 4. 실시간 방: 접속 중인 고양이, 줄, 채팅, 새 가게/목격/리뷰 ---------- */
  function me() { return { sid, nick: nick, cat: myCat, q: inQ && inQ.id ? inQ.id : null, qt: qt, x: +P.x.toFixed(1), z: +P.z.toFixed(1) } }
  function join(a) {
    const version = loadVersion;
    ch = sb.channel('world:' + a, { config: { presence: { key: sid }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, onSync)
      .on('broadcast', { event: 'mv' }, ({ payload }) => onMove(payload))
      .on('broadcast', { event: 'chat' }, ({ payload }) => onChat(payload))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shops', filter: 'area=eq.' + a }, ({ new: r }) => {
        if (r.created_by === uid || spots.some(s => s.id === r.id)) return;
        const k = mkSpot(r, [{ created_at: r.created_at, status: 'seen', user_id: r.created_by }]); spots.push(k); stall(k); refreshWorldUI(); say('🐟 새 붕어빵이 발견됐어요: ' + k.n);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, ({ new: r }) => {
        const s = spots.find(x => x.id === r.shop_id); if (!s || r.user_id === uid) return;
        (s.ev = s.ev || []).push({ t: Date.parse(r.created_at), st: r.status, sid: r.user_id }); if (r.status === 'seen') { s.w++ } lab(s);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, ({ new: r }) => {
        const s = r && spots.find(x => x.id === r.shop_id); if (!s || r.user_id === uid) return;
        s.rev = (s.rev || []).filter(v => v.uid !== r.user_id); s.rev.unshift({ rating: +r.rating, body: strs(r.body, 80), nick: strs(r.nick, 10), uid: r.user_id, t: Date.parse(r.created_at) });
      })
      .subscribe(st => {
        if (version !== loadVersion) return;
        if (st === 'SUBSCRIBED') { L.realtimeState = 'ready'; lastTrack = ''; track(true) }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') L.realtimeState = 'error';
        refreshWorldUI();
      });
    saveProfile();
  }
  function leave() {
    ++loadVersion; L.loadState = 'idle'; L.realtimeState = 'idle';
    try { if (ch && sb) { ch.untrack(); sb.removeChannel(ch) } } catch (e) { }
    ch = null; peers = []; Object.keys(meshes).forEach(k => dropMesh(k)); lastTrack = '';
  }
  function track(force) {
    if (!ch) return;
    const m = me(), key = [m.nick, m.q, m.qt].join('|');
    if (!force && key === lastTrack && Date.now() - (track.t || 0) < 15000) return;
    lastTrack = key; track.t = Date.now(); ch.track(m).catch(() => { });
  }
  function onSync() {
    const st = ch.presenceState(); peers = [];
    Object.keys(st).forEach(k => { if (k === sid) return; const m = st[k][st[k].length - 1]; if (m && m.sid) peers.push({ sid: m.sid, nick: strs(m.nick, 10), cat: m.cat, q: m.q || null, qt: +m.qt || 0, x: +m.x || 0, z: +m.z || 0 }) });
    spots.forEach(s => { if (s.id) s.q = peers.filter(p => p.q === s.id).length + (inQ === s ? 1 : 0) });
    const keep = new Set();
    peers.forEach(p => { if (p.q) return; keep.add(p.sid); let m = meshes[p.sid]; if (!m) m = addMesh(p); m.tx = p.x; m.tz = p.z; m.nick = p.nick });
    Object.keys(meshes).forEach(k => { if (!keep.has(k)) dropMesh(k) });
    $('area').textContent = areaTxt();
  }
  function addMesh(p) {
    const cat = p.cat && p.cat.eye ? p.cat : catStyle(hashStr(p.sid)), g = person(cat, SCARF[hashStr(p.sid) % SCARF.length], 0);
    mkBub(g, '🐱 ' + p.nick); g.position.set(p.x, 0, p.z); world.add(g); g.tx = p.x; g.tz = p.z; meshes[p.sid] = g; return g;
  }
  function dropMesh(k) { const m = meshes[k]; if (m && world) world.remove(m); delete meshes[k] }
  function onMove(m) { const g = m && meshes[m.sid]; if (g) { g.tx = +m.x || 0; g.tz = +m.z || 0 } }
  function onChat(m) {
    if (!m || !m.shop) return; const s = spots.find(x => x.id === m.shop); if (!s) return;
    const nk = strs(m.nick, 10), tx = strs(m.text, 60); if (!tx) return;
    addLog(s, nk, tx);
    const others = peers.filter(p => p.q === s.id).sort((a, b) => a.qt - b.qt), i = others.findIndex(p => p.sid === m.sid);
    if (i >= 0 && s.npc[i] && s.npc[i].visible) setBub(s.npc[i], tx);
  }
  // 움직임/줄 상태 전송 (약 5Hz, 바뀐 것만)
  setInterval(() => {
    if (!L.on || !ch) return;
    if (inQ !== lastQ) { lastQ = inQ; qt = inQ ? Date.now() : 0; if (inQ) L.qt = qt; if (inQ && inQ.id) { inQ.q = peers.filter(p => p.q === inQ.id).length + 1 } track() }
    if (nick && lastTrack.split('|')[0] !== nick) track();
    const k = P.x.toFixed(1) + ',' + P.z.toFixed(1);
    if (k !== lastMv && !inQ) { lastMv = k; ch.send({ type: 'broadcast', event: 'mv', payload: { sid, x: +P.x.toFixed(1), z: +P.z.toFixed(1) } }) }
    track();
  }, 200);
  // 다른 고양이가 부드럽게 걸어오도록
  (function anim() {
    requestAnimationFrame(anim);
    Object.keys(meshes).forEach(k => { const g = meshes[k], dx = g.tx - g.position.x, dz = g.tz - g.position.z, d = Math.hypot(dx, dz); if (d > .05) { const st = Math.min(d, Math.max(.12, d * .18)); g.position.x += dx / d * st; g.position.z += dz / d * st; g.rotation.y = Math.atan2(dx, dz) } });
  })();
  window.addEventListener('pagehide', () => { try { ch && ch.untrack() } catch (e) { } });

  /* ---------- 5. 닉네임/프로필 저장 ---------- */
  async function saveProfile() {
    if (!L.on || !nick) return;
    const r = await sb.from('profiles').upsert({ id: uid, nickname: nick, cat_style: myCat });
    if (r.error) console.warn('[bungzone] profile', r.error.message);
  }
  const _sn = window.setNick;
  window.setNick = function (n) { _sn(n); if (L.on) { saveProfile(); track(true) } };

  /* ---------- 6. 채팅: 같은 줄에 선 진짜 유저끼리 ---------- */
  window.members = function (s) {
    if (!L.on || !s.id) {
      const i = spots.indexOf(s), isMe = inQ === s, a = []; for (let k = 0; k < Math.min(s.q, 8) - (isMe ? 1 : 0); k++) a.push(NAMES[(i * 3 + k) % 8]);
      return { a, me: isMe, more: Math.max(0, s.q - 8) };
    }
    const a = peers.filter(p => p.q === s.id).sort((x, y) => x.qt - y.qt).map(p => p.nick);
    return { a: a.slice(0, 8), me: inQ === s, more: Math.max(0, a.length - 8) };
  };
  const _sc = window.sendChat;
  window.sendChat = function () {
    const i = $('ci'), t = i && i.value.trim(), s = chatSpot, ok = !!(t && s && inQ === s);
    if (L.on && ok && Date.now() - lastChat < 900) { say('조금만 천천히 말해 주세요 🐾'); return }
    _sc();
    if (L.on && ok && s.id && ch) { lastChat = Date.now(); ch.send({ type: 'broadcast', event: 'chat', payload: { sid, shop: s.id, nick: strs(nick, 10), text: strs(t, 60) } }) }
  };

  /* ---------- 7. 봤어요 / 새 가게 ---------- */
  const _mark = window.mark;
  window.mark = async function (i, st, bar) {
    const s = spots[i];
    if (!s || s.pendingReport) return;
    if (!L.on) return _mark(i, st, bar);
    if (!s.id) { say('가게 저장이 끝난 뒤 다시 제보해 주세요'); return }
    if (s.last && Date.now() - s.last < 18e5) { say('같은 가게는 30분에 한 번만 남길 수 있어요'); return }
    s.pendingReport = true;
    const card = $('bub');
    const buttons = Array.from(card.querySelectorAll('[data-x="seen"], [data-x="none"]')).filter(b => spots[+b.dataset.i] === s);
    buttons.forEach(b => { b.disabled = true });
    const cardBefore = card.innerHTML;
    say('제보를 저장하고 있어요…');
    try {
      const result = await sb.from('sightings').insert({ shop_id: s.id, status: st });
      if (result.error) throw result.error;
      const currentIndex = spots.indexOf(s);
      if (currentIndex < 0) return;
      // Update only the original shop; the user may have changed areas or cards.
      s.last = Date.now();
      (s.ev = s.ev || []).push({ t: s.last, st, sid: uid });
      if (st === 'seen') { s.t = s.last; s.w++ }
      lab(s);
      try { localStorage.setItem('bz_sm', '1') } catch (e) { }
      if (card.innerHTML === cardBefore && card.style.display === 'block') {
        if (bar) closeBub(); else { s.pendingReport = false; show(s) }
      }
      say(st === 'seen' ? '🔥 목격을 저장했어요. 고마워요!' : '🌙 제보를 저장했어요. 고마워요!');
    } catch (e) {
      console.warn('[bungzone] 제보 저장 실패', e);
      say(/duplicate/.test(e.message || '') ? '같은 가게는 30분에 한 번만 남길 수 있어요' : '제보를 저장하지 못했어요. 연결을 확인하고 다시 눌러주세요.');
    } finally {
      s.pendingReport = false;
      buttons.forEach(b => { b.disabled = false });
      if (card.innerHTML !== cardBefore) {
        card.querySelectorAll('[data-x="seen"], [data-x="none"]').forEach(b => {
          if (spots[+b.dataset.i] === s) { b.disabled = false; if (b.dataset.x === 'seen') b.textContent = '🔥 봤어요' }
        });
      }
    }
  };
  const _persist = window.persist;
  window.persist = function () { if (!L.on) return _persist() };
  const _save = window.save;
  window.save = function () {
    const r = reg;
    if (L.on && r && !r.real) { pickReal(r, () => window.save()); return } // 실제 지도에서 위치를 먼저 찍어요
    _save();
    if (!(L.on && r)) return;
    const s = spots[spots.length - 1]; if (!s || s.id) return;
    if (r.real) { s.lat = r.real.lat; s.lng = r.real.lng } s.addr = null;
    bub('<div style="text-align:center;padding:10px"><div style="font-size:36px">🐟</div><b>저장하는 중…</b></div>');
    createShop(s, r);
  };
  async function createShop(s, r) {
    try {
      const ins = await sb.from('shops').insert({ area: L.area, name: s.n, world_x: s.x, world_z: s.z, landmark: s.land || null, price_text: s.p || null, lat: r.real ? r.real.lat : null, lng: r.real ? r.real.lng : null }).select('id').single();
      if (ins.error) throw ins.error;
      s.id = ins.data.id;
      if (s.menu && s.menu.length) await sb.from('shop_menu').insert(s.menu.map(m => ({ shop_id: s.id, menu: m })));
      await sb.from('sightings').insert({ shop_id: s.id, status: 'seen' });
      if (L.photos && r.photo && /^data:image\//.test(r.photo)) {
        const blob = await (await fetch(r.photo)).blob(), path = uid + '/' + s.id + '-' + Date.now() + '.jpg';
        const up = await sb.storage.from('shop-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (!up.error) { const url = sb.storage.from('shop-photos').getPublicUrl(path).data.publicUrl; await sb.from('shop_photos').insert({ shop_id: s.id, url }); s.photo = url } else console.warn('[bungzone] photo', up.error.message);
      }
      const idx = spots.indexOf(s);
      bub('<div style="text-align:center"><div style="font-size:44px">🎉</div><h3 style="margin:4px 0">만들어졌어요!</h3><p style="margin:4px 0">이제 동네 사람들도 이 붕어빵을 찾을 수 있어요.</p>'
        + '<button class="b p" style="width:100%;margin-top:10px" data-x="gonew" data-i="' + idx + '">🚶 만들어진 곳으로 이동하기</button>'
        + (s.lat != null ? '<button class="b" style="width:100%;margin-top:8px" data-x="realgo" data-i="' + idx + '">🌏 실제 지도에서 보기</button>' : '') + '<button class="b" style="width:100%;margin-top:8px" data-x="close">닫기</button></div>');
    } catch (e) {
      try { closeBub() } catch (x) { }
      fail(/duplicate_shop/.test(e.message || '') ? '같은 자리(13m 안)에 이미 등록된 붕어빵이 있어요' : /too_many/.test(e.message || '') ? '하루에 5곳까지만 등록할 수 있어요' : '새 가게가 서버에 저장되지 않았어요', e);
      try { world.remove(s.g); (s.npc || []).forEach(n => world.remove(n)) } catch (x) { } const i = spots.indexOf(s); if (i >= 0) spots.splice(i, 1); refreshWorldUI();
    }
  }

  /* ---------- 8. 리뷰판 ("맛있었다면 리뷰를 남겨주세요") ---------- */
  const revMem = {}; // 데모 모드용
  const getRev = s => s.id ? (s.rev || []) : (revMem[area + '|' + s.n] || (revMem[area + '|' + s.n] = []));
  const stars = n => '⭐'.repeat(Math.max(0, Math.min(5, n)));
  function revHTML(s, i) {
    const r = getRev(s), avg = r.length ? (r.reduce((a, b) => a + b.rating, 0) / r.length).toFixed(1) : null;
    return `<div class="rv" id="rvbox"><div class="rvh"><span>${avg ? `⭐ ${avg} · 리뷰 ${r.length}개` : '아직 리뷰가 없어요'}</span><span><button class="lk2" data-x="rev" data-i="${i}">리뷰 쓰기</button>${r.length > 1 ? `<button class="lk2" data-x="revall" data-i="${i}">모두 보기</button>` : ''}</span></div>` +
      (r[0] ? `<div class="rv1">${stars(r[0].rating)} <b>${esc(r[0].nick || '익명')}</b> ${esc(r[0].body || '')}</div>` : '') + `</div>`;
  }
  const _show = window.show;
  window.show = function (s) { _show(s); const b = $('bub'), rows = $('rows'); if (b && b.style.display !== 'none' && rows) rows.insertAdjacentHTML('beforeend', revHTML(s, spots.indexOf(s)) + (s.lat != null ? `<button class="row" data-x="realgo" data-i="${spots.indexOf(s)}"><span>🌏 실제 지도에서 보기</span><span>›</span></button>` : '')) };
  function revForm(i, rating, body) {
    const s = spots[i], mine = getRev(s).find(v => v.mine || (uid && v.uid === uid)); rating = rating || (mine && mine.rating) || 5; body = body != null ? body : (mine && mine.body) || '';
    bub(`<div style="display:flex;justify-content:space-between"><b>😋 ${esc(s.n)} 리뷰</b><button class="b" data-x="close" aria-label="닫기">✕</button></div><small>맛있었다면 다른 고양이들이 참고할 수 있게 남겨주세요. 한 가게에 하나만 남길 수 있고, 다시 쓰면 바뀌어요.</small>
      <div style="display:flex;gap:4px;margin-top:8px" role="radiogroup" aria-label="별점">${[1, 2, 3, 4, 5].map(n => `<button class="b${n === rating ? ' p' : ''}" data-x="rstar" data-i="${i}" data-v="${n}" aria-label="${n}점" style="flex:1">${n}</button>`).join('')}</div>
      <input id="rvb" maxlength="80" placeholder="예: 슈크림이 꽉 차 있어요!" value="${esc(body)}" aria-label="리뷰 내용"><div id="m" role="status"></div>
      <button class="b p" style="width:100%;margin-top:8px" data-x="rsave" data-i="${i}" data-v="${rating}">리뷰 올리기</button>`);
  }
  async function revSave(i, rating) {
    const s = spots[i], body = ($('rvb') && $('rvb').value.trim().slice(0, 80)) || '', nk = nick || '익명냥';
    if (L.on && s.id) {
      const r = await sb.from('reviews').upsert({ shop_id: s.id, rating, body, nick: nk }, { onConflict: 'shop_id,user_id' });
      if (r.error) { const m = $('m'); if (m) m.textContent = '리뷰를 저장하지 못했어요. ' + SCHEMA_HINT; return }
      s.rev = (s.rev || []).filter(v => v.uid !== uid); s.rev.unshift({ rating, body, nick: nk, uid, t: Date.now() });
    } else { const a = getRev(s).filter(v => !v.mine); a.unshift({ rating, body, nick: nk, mine: true, t: Date.now() }); revMem[area + '|' + s.n] = a }
    show(s); say('😋 리뷰 고마워요! 다른 고양이들에게 도움이 돼요');
  }
  const RPG = 5;
  async function revAll(i, pg) {
    const s = spots[i]; pg = pg || 0; let list, total;
    if (L.on && s.id) {
      const r = await sb.from('reviews').select('rating,body,nick,user_id,created_at', { count: 'exact' }).eq('shop_id', s.id).order('created_at', { ascending: false }).range(pg * RPG, pg * RPG + RPG - 1);
      if (!r.error) { total = r.count || 0; list = (r.data || []).map(v => ({ rating: +v.rating, body: strs(v.body, 80), nick: strs(v.nick, 10) })) }
    }
    if (!list) { const a = getRev(s); total = a.length; list = a.slice(pg * RPG, pg * RPG + RPG) }
    const pages = Math.max(1, Math.ceil(total / RPG));
    const pn = pages > 1 ? `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px"><button class="b" data-x="revpg" data-i="${i}" data-v="${pg - 1}" ${pg <= 0 ? 'disabled style="opacity:.35"' : ''} aria-label="이전 페이지">‹</button><span style="font-size:13px">${pg + 1} / ${pages}</span><button class="b" data-x="revpg" data-i="${i}" data-v="${pg + 1}" ${pg >= pages - 1 ? 'disabled style="opacity:.35"' : ''} aria-label="다음 페이지">›</button></div>` : '';
    bub(`<div style="display:flex;justify-content:space-between"><b>😋 ${esc(s.n)} 리뷰 ${total}개</b><button class="b" data-x="close" aria-label="닫기">✕</button></div><div class="box" style="max-height:260px;overflow:auto">${list.map(x => `<div style="margin-bottom:6px">${stars(x.rating)} <b>${esc(x.nick || '익명냥')}</b> ${esc(x.body || '')}</div>`).join('') || '아직 리뷰가 없어요'}</div>${pn}<button class="b" style="width:100%;margin-top:8px" data-x="rback" data-i="${i}">← 가게로 돌아가기</button>`);
  }
  $('bub').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x, i = +b.dataset.i;
    if (x === 'rev') revForm(i);
    else if (x === 'rstar') revForm(i, +b.dataset.v, $('rvb') ? $('rvb').value : '');
    else if (x === 'rsave') revSave(i, +b.dataset.v);
    else if (x === 'revall') revAll(i, 0);
    else if (x === 'revpg') { if (!b.disabled) revAll(i, +b.dataset.v) }
    else if (x === 'rback') show(spots[i]);
    else if (x === 'gonew') { const t = spots[i]; if (t) { leaveQ(1); closeBub(); P.x = t.x + 1.5; P.z = t.z + 3.4; autoT = null; say('🐟 새로 만든 붕어빵 앞이에요!') } }
    else if (x === 'realgo') { const s = spots[i]; if (s && s.lat != null) openReal(s) }
  });
  // 줄에서 나왔을 때 "맛있었나요?" 안내 (45초 이상 기다렸을 때만)
  const chip = document.createElement('div');
  chip.id = 'rvchip'; chip.setAttribute('role', 'button'); chip.tabIndex = 0;
  chip.style.cssText = 'position:fixed;left:12px;right:12px;max-width:440px;margin:auto;top:calc(150px + env(safe-area-inset-top,0px));background:var(--bg);color:var(--ink);border-radius:14px;padding:10px 12px;font-size:13px;display:none;z-index:5;box-shadow:0 2px 8px #0004;cursor:pointer;text-align:center';
  document.body.appendChild(chip);
  chip.onclick = chip.onkeydown = e => { if (e.type === 'keydown' && e.key !== 'Enter') return; chip.style.display = 'none'; if (chip.s) { const i = spots.indexOf(chip.s); if (i >= 0) revForm(i) } };
  const _lq = window.leaveQ;
  window.leaveQ = function (q) {
    const o = inQ, waited = o ? Date.now() - (qt || L.qt || Date.now()) : 0; _lq(q);
    if (o && !inQ && waited > 45000) { chip.s = o; chip.textContent = '😋 ' + o.n + ' 맛있었나요? 리뷰를 남겨주세요 →'; chip.style.display = 'block'; clearTimeout(chip.k); chip.k = setTimeout(() => chip.style.display = 'none', 12000) }
  };
  /* ---------- 9. 실제 지도 (OpenStreetMap + Leaflet) ----------
   * 가게를 등록할 때 실제 지도에서 핀을 찍어 진짜 좌표(lat,lng)를 저장하고,
   * 🌏 실제 지도에서는 보이는 화면 안의 가게를 실제 위치 기준으로 찾아요.
   * 내 GPS는 이 폰 안에서만 쓰이고 서버로 보내지 않아요(가게 좌표만 저장). */
  const LFV = '1.9.4', LF = () => window.L, KR = [37.5665, 126.9780];
  let lfP = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (lfP) return lfP;
    lfP = new Promise((ok, no) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/' + LFV + '/leaflet.min.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/' + LFV + '/leaflet.min.js'; js.onload = ok; js.onerror = () => { lfP = null; no(new Error('leaflet')) }; document.head.appendChild(js);
    });
    return lfP;
  }
  const st9 = document.createElement('style');
  st9.textContent = `#rmap,#rpick{position:fixed;inset:0;z-index:30;background:var(--bg);color:var(--ink);display:none;flex-direction:column}
.rh{position:relative;z-index:2000;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top,0px))}
.rh button{min-width:44px;min-height:44px;touch-action:manipulation}.rh span{display:flex;gap:6px}.rc{padding:10px 12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));max-height:42%;overflow:auto;font-size:14px;background:var(--bg)}
.rm-pin{font-size:20px;background:#fff;border:2px solid #191F28;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px #0004}.rm-pin.old{opacity:.55}
.mapwrap{position:relative;flex:1;min-height:200px}.mapwrap>div:first-child{position:absolute;inset:0}
.rppin{position:absolute;left:50%;top:50%;width:34px;height:46px;margin-left:-17px;transform:translateY(-100%);line-height:0;z-index:1000;pointer-events:none;filter:drop-shadow(0 2px 2px #0006)}

#rmap,#rpick{background:#1B1815;color:#fff}.rh,.rc{background:#1B1815;color:#fff}#rmap .b,#rpick .b{background:rgba(255,255,255,.16);color:#fff}#rmap .p,#rpick .p{background:#fff;color:#1d1206}#rmap small,#rpick small{color:rgba(255,255,255,.75)}
.rlink{display:inline-block;text-decoration:none;text-align:center;flex:1}#rpick input{margin:0;flex:1}`;
  document.head.appendChild(st9);
  const mk = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild };
  const tiles = lf => lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  // 장소 검색: OpenStreetMap 검색(Nominatim) → 안 되면 Photon 으로 한 번 더. 둘 다 무료라 가끔 느리거나 못 찾을 수 있어요.
  async function getJSON(url) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 7000);
    try { const r = await fetch(url, { signal: ac.signal }); return r.ok ? await r.json() : null } catch (e) { return null } finally { clearTimeout(t) }
  }
  async function geocode(q) {
    q = String(q || '').trim().replace(/\s+/g, ' '); if (!q) return null;
    const enc = encodeURIComponent(q);
    let j = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=' + enc);
    if (j && j[0]) return [+j[0].lat, +j[0].lon];
    j = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ko&q=' + enc + (/대한민국|한국/.test(q) ? '' : '%20대한민국'));
    if (j && j[0]) return [+j[0].lat, +j[0].lon];
    j = await getJSON('https://photon.komoot.io/api/?limit=1&lat=37.55&lon=127.0&q=' + enc);
    const f = j && j.features && j.features[0];
    if (f && f.geometry && f.geometry.coordinates) return [+f.geometry.coordinates[1], +f.geometry.coordinates[0]];
    return null;
  }
  // 월드에서 고른 자리(r.x, r.z 미터)를 실제 지도 위 기준점에 더해서 핀을 그 근처에서 시작해요
  async function startCenter(r) {
    let base = null;
    try { const g = JSON.parse(localStorage.getItem('bz_ll') || 'null'); if (g && g.lat) base = [g.lat, g.lng] } catch (e) { }
    const a = String(L.area || (typeof area === 'string' ? area : '') || ''), m = /\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(a);
    if (!base && m) base = [+m[1], +m[2]];
    if (!base) base = (a && await geocode(a)) || KR;
    if (r && typeof r.x === 'number' && typeof r.z === 'number') base = [base[0] - r.z / 111000, base[1] + r.x / (111000 * Math.cos(base[0] * Math.PI / 180))];
    return base;
  }
  const dist = (a, b) => { const R = 6371000, r = Math.PI / 180, dy = (b[0] - a[0]) * r, dx = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r); return Math.round(Math.hypot(dx, dy) * R) };

  // --- 보기: 🌏 실제 지도 ---
  let rm = null, rmLayer = null, rmMe = null, rmMeLL = null, rmTimer = null, rmTok = 0, rmSel = null;
  function ensureRM() {
    let el = $('rmap'); if (el) return el;
    el = mk(`<div id="rmap" role="dialog" aria-label="실제 지도"><div class="rh"><b>🌏 실제 지도 · 내 주변 붕어빵</b><span><button class="b" id="rme" aria-label="내 위치로">📍 내 위치</button><button class="b" id="rx" aria-label="닫기">✕</button></span></div><div class="mapwrap"><div id="rmm"></div></div><div class="rc" id="rmc"></div></div>`);
    document.body.appendChild(el);
    ['rmap'].forEach(() => el.addEventListener('keydown', e => e.stopPropagation()));
    $('rx').onclick = () => { el.style.display = 'none' };
    $('rx').addEventListener('touchend', e => { e.preventDefault(); el.style.display = 'none' }, { passive: false });
    $('rme').onclick = () => {
      if (!navigator.geolocation) return;
      $('rmc').innerHTML = '<small>위치를 확인하는 중…</small>';
      navigator.geolocation.getCurrentPosition(p => {
        showMe([p.coords.latitude, p.coords.longitude]); rm.setView(rmMeLL, 16);
      }, e => { $('rmc').innerHTML = '<b>📍 위치를 쓸 수 없어요</b><br><small>' + esc(geoMsg(e)) + '</small>' }, { timeout: 15000, maximumAge: 60000 });
    };
    return el;
  }
  async function openReal(focus) {
    const el = ensureRM(); el.style.display = 'flex'; $('rmc').innerHTML = '<small>지도를 불러오는 중…</small>';
    try { await loadLeaflet() } catch (e) { $('rmc').innerHTML = '<b>지도를 불러오지 못했어요</b><br><small>인터넷 연결을 확인해 주세요.</small>'; return }
    const lf = LF(), c = focus && focus.lat != null ? [focus.lat, focus.lng] : await startCenter();
    if (!rm) {
      rm = lf.map('rmm'); tiles(lf).addTo(rm); rmLayer = lf.layerGroup().addTo(rm);
      rm.on('moveend', () => { clearTimeout(rmTimer); rmTimer = setTimeout(fetchBox, 350) });
    }
    rmSel = focus && focus.lat != null ? focus : null;
    rm.setView(c, 16); setTimeout(() => { rm.invalidateSize(); fetchBox() }, 60);
    if (!focus && navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { showMe([p.coords.latitude, p.coords.longitude]); rm.setView(rmMeLL, 16) },
      e => { if (!rmSel) $('rmc').innerHTML = '<small>' + esc(geoMsg(e)) + '</small>' }, { timeout: 10000, maximumAge: 60000 });
  }
  function showMe(ll) { rmMeLL = ll; if (rmMe) rmMe.remove(); rmMe = LF().circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f7bff', fillOpacity: 1 }).addTo(rm) }
  async function fetchBox() {
    if (!rm || $('rmap').style.display === 'none') return;
    if (rm.getZoom() < 12) { $('rmc').innerHTML = '<small>조금 더 확대하면 가게가 보여요.</small>'; return }
    const tok = ++rmTok, b = rm.getBounds();
    const { data, error } = await sb.from('shops').select('*,shop_menu(menu)').not('lat', 'is', null)
      .gte('lat', b.getSouth()).lte('lat', b.getNorth()).gte('lng', b.getWest()).lte('lng', b.getEast()).limit(150);
    if (tok !== rmTok) return;
    if (error) { $('rmc').innerHTML = '<small>가게를 못 불러왔어요 [' + esc(strs(error.message, 60)) + ']</small>'; return }
    const ids = data.map(d => d.id); let sg = [];
    if (ids.length) { const q = await sb.from('sightings').select('shop_id,status,user_id,created_at').in('shop_id', ids).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()); if (!q.error) sg = q.data }
    if (tok !== rmTok) return;
    rmLayer.clearLayers();
    const list = data.map(r => mkSpot(r, sg.filter(x => x.shop_id === r.id)));
    list.forEach(s => {
      const f = stat(s);
      LF().marker([s.lat, s.lng], { icon: LF().divIcon({ className: '', html: '<div class="rm-pin' + (f.old ? ' old' : '') + '">' + f.e + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .addTo(rmLayer).on('click', () => { rmSel = s; rmCard(s) });
    });
    if (rmSel) { const s = list.find(x => x.id === rmSel.id); if (s) return rmCard(s) }
    $('rmc').innerHTML = list.length ? '<small>이 화면에 붕어빵 ' + list.length + '곳이 있어요. 이모티콘을 눌러보세요.</small>' : '<small>이 근처엔 아직 등록된 붕어빵이 없어요. 지도를 움직여 보거나, 월드에서 첫 발견자가 되어 보세요 🐟</small>';
  }
  function rmCard(s) {
    const f = stat(s), info = (s.menu || []).map(m => (MI[m] || '🥞') + ' ' + m).join(' · ') + (s.p ? ((s.menu && s.menu.length) ? ' · ' : '') + '💰 ' + esc(s.p) : '');
    const d = rmMeLL ? ' · 내 위치에서 약 ' + dist(rmMeLL, [s.lat, s.lng]) + 'm' : '', cn = String(s.n || '').replace(/\s*\([^)]*\)/g, '').replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim() || '붕어빵', nm = encodeURIComponent(cn);
    $('rmc').innerHTML = `<b>${f.e} ${esc(cn)}</b><div style="margin-top:4px">${f.k === 'absent' ? '🌙 지금은 없을 수도 있어요' : ago(f.lastT || s.t) + ' 목격'}${f.conf ? ' · 👥 ' + f.conf + '명 확인' : ''}</div>`
      + (s.land && s.land !== s.n ? `<div style="margin-top:4px">📍 ${esc(s.land)}</div>` : '')
      + `<div style="margin-top:4px">${info || '<span style="opacity:.7">메뉴/가격 정보가 아직 없어요</span>'}</div><small>${esc(d.replace(/^ · /, ''))}</small>`
      + `<div class="g"><a class="b p rlink" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${nm},${s.lat},${s.lng}">🧭 카카오맵 길찾기</a><a class="b rlink" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">구글지도</a></div>`;
  }

  // --- 등록: 실제 지도에서 핀 찍기 (가운데 핀 고정, 지도를 움직여 맞추기) ---
  let pk = null, pkR = null, pkDone = null;
  function ensurePK() {
    let el = $('rpick'); if (el) return el;
    el = mk(`<div id="rpick" role="dialog" aria-label="가게 위치 찍기"><div class="rh"><b>📍 실제 가게 위치를 찍어주세요</b><button class="b" id="rpx" aria-label="닫기">✕</button></div>
<div style="display:flex;gap:6px;padding:0 12px 8px"><input id="rps" maxlength="40" placeholder="장소 검색 (예: 부천역 1번 출구)" aria-label="장소 검색"><button class="b" id="rpg">🔍</button></div>
<div class="mapwrap"><div id="rpm"></div><div class="rppin"><svg width="34" height="46" viewBox="0 0 34 46" aria-hidden="true"><path d="M17 45C17 45 3 28 3 16a14 14 0 0 1 28 0c0 12-14 29-14 29z" fill="#fff" stroke="#191F28" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#191F28"/></svg></div></div>
<div class="rc" id="rpc"><small>지도를 불러오는 중…</small><div class="g"><button class="b" id="rpme">📍 내 위치로</button><button class="b p" id="rpok">여기로 등록</button></div><button class="b" id="rpcancel" style="width:100%;margin-top:8px">취소</button></div></div>`);
    document.body.appendChild(el);
    el.addEventListener('keydown', e => e.stopPropagation());
    const closePk = () => { el.style.display = 'none'; pkDone = null };
    $('rpx').onclick = closePk; $('rpcancel').onclick = closePk;
    $('rpx').addEventListener('touchend', e => { e.preventDefault(); closePk() }, { passive: false });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.style.display !== 'none') closePk() });
    $('rpg').onclick = async () => {
      const q = $('rps').value.trim(); if (!q) return; $('rpc').firstChild.textContent = '“' + q + '” 찾는 중…';
      const c = await geocode(q);
      if (c) { pk.setView(c, 18); $('rpc').firstChild.textContent = '“' + q + '” 근처로 이동했어요. 📍 핀 끝을 실제 가게 위치에 맞춰주세요.' }
      else $('rpc').firstChild.textContent = '“' + q + '”을(를) 못 찾았어요. 더 짧게(예: 판교역) 검색하거나 지도를 직접 움직여 주세요.';
    };
    $('rps').addEventListener('keydown', e => { if (e.key === 'Enter') $('rpg').click() });
    $('rpme').onclick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(p => pk.setView([p.coords.latitude, p.coords.longitude], 18), e => { $('rpc').firstChild.textContent = geoMsg(e) }, { timeout: 15000, maximumAge: 60000 });
    };
    $('rpok').onclick = () => {
      if (!pk || !pkR) return; const c = pk.getCenter();
      if (pkR.limit && pkR.gps && dist([c.lat, c.lng], pkR.gps) > pkR.limit + 10) { $('rpc').firstChild.textContent = '동그라미 밖이에요. 지금 있는 곳 ' + pkR.limit + 'm 안으로 핀을 옮겨주세요.'; return }
      pkR.real = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
      el.style.display = 'none'; const f = pkDone; pkDone = null; if (f) f();
    };
    return el;
  }
  let pkCircle = null;
  const PK_HELP = '지도를 움직여서 📍 핀 끝을 실제 가게 위치에 맞춰주세요.';
  function pickReal(r, done, opts) {
    const el = ensurePK(); el.style.display = 'flex'; pkR = r; pkDone = done; r.limit = opts && opts.limit || 0;
    loadLeaflet().then(async () => {
      const lf = LF();
      if (!pk) { pk = lf.map('rpm'); tiles(lf).addTo(pk) }
      if (pkCircle) { pkCircle.remove(); pkCircle = null }
      const c = opts && opts.center || (r.real ? [r.real.lat, r.real.lng] : await startCenter(r));
      if (r.limit && r.gps) pkCircle = lf.circle(r.gps, { radius: r.limit, color: '#191F28', weight: 2, fillOpacity: .08, interactive: false }).addTo(pk);
      $('rpc').firstChild.textContent = r.limit ? '지금 있는 곳에서 ' + r.limit + 'm 안(동그라미)에서만 등록할 수 있어요. ' + PK_HELP : (opts && opts.msg) || '월드에서 고른 자리를 기준으로 시작했어요. ' + PK_HELP;
      pk.setView(c, 18); setTimeout(() => pk.invalidateSize(), 60);
    }).catch(() => { $('rpc').firstChild.textContent = '지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' });
  }

  // --- 등록: 지금 있는 곳(GPS)에서만, 실제 지도 한 번으로 끝 ---
  async function anchorLL() {
    const a = String(L.area || (typeof area === 'string' ? area : '') || ''), m = /\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(a);
    if (m) return [+m[1], +m[2]];
    if (L.anchorFor === a) return L.anchor;
    const g = a ? await geocode(a) : null; L.anchorFor = a; L.anchor = g; return g;
  }
  const toWorld = (an, lat, lng) => {
    const k = .4, c = v => Math.max(-240, Math.min(240, Math.round(v * k * 10) / 10));
    return { x: c((lng - an[1]) * 111000 * Math.cos(an[0] * Math.PI / 180)), z: c(-(lat - an[0]) * 111000) };
  };
  function startReal() {
    if (!navigator.geolocation) { say('이 브라우저는 위치를 지원하지 않아요'); return }
    say('지금 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition(async p => {
      const gps = [p.coords.latitude, p.coords.longitude], an = await anchorLL();
      if (an && dist(an, gps) > 2500) {
        bub('<b>📍 이 동네에서 너무 멀어요</b><p style="margin:6px 0">지금 있는 곳이 선택한 동네(' + esc(area) + ')에서 많이 떨어져 있어요. 붕어빵을 발견한 곳 근처 동네로 입장해서 등록해 주세요.</p><button class="b p" style="width:100%" data-x="close">확인</button>');
        return;
      }
      const r = { gps, real: null };
      pickReal(r, () => {
        const real = r.real, w = an ? toWorld(an, real.lat, real.lng) : { x: 0, z: 0 };
        regStart(w.x, w.z); if (reg) reg.real = real;
      }, { center: gps, limit: 150 });
    }, e => geoFail(e), { timeout: 15000, maximumAge: 30000 });
  }

  // 진입 버튼(🌏)과 가게 카드의 "실제 지도에서 보기"
  L.initP.then(() => {
    if (!L.on || !$('mapb') || $('rmapb')) return;
    $('mapb').insertAdjacentHTML('afterend', '<button class="glass" id="rmapb" aria-label="실제 지도 열기" style="border:0">🌏</button>');
    $('rmapb').onclick = () => openReal();
    $('b4').onclick = startReal; // 가게 등록은 지금 있는 곳 기준
  });
  L.openReal = openReal;

  L.leave = leave;
})();
