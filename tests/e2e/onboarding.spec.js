const { test, expect } = require('./support/fixtures');

test('explicit demo skips configuration and explains example data', async ({ page, app, backend }) => {
  await app.open('demo');
  await expect(page.locator('#connection-note')).toContainText('체험 모드');
  await app.chooseArea();
  await expect(page.locator('#sm')).toContainText('실제 가게 위치와 영업 정보가 아니에요');
  await app.finishEntry();
  await expect(page.locator('#mode-label')).toHaveText('체험 모드 · 예시 가게');
  expect(backend.requests('GET config')).toHaveLength(0);
  expect(backend.requests('POST signup')).toHaveLength(0);
});

for (const reason of ['unconfigured', 'offline', 'auth']) {
  test(`${reason} falls back to an explicitly labeled demo`, async ({ page, app, backend }) => {
    if (reason === 'auth') backend.authFails = true; else backend.config = reason;
    await app.open();
    await expect(page.locator('#connection-note')).toContainText(reason === 'unconfigured' ? '체험 모드' : '연결이 어려워');
    await app.chooseArea(); await app.finishEntry();
    await expect(page.locator('#mode-label')).toContainText('체험 모드');
  });
}

test('nickname and station validation block invalid input and allow correction', async ({ page, app }) => {
  await app.open('demo');
  await page.getByRole('button', { name: '입장하기', exact: true }).click();
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('!');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.locator('#nm')).toContainText('2~10자');
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('테스트냥');
  await page.getByRole('textbox', { name: '닉네임', exact: true }).press('Enter');
  await page.getByRole('button', { name: '위치 허용이 어렵다면 역 이름으로 찾기' }).click();
  await page.getByRole('textbox', { name: '지역 이름' }).fill('!');
  await page.getByRole('button', { name: '이 역 주변 보기' }).click();
  await expect(page.locator('#rm')).toContainText('2~20자');
  await page.getByRole('textbox', { name: '지역 이름' }).fill('판교');
  await page.getByRole('textbox', { name: '지역 이름' }).press('Enter');
  await app.finishEntry();
  await expect(page.locator('#area')).toContainText('판교');
});

test('denied geolocation offers manual station entry', async ({ page, context, app }) => {
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_, reject) => reject({ code: 1 });
  });
  await app.open('demo');
  await page.locator('#enter').click(); await page.locator('#nnext').click();
  await page.locator('#askgo').click();
  await expect(page.locator('#bub')).toContainText('위치 권한이 필요해요');
  await page.getByRole('button', { name: '동네 직접 고르기', exact: true }).click();
  await page.getByRole('textbox', { name: '지역 이름' }).fill('판교');
  await page.locator('#rgo').click(); await app.finishEntry();
  await expect(page.locator('#area')).toContainText('판교');
});

test('tutorial, nickname editing, sound preference and recent area survive navigation', async ({ page, app }) => {
  await app.enter('demo');
  await app.menu('도움말');
  await expect(page.locator('#tcard')).toContainText('걸어 다니기');
  await page.getByRole('button', { name: '다시 보지 않기', exact: true }).click();
  await app.menu('닉네임 바꾸기');
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('새로운냥');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#tag')).toHaveText('나 · 새로운냥');
  await app.menu('배경음 켜기/끄기');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bz_mute'))).toBe('0');
  await page.getByRole('button', { name: '위치 다시 설정', exact: true }).click();
  await expect(page.locator('#rec')).toContainText('판교');
  await page.locator('#rec').getByRole('button', { name: '판교', exact: true }).click();
  await app.finishEntry();
  await expect(page.locator('#tut')).toBeHidden();
  await page.reload(); await page.locator('#enter').click();
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toHaveValue('새로운냥');
});

test('GPS entry shares only a common avatar start, not the device coordinates', async ({ page, context, app, backend }) => {
  backend.shops = []; backend.sightings = [];
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.3947, longitude: 127.1112 });
  await app.open();
  await page.locator('#enter').click(); await page.locator('#nnext').click();
  await page.getByRole('button', { name: '📍 내 위치로 찾기', exact: true }).click();
  await app.finishEntry();
  await expect.poll(() => backend.frames.filter(f => f.event === 'presence').length).toBeGreaterThan(0);
  const position = backend.frames.find(f => f.event === 'presence').payload.payload;
  expect(position).toMatchObject({ x: 0, z: 0 });
  expect(JSON.stringify(backend.calls)).not.toContain('37.3947');
  expect(JSON.stringify(backend.calls)).not.toContain('127.1112');
});
