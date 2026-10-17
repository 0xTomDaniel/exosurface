import { chromium } from './playwright.mjs';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:38886/plugins/exo-spike/proof/thr_hpkdzye5am');
  await page.waitForTimeout(3000);
  console.log(JSON.stringify({ url: page.url(), errors, headings: await page.getByRole('heading').allTextContents(), buttons: await page.getByRole('button').allTextContents(), editors: await page.locator('textarea,[contenteditable=true]').evaluateAll(es => es.map(e => ({ tag: e.tagName, role: e.getAttribute('role'), label: e.getAttribute('aria-label'), placeholder: e.getAttribute('placeholder') }))), proofText: (await page.locator('section[aria-label="Native BB conversation"]').textContent()).slice(0, 5000) }, null, 2));
  await page.screenshot({ path: 'evidence/initial-ui.png' });
} finally { await browser.close(); }
