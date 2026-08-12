/**
 * Dò trạng thái trang khóa học sau khi bấm "Đăng ký miễn phí":
 * liệt kê mọi button (text + disabled) trước/sau khi tải lại trang.
 * Chạy: node probe-course.cjs [username]
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const { COURSE_URL } = require('./config.cjs');
const L = require('./lib.cjs');

const DIR = __dirname;
const want = process.argv[2];
const list = L.readAccounts(DIR);
const acct = want ? list.find(a => a.user === want) : list[0];

const dumpButtons = (page) => page.evaluate(() => ({
  url: location.href,
  buttons: [...document.querySelectorAll('button')]
    .map(b => ({ t: (b.textContent || '').replace(/\s+/g, ' ').trim(), d: b.disabled }))
    .filter(b => b.t),
  progress: (document.body.innerText.match(/Tiến độ học[\s\S]{0,40}/) || [''])[0].replace(/\s+/g, ' '),
}));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  try {
    await L.prepareLogin(page, acct);
    await L.doLogin(page);
    console.log(`[ok] đăng nhập ${acct.user}`);

    await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 8; i++) { await L.dismissSurvey(page); await page.waitForTimeout(500); }
    console.log('\n== TRẠNG THÁI HIỆN TẠI ==');
    console.log(JSON.stringify(await dumpButtons(page), null, 1));

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 8; i++) { await L.dismissSurvey(page); await page.waitForTimeout(500); }
    console.log('\n== SAU KHI TẢI LẠI ==');
    console.log(JSON.stringify(await dumpButtons(page), null, 1));
    await page.screenshot({ path: path.join(DIR, 'probe-course.png'), fullPage: false });
  } catch (e) {
    console.error('[LỖI]', e.message);
    await page.screenshot({ path: path.join(DIR, 'probe-course-err.png') }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
