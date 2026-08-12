# Ednext Loadtest — môi trường test.ednext.com.vn

Bộ kiểm thử tải (load test) cho **https://test.ednext.com.vn**, khóa học `thuat-toan-can-ban`:
mô phỏng **30 học viên thật đăng nhập và làm bài đồng thời** bằng trình duyệt Chromium (Playwright),
rồi xuất báo cáo đo độ trễ, tỉ lệ lỗi và phân định nguyên nhân.

## 📊 Báo cáo

| Dạng | Đường dẫn |
|---|---|
| **Xem trực tuyến** | https://tranhung2049.github.io/Ednext-Loadtest/ |
| Bản PDF (khổ A3, để in / gửi kèm) | [bao-cao-loadtest-test-ednext.pdf](bao-cao-loadtest-test-ednext.pdf) |
| Nhật ký lỗi dạng văn bản | [GHI-CHU-LOI-LOADTEST.md](GHI-CHU-LOI-LOADTEST.md) |
| Báo cáo chi tiết từng lượt chạy | [loadtest-test-ednext/loadtest-report.html](loadtest-test-ednext/loadtest-report.html) |

Báo cáo HTML **tự-chứa** (ảnh bằng chứng nhúng sẵn, không phụ thuộc file ngoài) nên tải về mở
offline vẫn xem được đầy đủ.

## Kết quả tóm tắt

Lượt đo chính thức (30 tài khoản đồng thời, 3 bài code): **30/30 tài khoản hoàn tất, không lỗi.**

| Chỉ số của server khi 30 người đồng thời | Giá trị (P50) |
|---|---|
| Đăng nhập | 6,0 s |
| Chạy thử — server chấm code | 9,0 s |
| Nộp bài | 11–13 s |

**Vấn đề duy nhất phát hiện được:** server chấm bài thỉnh thoảng trả
`Server Busy. Please try again later` ở bước **Nộp bài** — 4 lượt trên tổng 223 lượt nộp (1,8%),
xuất hiện cả ở mức 15 lẫn 30 người đồng thời. Tiến độ khóa học vẫn ghi nhận đúng nên không mất
dữ liệu, nhưng người dùng thật sẽ phải bấm nộp lại. Chi tiết và ảnh bằng chứng xem trong báo cáo.

> Lưu ý khi đọc số liệu: máy chạy test (12 nhân) gánh 30 Chromium thật nên chính nó cũng là một nút
> thắt. Chỉ các pha **Đăng nhập / Chạy thử / Nộp bài** mới phản ánh năng lực website; pha "gõ code"
> không gọi server nên chỉ đo sức của máy test. Báo cáo có mục riêng phân định rõ phần này.

## Cấu trúc

```
index.html                      Báo cáo tổng hợp (bản GitHub Pages phục vụ)
bao-cao-loadtest-test-ednext.pdf
GHI-CHU-LOI-LOADTEST.md         Nhật ký sự cố của tất cả các lượt chạy
loadtest-test-ednext/
  config.cjs                    URL, khóa học, 3 bài + đáp án (C#)
  lib.cjs                       Đăng nhập, đăng ký khóa, Monaco, chạy thử/nộp bài, barrier đồng thời
  explore-activities.cjs        Khảo sát đề bài & thử đáp án trước khi đo
  enroll-all.cjs                Đăng ký khóa học trước cho toàn bộ tài khoản (theo lô nhỏ)
  run-loadtest.cjs              Chạy burst N tài khoản đồng thời
  probe-course.cjs              Dò trạng thái trang khóa học của một tài khoản
  generate-report.cjs           Báo cáo HTML cho một lượt chạy
  build-summary-report.cjs      Báo cáo tổng hợp (file index.html ở trên)
  export-pdf.cjs                Xuất báo cáo tổng hợp ra PDF
  results*.json                 Dữ liệu đo thô
  artifacts/                    Ảnh chụp màn hình lúc lỗi
```

## Chạy lại

Cần Node.js và `@playwright/test`. Tài khoản để trong file `accounts.txt`
(mỗi dòng `username,password`) — **file này cố ý không đưa lên repo**, xem `.gitignore`.

```powershell
cd loadtest-test-ednext
$env:PLAYWRIGHT_BROWSERS_PATH="D:/ms-playwright"   # tùy máy

# 1. Kiểm tra đề bài và đáp án còn đúng không
$env:EXP_RUN="1"; node explore-activities.cjs

# 2. Đăng ký khóa học trước cho 30 tài khoản (tách khỏi burst để số đo sạch)
$env:EN_LIMIT="30"; node enroll-all.cjs

# 3. Chạy burst 30 tài khoản đồng thời
$env:LT_CONCURRENCY="30"; $env:LT_SUBMIT="1"; $env:LT_SKIP_ENROLL="1"; node run-loadtest.cjs

# 4. Dựng báo cáo
node generate-report.cjs
node build-summary-report.cjs
node export-pdf.cjs
```

Các biến môi trường khác: `LT_OFFSET` (bỏ qua N tài khoản đầu), `LT_ACTS=1934,1935` (chỉ chạy một
số bài), `LT_HEADED` (hiện cửa sổ trình duyệt), `LT_OUT` (đổi tên file kết quả).

## Bảo mật

Repo này **công khai**, nên không đưa lên đây: file danh sách tài khoản, mật khẩu, token.
`.gitignore` đã chặn sẵn `accounts*.txt`.
