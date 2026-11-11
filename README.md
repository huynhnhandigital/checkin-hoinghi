# Check-in khách hàng hội nghị bằng máy quét mã vạch

Web app check-in khách hàng: quét mã vạch (máy quét USB như **Sapo SP21**) → app tự hiện thông tin khách từ Google Sheet → ghi giờ check-in vào Sheet.

```
Máy quét USB ──(gõ mã + Enter)──► Web app (GitHub Pages) ──► Apps Script ──► Google Sheet
                                   đăng nhập Gmail nhân viên
```

## Tính năng

- **Mã vạch tự động**: nhập Mã KH vào Sheet là cột `Barcode` tự hiện mã vạch Code128.
- **Check-in bằng máy quét**: quét là hiện tên khách, ghi `Đã check-in` (ô tick), `Giờ check-in` và `Người check-in` vào Sheet.
- **Cảnh báo quét trùng**: nếu khách đã check-in sẽ báo kèm giờ và người check-in trước đó. Có nút hủy khi quét nhầm.
- **Tra cứu tay** theo tên hoặc mã khi khách quên thẻ.
- **Thống kê** số đã đến / tổng số, danh sách vừa check-in; nhiều máy quét cùng lúc tự đồng bộ (mặc định 20 giây).
- **Danh sách + xuất Excel (CSV)** lọc theo Đã check-in / Chưa đến.
- **In thẻ mã vạch** (A4, 2 thẻ/hàng) và **tải ảnh PNG** từng khách (hoặc tất cả dạng .zip) để gửi qua Zalo/email.
- **Đăng nhập Gmail**: chỉ email có trong tab `NguoiDung` của Sheet mới dùng được.

## Cấu trúc thư mục

| File | Vai trò |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Giao diện web app (đưa lên GitHub Pages) |
| `config.js` | **File cần sửa**: link API + Client ID + tên sự kiện |
| `apps-script/Code.gs` | Code dán vào Apps Script của Google Sheet |

---

## Cài đặt (làm 1 lần, khoảng 20 phút)

### Bước 1 — Cài Apps Script vào Google Sheet

1. Mở Google Sheet danh sách khách → menu **Tiện ích mở rộng (Extensions) → Apps Script**.
2. Xóa hết code mẫu, dán toàn bộ nội dung file `apps-script/Code.gs` → bấm **Lưu** (biểu tượng đĩa).
3. Ở thanh trên, chọn hàm **`setupSheet`** → bấm **Chạy (Run)**.
   - Lần đầu Google hỏi quyền: **Xem xét quyền → chọn Gmail → Nâng cao (Advanced) → Đi tới … (không an toàn) → Cho phép**. (Cảnh báo này xuất hiện vì đây là script do chính bạn viết, chưa qua Google duyệt.)
4. Quay lại Sheet, bạn sẽ thấy:
   - Cột **Barcode** có ảnh mã vạch cho từng Mã KH.
   - 3 cột mới: **Đã check-in**, **Giờ check-in**, **Người check-in**.
   - Tab mới **NguoiDung** đã có sẵn Gmail của bạn → **thêm Gmail của các nhân viên check-in vào cột A**.
   - Menu mới **🎫 Check-in** (tải lại trang Sheet nếu chưa thấy).

> Từ giờ, mỗi khi nhập/dán Mã KH mới, cột Barcode tự tạo mã vạch. Nếu dán hàng loạt mà chưa thấy, dùng menu **🎫 Check-in → Tạo lại barcode cho tất cả khách**.

### Bước 2 — Tạo OAuth Client ID (để đăng nhập Gmail)

1. Vào <https://console.cloud.google.com> (đăng nhập Gmail quản trị) → **Chọn dự án → Dự án mới**, đặt tên `Checkin Hoi Nghi` → Tạo.
2. Menu ☰ → **APIs & Services → OAuth consent screen** (hoặc **Google Auth Platform**) → **Get started**:
   - App name: `Check-in Hội nghị`, User support email: Gmail của bạn.
   - Audience: **External** → điền email liên hệ → **Create**.
3. Mục **Audience** → bấm **Publish app** → Confirm.
   (App chỉ dùng email + tên nên **không cần Google xét duyệt**. Nếu không muốn publish, thêm Gmail từng nhân viên vào mục *Test users*.)
4. Mục **Clients** → **Create client**:
   - Application type: **Web application**
   - **Authorized JavaScript origins** → Add URI: `https://<tên-tài-khoản-github>.github.io`
     (thêm `http://localhost:8000` nếu muốn chạy thử trên máy)
   - **Create** → sao chép **Client ID** (dạng `1234…-abc.apps.googleusercontent.com`).

### Bước 3 — Triển khai Apps Script thành API

1. Quay lại Apps Script, ở đầu file `Code.gs` thay dòng:
   ```js
   CLIENT_ID: 'DAN_CLIENT_ID_VAO_DAY.apps.googleusercontent.com',
   ```
   bằng Client ID vừa tạo → **Lưu**.
2. Bấm **Triển khai (Deploy) → Bản triển khai mới (New deployment)** → biểu tượng bánh răng → chọn **Ứng dụng web (Web app)**:
   - Execute as: **Me (Tôi)**
   - Who has access: **Anyone (Bất kỳ ai)**
3. **Deploy** → sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
   Mở thử URL này trên trình duyệt, thấy `"ok":true` là được.

> "Anyone" chỉ là cho phép web app gọi tới; mọi thao tác vẫn bắt buộc đăng nhập Gmail có trong tab `NguoiDung`.
>
> **Khi sửa Code.gs sau này**: Triển khai → Quản lý bản triển khai → ✏️ Sửa → Phiên bản: **Phiên bản mới** → Triển khai (giữ nguyên URL).

### Bước 4 — Đưa web app lên GitHub Pages

1. Đăng nhập <https://github.com> → **New repository** → tên `checkin-hoinghi`, chọn **Public** → **Create repository**.
2. Bấm **uploading an existing file** → kéo thả toàn bộ file trong thư mục này (`index.html`, `style.css`, `app.js`, `config.js`, `README.md` và thư mục `apps-script`) → **Commit changes**.
3. Mở file `config.js` trên GitHub → bấm ✏️ → điền:
   ```js
   API_URL: 'https://script.google.com/macros/s/…/exec',
   GOOGLE_CLIENT_ID: '1234…-abc.apps.googleusercontent.com',
   ```
   → **Commit changes**.
4. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**.
5. Sau 1–2 phút, app chạy tại: `https://<tên-tài-khoản-github>.github.io/checkin-hoinghi/`

> Repo public chỉ chứa code, **không chứa dữ liệu khách hàng**. Dữ liệu chỉ trả về sau khi đăng nhập Gmail hợp lệ.

---

## Sử dụng tại quầy check-in

1. Cắm máy quét **Sapo SP21** vào cổng USB (máy hoạt động như bàn phím: quét xong tự gõ mã + Enter).
2. **Tắt bộ gõ tiếng Việt** (Unikey/EVKey chuyển sang chế độ **E**) trên máy check-in, tránh bộ gõ làm sai mã.
3. Mở link app → **Đăng nhập bằng Google** (Gmail có trong tab `NguoiDung`). Máy giữ đăng nhập 12 giờ.
4. Ở tab **Check-in**, quét mã vạch của khách:
   - 🟩 **Check-in thành công** – kèm tiếng bíp.
   - 🟧 **Khách đã check-in trước đó** – báo giờ và người đã check-in (2 tiếng bíp).
   - 🟥 **Không tìm thấy mã** – kiểm tra thẻ, hoặc dùng ô **Tra cứu khi khách quên mã**.
5. Nhiều máy có thể check-in cùng lúc; số liệu tự đồng bộ mỗi 20 giây (bấm chấm xanh góc trên để làm mới ngay).

### Mã vạch gửi khách

- Tab **Mã vạch** → **In tem 30×50mm (ngang)**: in tem khổ ngang (cạnh 50mm nằm ngang), chữ thẳng: tên khách ở trên, mã vạch ở giữa, mã KH ở dưới. Mỗi khách 1 tem; nút **In tem** trên từng thẻ để in riêng 1 khách.
  - Trong hộp thoại in của Chrome: chọn máy in tem → **Khổ giấy 30 x 50 mm** (app tự ép trang sang **Ngang**) → Lề: **Không có** → Tỷ lệ: **100%** (Mặc định) → bỏ chọn **Đầu trang và chân trang**.
  - Nếu bản xem trước vẫn đứng dọc hoặc chữ bị xoay: vào Tùy chọn in (Printing Preferences) của driver máy in tem, chọn khổ **30 x 50 mm** và đặt Hướng **Ngang (Landscape)**.
  - Muốn in tem đứng (chữ chạy theo cạnh 30mm): đặt `LABEL_LANDSCAPE: false` trong `config.js`.
  - Đổi khổ tem khác: sửa `LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM` / `LABEL_LANDSCAPE` trong `config.js`.
- Tab **Mã vạch** → **In thẻ (A4)**: in thẻ giấy A4 (2 thẻ/hàng).
- **Tải ảnh PNG** từng khách hoặc **Tải tất cả ảnh (.zip)** để gửi Zalo/email.
- ⚠️ Máy quét laser 1D thường **không đọc được mã trên màn hình điện thoại**. Hãy thử trước: mở ảnh PNG trên điện thoại, tăng độ sáng tối đa và quét thử. Nếu không đọc được, hãy in thẻ cho khách.

### Xuất dữ liệu

- Tab **Danh sách** → lọc **Tất cả / Đã check-in / Chưa đến** → **Xuất Excel (CSV)** (mở bằng Excel hiển thị đúng tiếng Việt).
- Hoặc xem trực tiếp trong Google Sheet (3 cột check-in).

### Chạy thử trước sự kiện

- Mở link app kèm `?demo=1` (ví dụ `…/checkin-hoinghi/?demo=1`) → **Dùng thử với dữ liệu mẫu** để tập quét, không ghi vào Sheet.
- Hoặc check-in thật vài khách, sau đó dùng menu Sheet **🎫 Check-in → Xóa toàn bộ dữ liệu check-in** để làm lại từ đầu.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| Nút đăng nhập Google không hiện | Kiểm tra `GOOGLE_CLIENT_ID` trong `config.js` và *Authorized JavaScript origins* đúng `https://<tên>.github.io` |
| "Gmail … chưa được cấp quyền" | Thêm email đó vào cột A tab `NguoiDung` (có hiệu lực sau ~1 phút) |
| "CLIENT_ID trong Code.gs không khớp" | Dán đúng Client ID vào `Code.gs`, rồi **triển khai Phiên bản mới** |
| "Máy chủ trả về dữ liệu lạ" | Kiểm tra `API_URL` (đuôi `/exec`) và quyền **Anyone** khi triển khai |
| Quét ra ký tự lạ / sai mã | Tắt bộ gõ tiếng Việt, tắt Caps Lock |
| Cột Barcode trong Sheet không hiện ảnh | Menu **🎫 Check-in → Tạo lại barcode**. Ảnh trong Sheet dùng dịch vụ bwip-js miễn phí; mã vạch trong web app được tạo trực tiếp nên không phụ thuộc dịch vụ này |
