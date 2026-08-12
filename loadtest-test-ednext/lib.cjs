/**
 * Hàm dùng chung cho bộ load test test.ednext.com.vn
 * (đăng nhập, đăng ký khóa, thao tác Monaco, chạy thử/nộp bài, barrier đồng thời).
 */
const fs = require('fs');
const path = require('path');
const { LOGIN_URL, COURSE_URL } = require('./config.cjs');

// ---- tài khoản ----
// Danh sách acc của môi trường TEST nằm ở loadtest-ednext/"accounts test.txt" (tách riêng
// khỏi accounts.txt của prod). Ghi đè bằng LT_ACCOUNTS=<đường dẫn> khi cần.
function accountsFile(dir) {
  const candidates = [
    process.env.LT_ACCOUNTS,
    path.join(dir, 'accounts.txt'),
    path.join(dir, '..', 'loadtest-ednext', 'accounts test.txt'),
  ].filter(Boolean);
  const found = candidates.find(f => fs.existsSync(f));
  if (!found) {
    throw new Error(`Không tìm thấy file tài khoản. Đã thử:\n  ${candidates.join('\n  ')}\nMỗi dòng một tài khoản dạng "username,password".`);
  }
  return found;
}

function readAccounts(dir) {
  const file = accountsFile(dir);
  console.log(`[accounts] dùng ${file}`);
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const [u, p] = l.split(','); return { user: u.trim(), pass: (p || '').trim() }; });
}

// ---- barrier: mọi acc chuẩn bị xong mới cùng "nhả cổng" để bấm cùng một khoảnh khắc ----
// `drop()` giảm số thành viên khi một acc chết giữa chừng — nếu không, các barrier sau
// luôn phải chờ hết timeout và làm tổng thời gian chạy phình to một cách giả tạo.
const ALL_BARRIERS = [];
function makeBarrier(parties, timeoutMs, label) {
  let arrived = 0, released = false, resolveAll, timer = null;
  const gate = new Promise(r => (resolveAll = r));
  const fire = (reason) => {
    if (released) return;
    released = true;
    if (timer) clearTimeout(timer);
    console.log(`[barrier ${label}] release (${reason}) arrived=${arrived}/${parties}`);
    resolveAll(Date.now());
  };
  const check = () => { if (parties > 0 && arrived >= parties) fire('all-arrived'); };
  const wait = async function () {
    arrived++;
    check();
    if (!released && !timer) timer = setTimeout(() => fire('timeout'), timeoutMs);
    return gate;
  };
  wait.drop = () => { parties--; check(); };
  ALL_BARRIERS.push(wait);
  return wait;
}
const dropAllBarriers = () => { for (const b of ALL_BARRIERS) b.drop(); };

// ---- mạng ----
// CHỈ chặn theo mẫu URL. Nếu route('**/*') thì MỌI request (kể cả bundle Monaco vài MB
// nhân với N tab) phải đi vòng qua tiến trình Node -> Node hết heap khi chạy ~30 acc.
const BLOCK_URL_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)(\?|$)|googletagmanager|google-analytics|gtag\/js|facebook|fbcdn|hotjar|clarity\.ms|doubleclick|youtube|sentry/i;

async function blockRoutes(ctx, enabled) {
  if (!enabled) return;
  await ctx.route(BLOCK_URL_RE, (route) => route.abort().catch(() => {}));
}

// ---- đăng nhập (tách 2 pha để barrier bắn cùng lúc) ----
// Site test thỉnh thoảng trả 503 -> báo lỗi rõ ràng thay vì timeout khó hiểu.
async function prepareLogin(page, acct) {
  const resp = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const status = resp ? resp.status() : null;
  if (status === 503) throw new Error('Site test trả 503 — môi trường tạm không khả dụng');
  // Nút "Đăng nhập" ở HEADER (first) mở modal đăng nhập.
  await page.getByRole('button', { name: 'Đăng nhập' }).first().click({ timeout: 30000 });
  await page.getByRole('textbox', { name: 'Tên đăng nhập của bạn' }).first().fill(acct.user);
  await page.getByRole('textbox', { name: '••••••••' }).first().fill(acct.pass);
  return { ready: true, status };
}

async function doLogin(page) {
  // Nút submit là "Đăng nhập" TRONG modal = nút CUỐI (last); nút đầu là header.
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click();
  await page.waitForURL(/\/learning\b/, { timeout: 45000 });
  const huy = page.getByRole('button', { name: 'Hủy' });
  if (await huy.isVisible().catch(() => false)) await huy.click().catch(() => {});
  const stillLogin = await page.getByRole('button', { name: 'Đăng nhập' }).first()
    .isVisible({ timeout: 3000 }).catch(() => false);
  if (stillLogin) throw new Error('Đăng nhập thất bại — form vẫn còn (sai tài khoản/mật khẩu?)');
  return { url: page.url() };
}

// ---- đăng ký khóa học (idempotent) ----
// Nút trên site test là "Đăng ký miễn phí"; sau khi đăng ký đổi thành "Vào học ngay"/"Hủy đăng ký".
// Modal "Khảo sát khóa học" hay bật lên ngay ở trang khóa học và Mantine gắn aria-hidden lên
// phần còn lại của trang -> locator theo ROLE không còn thấy nút. Vì vậy dò nút bằng DOM thuần
// và đóng modal trước mỗi vòng dò.
const ENROLL_RE = /^Đăng k[ýí]/i;

async function courseButtonState(page) {
  return page.evaluate(() => {
    const texts = [...document.querySelectorAll('button')]
      .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
    return {
      enroll: texts.some(t => /^Đăng k[ýí]/i.test(t)),
      enrolled: texts.some(t => /Vào học ngay|Học tiếp|Hu[ỷy] đăng k/i.test(t)),
    };
  }).catch(() => ({ enroll: false, enrolled: false }));
}

async function waitCourseState(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let state = { enroll: false, enrolled: false };
  while (Date.now() < deadline) {
    await dismissSurvey(page);
    state = await courseButtonState(page);
    if (state.enroll || state.enrolled) return state;
    await page.waitForTimeout(500);
  }
  return state;
}

// Sau khi bấm "Đăng ký miễn phí", nút chỉ chuyển sang mờ; nhãn "Vào học ngay"/"Huỷ đăng kí"
// xuất hiện chậm hơn (đôi khi phải tải lại trang) -> chờ riêng cho trạng thái ĐÃ đăng ký.
async function waitEnrolled(page, timeoutMs) {
  const start = Date.now();
  let reloaded = false;
  while (Date.now() - start < timeoutMs) {
    await dismissSurvey(page);
    if ((await courseButtonState(page)).enrolled) return true;
    if (!reloaded && Date.now() - start > timeoutMs / 2) {
      reloaded = true;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
    await page.waitForTimeout(700);
  }
  return false;
}

async function enroll(page) {
  await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const state = await waitCourseState(page, 45000);
  if (state.enrolled) return { enrolled: 'already' };
  if (!state.enroll) throw new Error('Không thấy nút Đăng ký lẫn trạng thái đã đăng ký trên trang khóa học');

  const btn = page.getByRole('button', { name: ENROLL_RE }).first();
  const clicked = await btn.click({ timeout: 8000 }).then(() => true).catch(() => false);
  if (!clicked) {
    const jsClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /^Đăng k[ýí]/i.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
      if (!b) return false;
      b.click();
      return true;
    }).catch(() => false);
    if (!jsClicked) throw new Error('Không bấm được nút Đăng ký');
  }

  if (!await waitEnrolled(page, 40000)) {
    throw new Error('Bấm Đăng ký xong nhưng trang không chuyển sang trạng thái đã đăng ký');
  }
  return { enrolled: 'now' };
}

// ---- modal khảo sát ----
// Modal "Khảo sát khóa học" bật lên ngẫu nhiên khi vào trang bài học và PHỦ KÍN màn hình
// -> mọi thao tác chuột bị chặn. Đóng bằng nút "Hủy" (hoặc nút X không có chữ).
async function dismissSurvey(page) {
  return page.evaluate(() => {
    // innerText bắt trình duyệt reflow cả trang (rất chậm khi đang tải nặng) -> dùng textContent.
    if (!document.body.textContent.includes('Khảo sát khóa học')) return false;
    const boxes = [...document.querySelectorAll('div,dialog,section')]
      .filter(el => el.textContent.includes('Khảo sát khóa học') && el.textContent.length < 1500);
    if (!boxes.length) return false;
    const box = boxes[boxes.length - 1];
    const btns = [...box.querySelectorAll('button')];
    const close = btns.find(b => /^(Hủy|Huỷ|Đóng)$/i.test((b.textContent || '').trim()))
      || btns.find(b => !(b.textContent || '').trim());
    if (!close) return false;
    close.click();
    return true;
  }).catch(() => false);
}

// ---- mở trang bài học ----
// Khi chạy ~30 Chromium trên một máy, việc mở trang hay vấp lỗi PHÍA CLIENT
// (ERR_INSUFFICIENT_RESOURCES do cạn socket/bộ nhớ, hoặc editor nạp quá chậm).
// Thử lại ở đây là hợp lệ vì tính "đồng thời" của phép đo chỉ do barrier ở bước
// Chạy thử/Nộp bài quyết định, không phụ thuộc lúc mở trang.
async function openActivity(page, url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await dismissSurvey(page);
      await page.locator('.monaco-editor').first().waitFor({ timeout: 45000 });
      return { attempts: i };
    } catch (e) {
      last = e;
      if (i < tries) await page.waitForTimeout(2000 * i);
    }
  }
  throw new Error(`Mở bài thất bại sau ${tries} lần: ${last.message.split('\n')[0].slice(0, 120)}`);
}

// ---- Monaco editor ----
// Điền code bằng API monaco (không cần focus chuột).
// LƯU Ý: app nạp template mặc định vào model MỘT LÚC SAU khi editor xuất hiện. Nếu setValue
// chạy trước đó, template sẽ GHI ĐÈ lên code -> editor rỗng -> compile fail.
// => (1) chờ template đã nạp (model khác rỗng) rồi mới set; (2) verify code còn nguyên sau 400ms; retry.
async function typeSolution(page, code, tries = 4) {
  await page.waitForFunction(() => {
    if (typeof monaco === 'undefined' || !monaco.editor) return false;
    const m = monaco.editor.getModels();
    return m.length === 1 && m[0].getValue().trim().length > 0;
  }, { timeout: 8000 }).catch(() => {});

  for (let i = 0; i < tries; i++) {
    const set = await page.evaluate((c) => {
      if (typeof monaco === 'undefined' || !monaco.editor) return false;
      const m = monaco.editor.getModels();
      if (m.length !== 1) return false;
      m[0].setValue(c);
      return m[0].getValue() === c;
    }, code).catch(() => false);
    if (set) {
      await page.waitForTimeout(400);
      const still = await page.evaluate((c) => {
        const m = monaco.editor.getModels();
        return m.length === 1 && m[0].getValue() === c;
      }, code).catch(() => false);
      if (still) return { method: 'monaco', attempt: i + 1 };
    }
    await page.waitForTimeout(400);
  }
  // Dự phòng: gõ tay — chỉ nhánh này mới cần focus chuột vào editor.
  await page.locator('.monaco-editor').first().click({ timeout: 15000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
  return { method: 'keyboard', attempt: tries };
}

/** Đảm bảo code đang nằm trong editor (phòng khi app reset về template) — set lại nếu cần. */
async function ensureCode(page, code) {
  return page.evaluate((c) => {
    if (typeof monaco === 'undefined' || !monaco.editor) return true;
    const m = monaco.editor.getModels();
    if (m.length !== 1) return true;
    if (m[0].getValue() === c) return true;
    m[0].setValue(c);
    return m[0].getValue() === c;
  }, code).catch(() => true);
}

// ---- chạy thử / nộp bài ----
// Trong automation 2 nút này đôi khi mang class `hidden` (khác biệt render headless)
// -> thao tác bằng JS thay vì click chuột.
async function clickRun(page) {
  return page.evaluate(() => {
    const b = document.querySelector('button[title="Chạy thử"]');
    if (!b) return false;
    b.classList.remove('hidden');
    b.click();
    return true;
  });
}

async function waitRunResult(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      // Ưu tiên bắt LỖI trước để không báo pass nhầm khi có text cũ sót lại.
      if (/(Server Busy|try again later)/i.test(t)) return 'busy';
      if (/(Wrong answer|Runtime Error|Time Limit|Memory Limit|Compilation Error|Compile code failed|Lỗi biên dịch|Kiểm thử thất bại|test case sai|kiểm thử chưa|có kiểm thử.*không đúng)/i.test(t)) return 'fail';
      if (/Toàn bộ kiểm thử thành công/i.test(t)) return 'pass';
      return '';
    }).catch(() => '');
    if (st) return st;
    await page.waitForTimeout(700);
  }
  return 'timeout';
}

async function submitActivity(page) {
  const enabled = await page.waitForFunction(() => {
    const b = document.querySelector('button[title="Nộp bài"]');
    return b && !b.disabled;
  }, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!enabled) throw new Error('Nộp bài không enable (chưa đăng ký khóa học? hoặc chấm chưa pass)');

  await page.evaluate(() => {
    const b = document.querySelector('button[title="Nộp bài"]');
    b.classList.remove('hidden');
    b.click();
  });
  const congrats = await page.getByText(/Chúc mừng|Bạn vừa hoàn thành bài học/i).first()
    .waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  const stay = page.getByRole('button', { name: 'Ở lại trang' });
  if (await stay.isVisible().catch(() => false)) await stay.click().catch(() => {});
  if (!congrats) {
    // Dưới tải, server chấm bài hay trả "Server Busy" ngay trong panel kết quả —
    // gọi đúng tên nguyên nhân thay vì chỉ báo thiếu popup.
    const busy = await page.evaluate(() => /Server Busy|try again later/i.test(document.body.innerText)).catch(() => false);
    if (busy) throw new Error('Nộp bài: server chấm bài báo "Server Busy. Please try again later"');
    throw new Error('Nộp bài: không thấy popup xác nhận "Chúc mừng"');
  }
  return { submitted: true };
}

module.exports = {
  accountsFile, readAccounts, makeBarrier, dropAllBarriers, blockRoutes,
  prepareLogin, doLogin, enroll, dismissSurvey, openActivity,
  typeSolution, ensureCode, clickRun, waitRunResult, submitActivity,
};
