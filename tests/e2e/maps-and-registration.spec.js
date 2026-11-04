const { test, expect, GPS } = require('./support/fixtures');

async function registrationForm(page) {
  const duplicate = page.getByRole('button', { name: '아니에요, 다른 붕어예요', exact: true });
  if (await duplicate.isVisible()) await duplicate.click();
  const skip = page.getByRole('button', { name: '사진 없이 계속하기', exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('textbox', { name: '가게 이름', exact: true }).fill('새로운 붕어빵');
  await page.getByRole('textbox', { name: '가격', exact: true }).fill('2개 1,000원');
  await page.getByRole('textbox', { name: '위치 설명', exact: true }).fill('역 입구');
  await page.getByRole('button', { name: '💛 슈크림', exact: true }).click();
  // Menu rerenders the form: entered values must survive.
  await expect(page.getByRole('textbox', { name: '가게 이름', exact: true })).toHaveValue('새로운 붕어빵');
}

async function realPin(page, context) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(GPS);
  await page.locator('#b4').click();
  await expect(page.locator('#rpm .leaflet-control-zoom')).toBeVisible();
  await page.getByRole('button', { name: '여기로 등록', exact: true }).click();
}

test('demo registration persists locally and explicitly says it is not shared', async ({ page, app, backend }) => {
  await app.enter('demo');
  await page.locator('#b4').click();
  await page.getByRole('button', { name: '이 위치에 붕어빵 등록하기', exact: true }).click();
  await registrationForm(page);
  await page.getByRole('button', { name: '등록하기', exact: true }).click();
  await expect(page.locator('#bub')).toContainText('다른 사람에게 공유되지 않아요');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bz_user') || '{}')['판교']?.some(s => s.n === '새로운 붕어빵'))).toBe(true);
  expect(backend.requests('POST shops')).toHaveLength(0);
  await page.reload(); await app.chooseArea(); await app.finishEntry();
  await app.menu('지도 열기');
  await expect(page.locator('#mbox').getByRole('button', { name: '새로운 붕어빵', exact: true })).toBeVisible();
});

test('online registration sends the confirmed pin, menu and first sighting', async ({ page, context, app, backend }) => {
  backend.shops = []; backend.sightings = [];
  await app.enter(); await realPin(page, context); await registrationForm(page);
  await page.getByRole('button', { name: '등록하기', exact: true }).click();
  await expect(page.locator('#bub')).toContainText('만들어졌어요');
  expect(backend.requests('POST shops')).toHaveLength(1);
  const saved = backend.requests('POST shops')[0].body;
  expect(saved).toMatchObject({ area: '판교', name: '새로운 붕어빵', price_text: '2개 1,000원' });
  // Leaflet rounds projected pixels; retain sub-meter pin accuracy.
  expect(saved.lat).toBeCloseTo(GPS.latitude, 5);
  expect(saved.lng).toBeCloseTo(GPS.longitude, 5);
  expect(backend.requests('POST shop_menu')[0].body[0]).toMatchObject({ menu: '슈크림' });
  expect(backend.requests('POST sightings')).toHaveLength(1);
  await page.getByRole('button', { name: '🚶 만들어진 곳으로 이동하기', exact: true }).click();
  await expect(page.locator('#world-empty')).toBeHidden();
  await expect(page.locator('#area')).toContainText('붕어 1곳');
});

test('failed registration removes the temporary shop from the world', async ({ page, context, app, backend }) => {
  backend.shops = []; backend.sightings = []; backend.fail('POST shops', 'column lat does not exist');
  await app.enter(); await realPin(page, context); await registrationForm(page);
  await page.getByRole('button', { name: '등록하기', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('서버에 저장되지 않았어요');
  await expect(page.locator('#area')).toContainText('붕어 0곳');
  await expect(page.locator('#world-empty')).toBeVisible();
  expect(backend.requests('POST sightings')).toHaveLength(0);
});

test('registration map can be searched and canceled without saving', async ({ page, context, app, backend }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation(GPS);
  await app.enter(); await page.locator('#b4').click();
  await expect(page.locator('#rpm .leaflet-control-zoom')).toBeVisible();
  backend.searchFails = true;
  await page.getByRole('textbox', { name: '장소 검색', exact: true }).fill('없는 장소');
  await page.getByRole('textbox', { name: '장소 검색', exact: true }).press('Enter');
  await expect(page.locator('#rpc')).toContainText('못 찾았어요');
  backend.searchFails = false;
  await page.getByRole('textbox', { name: '장소 검색', exact: true }).fill('판교역');
  await page.getByRole('textbox', { name: '장소 검색', exact: true }).press('Enter');
  await expect(page.locator('#rpc')).toContainText('근처로 이동했어요');
  await page.locator('#rpick').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('#rpick')).toBeHidden();
  expect(backend.requests('POST shops')).toHaveLength(0);
});

test('real map shows a shop and exposes destination-only direction links', async ({ page, context, app }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation(GPS);
  await app.enter();
  await page.getByRole('button', { name: '실제 지도 열기', exact: true }).click();
  await expect(page.locator('#rmm .rm-pin')).toHaveCount(1);
  await page.locator('#rmm .rm-pin').click();
  await expect(page.locator('#rmc')).toContainText('테스트 붕어빵');
  await expect(page.getByRole('link', { name: '🧭 카카오맵 길찾기', exact: true })).toHaveAttribute('href', /37\.3947,127\.1112$/);
  await expect(page.getByRole('link', { name: '구글지도', exact: true })).toHaveAttribute('rel', 'noopener');
  await page.locator('#rmap').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('#rmap')).toBeHidden();
});

test('map download failure gives a readable error and can be closed', async ({ page, app, backend }) => {
  backend.mapFails = true;
  await app.enter();
  await page.getByRole('button', { name: '실제 지도 열기', exact: true }).click();
  await expect(page.locator('#rmc')).toContainText('지도를 불러오지 못했어요');
  await page.locator('#rmap').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('#rmap')).toBeHidden();
});

test('world map supports selecting a shop and teleporting to it', async ({ page, app }) => {
  await app.enter(); await app.menu('지도 열기');
  await page.locator('#mbox').getByRole('button', { name: '테스트 붕어빵', exact: true }).click();
  await expect(page.locator('#mcard')).toContainText('3개 2,000원');
  await page.getByRole('button', { name: '✨ 바로 이동', exact: true }).click();
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('앞에 도착했어요');
  await app.details();
  await expect(page.locator('#bub')).toContainText('테스트 붕어빵');
});

test('mobile and desktop layouts keep primary controls inside the viewport', async ({ page, app }) => {
  await app.enter('demo');
  for (const id of ['area', 'bar', 'joy', 'mode-label']) {
    const bounds = await page.locator('#' + id).boundingBox();
    const viewport = page.viewportSize();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
