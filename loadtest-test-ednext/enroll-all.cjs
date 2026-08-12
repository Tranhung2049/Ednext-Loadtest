/**
 * PRE-ENROLL khóa "thuat-toan-can-ban" trên test.ednext.com.vn (one-time setup).
 *
 * Chạy theo LÔ NHỎ để không nghẽn CPU máy chạy test — tách bước đăng ký ra khỏi burst
 * chính giúp số đo của burst sạch (đúng kịch bản thật: học viên đã đăng ký sẵn, cùng
 * vào làm bài). Nếu muốn ĐO luôn cả trang khóa học dưới tải thì bỏ bước này và chạy
 * run-loadtest.cjs không kèm LT_SKIP_ENROLL.
 *
 * Chạy:
 *   $env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"
 *   node enroll-all.cjs
 *
 * Biến: EN_BATCH (mặc định 6) số acc mỗi lô · EN_OFFSET · EN_LIMIT.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const L = require('./lib.cjs');

const DIR = __dirname;
const BATCH = parseInt(process.env.EN_BATCH || '6', 10);
const OFFSET = parseInt(process.env.EN_OFFSET || '0', 10);
const all = L.readAccounts(DIR);
const LIMIT = Math.min(parseInt(process.env.EN_LIMIT || String(all.length), 10), all.length - OFFSET);
const accounts = all.slice(OFFSET, OFFSET + LIMIT);

async function enrollOne(browser, acct) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  try {
    await L.prepareLogin(page, acct);
    await L.doLogin(page);
    const r = await L.enroll(page);
    console.log(`  [ok] ${acct.user} -> ${r.enrolled}`);
    return r.enrolled;
  } catch (e) {
    console.log(`  [LỖI] ${acct.user}: ${e.message.split('\n')[0].slice(0, 90)}`);
    await page.screenshot({ path: path.join(DIR, 'artifacts', `enroll_err_${acct.user}.png`) }).catch(() => {});
    return 'error';
  } finally {
    await ctx.close().catch(() => {});
  }
}

(async () => {
  require('fs').mkdirSync(path.join(DIR, 'artifacts'), { recursive: true });
  console.log(`== PRE-ENROLL thuat-toan-can-ban (test.ednext.com.vn): ${accounts.length} acc (offset=${OFFSET}), lô ${BATCH} ==`);
  const browser = await chromium.launch({ headless: true });
  const stat = { now: 0, already: 0, error: 0 };
  const failed = [];
  for (let i = 0; i < accounts.length; i += BATCH) {
    const batch = accounts.slice(i, i + BATCH);
    console.log(`-- lô ${Math.floor(i / BATCH) + 1}: ${batch.map(a => a.user).join(', ')}`);
    const res = await Promise.all(batch.map(a => enrollOne(browser, a)));
    res.forEach((r, k) => { stat[r]++; if (r === 'error') failed.push(batch[k].user); });
  }
  await browser.close();
  console.log(`\n== XONG == đăng ký mới=${stat.now} đã có sẵn=${stat.already} lỗi=${stat.error}`);
  if (failed.length) console.log(`   Acc lỗi: ${failed.join(', ')}`);
})();
