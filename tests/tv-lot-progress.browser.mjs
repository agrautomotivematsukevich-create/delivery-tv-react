import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Starts a local Vite server by default. All non-local requests are intercepted;
// this regression suite cannot send commands or writes to production.
const viteServer = process.env.TV_TEST_URL ? null : await createServer({
  server: { host: '127.0.0.1', port: 0 },
});
if (viteServer) await viteServer.listen();
const baseURL = process.env.TV_TEST_URL || viteServer?.resolvedUrls?.local[0];
assert.ok(baseURL, 'Local Vite test URL must be available');
const artifactDir = process.env.TV_TEST_ARTIFACTS || 'test-results/tv-lots';
const activeFixtures = [
  ['43115-CT1EJ20260505', 51, 5, 1],
  ['43115-CM32T20260517', 29, 13, 1],
  ['43115-CM32T20260515', 29, 26, 1],
  ['43115-CT1EJ20260503', 62, 28, 0],
  ['43115-CM32T20260514', 22, 2, 0],
  ['43115-CM32T20260520', 13, 0, 0],
  ['43115-CT13J20260612', 10, 0, 0],
  ['43115-CT1EJ20260408', 61, 56, 0],
  ['43115-AQT13J20260708', 1, 0, 0],
];
const closedFixtures = [
  ['43115-CT1EJ20260504', 65, 65, 0],
  ['43115-CT13J20260509', 3, 3, 0],
  ['43115-CT1EJ20260501', 47, 47, 0],
];
function payloadFor(fixtures) {
  const planRows = [], tasks = [];
  for (const [lot, total, done, active] of fixtures) {
    for (let i = 0; i < total; i++) {
      const id = `${lot}-${i}`;
      const ws = ['Welding', 'Assembly', 'Painting'][i % 3];
      planRows.push({ lot, id, ws, rowIndex: i + 5, index: String(i + 1), pallets: '0/20', phone: '', eta: '16:00', sheetDate: '07.09', sequence: 600005 + i });
      const status = i < done ? 'DONE' : i < done + active ? 'ACTIVE' : 'WAIT';
      tasks.push({ id, type: ws, pallets: '0/20', eta: '16:00', status, time: '16:00', start_time: status === 'WAIT' ? '' : '15:00', end_time: status === 'DONE' ? '15:30' : '', zone: status === 'WAIT' ? '' : 'G3', sheet_date: '07.09' });
    }
  }
  return { planRows, tasks };
}
const browser = await chromium.launch({ headless: true });
await mkdir(artifactDir, { recursive: true });
let feedCalls = 0;
const pageErrors = [];
async function openScreen(fixtures, viewport = { width: 1920, height: 1080 }) {
  const page = await browser.newPage({ viewport });
  await page.clock.install();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    let body;
    try { body = request.postDataJSON(); } catch { /* not JSON */ }
    if (body?.mode === 'tv_lot_progress') {
      feedCalls++;
      return route.fulfill({ json: payloadFor(fixtures) });
    }
    if (new URL(request.url()).origin === new URL(baseURL).origin) return route.continue();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url())) return route.abort();
    return route.fulfill({ json: {} });
  });
  await page.goto(`${baseURL}/?tv=1&screen=lots`);
  await page.locator('[data-lot-row="active"], .tv-lot-closed-row').first().waitFor().catch(async error => {
    console.error(await page.locator('body').innerText());
    throw error;
  });
  await page.clock.runFor(3000);
  await page.waitForFunction(() => {
    const screen = document.querySelector('.tv-lot-screen');
    if (!screen) return false;
    for (let node = screen; node instanceof HTMLElement; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) < 0.99) return false;
    }
    return !document.body.innerText.includes('Синхронизация с базой данных...');
  });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const activeLabels = page => page.locator('[data-lot-row="active"] [title]').evaluateAll(nodes => nodes.map(n => n.title));
async function checkFit(page) {
  const issues = await page.evaluate(() => {
    const problems = [];
    for (const el of document.querySelectorAll('[data-lot-row], [data-lot-row] > div, .tv-lot-active-title, .tv-lot-closed-title')) {
      const rect = el.getBoundingClientRect();
      if (rect.top < -1 || rect.left < -1 || rect.bottom > innerHeight + 1 || rect.right > innerWidth + 1) problems.push(`Outside viewport: ${el.className} ${el.textContent}`);
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 || (style.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1)) problems.push(`Clipped ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}: ${el.className} ${el.textContent}`);
    }
    return problems;
  });
  assert.deepEqual(issues, [], 'All rows and labels must fit without clipping');
}
try {
  let page = await openScreen([...activeFixtures, ...closedFixtures]);
  assert.deepEqual((await activeLabels(page)).sort(), activeFixtures.map(f => f[0]).sort(), 'All nine unfinished lots, including the eighth and single-container lot, must be visible');
  await checkFit(page);
  const fonts = await page.locator('[data-lot-row="active"] [title]').evaluateAll(nodes => nodes.map(n => parseFloat(getComputedStyle(n).fontSize)));
  assert.ok(fonts.every(size => size >= 38), 'Full-HD lot numbers must retain large type');
  await page.screenshot({ path: `${artifactDir}/nine-lots-1920x1080.png` });
  await page.close();

  const twoRows = activeFixtures.map(f => f[0] === '43115-AQT13J20260708' ? [f[0], 2, 0, 0] : f);
  page = await openScreen([...twoRows, ...closedFixtures]);
  assert.ok((await activeLabels(page)).includes('43115-AQT13J20260708'), 'Two-container lots must remain visible');
  await page.close();

  const overflow = [...activeFixtures, ...Array.from({ length: 14 }, (_, i) => [`43115-TEST202609${String(i + 1).padStart(2, '0')}`, 3, 0, 0])];
  page = await openScreen([...overflow, ...closedFixtures]);
  const callsBeforeRotation = feedCalls;
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    (await activeLabels(page)).forEach(lot => seen.add(lot));
    await checkFit(page);
    await page.clock.fastForward(15000);
  }
  assert.deepEqual([...seen].sort(), overflow.map(f => f[0]).sort(), 'Every overflow lot must appear during a full page cycle');
  assert.equal(feedCalls, callsBeforeRotation, 'Page changes must not request more data');
  await page.screenshot({ path: `${artifactDir}/overflow-1920x1080.png` });
  await page.close();

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1980, height: 1280 }, { width: 1600, height: 900 }]) {
    page = await openScreen([...activeFixtures, ...closedFixtures], viewport);
    await checkFit(page);
    await page.screenshot({ path: `${artifactDir}/lots-${viewport.width}x${viewport.height}.png` });
    await page.close();
  }
  for (const fixtures of [activeFixtures, closedFixtures]) {
    page = await openScreen(fixtures);
    await checkFit(page);
    await page.close();
  }
  assert.deepEqual(pageErrors, [], 'No browser runtime errors');
  console.log('PASS: full-HD completeness, one/two-container lots, overflow rotation, network cadence and viewport fit');
} finally {
  await browser.close();
  await viteServer?.close();
}
