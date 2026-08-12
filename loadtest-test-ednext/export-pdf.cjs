/**
 * Xuất báo cáo tổng hợp ra PDF để gửi cho người không tiện mở file HTML.
 * Chạy: $env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"; node export-pdf.cjs
 *
 * Dùng khổ A3 dọc vì báo cáo có nhiều bảng rộng (bảng chi tiết 30 tài khoản × 14 pha);
 * in A4 sẽ bị bóp chữ quá nhỏ.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'bao-cao-loadtest-test-ednext.html');
const OUT = path.join(DIR, 'bao-cao-loadtest-test-ednext.pdf');

(async () => {
  if (!fs.existsSync(SRC)) throw new Error('Chưa có báo cáo HTML — chạy build-summary-report.cjs trước.');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + SRC.replace(/\\/g, '/'), { waitUntil: 'load' });
  // Ép giao diện sáng: máy đang để dark mode sẽ in ra nền đen rất tốn mực.
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.waitForTimeout(800);
  await page.pdf({
    path: OUT,
    format: 'A3',
    printBackground: true,
    margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#777;padding:0 12mm;display:flex;justify-content:space-between">'
      + '<span>Báo cáo load test — test.ednext.com.vn</span>'
      + '<span>Trang <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log(`-> ${path.basename(OUT)} đã tạo (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB).`);
})();
