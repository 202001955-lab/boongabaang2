/* 붕세권 live.js — 서버(Supabase) 연결 계층.
 * 설정이 없거나 연결에 실패하면 LIVE.on=false 로 남고, 월드는 기존 데모(혼자 하기) 모드로 동작합니다.
 * 진짜 GPS 좌표는 어디에도 보내지 않습니다. 공유되는 건 동네 이름(area)과 월드 좌표(world_x, world_z)뿐입니다. */
(function () {
  'use strict';
  const L = window.LIVE;
  const SCHEMA_HINT = '서버 설정을 확인해 주세요';
  let sb = null, ch = null, uid = null, peers = [], meshes = {}, sid = null, lastTrack = '', lastMv = '', lastChat = 0, qt = 0, lastQ = null;
  try { sid = sessionStorage.getItem('bz_sid') || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); sessionStorage.setItem('bz_sid', sid) } catch (e) { sid = String(Math.random()).slice(2) }

  const strs = (v, n) => String(v == null ? '' : v).slice(0, n);
  const hashStr = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) };
  const sbUrl = () => (L.cfg && L.cfg.url) || '';
  const safePhoto = u => typeof u === 'string' && u.startsWith(sbUrl() + '/storage/') ? u : null;
  const fail = (m, e) => { console.warn('[bungzone]', m, e && (e.message || e)); try { say(m) } catch (x) { } };

  /* ---------- 1. 시작: 설정 읽기 → 클라이언트 → 익명 로그인 ---------- */
  L.initP = (async () => {
    try {
      if (window.__sbfail || !window.supabase) return;
      const r = await Promise.race([fetch('/api/config', { cache: 'no-store' }), new Promise((_, j) => setTimeout(() => j('timeout'), 3000))]);
      if (!r.ok) return;
      const c = await r.json();
      if (!c || !c.url || !c.anon) return;
      L.cfg = c;
      sb = window.supabase.createClient(c.url, c.anon, { realtime: { params: { eventsPerSecond: 10 } } });
      let { data } = await sb.auth.getSession();
      if (!data.session) { const x = await sb.auth.signInAnonymously(); if (x.error) throw x.error; data = x.data }
      uid = data.session ? data.session.user.id : (data.user && data.user.id);
      L.sb = sb; L.uid = uid; L.on = true;
    } catch (e) { console.warn('[bungzone] 서버 연결 실패 → 데모 모드', e && e.message || e); L.on = false }
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
      photo: photos[0] || null, rev: (r.reviews || []).map(v => ({ rating: +v.rating, body: strs(v.body, 80), nick: strs(v.nick, 10), uid: v.user_id, t: Date.parse(v.created_at) })), user: false
    };
    k.addr = addrText(k.x, k.z); k.ll = llOf(k.x, k.z);
    return k;
  }
  L.load = async function (a) {
    if (!L.on) return;
    L.area = a;
    try {
      const { data, error } = await sb.from('shops').select('*,shop_menu(menu),shop_photos(url,created_at),reviews(rating,body,nick,user_id,created_at)')
        .eq('area', a).order('created_at', { referencedTable: 'reviews', ascending: false }).limit(20, { referencedTable: 'reviews' });
      if (error) throw error;
      const ids = data.map(d => d.id); let sg = [];
      if (ids.length) {
        const q = await sb.from('sightings').select('shop_id,status,user_id,created_at').in('shop_id', ids).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
        if (!q.error) sg = q.data;
      }
      data.forEach(r => { const k = mkSpot(r, sg.filter(x => x.shop_id === r.id)); spots.push(k); stall(k) });
    } catch (e) { fail('가게 목록을 못 불러왔어요. ' + SCHEMA_HINT, e) }
    join(a);
  };

  /* ---------- 4. 실시간 방: 접속 중인 고양이, 줄, 채팅, 새 가게/목격/리뷰 ---------- */
  function me() { return { sid, nick: nick, cat: myCat, q: inQ && inQ.id ? inQ.id : null, qt: qt, x: +P.x.toFixed(1), z: +P.z.toFixed(1) } }
  function join(a) {
    ch = sb.channel('world:' + a, { config: { presence: { key: sid }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, onSync)
      .on('broadcast', { event: 'mv' }, ({ payload }) => onMove(payload))
      .on('broadcast', { event: 'chat' }, ({ payload }) => onChat(payload))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shops', filter: 'area=eq.' + a }, ({ new: r }) => {
        if (r.created_by === uid || spots.some(s => s.id === r.id)) return;
        const k = mkSpot(r, [{ created_at: r.created_at, status: 'seen', user_id: r.created_by }]); spots.push(k); stall(k); $('area').textContent = areaTxt(); say('🐟 새 붕어빵이 발견됐어요: ' + k.n);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sightings' }, ({ new: r }) => {
        const s = spots.find(x => x.id === r.shop_id); if (!s || r.user_id === uid) return;
        (s.ev = s.ev || []).push({ t: Date.parse(r.created_at), st: r.status, sid: r.user_id }); if (r.status === 'seen') { s.w++ } lab(s);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, ({ new: r }) => {
        const s = r && spots.find(x => x.id === r.shop_id); if (!s || r.user_id === uid) return;
        s.rev = (s.rev || []).filter(v => v.uid !== r.user_id); s.rev.unshift({ rating: +r.rating, body: strs(r.body, 80), nick: strs(r.nick, 10), uid: r.user_id, t: Date.parse(r.created_at) });
      })
      .subscribe(st => { if (st === 'SUBSCRIBED') { lastTrack = ''; track(true) } });
    saveProfile();
  }
  function leave() {
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
  window.mark = function (i, st, bar) {
    const s = spots[i], ok = !(s.last && Date.now() - s.last < 18e5);
    _mark(i, st, bar);
    if (L.on && ok && s.id) sb.from('sightings').insert({ shop_id: s.id, status: st }).then(r => { if (r.error) fail(/duplicate/.test(r.error.message) ? '같은 가게는 30분에 한 번만 남길 수 있어요' : '제보가 서버에 저장되지 않았어요', r.error) });
  };
  const _persist = window.persist;
  window.persist = function () { if (!L.on) return _persist() };
  const _save = window.save;
  window.save = function () {
    const r = reg; _save();
    if (!(L.on && r)) return;
    const s = spots[spots.length - 1]; if (!s || s.id) return;
    createShop(s, r);
  };
  async function createShop(s, r) {
    try {
      const ins = await sb.from('shops').insert({ area: L.area, name: s.n, world_x: s.x, world_z: s.z, landmark: s.land || null, price_text: s.p || null }).select('id').single();
      if (ins.error) throw ins.error;
      s.id = ins.data.id;
      if (s.menu && s.menu.length) await sb.from('shop_menu').insert(s.menu.map(m => ({ shop_id: s.id, menu: m })));
      await sb.from('sightings').insert({ shop_id: s.id, status: 'seen' });
      if (r.photo && /^data:image\//.test(r.photo)) {
        const blob = await (await fetch(r.photo)).blob(), path = uid + '/' + s.id + '-' + Date.now() + '.jpg';
        const up = await sb.storage.from('shop-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (!up.error) { const url = sb.storage.from('shop-photos').getPublicUrl(path).data.publicUrl; await sb.from('shop_photos').insert({ shop_id: s.id, url }); s.photo = url } else console.warn('[bungzone] photo', up.error.message);
      }
    } catch (e) {
      fail(/duplicate_shop/.test(e.message || '') ? '이 근처엔 이미 붕어빵이 있어요' : '새 가게가 서버에 저장되지 않았어요', e);
      try { world.remove(s.g); (s.npc || []).forEach(n => world.remove(n)) } catch (x) { } const i = spots.indexOf(s); if (i >= 0) spots.splice(i, 1);
    }
  }

  /* ---------- 8. 리뷰판 ("맛있었다면 리뷰를 남겨주세요") ---------- */
  const revMem = {}; // 데모 모드용
  const getRev = s => s.id ? (s.rev || []) : (revMem[area + '|' + s.n] || (revMem[area + '|' + s.n] = []));
  const stars = n => '⭐'.repeat(Math.max(0, Math.min(5, n)));
  function revHTML(s, i) {
    const r = getRev(s), avg = r.length ? (r.reduce((a, b) => a + b.rating, 0) / r.length).toFixed(1) : null;
    return `<div class="box" id="rvbox"><b>😋 고양이 리뷰</b> ${avg ? `<span>⭐ ${avg} · ${r.length}개</span>` : ''}` +
      (r.slice(0, 3).map(x => `<div style="margin-top:4px">${stars(x.rating)} <b>${esc(x.nick || '익명냥')}</b> ${esc(x.body || '')}</div>`).join('') || '<small style="display:block;margin-top:4px">아직 리뷰가 없어요. 맛있었다면 첫 리뷰를 남겨주세요!</small>') +
      `<div class="g"><button class="b" data-x="rev" data-i="${i}">✍️ 리뷰 남기기</button>${r.length > 3 ? `<button class="b" data-x="revall" data-i="${i}">전체 ${r.length}개</button>` : ''}</div></div>`;
  }
  const _show = window.show;
  window.show = function (s) { _show(s); const b = $('bub'); if (b && b.style.display !== 'none') b.insertAdjacentHTML('beforeend', revHTML(s, spots.indexOf(s))) };
  function revForm(i, rating, body) {
    const s = spots[i], mine = getRev(s).find(v => v.mine || (uid && v.uid === uid)); rating = rating || (mine && mine.rating) || 5; body = body != null ? body : (mine && mine.body) || '';
    bub(`<div style="display:flex;justify-content:space-between"><b>😋 ${esc(s.n)} 리뷰</b><button class="b" data-x="close" aria-label="닫기">✕</button></div><small>맛있었다면 다른 고양이들이 참고할 수 있게 남겨주세요. 한 가게에 하나만 남길 수 있고, 다시 쓰면 바뀌어요.</small>
      <div style="display:flex;gap:4px;margin-top:8px" role="radiogroup" aria-label="별점">${[1, 2, 3, 4, 5].map(n => `<button class="b${n <= rating ? ' p' : ''}" data-x="rstar" data-i="${i}" data-v="${n}" aria-label="${n}점" style="flex:1">${n}</button>`).join('')}</div>
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
  function revAll(i) {
    const s = spots[i];
    bub(`<div style="display:flex;justify-content:space-between"><b>😋 ${esc(s.n)} 리뷰</b><button class="b" data-x="close" aria-label="닫기">✕</button></div><div class="box" style="max-height:260px;overflow:auto">${getRev(s).map(x => `<div style="margin-bottom:6px">${stars(x.rating)} <b>${esc(x.nick || '익명냥')}</b> ${esc(x.body || '')}</div>`).join('')}</div><button class="b" style="width:100%;margin-top:8px" data-x="rback" data-i="${i}">← 가게로 돌아가기</button>`);
  }
  $('bub').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x, i = +b.dataset.i;
    if (x === 'rev') revForm(i);
    else if (x === 'rstar') revForm(i, +b.dataset.v, $('rvb') ? $('rvb').value : '');
    else if (x === 'rsave') revSave(i, +b.dataset.v);
    else if (x === 'revall') revAll(i);
    else if (x === 'rback') show(spots[i]);
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
  L.leave = leave;
})();
