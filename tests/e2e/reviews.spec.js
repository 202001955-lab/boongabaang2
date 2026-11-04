const { test, expect, SHOP, USER } = require('./support/fixtures');

test('review creation and editing replace the current user review', async ({ page, app, backend }) => {
  await app.enter(); await app.details();
  await page.getByRole('button', { name: '리뷰 쓰기', exact: true }).click();
  await page.getByRole('textbox', { name: '리뷰 내용' }).fill('바삭하고 따뜻해요');
  await page.getByRole('button', { name: '4점', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '리뷰 내용' })).toHaveValue('바삭하고 따뜻해요');
  await page.getByRole('button', { name: '리뷰 올리기', exact: true }).click();
  await expect(page.locator('#rvbox')).toContainText('바삭하고 따뜻해요');
  await page.getByRole('button', { name: '리뷰 쓰기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '리뷰 내용' })).toHaveValue('바삭하고 따뜻해요');
  await page.getByRole('textbox', { name: '리뷰 내용' }).fill('슈크림도 맛있어요');
  await page.getByRole('button', { name: '리뷰 올리기', exact: true }).click();
  await expect(page.locator('#rvbox')).toContainText('슈크림도 맛있어요');
  expect(backend.reviews.filter(r => r.user_id === USER)).toHaveLength(1);
  expect(backend.reviews[0].rating).toBe(4);
});

test('review failure keeps the draft and allows retry', async ({ page, app, backend }) => {
  backend.fail('POST reviews');
  await app.enter(); await app.details();
  await page.getByRole('button', { name: '리뷰 쓰기', exact: true }).click();
  await page.getByRole('textbox', { name: '리뷰 내용' }).fill('다시 올릴 리뷰');
  await page.getByRole('button', { name: '리뷰 올리기', exact: true }).click();
  await expect(page.locator('#m')).toContainText('저장하지 못했어요');
  await expect(page.getByRole('textbox', { name: '리뷰 내용' })).toHaveValue('다시 올릴 리뷰');
  backend.recover('POST reviews');
  await page.getByRole('button', { name: '리뷰 올리기', exact: true }).click();
  await expect(page.locator('#rvbox')).toContainText('다시 올릴 리뷰');
});

test('review pagination honors total and page boundaries', async ({ page, app, backend }) => {
  backend.reviews = Array.from({ length: 7 }, (_, i) => ({ shop_id: SHOP, user_id: 'reviewer-' + i, nick: '이웃' + i, body: '리뷰내용' + i, rating: 5, created_at: new Date(Date.now() - i * 60000).toISOString() }));
  await app.enter(); await app.details();
  await page.getByRole('button', { name: '모두 보기', exact: true }).click();
  await expect(page.locator('#bub')).toContainText('1 / 2');
  await expect(page.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  await page.getByRole('button', { name: '다음 페이지' }).click();
  await expect(page.locator('#bub')).toContainText('2 / 2');
  await expect(page.locator('#bub')).toContainText('리뷰내용6');
  await expect(page.locator('#bub')).not.toContainText('리뷰내용0');
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  await page.getByRole('button', { name: '← 가게로 돌아가기', exact: true }).click();
  await expect(page.locator('#rvbox')).toBeVisible();
});

test('untrusted review text is rendered as text', async ({ page, app, backend }) => {
  const body = '<img src=x onerror="window.injected=true">';
  backend.reviews = [{ shop_id: SHOP, user_id: 'reviewer', nick: '<b>냥</b>', rating: 5, body, created_at: new Date().toISOString() }];
  await app.enter(); await app.details();
  await expect(page.locator('#rvbox')).toContainText(body);
  await expect(page.locator('#rvbox img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
