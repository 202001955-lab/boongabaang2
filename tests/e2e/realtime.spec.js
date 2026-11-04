const { test, expect, shop, OTHER, SHOP } = require('./support/fixtures');

async function subscribed(backend) {
  await expect.poll(() => backend.channels.length).toBeGreaterThan(0);
  await expect.poll(() => backend.frames.filter(f => f.event === 'presence').length).toBeGreaterThan(0);
}

test('new shops arrive through the real SDK subscription without reloading', async ({ page, app, backend }) => {
  backend.shops = []; backend.sightings = [];
  await app.enter(); await subscribed(backend);
  backend.change('shops', shop());
  await expect(page.locator('#area')).toContainText('붕어 1곳');
  await expect(page.locator('#world-empty')).toBeHidden();
  await app.details();
  await expect(page.locator('#bub')).toContainText('테스트 붕어빵');
});

test('remote sightings and reviews update the shop detail', async ({ page, app, backend }) => {
  await app.enter(); await subscribed(backend);
  backend.change('sightings', { shop_id: SHOP, user_id: OTHER, status: 'not_seen', created_at: new Date(Date.now() + 1000).toISOString() });
  backend.change('reviews', { shop_id: SHOP, user_id: OTHER, nick: '이웃냥', rating: 5, body: '방금 먹었어요', created_at: new Date().toISOString() });
  await app.details();
  await expect(page.locator('#bub')).toContainText('지금은 없을 수도');
  await expect(page.locator('#rvbox')).toContainText('방금 먹었어요');
});

test('channel error is visible and automatic reconnection restores online state', async ({ page, app, backend }) => {
  await app.enter(); await subscribed(backend);
  backend.send('phx_error', {});
  await expect(page.locator('#mode-label')).toContainText('실시간 연결 끊김');
  await expect.poll(() => backend.channels.length).toBeGreaterThan(1);
  await expect(page.locator('#mode-label')).toHaveText('온라인 · 이웃의 제보');
});

test('queue membership enables chat and messages use the realtime transport', async ({ page, app, backend }) => {
  await app.enter(); await subscribed(backend); await app.details();
  await page.getByRole('button', { name: /줄 대화방/ }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '줄 서러 가기', exact: true }).click();
  await page.getByRole('button', { name: '대화하기', exact: true }).click();
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('슈크림 있나요?');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page.locator('#log')).toContainText('슈크림 있나요?');
  await expect.poll(() => backend.frames.filter(f => f.event === 'broadcast' && f.payload.event === 'chat').length).toBe(1);
  backend.send('broadcast', { event: 'chat', payload: { sid: 'neighbor', shop: SHOP, nick: '이웃냥', text: '네 있어요!' } });
  await expect(page.locator('#log')).toContainText('네 있어요!');
});
