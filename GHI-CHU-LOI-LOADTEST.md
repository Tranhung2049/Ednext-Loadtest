# Nhật ký lỗi — Load test test.ednext.com.vn (11/08/2026)

Khóa **thuat-toan-can-ban**, 3 bài code: **1934 isPrime · 1935 factorSum · 1936 greatestCommonPrimeDivisor**.
Tài khoản: `1hvm`–`30hvm` (nguồn: `loadtest-ednext/accounts test.txt`).

**Kết quả cuối cùng (17:08–17:15): 30/30 tài khoản hoàn tất, 0 lỗi.** Các lỗi bên dưới là những gì gặp
trên đường đi — phần lớn do **máy chạy test**, riêng lỗi "Server Busy" là **của server ednext**.

---

## 1. Bảng các lần chạy

| # | Thời gian | Cấu hình | Kết quả | Lỗi |
|---|-----------|----------|---------|-----|
| A | ~16:37 | 5 acc, 3 bài | 0/5 | Trình duyệt chết giữa chừng |
| B | 16:43–16:44 | 30 acc | Sập tiến trình | Node hết bộ nhớ (heap out of memory) |
| C | 16:44–16:51 | 30 acc | 19/30 | 11 acc gãy khi mở bài 2 |
| D | 16:53–16:58 | 15 acc (đối chứng) | 13/15 | 2 acc lỗi nộp bài — **Server Busy** |
| E | 16:58–17:05 | 30 acc | 28/30 | 2 acc lỗi nộp bài — **Server Busy** |
| F | 17:08–17:15 | 30 acc | **30/30** | Không có |

---

## 2. Chi tiết từng sự cố

### A. ~16:37 — 5 acc: trình duyệt chết đồng loạt

| Tài khoản | Pha | Thông báo |
|---|---|---|
| `1hvm` `2hvm` `3hvm` `4hvm` `5hvm` | `act1_type` (gõ code bài 1934) | `Target page, context or browser has been closed` |

Cả 5 acc chết cùng một khoảnh khắc (~26 giây sau khi bắt đầu), tức tiến trình Chromium tắt hẳn chứ
không phải từng tab lỗi riêng.

**Nguyên nhân:** phía máy chạy test — Chromium tắt đột ngột. **Không tái hiện được**: chạy lại y hệt
ngay sau đó cho kết quả 5/5 đạt. Xếp loại sự cố nhất thời của máy, không liên quan tới website.

### B. 16:43–16:44 — 30 acc: Node hết bộ nhớ

Tiến trình chết ở giây thứ 37 với `FATAL ERROR: JavaScript heap out of memory`. Hai acc kịp ghi ảnh
lỗi trước khi sập: `10hvm`, `24hvm`.

**Nguyên nhân:** phía máy chạy test — lỗi trong bộ script. Hàm chặn ảnh/tracker dùng `ctx.route('**/*')`,
nghĩa là **mọi** request phải đi vòng qua tiến trình Node; với 30 tab cùng tải bundle Monaco (vài MB
mỗi tab) thì Node vỡ bộ nhớ.

**Đã sửa:** chỉ chặn theo mẫu URL (`lib.cjs` → `BLOCK_URL_RE`), nên chỉ ảnh/font/tracker mới đi qua
Node, còn mã nguồn trang đi thẳng. Sau khi sửa không còn tái diễn.

### C. 16:44–16:51 — 30 acc: 11 acc gãy khi mở bài 2 (1935)

| Tài khoản | Thông báo |
|---|---|
| `22hvm` `26hvm` | `net::ERR_INSUFFICIENT_RESOURCES` |
| `1hvm` `3hvm` `20hvm` `21hvm` `25hvm` `29hvm` | Chờ editor Monaco quá 30 giây |
| `7hvm` `15hvm` `27hvm` | Tải trang quá 60 giây |

Ảnh lỗi: `artifacts/err_{1,20,21,22,25,26,29}hvm.png` (khoảng 16:48:54–16:49:25).

**Nguyên nhân:** phía máy chạy test. `ERR_INSUFFICIENT_RESOURCES` là lỗi Chromium báo khi **chính nó**
cạn tài nguyên (socket/bộ nhớ) — 30 trình duyệt thật trên máy 12 nhân, RAM trống 7.6 GB. Ba nhóm lỗi
trên đều là biến thể của cùng một hiện tượng nghẽn client. Bài 1 trước đó vẫn đạt 30/30 nên không phải
lỗi server.

**Đã sửa:** bước mở bài được thử lại tối đa 3 lần và nới thời gian chờ (`lib.cjs` → `openActivity`),
kèm bớt thành phần thừa của Chromium khi khởi động. Việc thử lại **không làm sai phép đo**, vì tính
"đồng thời" chỉ do barrier ở bước Chạy thử / Nộp bài quyết định, không phụ thuộc lúc mở trang.

### D. 16:53–16:58 — 15 acc (đối chứng): 2 acc lỗi nộp bài

| Tài khoản | Pha | Nguyên nhân thật |
|---|---|---|
| `3hvm` `11hvm` | `act3_submit` (nộp bài 1936) | Server trả **"Server Busy. Please try again later"** |

Ảnh bằng chứng: `artifacts/err_3hvm.png`, `artifacts/err_11hvm.png` (16:58:13) — panel KIỂM THỬ hiện
dòng đỏ *"Server Busy. Please try again later!. Please try again later!!!"*.

**Nguyên nhân: phía server ednext.** Lúc đó script báo nhầm là *"không thấy popup xác nhận Chúc mừng"*
vì chỉ chờ popup mà chưa đọc thông báo lỗi; ảnh chụp mới lộ ra nguyên nhân thật. Đã sửa `submitActivity`
để gọi đúng tên lỗi trong các lần chạy sau.

### E. 16:58–17:05 — 30 acc: 2 acc lỗi nộp bài

| Tài khoản | Pha | Nguyên nhân thật |
|---|---|---|
| `5hvm` `30hvm` | `act2_submit` (nộp bài 1935) | Server trả **"Server Busy. Please try again later"** |

Ảnh bằng chứng: `artifacts/err_5hvm.png`, `artifacts/err_30hvm.png` (17:04:12).

Hai acc này dừng luôn ở đó nên không làm tiếp bài 3 — vì vậy bài 1936 chỉ có 28/30.
Đối chiếu tiến độ khóa học sau đó (`2hvm`, `5hvm`, `30hvm` đều 6%) cho thấy **không mất dữ liệu bài đã nộp**.

### F. 17:08–17:15 — 30 acc: sạch

30/30 acc hoàn tất, cả 3 bài chấm pass và nộp bài thành công, không có lỗi nào.
Kết quả: `results.json` · Báo cáo: `loadtest-report.html`.

---

## 3. Tổng hợp theo tài khoản

| Tài khoản | Số lần dính lỗi | Ở những lần chạy |
|---|---|---|
| `3hvm` | 3 | A · C · D |
| `1hvm` `5hvm` | 2 | A · C / A · E |
| `2hvm` `4hvm` | 1 | A |
| `20hvm` `21hvm` `22hvm` `25hvm` `26hvm` `29hvm` `7hvm` `15hvm` `27hvm` | 1 | C |
| `10hvm` `24hvm` | 1 | B |
| `11hvm` | 1 | D |
| `30hvm` | 1 | E |
| Còn lại (`6,8,9,12,13,14,16,17,18,19,23,28hvm`) | 0 | — |

Không có tài khoản nào lỗi do sai thông tin đăng nhập; **30/30 acc đăng nhập thành công ở mọi lần chạy**.

---

## 4. Điều duy nhất cần báo cho dev ednext

**"Server Busy. Please try again later" khi nhiều người NỘP BÀI cùng lúc.**

| Mức tải | Tỉ lệ |
|---|---|
| 15 người đồng thời | 2 lượt nộp lỗi (`3hvm`, `11hvm`) |
| 30 người đồng thời | 2 lượt nộp lỗi (`5hvm`, `30hvm`) |
| 30 người đồng thời (lần cuối) | 0 lỗi |

Đặc điểm: lỗi **rời rạc, không tái hiện theo ý muốn**, chỉ rơi vào bước **Nộp bài** (bước "Chạy thử"
chưa lần nào dính). Tiến độ khóa học vẫn ghi nhận đúng nên không mất dữ liệu, nhưng người dùng thật
sẽ thấy bài không nộp được và phải bấm lại.

Đề xuất kiểm tra phía dev: hàng đợi/giới hạn đồng thời của dịch vụ chấm bài lúc nhận nộp bài, và bổ
sung tự động thử lại thay vì trả thẳng "Server Busy" cho người dùng.

---

## 5. Vì sao phần lớn lỗi là của máy test, không phải của website

Đo cùng một kịch bản với **1 tài khoản** (không tải) và **30 tài khoản đồng thời**:

| Pha | 1 acc | 30 acc (P50) | Nhận xét |
|---|---|---|---|
| Đăng nhập | 1.6 s | 6.0 s | Có tăng, chấp nhận được |
| Mở bài | 2.6 s | 10–15 s | Tải trang nặng dần |
| **Gõ code** | **0.4 s** | **60.7 s** | Thao tác **thuần client**, server không tham gia → đây là thước đo mức nghẽn của máy test |
| **Chạy thử (chấm code)** | **4.2 s** | **9.0–9.4 s** | Số liệu **thật của server**: chậm khoảng 2× khi 30 người cùng chấm |

Pha "gõ code" không hề gọi server mà vẫn phình từ 0.4 s lên 60 s, chứng tỏ máy chạy test (12 nhân,
30 Chromium) mới là nút thắt. Vì vậy chỉ nên đọc **"Chạy thử"** và **"Nộp bài"** như số liệu của
website; các pha còn lại chỉ để tham khảo.

Muốn đo sạch hơn ở mức 30+ người: chia tải ra nhiều máy, hoặc dùng công cụ tầng HTTP (k6/JMeter)
thay vì trình duyệt thật.
