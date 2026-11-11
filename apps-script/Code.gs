/**
 * ================================================================
 *  API CHECK-IN KHÁCH HÀNG HỘI NGHỊ  –  Google Apps Script
 *  Cài vào Google Sheet: Tiện ích mở rộng > Apps Script > dán toàn bộ file này.
 *  Hướng dẫn đầy đủ: README.md
 * ================================================================
 */

// ======================= CẤU HÌNH =======================
const CONFIG = {
  // OAuth Client ID tạo trên Google Cloud (phải GIỐNG HỆT GOOGLE_CLIENT_ID trong config.js)
  CLIENT_ID: '228520363042-3kvet9162n1ktlk6q9l1p9ukvibpgsm9.apps.googleusercontent.com',

  // Tên tab chứa danh sách khách hàng (nếu không thấy sẽ dùng tab đầu tiên)
  SHEET_NAME: 'DSKH tham gia hội nghị HCM',

  // Tên tab chứa danh sách Gmail nhân viên được phép check-in (cột A)
  USERS_SHEET: 'NguoiDung',

  // Mỗi máy giữ đăng nhập bao nhiêu giờ
  SESSION_HOURS: 12,

  TIMEZONE: 'Asia/Ho_Chi_Minh',

  // Dịch vụ vẽ ảnh mã vạch Code128 cho cột "Barcode" trong Sheet
  BARCODE_IMAGE_URL: 'https://bwipjs-api.metafloor.com/?bcid=code128&scale=2&height=10&includetext&text=',
  BARCODE_ROW_HEIGHT: 60,
};

const HDR = { BARCODE: 'Barcode', CHECKED: 'Đã check-in', TIME: 'Giờ check-in', BY: 'Người check-in' };
const TIME_FMT_SHEET = 'HH:mm:ss dd/mm/yyyy'; // định dạng hiển thị trong Sheet
const TIME_FMT_API = 'HH:mm:ss dd/MM/yyyy';   // định dạng trả về web app

// ======================= MENU TRONG SHEET =======================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎫 Check-in')
    .addItem('Cài đặt lần đầu', 'setupSheet')
    .addItem('Tạo lại barcode cho tất cả khách', 'refreshBarcodes')
    .addSeparator()
    .addItem('Xóa toàn bộ dữ liệu check-in (làm lại từ đầu)', 'resetCheckins')
    .addToUi();
}

/** Chạy 1 lần: tạo cột check-in, barcode, tab NguoiDung, khóa bí mật phiên đăng nhập. */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  secret_();

  const sh = mainSheet_();
  const m = colMap_(sh, true);
  if (sh.getMaxRows() > 1) {
    sh.getRange(2, m.time, sh.getMaxRows() - 1, 1).setNumberFormat(TIME_FMT_SHEET);
  }
  sh.setColumnWidth(m.barcode, 230);
  sh.setColumnWidth(m.checked, 100);
  sh.setColumnWidth(m.time, 150);
  sh.setColumnWidth(m.by, 210);
  const last = sh.getLastRow();
  if (last >= 2) prepareRows_(sh, m, 2, last);

  let us = ss.getSheetByName(CONFIG.USERS_SHEET);
  if (!us) {
    us = ss.insertSheet(CONFIG.USERS_SHEET);
    us.getRange(1, 1, 1, 2).setValues([['Email', 'Ghi chú']]).setFontWeight('bold');
    us.setFrozenRows(1);
    us.setColumnWidth(1, 280);
    us.setColumnWidth(2, 260);
    const me = Session.getEffectiveUser().getEmail();
    if (me) us.appendRow([me, 'Quản trị (tự thêm khi cài đặt)']);
  }
  CacheService.getScriptCache().remove('allowed');
  notify_('Cài đặt xong! Thêm Gmail nhân viên vào tab "' + CONFIG.USERS_SHEET + '" (cột A) để họ đăng nhập được.');
}

/** Tạo lại barcode + ô tick cho mọi dòng có Mã KH. */
function refreshBarcodes() {
  const sh = mainSheet_();
  const m = colMap_(sh, true);
  const last = sh.getLastRow();
  if (last >= 2) prepareRows_(sh, m, 2, last);
  notify_('Đã tạo barcode cho ' + Math.max(last - 1, 0) + ' dòng.');
}

/** Xóa dữ liệu check-in để làm lại (ví dụ sau khi chạy thử). */
function resetCheckins() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert(
    'Xóa toàn bộ check-in?',
    'Dữ liệu ở 3 cột "' + HDR.CHECKED + '", "' + HDR.TIME + '", "' + HDR.BY + '" sẽ bị xóa và không hoàn tác được.',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;
  const sh = mainSheet_();
  const m = colMap_(sh, true);
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  [m.checked, m.time, m.by].forEach(function (c) { sh.getRange(2, c, n, 1).clearContent(); });
  notify_('Đã xóa dữ liệu check-in.');
}

/** Tự tạo barcode khi nhập/dán Mã KH mới (trigger đơn giản, không cần cài). */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getSheetId() !== mainSheet_().getSheetId()) return;
    const m = colMap_(sh, false);
    const r = e.range;
    if (m.code < r.getColumn() || m.code > r.getLastColumn()) return;
    const start = Math.max(2, r.getRow());
    const end = r.getLastRow();
    if (end >= start) prepareRows_(sh, m, start, end);
  } catch (err) {
    console.log('onEdit: ' + err);
  }
}

/** Ghi công thức ảnh barcode + ô tick cho các dòng start..end. */
function prepareRows_(sh, m, start, end) {
  const n = end - start + 1;
  if (n <= 0) return;
  const codes = sh.getRange(start, m.code, n, 1).getDisplayValues();
  if (m.barcode) {
    const L = colLetter_(m.code);
    const formulas = codes.map(function (r, i) {
      return [String(r[0]).trim()
        ? '=IMAGE("' + CONFIG.BARCODE_IMAGE_URL + '"&ENCODEURL(TRIM(' + L + (start + i) + ')))'
        : ''];
    });
    sh.getRange(start, m.barcode, n, 1).setFormulas(formulas);
    sh.setRowHeights(start, n, CONFIG.BARCODE_ROW_HEIGHT);
  }
  if (m.checked) {
    // Dùng data validation (không dùng insertCheckboxes vì hàm đó xóa giá trị đã tick)
    const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sh.getRange(start, m.checked, n, 1).setDataValidation(rule);
  }
}

// ======================= WEB API =======================
function doGet() {
  return json_({ ok: true, app: 'checkin-api', message: 'API check-in đang chạy. Hãy mở web app trên GitHub Pages để check-in.' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request', message: 'Dữ liệu gửi lên không hợp lệ' });
  }
  try {
    if (req.action === 'login') return json_(login_(req.idToken));
    const user = readSession_(req.session);
    if (req.action === 'data') return json_(Object.assign({ ok: true, user: user }, readAll_()));
    if (req.action === 'checkin') return json_(mark_(req.code, user, false));
    if (req.action === 'undo') return json_(mark_(req.code, user, true));
    return json_({ ok: false, error: 'bad_request', message: 'Thao tác không hợp lệ' });
  } catch (err) {
    return json_({ ok: false, error: err.code || 'server_error', message: String((err && err.message) || err) });
  }
}

/** Đăng nhập: xác minh ID token Google, kiểm tra email trong tab NguoiDung, cấp phiên. */
function login_(idToken) {
  if (!idToken) throw err_('invalid_token', 'Thiếu token đăng nhập');
  if (CONFIG.CLIENT_ID.indexOf('DAN_CLIENT_ID') === 0) throw err_('invalid_token', 'Chưa dán CLIENT_ID vào Code.gs');
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) throw err_('invalid_token', 'Google không xác nhận được token, hãy đăng nhập lại');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CONFIG.CLIENT_ID) throw err_('invalid_token', 'CLIENT_ID trong Code.gs không khớp với config.js');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(t.iss) < 0) throw err_('invalid_token', 'Token không do Google cấp');
  if (String(t.email_verified) !== 'true') throw err_('invalid_token', 'Email Google chưa được xác minh');
  if (Number(t.exp) * 1000 < Date.now()) throw err_('invalid_token', 'Token đã hết hạn, hãy đăng nhập lại');

  const email = String(t.email || '').toLowerCase();
  if (allowedEmails_().indexOf(email) < 0) throw err_('forbidden', email);
  const user = { email: email, name: t.name || '', picture: t.picture || '' };
  return Object.assign({ ok: true, session: makeSession_(user), user: user }, readAll_());
}

/** Đọc toàn bộ danh sách khách. */
function readAll_() {
  const sh = mainSheet_();
  const m = colMap_(sh, false);
  const last = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const cols = showCols_(m);
  const customers = [];
  if (last >= 2) {
    const range = sh.getRange(2, 1, last - 1, lastCol);
    const values = range.getValues();
    const display = range.getDisplayValues();
    for (let i = 0; i < values.length; i++) {
      if (!normCode_(values[i][m.code - 1])) continue;
      customers.push(toCustomer_(values[i], display[i], m, cols, i + 2));
    }
  }
  return {
    columns: cols.map(function (i) { return m.headers[i]; }),
    customers: customers,
    sheetName: sh.getName(),
    serverTime: new Date().toISOString(),
  };
}

/** Check-in (undo=false) hoặc hủy check-in (undo=true) theo mã KH. */
function mark_(rawCode, user, undo) {
  const code = normCode_(rawCode);
  if (!code) throw err_('bad_request', 'Thiếu mã khách hàng');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw err_('busy', 'Hệ thống đang bận, vui lòng quét lại');
  try {
    const sh = mainSheet_();
    const m = colMap_(sh, true);
    const last = sh.getLastRow();
    if (last < 2) return { ok: true, status: 'notfound', code: code };
    const codes = sh.getRange(2, m.code, last - 1, 1).getValues();
    let idx = -1;
    for (let i = 0; i < codes.length; i++) {
      if (normCode_(codes[i][0]) === code) { idx = i; break; }
    }
    if (idx < 0) return { ok: true, status: 'notfound', code: code };

    const rowNum = idx + 2;
    const cols = showCols_(m);
    const read = function () {
      const r = sh.getRange(rowNum, 1, 1, sh.getLastColumn());
      return toCustomer_(r.getValues()[0], r.getDisplayValues()[0], m, cols, rowNum);
    };
    const before = read();

    if (undo) {
      sh.getRange(rowNum, m.checked).setValue(false);
      sh.getRange(rowNum, m.time).clearContent();
      sh.getRange(rowNum, m.by).clearContent();
      SpreadsheetApp.flush();
      return { ok: true, status: 'undone', customer: read() };
    }
    if (before.checked) return { ok: true, status: 'duplicate', customer: before };

    sh.getRange(rowNum, m.checked).setValue(true);
    sh.getRange(rowNum, m.time).setValue(new Date()).setNumberFormat(TIME_FMT_SHEET);
    sh.getRange(rowNum, m.by).setValue(user.email);
    SpreadsheetApp.flush();
    return { ok: true, status: 'ok', customer: read() };
  } finally {
    lock.releaseLock();
  }
}

// ======================= PHIÊN ĐĂNG NHẬP =======================
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SESSION_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('SESSION_SECRET', s);
  }
  return s;
}

function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_()));
}

function makeSession_(user) {
  const data = { e: user.email, n: user.name, p: user.picture, x: Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000 };
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify(data), Utilities.Charset.UTF_8);
  return payload + '.' + sign_(payload);
}

function readSession_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw err_('unauthorized', 'Phiên đăng nhập không hợp lệ');
  const data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  if (!data.x || data.x < Date.now()) throw err_('unauthorized', 'Phiên đăng nhập đã hết hạn');
  if (allowedEmails_().indexOf(data.e) < 0) throw err_('forbidden', data.e);
  return { email: data.e, name: data.n || '', picture: data.p || '' };
}

/** Danh sách Gmail được phép (tab NguoiDung, cột A), cache 60 giây. */
function allowedEmails_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('allowed');
  if (hit) return JSON.parse(hit);
  const us = ss_().getSheetByName(CONFIG.USERS_SHEET);
  let list = [];
  if (us && us.getLastRow() >= 2) {
    list = us.getRange(2, 1, us.getLastRow() - 1, 1).getDisplayValues()
      .map(function (r) { return String(r[0]).trim().toLowerCase(); })
      .filter(function (s) { return s.indexOf('@') > 0; });
  }
  cache.put('allowed', JSON.stringify(list), 60);
  return list;
}

// ======================= TIỆN ÍCH =======================
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
}

function mainSheet_() {
  const ss = ss_();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getSheets()[0];
}

/** Tìm vị trí các cột theo tên tiêu đề ở dòng 1. ensure=true: tự thêm cột còn thiếu. */
function colMap_(sh, ensure) {
  let lastCol = Math.max(sh.getLastColumn(), 1);
  let headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  if (ensure) {
    const have = headers.map(norm_);
    const need = [HDR.BARCODE, HDR.CHECKED, HDR.TIME, HDR.BY].filter(function (h) { return have.indexOf(norm_(h)) < 0; });
    if (need.length) {
      sh.getRange(1, lastCol + 1, 1, need.length).setValues([need]).setFontWeight('bold');
      lastCol = sh.getLastColumn();
      headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    }
  }
  const n = headers.map(norm_);
  const find = function (test) { for (let i = 0; i < n.length; i++) if (test(n[i])) return i + 1; return 0; };
  const m = {
    headers: headers,
    code: find(function (h) { return /^ma\s*(kh|khach hang)\b/.test(h) || h === 'customer code'; }),
    name: find(function (h) { return /^(ten|ho ten|ho va ten|ten khach hang)\b/.test(h); }),
    barcode: find(function (h) { return h === norm_(HDR.BARCODE); }),
    checked: find(function (h) { return h === norm_(HDR.CHECKED); }),
    time: find(function (h) { return h === norm_(HDR.TIME); }),
    by: find(function (h) { return h === norm_(HDR.BY); }),
  };
  if (!m.code) throw err_('config', 'Không tìm thấy cột "Ma KH" ở dòng 1 của tab "' + sh.getName() + '"');
  return m;
}

/** Các cột hiển thị trên web app (bỏ cột barcode và 3 cột check-in). */
function showCols_(m) {
  const hide = [m.barcode, m.checked, m.time, m.by];
  const out = [];
  m.headers.forEach(function (h, i) { if (hide.indexOf(i + 1) < 0 && String(h).trim()) out.push(i); });
  return out;
}

function toCustomer_(row, disp, m, cols, rowNum) {
  const raw = m.time ? row[m.time - 1] : '';
  const d = raw instanceof Date ? raw : null;
  const valid = d && !isNaN(d.getTime());
  return {
    row: rowNum,
    code: normCode_(row[m.code - 1]),
    name: m.name ? String(disp[m.name - 1]).trim() : '',
    values: cols.map(function (i) { return String(disp[i]); }),
    checked: (m.checked > 0 && row[m.checked - 1] === true) || !!raw,
    time: valid ? Utilities.formatDate(d, CONFIG.TIMEZONE, TIME_FMT_API) : (raw ? String(raw) : ''),
    ts: valid ? d.getTime() : 0,
    by: m.by ? String(disp[m.by - 1]) : '',
  };
}

function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normCode_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D').toUpperCase().replace(/\s+/g, '');
}

function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function err_(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function notify_(msg) {
  console.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Check-in', 10); } catch (e) { /* chạy từ trình soạn thảo */ }
}
