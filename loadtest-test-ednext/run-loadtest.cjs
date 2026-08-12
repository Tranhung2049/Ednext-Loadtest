/**
 * LOAD TEST test.ednext.com.vn — khóa "thuat-toan-can-ban" — N acc ĐỒNG THỜI
 * ---------------------------------------------------------------------------
 * Bài: 1934 isPrime · 1935 factorSum · 1936 greatestCommonPrimeDivisor (xem config.cjs)
 *
 * Kịch bản mỗi account (song song, có "barrier" bắn cùng lúc):
 *   1. Mở /learning, điền form -> TẤT CẢ bấm "Đăng nhập" cùng 1 khoảnh khắc
 *   2. (nếu không LT_SKIP_ENROLL) vào trang khóa -> "Đăng ký miễn phí" (idempotent)
 *   3. Với từng bài: mở bài -> điền đáp án -> TẤT CẢ bấm "Chạy thử" cùng lúc -> chờ chấm
 *      -> (LT_SUBMIT=1) TẤT CẢ bấm "Nộp bài" cùng lúc
 *
 * Kết quả -> results.json (dựng HTML bằng generate-report.cjs)
 *
 * Chạy:
 *   $env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"   # BẮT BUỘC trên máy này (ổ C gần đầy)
 *   $env:LT_SUBMIT="1"; $env:LT_SKIP_ENROLL="1"; node run-loadtest.cjs
 *
 * Biến môi trường:
 *   LT_CONCURRENCY (mặc định 30) · LT_OFFSET · LT_HEADED · LT_SUBMIT · LT_BLOCK=0 (không chặn ảnh)
 *   LT_SKIP_ENROLL=1 (bỏ qua trang khóa học — dùng sau khi đã chạy enroll-all.cjs)
 *   LT_ACTS=1934,1935 chạy một phần các bài · LT_OUT=tên-file-results.json · LT_RAMP_MS
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { BASE, COURSE_SLUG, pickActivities } = require('./config.cjs');
const L = require('./lib.cjs');

const DIR = __dirname;
const ART = path.join(DIR, 'artifacts');
fs.mkdirSync(ART, { recursive: true });

// ---- config ----
const HEADLESS = !process.env.LT_HEADED;
const DO_SUBMIT = process.env.LT_SUBMIT === '1';
const BLOCK = process.env.LT_BLOCK !== '0';
const SKIP_ENROLL = process.env.LT_SKIP_ENROLL === '1';
const OUT_FILE = process.env.LT_OUT || 'results.json';
const ACTIVITIES = pickActivities();

// ---- accounts ----
const accounts = L.readAccounts(DIR);
const OFFSET = parseInt(process.env.LT_OFFSET || '0', 10);
const CONCURRENCY = Math.min(parseInt(process.env.LT_CONCURRENCY || '30', 10), accounts.length - OFFSET);
const RUN = accounts.slice(OFFSET, OFFSET + CONCURRENCY);
// Giãn nhẹ khâu MỞ trình duyệt để N Chromium không khởi động cùng một nhịp và tự bóp CPU
// máy test. Thời điểm bấm "Đăng nhập" vẫn đồng thời tuyệt đối nhờ barrier.
const RAMP_MS = parseInt(process.env.LT_RAMP_MS || '400', 10);

if (!RUN.length) {
  console.error('Không có tài khoản nào để chạy — kiểm tra accounts.txt và LT_OFFSET.');
  process.exit(1);
}

// ---- barrier ----
const bLogin = L.makeBarrier(RUN.length, 60000, 'login');
const bRun = {}, bSubmit = {};
for (const a of ACTIVITIES) {
  bRun[a.key] = L.makeBarrier(RUN.length, 90000, `run-${a.key}`);
  bSubmit[a.key] = L.makeBarrier(RUN.length, 90000, `submit-${a.key}`);
}

// ---- state ----
const nowISO = () => new Date().toISOString();
const results = [];
const GLOBAL = {
  site: BASE, course: COURSE_SLUG, startedAt: nowISO(), startEpoch: Date.now(),
  concurrency: RUN.length, offset: OFFSET, doSubmit: DO_SUBMIT, headless: HEADLESS,
  blockAssets: BLOCK, skipEnroll: SKIP_ENROLL,
  activities: ACTIVITIES.map(a => ({ key: a.key, id: a.id, name: a.name })),
};

// ---- một tài khoản ----
async function runAccount(browser, acct, idx) {
  const rec = { user: acct.user, index: idx, ok: false, startEpoch: null, events: [], errors: [] };
  results.push(rec);
  const rel = (epoch) => epoch - GLOBAL.startEpoch;
  const mark = async (phase, fn) => {
    const s = Date.now();
    const ev = { phase, tStart: rel(s), status: 'ok', durMs: 0, detail: null };
    try {
      ev.detail = await fn();
      ev.durMs = Date.now() - s;
      rec.events.push(ev);
      return ev.detail;
    } catch (e) {
      ev.status = 'error'; ev.durMs = Date.now() - s; ev.error = e.message.split('\n')[0].slice(0, 200);
      rec.events.push(ev); rec.errors.push(`${phase}: ${ev.error}`);
      throw e;
    }
  };

  let ctx, page;
  try {
    await new Promise(r => setTimeout(r, idx * RAMP_MS));
    ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await L.blockRoutes(ctx, BLOCK);
    page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    // Renderer chết (OOM/crash) làm mọi thao tác sau đó báo "Target page has been closed"
    // rất khó hiểu — ghi nhận riêng để đọc báo cáo không bị lạc hướng.
    page.on('crash', () => {
      rec.crashed = true;
      console.log(`[crash] ${acct.user} — renderer chết lúc t=${Date.now() - GLOBAL.startEpoch}ms`);
    });

    await mark('setup', async () => L.prepareLogin(page, acct));

    await bLogin();
    rec.startEpoch = Date.now();
    await mark('login', async () => L.doLogin(page));

    if (!SKIP_ENROLL) await mark('enroll', async () => L.enroll(page));

    const guard = async () => { if (await L.dismissSurvey(page)) rec.surveyPopups = (rec.surveyPopups || 0) + 1; };

    for (const act of ACTIVITIES) {
      await mark(`${act.key}_open`, async () => {
        const r = await L.openActivity(page, act.url);
        await guard();
        return { id: act.id, name: act.name, attempts: r.attempts };
      });
      await mark(`${act.key}_type`, async () => {
        await guard();
        const t = await L.typeSolution(page, act.solution);
        return { id: act.id, ...t };
      });

      await bRun[act.key]();
      const result = await mark(`${act.key}_run`, async () => {
        await guard();
        await L.ensureCode(page, act.solution); // phòng app reset editor về template trước khi chạy
        const ok = await L.clickRun(page);
        if (!ok) throw new Error('Không tìm thấy nút Chạy thử');
        const r = await L.waitRunResult(page);
        if (r === 'busy') throw new Error('Chạy thử: server chấm code báo "Server Busy. Please try again later"');
        if (r === 'timeout') throw new Error('Chạy thử: quá thời gian chờ kết quả');
        if (r === 'fail') throw new Error('Chạy thử: chấm KHÔNG pass (đáp án sai?)');
        return { result: r };
      });
      rec[`${act.key}_result`] = result && result.result;

      if (DO_SUBMIT) {
        await bSubmit[act.key]();
        await mark(`${act.key}_submit`, async () => { await guard(); return L.submitActivity(page); });
      }
    }

    rec.ok = rec.errors.length === 0;
  } catch (e) {
    rec.ok = false;
    if (!rec.errors.length) rec.errors.push(e.message.split('\n')[0].slice(0, 200));
    try { if (page) await page.screenshot({ path: path.join(ART, `err_${acct.user}.png`) }); } catch {}
  } finally {
    L.dropAllBarriers(); // acc này rời cuộc chơi -> các barrier sau bớt 1 thành viên
    try { if (ctx) await ctx.close(); } catch {}
  }
  console.log(`[done] ${acct.user} ok=${rec.ok} errors=${rec.errors.length}${rec.errors.length ? ' | ' + rec.errors[0] : ''}`);
}

// ---- main ----
(async () => {
  console.log(`== LOAD TEST test.ednext.com.vn (${COURSE_SLUG} ${ACTIVITIES.map(a => a.id).join('/')}) == accounts=${RUN.length} offset=${OFFSET} headless=${HEADLESS} submit=${DO_SUBMIT} block=${BLOCK} skipEnroll=${SKIP_ENROLL}`);
  // Bớt thành phần không cần cho phép đo -> giảm RAM/CPU phía máy chạy test, vốn là
  // nút thắt thật sự khi mở vài chục trình duyệt cùng lúc.
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--mute-audio'],
  });
  const t0 = Date.now();
  browser.on('disconnected', () => console.log(`[browser] MẤT KẾT NỐI lúc t=${Date.now() - t0}ms`));
  await Promise.all(RUN.map((a, i) => runAccount(browser, a, i)));
  GLOBAL.finishedAt = nowISO();
  GLOBAL.totalMs = Date.now() - t0;
  await browser.close();

  results.sort((a, b) => a.index - b.index);
  fs.writeFileSync(path.join(DIR, OUT_FILE), JSON.stringify({ meta: GLOBAL, results }, null, 2), 'utf8');
  const okN = results.filter(r => r.ok).length;
  console.log(`\n== XONG == ok=${okN}/${results.length} totalMs=${GLOBAL.totalMs}`);
  for (const act of ACTIVITIES) {
    const pass = results.filter(r => r[`${act.key}_result`] === 'pass').length;
    console.log(`   ${act.id} ${act.name}: chấm pass ${pass}/${results.length}`);
  }
  console.log(`-> ${OUT_FILE} đã ghi.`);
})();
