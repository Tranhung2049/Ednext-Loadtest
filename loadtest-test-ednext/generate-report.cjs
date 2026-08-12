/**
 * Dựng báo cáo HTML tự-chứa (chia sẻ được) từ results.json
 * Chạy: node generate-report.cjs [file-results.json]  ->  loadtest-report.html
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const IN_FILE = process.argv[2] || process.env.LT_OUT || 'results.json';
const OUT_FILE = process.env.RP_OUT || IN_FILE.replace(/^results/, 'loadtest-report').replace(/\.json$/, '.html');
const { meta, results } = JSON.parse(fs.readFileSync(path.join(DIR, IN_FILE), 'utf8'));

// Các pha dựng động theo số bài đã chạy trong lần đo này.
const PHASES = [['login', 'Đăng nhập'], ['enroll', 'Đăng ký khóa']];
meta.activities.forEach((a, i) => {
  const n = i + 1;
  PHASES.push([`${a.key}_open`, `Mở bài ${n}`], [`${a.key}_type`, `Gõ code ${n}`],
    [`${a.key}_run`, `Chạy thử ${n}`], [`${a.key}_submit`, `Nộp bài ${n}`]);
});
const activePhases = PHASES.filter(([k]) => results.some(r => r.events.some(e => e.phase === k)));

const evOf = (r, k) => r.events.find(e => e.phase === k);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const fmt = (v, suf = 'ms') => v == null ? '—' : `${Math.round(v)}${suf}`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const phaseStats = activePhases.map(([k, label]) => {
  const evs = results.map(r => evOf(r, k)).filter(Boolean);
  const okDur = evs.filter(e => e.status === 'ok').map(e => e.durMs);
  return {
    k, label, total: evs.length,
    okN: evs.filter(e => e.status === 'ok').length,
    errN: evs.filter(e => e.status === 'error').length,
    min: okDur.length ? Math.min(...okDur) : null,
    avg: okDur.length ? okDur.reduce((a, b) => a + b, 0) / okDur.length : null,
    p50: pct(okDur, 50), p95: pct(okDur, 95),
    max: okDur.length ? Math.max(...okDur) : null,
  };
});

// Gom lỗi giống nhau lại (thay số bằng N) để thấy nhóm lỗi thay vì danh sách dài.
const errorGroups = {};
for (const r of results) for (const e of r.errors) {
  const key = e.replace(/\d+/g, 'N').slice(0, 120);
  (errorGroups[key] = errorGroups[key] || { sample: e, count: 0, users: [] });
  errorGroups[key].count++; errorGroups[key].users.push(r.user);
}
const errorList = Object.values(errorGroups).sort((a, b) => b.count - a.count);

const runResult = (r, key) => { const e = evOf(r, key); return e && e.detail && e.detail.result; };
const passN = (key) => results.filter(r => runResult(r, key) === 'pass').length;
const submitOkN = (key) => results.filter(r => { const e = evOf(r, key); return e && e.status === 'ok'; }).length;
const hasSubmit = meta.activities.some(a => results.some(r => evOf(r, `${a.key}_submit`)));

const okAcc = results.filter(r => r.ok).length;
const badAcc = results.length - okAcc;
const loginStarts = results.map(r => evOf(r, 'login')).filter(Boolean).map(e => e.tStart);
const loginSpread = loginStarts.length ? Math.max(...loginStarts) - Math.min(...loginStarts) : 0;

const cell = (r, k) => {
  const e = evOf(r, k);
  if (!e) return '<td class="na">—</td>';
  const extra = e.detail && e.detail.result ? ` <i>${esc(e.detail.result)}</i>` : '';
  return `<td class="${e.status}">${e.status === 'ok' ? '✓' : '✕'} ${fmt(e.durMs)}${extra}${e.error ? `<div class="etip">${esc(e.error)}</div>` : ''}</td>`;
};

const rows = results.map(r => `
  <tr>
    <td class="u">${esc(r.user)}</td>
    <td class="${r.ok ? 'ok' : 'err'} st">${r.ok ? 'ĐẠT' : 'LỖI'}</td>
    ${activePhases.map(([k]) => cell(r, k)).join('')}
  </tr>`).join('');

const actCards = meta.activities.map((a, i) => `
  <div class="c"><div class="n">${passN(`${a.key}_run`)}/${meta.concurrency}</div><div class="l">Bài ${i + 1} (${esc(a.name)}): chấm PASS</div></div>`).join('');
const submitCards = hasSubmit ? meta.activities.map((a, i) => `
  <div class="c"><div class="n">${submitOkN(`${a.key}_submit`)}/${meta.concurrency}</div><div class="l">Bài ${i + 1} (${esc(a.name)}): NỘP BÀI OK</div></div>`).join('') : '';

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load Test ${esc(meta.site || 'test.ednext.com.vn')} — Báo cáo</title>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#1a1d24;--mut:#5b6472;--line:#e5e8ee;--ok:#1a8f4c;--okbg:#e8f7ee;--err:#c0392b;--errbg:#fdecea;--acc:#2d6cdf;--accbg:#eaf1fd;}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--ink:#e8ebf0;--mut:#9aa4b2;--line:#252b34;--ok:#43c47a;--okbg:#12301f;--err:#ff6b5e;--errbg:#331714;--acc:#5b9bff;--accbg:#132238;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .wrap{max-width:1240px;margin:0 auto;padding:28px 20px 60px}
  h1{font-size:24px;margin:0 0 4px} h2{font-size:18px;margin:34px 0 12px}
  .sub{color:var(--mut);margin:0 0 20px;font-size:13.5px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}
  .c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .c .n{font-size:26px;font-weight:700} .c .l{color:var(--mut);font-size:12.5px;margin-top:2px}
  .c.good .n{color:var(--ok)} .c.bad .n{color:var(--err)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
  th{background:var(--accbg);color:var(--ink);font-weight:600;font-size:12px;position:sticky;top:0}
  td.ok{color:var(--ok)} td.error,td.err{color:var(--err)} td.na{color:var(--mut)}
  td.u{font-weight:600} td.st{font-weight:700}
  .scroll{overflow-x:auto;border-radius:12px}
  .etip{font-size:11px;color:var(--err);white-space:normal;max-width:220px;margin-top:2px}
  .errbox{background:var(--errbg);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0}
  .errbox .cnt{font-weight:700;color:var(--err)} .errbox .us{color:var(--mut);font-size:12px}
  .meta{font-size:12.5px;color:var(--mut)}
  .pill{display:inline-block;background:var(--accbg);color:var(--acc);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;margin-right:6px}
  i{color:var(--acc);font-style:normal;font-weight:600}
  footer{margin-top:40px;color:var(--mut);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
</style></head><body><div class="wrap">

<h1>Load Test — ${esc(meta.site || 'test.ednext.com.vn')}</h1>
<p class="sub">${esc(meta.concurrency)} tài khoản đăng nhập &amp; làm ${meta.activities.length} bài code <b>đồng thời</b> · Khóa <b>${esc(meta.course)}</b> · Bắt đầu ${esc(meta.startedAt)} · Tổng thời gian ${fmt(meta.totalMs)}</p>

<div>
  <span class="pill">Đồng thời: ${esc(meta.concurrency)} acc</span>
  <span class="pill">Chế độ: ${meta.headless ? 'headless' : 'headed'}</span>
  <span class="pill">Nộp bài: ${meta.doSubmit ? 'CÓ' : 'BỎ QUA'}</span>
  <span class="pill">Đăng ký khóa trong burst: ${meta.skipEnroll ? 'không (pre-enroll sẵn)' : 'CÓ'}</span>
  <span class="pill">Chặn ảnh/tracker: ${meta.blockAssets ? 'CÓ' : 'không'}</span>
</div>

<div class="cards">
  <div class="c"><div class="n">${esc(meta.concurrency)}</div><div class="l">Tài khoản chạy đồng thời</div></div>
  <div class="c good"><div class="n">${okAcc}</div><div class="l">Acc hoàn tất không lỗi</div></div>
  <div class="c ${badAcc ? 'bad' : ''}"><div class="n">${badAcc}</div><div class="l">Acc có lỗi</div></div>
  ${actCards}${submitCards}
  <div class="c"><div class="n">${fmt(loginSpread)}</div><div class="l">Độ giãn thời điểm login (càng nhỏ càng đồng thời)</div></div>
</div>

<h2>Độ trễ theo từng pha (chỉ tính lượt thành công)</h2>
<div class="scroll"><table>
  <thead><tr><th>Pha</th><th>Chạy</th><th>OK</th><th>Lỗi</th><th>Min</th><th>Trung bình</th><th>P50</th><th>P95</th><th>Max</th></tr></thead>
  <tbody>${phaseStats.map(s => `<tr>
    <td class="u">${esc(s.label)}</td><td>${s.total}</td>
    <td class="ok">${s.okN}</td><td class="${s.errN ? 'err' : 'na'}">${s.errN}</td>
    <td>${fmt(s.min)}</td><td>${fmt(s.avg)}</td><td>${fmt(s.p50)}</td><td>${fmt(s.p95)}</td><td>${fmt(s.max)}</td>
  </tr>`).join('')}</tbody>
</table></div>

<h2>Lỗi &amp; bug ghi nhận ${errorList.length ? `(${errorList.length} nhóm)` : ''}</h2>
${errorList.length ? errorList.map(g => `<div class="errbox">
  <span class="cnt">×${g.count}</span> ${esc(g.sample)}
  <div class="us">Tài khoản: ${esc(g.users.slice(0, 12).join(', '))}${g.users.length > 12 ? ` … (+${g.users.length - 12})` : ''}</div>
</div>`).join('') : '<p class="meta">Không có lỗi nào ở các pha đã chạy.</p>'}

<h2>Chi tiết từng tài khoản</h2>
<div class="scroll"><table>
  <thead><tr><th>Tài khoản</th><th>Kết quả</th>${activePhases.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="meta">Ô mỗi pha: ✓/✕ kèm thời gian (ms). Với "Chạy thử", <i>pass/fail</i> là kết quả chấm code trên server.</p>

<footer>
  Báo cáo tạo tự động từ bộ load test Playwright · ${esc(meta.site || '')} · ${esc(meta.finishedAt || meta.startedAt)}<br>
  Bài đã chạy: ${meta.activities.map((a, i) => `Bài ${i + 1} (id ${esc(a.id)}) ${esc(a.name)}`).join(' · ')}
</footer>

</div></body></html>`;

fs.writeFileSync(path.join(DIR, OUT_FILE), html, 'utf8');
console.log(`-> ${OUT_FILE} đã tạo (${(html.length / 1024).toFixed(0)} KB, tự-chứa, chia sẻ được).`);
