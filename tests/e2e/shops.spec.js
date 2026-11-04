const { test, expect, shop, OTHER, SHOP } = require('./support/fixtures');

test('empty area disables shop actions and offers registration', async ({ page, app, backend }) => {
  backend.shops = []; backend.sightings = [];
  await app.enter();
  await expect(page.locator('#world-empty')).toContainText('아직 등록된 가게가 없어요');
  for (const id of ['b1', 'b2', 'b3']) await expect(page.locator('#' + id)).toBeDisabled();
  await expect(page.locator('#cmp')).toBeHidden();
  await expect(page.getByRole('button', { name: '첫 가게 등록하기', exact: true })).toBeEnabled();
});

test('failed shop list is not mistaken for empty and can be retried', async ({ page, app, backend }) => {
  backend.fail('GET shops');
  await app.enter();
  await expect(page.locator('#empty-title')).toHaveText('가게를 불러오지 못했어요');
  backend.recover('GET shops');
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.locator('#world-empty')).toBeHidden();
  await expect(page.locator('#b1')).toBeEnabled();
  await app.details();
  await expect(page.locator('#bub')).toContainText('테스트 붕어빵');
});

test('failed sighting fetch does not display misleading shop freshness', async ({ page, app, backend }) => {
  backend.fail('GET sightings');
  await app.enter();
  await expect(page.locator('#empty-title')).toHaveText('가게를 불러오지 못했어요');
  backend.recover('GET sightings');
  await page.locator('#empty-action').click();
  await app.details();
  await expect(page.locator('#bub')).toContainText('명 확인');
});

test('shop details show menu, price and recent evidence', async ({ page, app }) => {
  await app.enter(); await app.details();
  await expect(page.locator('#bub')).toContainText('팥');
  await expect(page.locator('#bub')).toContainText('3개 2,000원');
  await expect(page.locator('#bub')).toContainText('역 1번 출구');
  await expect(page.locator('#bub')).toContainText('1명 확인');
  await page.locator('#bub').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('#bub')).toBeHidden();
});

for (const status of ['seen', 'not_seen']) {
  test(`${status} report saves once and enforces the local cooldown`, async ({ page, app, backend }) => {
    await app.enter(); await app.details();
    await page.locator(`[data-x="${status === 'seen' ? 'seen' : 'none'}"]`).click();
    await expect(page.locator('#toast')).toContainText('저장했어요');
    expect(backend.requests('POST sightings')).toHaveLength(1);
    expect(backend.requests('POST sightings')[0].body).toEqual({ shop_id: SHOP, status });
    await page.locator('[data-x="seen"]').click();
    await expect(page.locator('#toast')).toContainText('30분에 한 번');
    expect(backend.requests('POST sightings')).toHaveLength(1);
  });
}

test('failed report keeps evidence unchanged and preserves retry', async ({ page, app, backend }) => {
  backend.fail('POST sightings');
  await app.enter(); await app.details();
  await page.locator('[data-x="seen"]').click();
  await expect(page.locator('#toast')).toContainText('저장하지 못했어요');
  await expect(page.locator('#bub')).toContainText('1명 확인');
  await expect(page.locator('[data-x="seen"]')).toBeEnabled();
  backend.recover('POST sightings');
  await page.locator('[data-x="seen"]').click();
  await expect(page.locator('#bub')).toContainText('2명 확인');
});

test('pending report disables both choices until the server responds', async ({ page, app, backend }) => {
  const release = backend.hold('POST sightings');
  try {
    await app.enter(); await app.details();
    await page.locator('[data-x="seen"]').dblclick();
    await expect(page.locator('[data-x="seen"]')).toBeDisabled();
    await expect(page.locator('[data-x="none"]')).toBeDisabled();
    await expect.poll(() => backend.requests('POST sightings').length).toBe(1);
    expect(backend.requests('POST sightings')).toHaveLength(1);
    release();
    await expect(page.locator('[data-x="seen"]')).toBeEnabled();
    await expect(page.locator('#bub')).toContainText('2명 확인');
  } finally { release(); }
});

test('leaving an area while reporting never opens its card in the new area', async ({ page, app, backend }) => {
  const release = backend.hold('POST sightings');
  try {
    await app.enter(); await app.details();
    await page.locator('[data-x="seen"]').click();
    await expect.poll(() => backend.requests('POST sightings').length).toBe(1);
    await page.getByRole('button', { name: '위치 다시 설정', exact: true }).click();
    backend.shops = [shop({ id: 'other-shop', area: '홍대', name: '홍대 붕어빵' })];
    await page.locator('#ra').fill('홍대'); await page.locator('#rgo').click();
    await page.locator('#go').click();
    release();
    await expect(page.locator('#area')).toContainText('홍대');
    await expect(page.locator('#bub')).toBeHidden();
    await app.details();
    await expect(page.locator('#bub')).toContainText('홍대 붕어빵');
    await expect(page.locator('#bub')).not.toContainText('테스트 붕어빵');
  } finally { release(); }
});

test('a database duplicate report error remains actionable', async ({ page, app, backend }) => {
  backend.fail('POST sightings', 'duplicate_sighting');
  await app.enter(); await app.details();
  await page.locator('[data-x="seen"]').click();
  await expect(page.locator('#toast')).toContainText('30분에 한 번');
  await expect(page.locator('[data-x="seen"]')).toBeEnabled();
});

test('loading state does not offer entry until the shop request finishes', async ({ page, app, backend }) => {
  const release = backend.hold('GET shops');
  try {
    await app.open(); await app.chooseArea();
    await expect.poll(() => backend.requests('GET shops').length).toBe(1);
    await expect(page.locator('#st')).toHaveText('동네의 제보를 불러오는 중…');
    await expect(page.locator('#go')).toBeHidden();
    release();
    await expect(page.locator('#go')).toBeVisible();
    await app.finishEntry();
  } finally { release(); }
});
