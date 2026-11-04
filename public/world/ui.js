/* UI state only: no server configuration or database changes. */
function refreshWorldUI() {
  const demo = !LIVE.on;
  const unavailable = LIVE.loadState === 'error';
  const empty = !spots.length;
  const loading = LIVE.loadState === 'loading';
  const mode = demo ? '체험 모드 · 예시 가게' : unavailable ? '가게 목록 연결 실패' : LIVE.realtimeState === 'error' ? '온라인 · 실시간 연결 끊김' : '온라인 · 이웃의 제보';
  $('mode-label').textContent = mode;
  $('world-status').style.display = running ? 'flex' : 'none';
  $('connection-note').textContent = demo
    ? (LIVE.demoReason === 'error' ? '연결이 어려워 체험 모드로 열었어요. 가게와 대화는 예시이며 제보는 이 기기에만 저장돼요.' : '체험 모드로 둘러볼 수 있어요. 예시 가게와 고양이를 만나고, 제보는 이 기기에만 저장해요.')
    : '동네 이웃이 남긴 가게와 최근 목격을 확인해 보세요.';
  $('area').textContent = areaTxt();
  $('area').setAttribute('aria-label', area + ' · 동네 바꾸기');
  $('cmp').style.visibility = empty ? 'hidden' : '';
  if (empty) { $('dist').textContent = ''; $('arr').style.transform = ''; }
  ['b1', 'b2', 'b3'].forEach(id => { $(id).disabled = empty || loading; });
  $('world-empty').hidden = !running || !empty;
  $('empty-title').textContent = loading ? '동네를 확인하고 있어요' : unavailable ? '가게를 불러오지 못했어요' : '아직 등록된 가게가 없어요';
  $('empty-description').textContent = loading ? '잠시만 기다려 주세요.' : unavailable ? '연결을 확인하고 다시 시도해 주세요. 등록된 가게가 없는 것은 아니에요.' : '동네를 먼저 둘러보거나, 발견한 붕어빵 가게를 알려주세요.';
  $('empty-action').textContent = unavailable ? '다시 불러오기' : '첫 가게 등록하기';
  $('empty-action').disabled = loading;
}

function finishScan() {
  const failed = LIVE.loadState === 'error';
  $('st').textContent = failed ? '가게를 불러오지 못했어요' : !spots.length ? '아직 등록된 붕어빵이 없어요' : LIVE.on ? '붕어 ' + spots.length + '곳 발견! 🎉' : '예시 가게와 동네를 둘러보세요';
  $('sm').textContent = failed ? '월드에 들어간 뒤 다시 불러올 수 있어요.' : !LIVE.on ? '체험 모드예요. 실제 가게 위치와 영업 정보가 아니에요.' : !spots.length ? '동네를 둘러보고 첫 번째 가게를 알려주세요.' : '최근 목격과 메뉴를 확인하고 찾아가 보세요.';
  $('go').textContent = LIVE.on ? '동네 둘러보기' : '체험 시작하기';
  $('go').style.display = '';
  refreshWorldUI();
}

$('empty-action').onclick = async () => {
  if (LIVE.loadState !== 'error') { $('b4').click(); return; }
  await LIVE.load(area);
  refreshWorldUI();
};
