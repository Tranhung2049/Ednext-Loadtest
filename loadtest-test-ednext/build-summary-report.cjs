/**
 * Dựng BÁO CÁO TỔNG HỢP (tự-chứa, chia sẻ được) cho đợt load test test.ednext.com.vn:
 * kết quả lần chạy cuối + nhật ký sự cố của tất cả các lần chạy + ảnh bằng chứng nhúng sẵn.
 *
 * Chạy: node build-summary-report.cjs  ->  bao-cao-loadtest-test-ednext.html
 *
 * Nguồn dữ liệu: results.json (30 acc, lần cuối) · results-ctrl15-a.json (15 acc đối chứng)
 *                results-diag1.json (1 acc, mốc so sánh không tải) · artifacts/*.png
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = 'bao-cao-loadtest-test-ednext.html';

const readJson = (f) => {
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const final30 = readJson('results.json');
const ctrl15 = readJson('results-ctrl15-a.json');
const base1 = readJson('results-diag1.json');
if (!final30) throw new Error('Thiếu results.json — chạy run-loadtest.cjs trước.');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtMs = (v) => v == null ? '—' : v >= 10000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
const pctl = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const evOf = (r, k) => r.events.find(e => e.phase === k);
const durs = (data, k) => data.results.map(r => evOf(r, k)).filter(e => e && e.status === 'ok').map(e => e.durMs);

const img = (file) => {
  const p = path.join(DIR, 'artifacts', file);
  if (!fs.existsSync(p)) return null;
  return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
};

// ---------- nhật ký sự cố (results.json của các lần chạy hỏng đã bị ghi đè, giữ lại ở đây) ----------
const RUNS = [
  { id: 'A', time: '~16:37', cfg: '5 acc · 3 bài', ok: '0/5', bad: true, cause: 'client', note: 'Trình duyệt trên máy test chết giữa chừng' },
  { id: 'B', time: '16:43–16:44', cfg: '30 acc', ok: 'sập tiến trình', bad: true, cause: 'client', note: 'Node trên máy test hết bộ nhớ' },
  { id: 'C', time: '16:44–16:51', cfg: '30 acc', ok: '19/30', bad: true, cause: 'client', note: '11 acc không mở nổi bài 2 do máy test cạn tài nguyên' },
  { id: 'D', time: '16:53–16:58', cfg: '15 acc (đối chứng)', ok: '13/15', bad: true, cause: 'server', note: '2 acc lỗi nộp bài — Server Busy' },
  { id: 'E', time: '16:58–17:05', cfg: '30 acc', ok: '28/30', bad: true, cause: 'server', note: '2 acc lỗi nộp bài — Server Busy' },
  { id: 'F', time: '17:08–17:15', cfg: '30 acc', ok: '30/30', bad: false, cause: 'none', note: 'Không có lỗi nào' },
];

const CAUSE_TAG = {
  client: '<span class="tag client">MÁY TEST</span>',
  server: '<span class="tag server">SERVER</span>',
  none: '<span class="tag none">—</span>',
};

// Số lượt Chạy thử / Nộp bài đã thực hiện ở 3 lượt chạy còn giữ được số liệu (D, E, F).
// Ghi cứng vì results.json của các lượt hỏng trước đó đã bị ghi đè.
const SUBMIT_TOTAL = 45 + 88 + 90;   // D: 15×3 · E: 30+30+28 · F: 30×3
const SUBMIT_FAIL = 2 + 2 + 0;       // đều là "Server Busy"
const RUN_TOTAL = SUBMIT_TOTAL;      // mỗi lượt nộp đều có một lượt chạy thử trước đó
const RUN_FAIL = 0;

// Phân định: pha nào phản ánh năng lực SERVER, pha nào chỉ phản ánh sức MÁY TEST.
const PHASE_ORIGIN = {
  setup: ['mix', 'Cả hai', 'Tải trang từ server, nhưng dựng giao diện tốn CPU máy test'],
  login: ['server', 'Server', 'Chờ server xác thực và trả phiên đăng nhập'],
  open: ['mix', 'Cả hai', 'Server trả dữ liệu bài, máy test dựng editor Monaco'],
  type: ['client', 'Máy test', 'Chỉ thao tác trong trình duyệt, KHÔNG gọi server'],
  run: ['server', 'Server', 'Server biên dịch và chấm code'],
  submit: ['server', 'Server', 'Server ghi nhận bài nộp'],
};
const originOf = (k) => PHASE_ORIGIN[k] || PHASE_ORIGIN[(k.split('_')[1] || '')] || ['mix', 'Cả hai', ''];

const INCIDENTS = [
  {
    id: 'A', title: 'Trình duyệt chết đồng loạt', time: '~16:37 · 5 tài khoản',
    origin: 'client', originLabel: 'Máy chạy test',
    rows: [['1hvm, 2hvm, 3hvm, 4hvm, 5hvm', 'Gõ code bài 1934', 'Target page, context or browser has been closed']],
    why: 'Cả 5 acc chết cùng một khoảnh khắc (~26 giây sau khi bắt đầu), tức tiến trình Chromium tắt hẳn chứ không phải từng tab lỗi riêng. Chạy lại y hệt ngay sau đó cho kết quả 5/5 đạt nên đây là sự cố nhất thời của máy, không liên quan tới website.',
    fix: null, shots: [],
  },
  {
    id: 'B', title: 'Node hết bộ nhớ, sập tiến trình', time: '16:43–16:44 · 30 tài khoản',
    origin: 'client', originLabel: 'Lỗi của bộ script',
    rows: [['10hvm, 24hvm (kịp ghi ảnh trước khi sập)', 'Mở/gõ bài 1934', 'FATAL ERROR: JavaScript heap out of memory']],
    why: 'Hàm chặn ảnh/tracker dùng ctx.route("**/*"), nghĩa là MỌI request phải đi vòng qua tiến trình Node. Với 30 tab cùng tải bundle Monaco (vài MB mỗi tab) thì Node vỡ bộ nhớ ở giây thứ 37.',
    fix: 'Chỉ chặn theo mẫu URL (lib.cjs → BLOCK_URL_RE): ảnh/font/tracker mới đi qua Node, mã nguồn trang đi thẳng. Sau khi sửa không còn tái diễn.',
    shots: [],
  },
  {
    id: 'C', title: 'Không mở nổi bài 2 (1935)', time: '16:44–16:51 · 30 tài khoản · 11 acc lỗi',
    origin: 'client', originLabel: 'Máy chạy test',
    rows: [
      ['22hvm, 26hvm', 'Mở bài 1935', 'net::ERR_INSUFFICIENT_RESOURCES'],
      ['1hvm, 3hvm, 20hvm, 21hvm, 25hvm, 29hvm', 'Mở bài 1935', 'Chờ editor Monaco quá 30 giây'],
      ['7hvm, 15hvm, 27hvm', 'Mở bài 1935', 'Tải trang quá 60 giây'],
    ],
    why: 'ERR_INSUFFICIENT_RESOURCES là lỗi Chromium báo khi CHÍNH NÓ cạn tài nguyên (socket/bộ nhớ) — 30 trình duyệt thật trên máy 12 nhân, RAM trống 7.6 GB. Ba nhóm lỗi trên đều là biến thể của cùng một hiện tượng nghẽn phía client. Bài 1 ngay trước đó vẫn đạt 30/30 nên không phải lỗi server.',
    fix: 'Bước mở bài được thử lại tối đa 3 lần và nới thời gian chờ (lib.cjs → openActivity), kèm bớt thành phần thừa của Chromium khi khởi động. Việc thử lại không làm sai phép đo, vì tính "đồng thời" chỉ do barrier ở bước Chạy thử / Nộp bài quyết định.',
    shots: [], // ảnh của nhóm này chỉ là trang trắng, không cho thêm thông tin gì
  },
  {
    id: 'D', title: 'Server báo bận khi nộp bài (mức 15 người)', time: '16:53–16:58 · 15 tài khoản · 2 acc lỗi',
    origin: 'server', originLabel: 'Server ednext',
    rows: [['3hvm, 11hvm', 'Nộp bài 1936', 'Server Busy. Please try again later']],
    why: 'Panel KIỂM THỬ hiện dòng đỏ "Server Busy. Please try again later!. Please try again later!!!". Lúc chạy, script báo nhầm là "không thấy popup xác nhận Chúc mừng" vì chỉ chờ popup mà chưa đọc thông báo lỗi; ảnh chụp mới lộ ra nguyên nhân thật.',
    fix: 'Đã sửa submitActivity để đọc và gọi đúng tên lỗi "Server Busy" trong các lần chạy sau.',
    shots: [{ file: 'err_3hvm.png', cap: '3hvm — nộp bài 1936 bị từ chối vì server bận' }],
  },
  {
    id: 'E', title: 'Server báo bận khi nộp bài (mức 30 người)', time: '16:58–17:05 · 30 tài khoản · 2 acc lỗi',
    origin: 'server', originLabel: 'Server ednext',
    rows: [['5hvm, 30hvm', 'Nộp bài 1935', 'Server Busy. Please try again later']],
    why: 'Hai acc này dừng luôn ở đó nên không làm tiếp bài 3 — vì vậy bài 1936 chỉ có 28/30. Đối chiếu tiến độ khóa học sau đó (2hvm, 5hvm, 30hvm đều 6%) cho thấy KHÔNG mất dữ liệu bài đã nộp.',
    fix: null,
    shots: [{ file: 'err_5hvm.png', cap: '5hvm — nộp bài 1935 bị từ chối vì server bận' }],
  },
];

const BY_ACCOUNT = [
  ['3hvm', 3, 'A · C · D'],
  ['1hvm', 2, 'A · C'],
  ['5hvm', 2, 'A · E'],
  ['2hvm, 4hvm', 1, 'A'],
  ['10hvm, 24hvm', 1, 'B'],
  ['7hvm, 15hvm, 20hvm, 21hvm, 22hvm, 25hvm, 26hvm, 27hvm, 29hvm', 1, 'C'],
  ['11hvm', 1, 'D'],
  ['30hvm', 1, 'E'],
  ['6, 8, 9, 12, 13, 14, 16, 17, 18, 19, 23, 28hvm', 0, '—'],
];

// ---------- số liệu ----------
const meta = final30.meta;
const acts = meta.activities;
const okAcc = final30.results.filter(r => r.ok).length;
const loginStarts = final30.results.map(r => evOf(r, 'login')).filter(Boolean).map(e => e.tStart);
const loginSpread = loginStarts.length ? Math.max(...loginStarts) - Math.min(...loginStarts) : 0;
const passN = (data, key) => data.results.filter(r => { const e = evOf(r, key); return e && e.detail && e.detail.result === 'pass'; }).length;

const PHASE_LABELS = [['setup', 'Mở trang & điền form'], ['login', 'Đăng nhập']];
acts.forEach((a, i) => PHASE_LABELS.push(
  [`${a.key}_open`, `Mở bài ${i + 1} (${a.name})`],
  [`${a.key}_type`, `Gõ code bài ${i + 1}`],
  [`${a.key}_run`, `Chạy thử bài ${i + 1}`],
  [`${a.key}_submit`, `Nộp bài ${i + 1}`],
));

const phaseRows = PHASE_LABELS.map(([k, label]) => {
  const d = durs(final30, k);
  if (!d.length) return null;
  const evs = final30.results.map(r => evOf(r, k)).filter(Boolean);
  const [cls, who] = originOf(k);
  return {
    label, cls, who, server: cls === 'server', n: evs.length,
    err: evs.filter(e => e.status === 'error').length,
    p50: pctl(d, 50), p95: pctl(d, 95), max: Math.max(...d),
  };
}).filter(Boolean);

// So sánh không tải (1 acc) với 30 acc — cho thấy pha nào là nghẽn client, pha nào là số liệu server.
const CMP = base1 ? [
  { label: 'Đăng nhập', k: 'login', cls: 'server', note: 'Server chậm hơn nhưng vẫn trong ngưỡng chấp nhận' },
  { label: 'Mở bài học', k: 'act1_open', cls: 'mix', note: 'Lẫn cả tải dữ liệu lẫn dựng giao diện' },
  { label: 'Gõ code (không gọi server)', k: 'act1_type', cls: 'client', note: 'Không đụng tới server → toàn bộ độ chậm là của máy đo' },
  { label: 'Chạy thử — server chấm code', k: 'act1_run', cls: 'server', note: 'Số liệu thật của website: chậm khoảng 2 lần' },
].map(c => {
  const b = durs(base1, c.k), f = durs(final30, c.k);
  return { ...c, one: b.length ? pctl(b, 50) : null, many: f.length ? pctl(f, 50) : null };
}) : [];

// Mọi chỗ nhắc tới mã sự cố (A–F) đều thành liên kết nhảy tới thẻ giải thích tương ứng.
const hasIncident = (id) => INCIDENTS.some(i => i.id === id);
const refSC = (id) => hasIncident(id)
  ? `<a class="ref" href="#sc-${id}" title="Xem chi tiết sự cố ${id}">${id}</a>`
  : id;
const refList = (s) => String(s).replace(/\b([A-F])\b/g, (m) => refSC(m));

const cellOf = (r, k) => {
  const e = evOf(r, k);
  if (!e) return '<td class="na">—</td>';
  const extra = e.detail && e.detail.result ? ` <i>${esc(e.detail.result)}</i>` : '';
  return `<td class="${e.status}">${e.status === 'ok' ? '✓' : '✕'} ${fmtMs(e.durMs)}${extra}${e.error ? `<div class="etip">${esc(e.error)}</div>` : ''}</td>`;
};
const detailPhases = PHASE_LABELS.filter(([k]) => final30.results.some(r => evOf(r, k)));

// ---------- render ----------
const shotHtml = (s) => {
  const src = img(s.file);
  if (!src) return '';
  return `<figure><img src="${src}" alt="${esc(s.cap)}"><figcaption>${esc(s.cap)} · <code>artifacts/${esc(s.file)}</code></figcaption></figure>`;
};

const incidentHtml = INCIDENTS.map(inc => `
<div class="inc ${inc.origin}" id="sc-${inc.id}">
  <div class="inc-h">
    <span class="tag ${inc.origin}">${inc.origin === 'server' ? 'LỖI WEBSITE' : 'KHÔNG PHẢI LỖI WEBSITE'}</span>
    <b>${esc(inc.id)}. ${esc(inc.title)}</b>
    <span class="when">${esc(inc.time)}</span>
  </div>
  <table class="mini">
    <thead><tr><th>Tài khoản dính lỗi</th><th>Bước</th><th>Thông báo</th></tr></thead>
    <tbody>${inc.rows.map(([u, p, m]) => `<tr><td class="u">${esc(u)}</td><td>${esc(p)}</td><td class="msg">${esc(m)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="why"><b>Nguồn gốc — ${esc(inc.originLabel)}:</b> ${esc(inc.why)}</p>
  ${inc.fix ? `<p class="fix"><b>Đã xử lý:</b> ${esc(inc.fix)}</p>` : ''}
  ${inc.shots.map(shotHtml).join('')}
</div>`).join('');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Báo cáo load test — test.ednext.com.vn</title>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#1a1d24;--mut:#5b6472;--line:#e5e8ee;--ok:#1a8f4c;--okbg:#e8f7ee;--err:#c0392b;--errbg:#fdecea;--warn:#b7791f;--warnbg:#fdf6e3;--acc:#2d6cdf;--accbg:#eaf1fd;}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--ink:#e8ebf0;--mut:#9aa4b2;--line:#252b34;--ok:#43c47a;--okbg:#12301f;--err:#ff6b5e;--errbg:#331714;--warn:#e2b04a;--warnbg:#2e2513;--acc:#5b9bff;--accbg:#132238;}}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .ref{color:var(--acc);font-weight:700;text-decoration:none;border-bottom:1.5px dotted var(--acc);padding:0 1px}
  .ref:hover{background:var(--accbg);border-radius:4px}
  .totop{position:fixed;right:20px;bottom:20px;width:44px;height:44px;border-radius:50%;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 3px 12px rgba(0,0,0,.15)}
  .totop:hover{background:var(--accbg);color:var(--acc)}
  .wrap{max-width:1160px;margin:0 auto;padding:30px 20px 70px}
  h1{font-size:26px;margin:0 0 6px}
  h2{font-size:19px;margin:38px 0 6px;padding-top:14px;border-top:1px solid var(--line)}
  h2:first-of-type{border-top:0}
  .lead{color:var(--mut);margin:0 0 18px;font-size:14px}
  .sec-note{color:var(--mut);font-size:13.5px;margin:0 0 14px}
  .pill{display:inline-block;background:var(--accbg);color:var(--acc);border-radius:20px;padding:3px 11px;font-size:12.5px;font-weight:600;margin:0 6px 6px 0}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
  .c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .c .n{font-size:27px;font-weight:700} .c .l{color:var(--mut);font-size:12.5px;margin-top:2px}
  .c.good .n{color:var(--ok)} .c.bad .n{color:var(--err)}
  .call{border-radius:12px;padding:14px 18px;margin:16px 0;border:1px solid var(--line)}
  .call.ok{background:var(--okbg)} .call.warn{background:var(--warnbg)}
  .call>b:first-child{display:block;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13.5px}
  th,td{padding:9px 11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
  th{background:var(--accbg);font-weight:600;font-size:12.5px}
  tr:last-child td{border-bottom:0}
  td.u{font-weight:600} td.ok{color:var(--ok)} td.error,td.err{color:var(--err)} td.na{color:var(--mut)}
  td.msg{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:var(--err)}
  .scroll{overflow-x:auto;border-radius:12px}
  .scroll table td,.scroll table th{white-space:nowrap}
  .etip{font-size:11px;color:var(--err);white-space:normal;max-width:230px;margin-top:3px}
  .inc{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--mut);border-radius:12px;padding:16px 18px;margin:14px 0;scroll-margin-top:18px}
  .inc.server{border-left-color:var(--err)} .inc.client{border-left-color:var(--warn)}
  .inc:target{box-shadow:0 0 0 3px var(--acc);animation:flash 1.8s ease-out}
  @keyframes flash{0%{background:var(--accbg)}70%{background:var(--accbg)}100%{background:var(--card)}}
  .inc-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
  .inc-h b{font-size:16px}
  .when{color:var(--mut);font-size:12.5px;margin-left:auto}
  .tag{display:inline-block;font-size:11px;font-weight:700;border-radius:20px;padding:3px 9px;letter-spacing:.02em;white-space:nowrap}
  .tag.server{background:var(--errbg);color:var(--err)} .tag.client{background:var(--warnbg);color:var(--warn)}
  .tag.mix{background:var(--accbg);color:var(--acc)} .tag.none{background:var(--line);color:var(--mut)}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
  @media (max-width:860px){.split{grid-template-columns:1fr}}
  .col{background:var(--card);border:1px solid var(--line);border-top:4px solid var(--mut);border-radius:12px;padding:16px 18px}
  .col.client{border-top-color:var(--warn)} .col.server{border-top-color:var(--err)}
  .col h3{font-size:15.5px;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .col p{font-size:13.5px;margin:0 0 10px}
  .mini-note{color:var(--mut);font-size:12.5px;margin:10px 0 0}
  h3.sub{font-size:16px;margin:26px 0 4px}
  table.mini{font-size:13px;margin:8px 0}
  .why,.fix{font-size:13.5px;margin:10px 0 0} .fix{color:var(--ok)}
  figure{margin:14px 0 0} figure img{width:100%;border:1px solid var(--line);border-radius:10px;display:block}
  figcaption{color:var(--mut);font-size:12px;margin-top:6px}
  code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:var(--accbg);padding:1px 5px;border-radius:5px}
  i{color:var(--acc);font-style:normal;font-weight:600}
  .srv{font-weight:600}
  footer{margin-top:44px;color:var(--mut);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}
  /* Bản in / xuất PDF: ép nền sáng, cho bảng xuống dòng thay vì tràn ngang, không cắt đôi thẻ sự cố. */
  @media print{
    :root{--bg:#fff;--card:#fff;--ink:#1a1d24;--mut:#5b6472;--line:#d8dce4;--ok:#1a8f4c;--okbg:#eaf7ef;--err:#c0392b;--errbg:#fdeceb;--warn:#9c6b12;--warnbg:#fdf6e3;--acc:#2d6cdf;--accbg:#eef3fd}
    body{background:#fff;font-size:11.5px}
    .wrap{max-width:none;padding:0}
    .totop{display:none}
    .scroll{overflow:visible}
    .scroll table td,.scroll table th{white-space:normal;word-break:break-word}
    table{font-size:10.5px} th,td{padding:5px 7px}
    .inc,figure,.col,.c,.call{break-inside:avoid}
    table{break-inside:auto} tr{break-inside:avoid}
    h1,h2,h3{break-after:avoid}
    h2{margin-top:20px}
    .ref{border-bottom:0}
    figure img{max-height:150mm;object-fit:contain}
  }
</style></head><body><div class="wrap" id="top">

<h1>Báo cáo load test — test.ednext.com.vn</h1>
<p class="lead">Khóa <b>${esc(meta.course)}</b> · 3 bài code: ${acts.map((a, i) => `<b>${esc(a.id)} ${esc(a.name)}</b>`).join(' · ')}<br>
Tài khoản <code>1hvm</code>–<code>30hvm</code> · Kịch bản: đăng nhập → đăng ký khóa → với từng bài: mở bài, gõ đáp án, <b>tất cả cùng bấm Chạy thử một khoảnh khắc</b>, rồi <b>cùng bấm Nộp bài</b>.</p>

<div>
  <span class="pill">Đồng thời: ${esc(meta.concurrency)} tài khoản</span>
  <span class="pill">Nộp bài: ${meta.doSubmit ? 'CÓ' : 'bỏ qua'}</span>
  <span class="pill">Đăng ký khóa: làm trước, ngoài burst</span>
  <span class="pill">Tổng thời gian: ${fmtMs(meta.totalMs)}</span>
  <span class="pill">Kết thúc: ${esc((meta.finishedAt || '').replace('T', ' ').slice(0, 19))}</span>
</div>

<div class="cards">
  <div class="c ${okAcc === final30.results.length ? 'good' : 'bad'}"><div class="n">${okAcc}/${final30.results.length}</div><div class="l">Tài khoản hoàn tất không lỗi</div></div>
  ${acts.map((a, i) => `<div class="c good"><div class="n">${passN(final30, `${a.key}_run`)}/${meta.concurrency}</div><div class="l">Bài ${i + 1} ${esc(a.name)}: chấm PASS</div></div>`).join('')}
  <div class="c"><div class="n">${fmtMs(loginSpread)}</div><div class="l">Độ giãn thời điểm đăng nhập (càng nhỏ càng đồng thời)</div></div>
</div>

<div class="call ok"><b>Kết quả lần chạy cuối (${esc(RUNS[RUNS.length - 1].time)}): đạt toàn bộ.</b>
30/30 tài khoản đăng nhập, làm và nộp cả 3 bài thành công, không lỗi nào. Server chấm code trả kết quả đúng cho 90/90 lượt.</div>

<div class="call warn"><b>Điều duy nhất cần báo cho dev ednext: server báo bận khi nhiều người NỘP BÀI cùng lúc.</b>
Thông báo <code>Server Busy. Please try again later</code> xuất hiện rời rạc ở bước Nộp bài: 2 lượt ở mức 15 người đồng thời (<code>3hvm</code>, <code>11hvm</code> — sự cố ${refSC('D')}) và 2 lượt ở mức 30 người (<code>5hvm</code>, <code>30hvm</code> — sự cố ${refSC('E')}), nhưng lần chạy cuối lại không dính lượt nào.
Bước "Chạy thử" chưa lần nào dính. Tiến độ khóa học vẫn ghi nhận đúng nên <b>không mất dữ liệu</b>, song người dùng thật sẽ thấy nộp bài không được và phải bấm lại.
<br><br>Đề xuất kiểm tra: hàng đợi / giới hạn đồng thời của dịch vụ chấm bài lúc nhận nộp bài, và tự động thử lại thay vì trả thẳng "Server Busy" cho người dùng.</div>

<h2>1. Các lần chạy</h2>
<p class="sec-note">Đã chạy 6 lượt. Năm lượt đầu lộ ra lỗi và được xử lý dần; lượt cuối là kết quả chính thức. <b>Bấm vào mã lượt (${INCIDENTS.map(i => refSC(i.id)).join(', ')}) để nhảy thẳng tới phần giải thích sự cố.</b></p>
<div class="scroll"><table>
  <thead><tr><th>Lượt</th><th>Thời gian</th><th>Cấu hình</th><th>Kết quả</th><th>Lỗi do đâu</th><th>Ghi chú</th></tr></thead>
  <tbody>${RUNS.map(r => `<tr>
    <td class="u">${refSC(r.id)}</td><td>${esc(r.time)}</td><td>${esc(r.cfg)}</td>
    <td class="${r.bad ? 'err' : 'ok'}"><b>${esc(r.ok)}</b></td>
    <td>${CAUSE_TAG[r.cause]}</td><td>${esc(r.note)}</td>
  </tr>`).join('')}</tbody>
</table></div>

<h2>2. Phân định: phần nào do máy test, phần nào do server</h2>
<p class="sec-note">Đây là điểm quan trọng nhất khi đọc báo cáo: chạy 30 trình duyệt thật trên một máy 12 nhân thì bản thân máy đo cũng nghẽn, nên phải tách bạch trước khi kết luận về website.</p>

<div class="cards">
  <div class="c bad"><div class="n">18</div><div class="l">Lượt tài khoản lỗi <b>do máy chạy test</b> (sự cố ${refSC('A')}, ${refSC('B')}, ${refSC('C')})</div></div>
  <div class="c bad"><div class="n">${SUBMIT_FAIL}</div><div class="l">Lượt lỗi <b>do server ednext</b> (sự cố ${refSC('D')}, ${refSC('E')})</div></div>
  <div class="c"><div class="n">${(SUBMIT_FAIL / SUBMIT_TOTAL * 100).toFixed(1)}%</div><div class="l">Tỉ lệ nộp bài lỗi vì server bận (${SUBMIT_FAIL}/${SUBMIT_TOTAL} lượt nộp)</div></div>
  <div class="c good"><div class="n">${RUN_FAIL}/${RUN_TOTAL}</div><div class="l">Lượt chấm code lỗi — server chấm chưa lần nào hỏng</div></div>
</div>

<div class="split">
  <div class="col client">
    <h3><span class="tag client">MÁY TEST</span> Không phải lỗi của website</h3>
    <p>Toàn bộ lỗi ở đây xảy ra <b>trước khi</b> yêu cầu kịp gửi đi, hoặc do chính trình duyệt / tiến trình Node trên máy đo chết. Website không hề trả lỗi.</p>
    <table class="mini">
      <thead><tr><th>Sự cố</th><th>Dính</th><th>Biểu hiện</th></tr></thead>
      <tbody>
        <tr><td class="u">${refSC('A')}</td><td>5 acc</td><td>Chromium tắt hẳn giữa chừng, chạy lại thì 5/5 đạt</td></tr>
        <tr><td class="u">${refSC('B')}</td><td>cả tiến trình</td><td>Node hết bộ nhớ vì bộ script cho mọi request đi vòng qua Node</td></tr>
        <tr><td class="u">${refSC('C')}</td><td>11 acc</td><td><code>ERR_INSUFFICIENT_RESOURCES</code> và timeout khi mở bài — Chromium tự cạn socket/RAM</td></tr>
      </tbody>
    </table>
    <p class="mini-note">Đã khắc phục bằng cách chặn request theo mẫu URL, thêm thử lại khi mở bài và giảm tải Chromium. Sau đó lượt cuối chạy sạch 30/30.</p>
  </div>
  <div class="col server">
    <h3><span class="tag server">SERVER</span> Lỗi thật của website</h3>
    <p>Server nhận được yêu cầu và <b>chủ động trả về thông báo từ chối</b>: <code>Server Busy. Please try again later</code>. Có ảnh chụp màn hình làm bằng chứng ở mục 3.</p>
    <table class="mini">
      <thead><tr><th>Sự cố</th><th>Dính</th><th>Biểu hiện</th></tr></thead>
      <tbody>
        <tr><td class="u">${refSC('D')}</td><td>2 lượt nộp<br>(<code>3hvm</code>, <code>11hvm</code>)</td><td>Mức 15 người đồng thời, nộp bài 1936</td></tr>
        <tr><td class="u">${refSC('E')}</td><td>2 lượt nộp<br>(<code>5hvm</code>, <code>30hvm</code>)</td><td>Mức 30 người đồng thời, nộp bài 1935</td></tr>
      </tbody>
    </table>
    <p class="mini-note">Chỉ rơi vào bước <b>Nộp bài</b>; bước Chạy thử chưa lần nào dính. Tiến độ khóa học vẫn đúng nên không mất dữ liệu, nhưng người dùng thật sẽ phải bấm nộp lại.</p>
  </div>
</div>

<h3 class="sub">Căn cứ để phân định</h3>
<p class="sec-note">So cùng một kịch bản khi chạy 1 tài khoản (không tải) với khi chạy 30 tài khoản đồng thời. Pha "gõ code" là phép thử quyết định: nó <b>không gọi server một lần nào</b>, nên mọi độ chậm ở đó chắc chắn là của máy đo.</p>
<div class="scroll"><table>
  <thead><tr><th>Pha</th><th>Số liệu phản ánh</th><th>1 tài khoản</th><th>30 tài khoản (P50)</th><th>Nhận xét</th></tr></thead>
  <tbody>${CMP.map(c => `<tr>
    <td class="u">${esc(c.label)}</td>
    <td><span class="tag ${c.cls}">${c.cls === 'server' ? 'SERVER' : c.cls === 'client' ? 'MÁY TEST' : 'CẢ HAI'}</span></td>
    <td>${fmtMs(c.one)}</td>
    <td class="${c.cls === 'client' ? 'err' : ''}"><b>${fmtMs(c.many)}</b></td>
    <td>${esc(c.note)}</td>
  </tr>`).join('')}</tbody>
</table></div>
<p class="sec-note">Gõ code phình <b>hơn 140 lần</b> (từ dưới nửa giây lên hơn một phút) dù không đụng tới server — đó chính là mức nghẽn của máy đo. Cùng lúc đó, chấm code (việc của server) chỉ chậm khoảng <b>2 lần</b>. Vì vậy khi đọc các bảng số phía dưới, <b>chỉ "Đăng nhập", "Chạy thử" và "Nộp bài" mới là số liệu của website</b>.</p>

<h2>3. Chi tiết từng sự cố</h2>
<p class="sec-note">Viền đỏ = lỗi của website. Viền vàng = giới hạn của máy chạy test, không phải lỗi website.</p>
${incidentHtml}

<h2>4. Tổng hợp theo tài khoản</h2>
<p class="sec-note">Không có tài khoản nào lỗi do sai thông tin đăng nhập — 30/30 acc đăng nhập thành công ở mọi lượt chạy.</p>
<div class="scroll"><table>
  <thead><tr><th>Tài khoản</th><th>Số lượt dính lỗi</th><th>Ở lượt nào</th></tr></thead>
  <tbody>${BY_ACCOUNT.map(([u, n, w]) => `<tr>
    <td class="u">${esc(u)}</td><td class="${n ? 'err' : 'ok'}"><b>${n}</b></td><td>${refList(esc(w))}</td>
  </tr>`).join('')}</tbody>
</table></div>

<h2>5. Độ trễ lần chạy cuối, theo từng pha</h2>
<p class="sec-note">Chỉ tính các lượt thành công. Cột "Số liệu phản ánh" cho biết con số đó nói về <b>server</b> hay chỉ nói về <b>sức của máy đo</b>.</p>
<div class="scroll"><table>
  <thead><tr><th>Pha</th><th>Số liệu phản ánh</th><th>Số lượt</th><th>Lỗi</th><th>P50</th><th>P95</th><th>Chậm nhất</th></tr></thead>
  <tbody>${phaseRows.map(s => `<tr>
    <td class="${s.server ? 'u srv' : 'u'}">${esc(s.label)}</td>
    <td><span class="tag ${s.cls}">${esc(s.who.toUpperCase())}</span></td>
    <td>${s.n}</td><td class="${s.err ? 'err' : 'na'}">${s.err}</td>
    <td>${fmtMs(s.p50)}</td><td>${fmtMs(s.p95)}</td><td>${fmtMs(s.max)}</td>
  </tr>`).join('')}</tbody>
</table></div>
<p class="sec-note">Đọc bảng này: các dòng gắn nhãn <span class="tag server">SERVER</span> là năng lực thật của website khi 30 người dùng đồng thời — đăng nhập 6 s, chấm code 9 s, nộp bài 11–13 s. Dòng gắn nhãn <span class="tag client">MÁY TEST</span> chỉ cho biết máy đo đang nghẽn tới mức nào, <b>không phản ánh chất lượng website</b>. Dòng <span class="tag mix">CẢ HAI</span> là hỗn hợp, chỉ nên tham khảo.</p>

<h2>6. Chi tiết từng tài khoản (lần chạy cuối)</h2>
<div class="scroll"><table>
  <thead><tr><th>Tài khoản</th><th>Kết quả</th>${detailPhases.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead>
  <tbody>${final30.results.map(r => `<tr>
    <td class="u">${esc(r.user)}</td>
    <td class="${r.ok ? 'ok' : 'err'}"><b>${r.ok ? 'ĐẠT' : 'LỖI'}</b></td>
    ${detailPhases.map(([k]) => cellOf(r, k)).join('')}
  </tr>`).join('')}</tbody>
</table></div>
<p class="sec-note">Ô mỗi pha: ✓ / ✕ kèm thời gian. Ở cột "Chạy thử", <i>pass</i> là kết quả chấm code trên server.</p>

${ctrl15 ? `<h2>7. Lượt đối chứng 15 tài khoản</h2>
<p class="sec-note">Chạy ở mức tải bằng một nửa để kiểm chứng xem lỗi đến từ website hay từ máy đo.</p>
<div class="cards">
  <div class="c"><div class="n">${ctrl15.results.filter(r => r.ok).length}/${ctrl15.results.length}</div><div class="l">Tài khoản hoàn tất không lỗi</div></div>
  ${ctrl15.meta.activities.map((a, i) => `<div class="c good"><div class="n">${passN(ctrl15, `${a.key}_run`)}/${ctrl15.meta.concurrency}</div><div class="l">Bài ${i + 1} ${esc(a.name)}: chấm PASS</div></div>`).join('')}
</div>
<p class="sec-note">Cả 3 bài đều chấm pass 15/15 — không còn lỗi mở trang như ở mức 30 acc, càng khẳng định nhóm lỗi đó là do máy đo. Hai acc lỗi còn lại là do "Server Busy" lúc nộp bài (mục 2, sự cố D).</p>` : ''}

<h2>${ctrl15 ? '8' : '7'}. Chạy lại bộ test này</h2>
<div class="scroll"><table>
  <thead><tr><th>Bước</th><th>Lệnh (PowerShell)</th></tr></thead>
  <tbody>
    <tr><td class="u">Chuẩn bị</td><td><code>cd loadtest-test-ednext</code> · <code>$env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"</code></td></tr>
    <tr><td class="u">Kiểm tra đề &amp; đáp án</td><td><code>$env:EXP_RUN="1"; node explore-activities.cjs</code></td></tr>
    <tr><td class="u">Đăng ký khóa trước</td><td><code>$env:EN_LIMIT="30"; node enroll-all.cjs</code></td></tr>
    <tr><td class="u">Chạy burst 30 acc</td><td><code>$env:LT_CONCURRENCY="30"; $env:LT_SUBMIT="1"; $env:LT_SKIP_ENROLL="1"; node run-loadtest.cjs</code></td></tr>
    <tr><td class="u">Dựng báo cáo</td><td><code>node generate-report.cjs</code> và <code>node build-summary-report.cjs</code></td></tr>
  </tbody>
</table></div>

<footer>
  Báo cáo tạo tự động bằng Playwright · Môi trường <b>${esc(meta.site)}</b> · Dữ liệu: <code>results.json</code>, <code>results-ctrl15-a.json</code>, <code>results-diag1.json</code>, ảnh trong <code>artifacts/</code><br>
  Nhật ký lỗi dạng văn bản: <code>GHI-CHU-LOI-LOADTEST.md</code> · Báo cáo chi tiết từng lượt: <code>loadtest-report.html</code><br>
  Mẹo: bấm vào mã sự cố (${INCIDENTS.map(i => refSC(i.id)).join(', ')}) ở bất kỳ bảng nào để nhảy tới phần giải thích tương ứng.
</footer>

<a class="totop" href="#top" title="Lên đầu trang">↑</a>
</div></body></html>`;

fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log(`-> ${OUT} đã tạo (${(html.length / 1024).toFixed(0)} KB, tự-chứa, mở bằng trình duyệt là xem được).`);
