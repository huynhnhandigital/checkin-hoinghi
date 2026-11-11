// =====================================================
//  CẤU HÌNH WEB APP CHECK-IN  (chỉ cần sửa file này)
// =====================================================
window.APP_CONFIG = {
  // Link Web App của Apps Script (Triển khai > Quản lý bản triển khai), dạng:
  // https://script.google.com/macros/s/XXXXXXXX/exec
  API_URL: 'https://script.google.com/macros/s/AKfycbzRILMiTmQw5fdRsPkPbINlJS8_ErUYDaMytlrzaFcm4E0jfNhVWpm1goCgz0emyMbi7w/exec',

  // OAuth Client ID tạo trên Google Cloud, dạng: 1234567890-abc.apps.googleusercontent.com
  // (phải giống hệt CLIENT_ID trong apps-script/Code.gs)
  GOOGLE_CLIENT_ID: '228520363042-3kvet9162n1ktlk6q9l1p9ukvibpgsm9.apps.googleusercontent.com',

  // Tên hiển thị trên app, thẻ in và ảnh mã vạch gửi khách
  ORG_NAME: 'BIOMEQ',
  EVENT_NAME: 'Hội nghị khách hàng HCM 2026',

  // Tự làm mới dữ liệu mỗi bao nhiêu giây (đồng bộ khi có nhiều máy check-in)
  REFRESH_SECONDS: 20,

  // Kích thước tem (mm) đúng như khi tem chạy ra khỏi máy in:
  // RỘNG = cạnh nằm ngang đầu in, CAO = cạnh theo chiều chạy giấy.
  // Cuộn tem hiện tại: rộng 50mm × cao 30mm -> nội dung nằm ngang, chữ thẳng.
  LABEL_WIDTH_MM: 50,
  LABEL_HEIGHT_MM: 30,
  // Khe hở giữa 2 tem (mm) và độ phân giải máy in tem (Xprinter XP-470B: 203 dpi)
  LABEL_GAP_MM: 2,
  LABEL_DPI: 203,
};
