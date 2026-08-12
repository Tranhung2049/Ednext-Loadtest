/**
 * KHẢO SÁT 3 bài code trên test.ednext.com.vn trước khi chạy load test.
 * Với mỗi bài: lấy tiêu đề, chữ ký hàm mẫu trong Monaco, panel KIỂM THỬ
 * -> ghi ra explore-<id>.txt để đối chiếu với `solution` trong config.cjs.
 *
 * Đặt EXP_RUN=1 để thử luôn đáp án (gõ code -> Chạy thử -> chờ chấm) — nên làm
 * MỘT LẦN trước burst, vì đáp án sai sẽ làm hỏng toàn bộ số đo.
 *
 * Chạy:
 *   $env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"
 *   node explore-activities.cjs              # chỉ đọc đề
 *   $env:EXP_RUN="1"; node explore-activities.cjs   # đọc đề + thử đáp án
 *
 * Biến: EXP_USER/EXP_PASS (mặc định lấy dòng đầu accounts.txt) · EXP_ENROLL=0 để bỏ qua đăng ký.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pickActivities } = require('./config.cjs');
const L = require('./lib.cjs');

const DIR = __dirname;
const DO_RUN = process.env.EXP_RUN === '1';
const DO_ENROLL = process.env.EXP_ENROLL !== '0';
const ACTIVITIES = pickActivities();

function account() {
  if (process.env.EXP_USER) return { user: process.env.EXP_USER, pass: process.env.EXP_PASS || '' };
  const list = L.readAccounts(DIR);
  if (!list.length) throw new Error('accounts.txt rỗng');
  return list[0];
}

(async () => {
  const acct = account();
  console.log(`== KHẢO SÁT ${ACTIVITIES.length} bài với tài khoản ${acct.user} (thử đáp án: ${DO_RUN ? 'CÓ' : 'không'}) ==`);
  const browser = await chromium.launch({ headless: !process.env.EXP_HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  try {
    await L.prepareLogin(page, acct);
    await L.doLogin(page);
    console.log('[ok] đăng nhập');

    if (DO_ENROLL) {
      const e = await L.enroll(page);
      console.log(`[ok] đăng ký khóa: ${e.enrolled}`);
    }

    for (const act of ACTIVITIES) {
      console.log(`\n-- bài ${act.id} ${act.name}`);
      await page.goto(act.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 }).catch(() => {});
      await L.dismissSurvey(page);
      await page.waitForTimeout(2000);

      const title = await page.title().catch(() => '');
      // App nạp template vào model một lúc SAU khi editor xuất hiện — đọc sớm sẽ ra rỗng.
      await page.waitForFunction(() => {
        if (typeof monaco === 'undefined' || !monaco.editor) return false;
        const m = monaco.editor.getModels();
        return m.length === 1 && m[0].getValue().trim().length > 0;
      }, { timeout: 15000 }).catch(() => {});
      const starter = await page.evaluate(() => {
        if (typeof monaco === 'undefined' || !monaco.editor) return '(không thấy monaco)';
        const m = monaco.editor.getModels();
        return m.length ? m[0].getValue() : '(không có model)';
      }).catch(() => '(lỗi đọc editor)');
      const body = await page.evaluate(() => document.body.innerText).catch(() => '');

      let runResult = '(không chạy)';
      if (DO_RUN) {
        await L.typeSolution(page, act.solution);
        const clicked = await L.clickRun(page);
        runResult = clicked ? await L.waitRunResult(page) : '(không thấy nút Chạy thử)';
        console.log(`   chạy thử -> ${runResult}`);
      }

      const out = [
        `URL: ${act.url}`,
        `TITLE: ${title}`,
        `CHỮ KÝ KHAI BÁO TRONG CONFIG: ${act.signature}`,
        `KẾT QUẢ THỬ ĐÁP ÁN: ${runResult}`,
        '',
        '===== EDITOR / STARTER =====',
        starter,
        '',
        '===== BODY TEXT =====',
        body,
      ].join('\n');
      fs.writeFileSync(path.join(DIR, `explore-${act.id}.txt`), out, 'utf8');
      console.log(`   -> explore-${act.id}.txt`);

      const sigOk = starter.replace(/\s+/g, ' ').includes(act.signature.replace(/\s+/g, ' '));
      if (!sigOk) console.log(`   [CẢNH BÁO] chữ ký hàm trong config KHÔNG khớp starter — sửa config.cjs trước khi chạy load test`);
    }
  } catch (e) {
    console.error('[LỖI]', e.message);
    await page.screenshot({ path: path.join(DIR, 'explore-error.png'), fullPage: true }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
