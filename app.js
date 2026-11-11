/* =========================================================
 *  WEB APP CHECK-IN KHÁCH HÀNG
 *  - Máy quét mã vạch USB (VD: Sapo SP21) hoạt động như bàn phím:
 *    gõ mã KH rồi tự nhấn Enter -> app tự check-in.
 *  - Dữ liệu lấy/ghi vào Google Sheet qua Apps Script (config.js).
 * ========================================================= */
(function () {
  'use strict';

  const CFG = Object.assign({
    API_URL: '', GOOGLE_CLIENT_ID: '', ORG_NAME: '', EVENT_NAME: 'Check-in khách hàng', REFRESH_SECONDS: 20,
    LABEL_WIDTH_MM: 50, LABEL_HEIGHT_MM: 30,
  }, window.APP_CONFIG || {});
  const LABEL_W = Number(CFG.LABEL_WIDTH_MM) || 50;
  const LABEL_H = Number(CFG.LABEL_HEIGHT_MM) || 30;
  const CONFIGURED = /^https:\/\/script\.google(usercontent)?\.com\//.test(CFG.API_URL) &&
    /\.apps\.googleusercontent\.com$/.test(String(CFG.GOOGLE_CLIENT_ID).trim());
  const PARAMS = new URLSearchParams(location.search);

  // ---------- Tiện ích ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  const normCode = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').toUpperCase().replace(/\s+/g, '');
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtClock = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const fmtFull = (ts) => { const d = new Date(ts); return `${fmtClock(ts)} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`; };
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
  };

  const ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>',
    dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5M12 17h.01"/></svg>',
    err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
    scanner: '<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M14 14v52M24 14v52M32 14v52M44 14v52M50 14v52M62 14v52M72 14v52M80 14v52M92 14v52M98 14v52M106 14v52"/><path d="M4 40h112" stroke="#e5484d" stroke-width="3"/></svg>',
  };

  // ---------- Trạng thái ----------
  const S = {
    session: null, user: null, demo: false,
    columns: [], customers: [], byCode: new Map(),
    nameIdx: -1, codeIdx: -1,
    tab: 'scan', filter: 'all',
    queue: Promise.resolve(), busy: 0, seq: 0,
    codesSig: '', muted: store.get('ci_muted') === '1',
  };

  // ---------- Gọi API ----------
  function apiErr(code, message) { const e = new Error(message || code); e.code = code; return e; }

  async function api(action, body) {
    if (S.demo) return demoApi(action, body || {});
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh CORS preflight với Apps Script
        body: JSON.stringify(Object.assign({ action, session: S.session }, body || {})),
        redirect: 'follow',
      });
    } catch (e) {
      throw apiErr('network', 'Không kết nối được máy chủ. Kiểm tra mạng Internet.');
    }
    let data;
    try { data = await res.json(); } catch (e) {
      throw apiErr('bad_response', 'Máy chủ trả về dữ liệu lạ. Kiểm tra API_URL và mục "Who has access: Anyone" khi triển khai Apps Script.');
    }
    if (!data.ok) {
      const err = apiErr(data.error, data.message);
      if (action !== 'login' && (data.error === 'unauthorized' || data.error === 'forbidden')) logout(errorText(err));
      throw err;
    }
    return data;
  }

  function errorText(e) {
    switch (e && e.code) {
      case 'forbidden': return `Gmail ${e.message} chưa được cấp quyền. Nhờ quản trị thêm email này vào tab "NguoiDung" trong Google Sheet.`;
      case 'invalid_token': return 'Đăng nhập Google không hợp lệ: ' + e.message;
      case 'unauthorized': return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
      case 'config': return 'Lỗi cấu hình Google Sheet: ' + e.message;
      default: return (e && e.message) || 'Đã có lỗi xảy ra.';
    }
  }

  // ---------- Dữ liệu ----------
  function prep(c) {
    c._k = norm([c.code, c.name].concat(c.values || []).join(' '));
    return c;
  }

  function setData(d) {
    S.columns = d.columns || [];
    S.customers = (d.customers || []).map(prep);
    S.byCode = new Map(S.customers.map((c) => [c.code, c]));
    const n = S.columns.map(norm);
    S.nameIdx = n.findIndex((h) => /^(ten|ho ten|ho va ten|ten khach hang)\b/.test(h));
    S.codeIdx = n.findIndex((h) => /^ma\s*(kh|khach hang)\b/.test(h));
    setSync('ok');
    renderAll();
  }

  function upsert(c) {
    S.seq++;
    prep(c);
    const old = S.byCode.get(c.code);
    if (old) { Object.assign(old, c); return old; }
    S.customers.push(c);
    S.byCode.set(c.code, c);
    return c;
  }

  function search(q) {
    const n = norm(q);
    if (!n) return S.customers.slice();
    const terms = n.split(' ');
    const hits = S.customers.filter((c) => terms.every((t) => c._k.includes(t)));
    // Ưu tiên: đúng mã KH > chứa nguyên cụm từ > các kết quả còn lại
    const rank = (c) => (c.code === normCode(q) ? 2 : c._k.includes(n) ? 1 : 0);
    return hits.sort((a, b) => rank(b) - rank(a));
  }

  async function refresh(manual) {
    if (!S.session || S.busy) return;
    const seq = S.seq;
    setSync('busy');
    try {
      const d = await api('data');
      if (seq !== S.seq || S.busy) { setSync('ok'); return; } // có check-in mới trong lúc tải -> bỏ bản cũ
      setData(d);
      if (manual) toast('Đã làm mới dữ liệu');
    } catch (e) {
      setSync('err');
      if (manual) toast(errorText(e), 'err');
    }
  }

  // ---------- Check-in ----------
  function handleScan(raw) {
    const code = normCode(raw);
    if (!code || !S.session) return;
    if (S.tab !== 'scan') switchTab('scan');
    S.queue = S.queue.then(() => doCheckin(code)).catch(() => {});
  }

  async function doCheckin(code) {
    const local = S.byCode.get(code);
    showResult('pending', local, { code });
    S.busy++;
    try {
      const r = await api('checkin', { code });
      if (r.status === 'notfound') {
        showResult('notfound', null, { code });
        beep('err');
      } else {
        const c = upsert(r.customer);
        if (r.status === 'ok') { showResult('ok', c); beep('ok'); } else { showResult('dup', c); beep('dup'); }
        renderAfterChange();
      }
    } catch (e) {
      showResult('error', local, { code, message: errorText(e) });
      beep('err');
    } finally {
      S.busy--;
    }
  }

  async function doUndo(code) {
    const c = S.byCode.get(code);
    if (!confirm(`Hủy check-in của:\n${c ? c.name || c.code : code}?`)) return;
    S.busy++;
    try {
      const r = await api('undo', { code });
      if (r.customer) {
        const u = upsert(r.customer);
        if (S.tab === 'scan') showResult('undone', u);
      }
      renderAfterChange();
      toast('Đã hủy check-in');
    } catch (e) {
      toast(errorText(e), 'err');
    } finally {
      S.busy--;
      focusScan();
    }
  }

  // ---------- Hiển thị kết quả quét ----------
  function showResult(kind, c, extra) {
    extra = extra || {};
    const el = $('#result');
    el.className = 'result ' + kind;
    void el.offsetWidth; // chạy lại hiệu ứng
    el.classList.add('flash');

    const code = (c && c.code) || extra.code || '';
    const titles = {
      pending: ['wait', 'Đang ghi nhận…'],
      ok: ['ok', 'Check-in thành công'],
      dup: ['dup', 'Khách đã check-in trước đó'],
      notfound: ['err', 'Không tìm thấy mã khách hàng'],
      error: ['err', 'Chưa check-in được'],
      undone: ['undo', 'Đã hủy check-in'],
    };
    const [icon, title] = titles[kind];
    let body = '';
    if (c) {
      const fields = S.columns.map((h, i) => [h, c.values[i]])
        .filter(([, v], i) => i !== S.nameIdx && i !== S.codeIdx && String(v || '').trim());
      body += `<div class="cust-name">${esc(c.name || c.code)}</div>`;
      body += `<div class="cust-code">${esc(c.code)}</div>`;
      if (fields.length) body += `<dl class="fields">${fields.map(([h, v]) => `<dt>${esc(h)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    } else if (code) {
      body += `<div class="cust-name">${esc(code)}</div>`;
    }
    if (kind === 'ok') body += `<div class="cust-meta">Check-in lúc <b>${esc(c.time)}</b></div>`;
    if (kind === 'dup') body += `<div class="cust-meta">Đã check-in lúc ${esc(c.time || '(không rõ giờ)')}${c.by ? ' — bởi ' + esc(c.by) : ''}</div>`;
    if (kind === 'notfound') body += `<div class="cust-meta">Mã này không có trong danh sách. Kiểm tra lại thẻ của khách hoặc dùng ô "Tra cứu khi khách quên mã".</div>`;
    if (kind === 'error') body += `<div class="cust-meta">${esc(extra.message || 'Lỗi không xác định')}</div><div class="result-actions"><button class="btn primary" type="button" data-act="checkin" data-code="${esc(code)}">Thử lại</button></div>`;
    if ((kind === 'ok' || kind === 'dup') && c) {
      body += `<div class="result-actions"><button class="btn small ghost danger" type="button" data-act="undo" data-code="${esc(c.code)}">${ICON.undo} Hủy check-in (quét nhầm)</button></div>`;
    }
    el.innerHTML = `<div class="result-head">${ICON[icon]}<span>${esc(title)}</span></div><div class="result-body">${body}</div>`;
  }

  function showIdle() {
    const el = $('#result');
    el.className = 'result idle';
    el.innerHTML = `<div class="idle-art">${ICON.scanner}</div><div class="idle-title">Đưa mã vạch của khách vào máy quét</div><div>Thông tin khách sẽ tự hiện ra và được ghi vào Google Sheet.</div>`;
  }

  // ---------- Render ----------
  function renderAll() {
    renderAfterChange();
    if (S.tab === 'codes') renderCodes();
  }

  function renderAfterChange() {
    renderStats();
    renderRecent();
    renderLookup();
    if (S.tab === 'list') renderList();
  }

  function renderStats() {
    const total = S.customers.length;
    const done = S.customers.filter((c) => c.checked).length;
    const pct = total ? Math.round((done * 100) / total) : 0;
    $('#stDone').textContent = done;
    $('#stTotal').textContent = total;
    $('#stLeft').textContent = total - done;
    $('#stPct').textContent = pct + '%';
    $('#stBar').style.width = pct + '%';
  }

  function renderRecent() {
    const list = S.customers.filter((c) => c.checked && c.ts).sort((a, b) => b.ts - a.ts).slice(0, 8);
    $('#recent').innerHTML = list.length
      ? list.map((c) => `<li><span class="t">${esc(fmtClock(c.ts))}</span><span class="n" title="${esc(c.name)}">${esc(c.name || c.code)}</span><span class="c">${esc(c.code)}</span></li>`).join('')
      : '<li class="empty">Chưa có khách check-in</li>';
  }

  function renderLookup() {
    const q = $('#lookup').value.trim();
    const ul = $('#lookupResults');
    if (!q) { ul.innerHTML = ''; return; }
    const list = search(q).slice(0, 8);
    ul.innerHTML = list.length ? list.map((c) => `
      <li>
        <div class="stack"><span class="n" title="${esc(c.name)}">${esc(c.name || c.code)}</span><span class="c">${esc(c.code)}</span></div>
        ${c.checked
          ? `<span class="pill ok">Đã đến${c.ts ? ' ' + esc(fmtClock(c.ts).slice(0, 5)) : ''}</span>`
          : `<button class="btn small ok" type="button" data-act="checkin" data-code="${esc(c.code)}">Check-in</button>`}
      </li>`).join('') : '<li class="empty">Không tìm thấy khách phù hợp</li>';
  }

  function filteredList() {
    const q = $('#listSearch').value;
    return search(q).filter((c) => S.filter === 'all' || (S.filter === 'in' ? c.checked : !c.checked));
  }

  function renderList() {
    const all = S.customers;
    const nIn = all.filter((c) => c.checked).length;
    const counts = { all: all.length, in: nIn, out: all.length - nIn };
    $$('#filterSeg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === S.filter);
      $('span', b).textContent = `(${counts[b.dataset.filter]})`;
    });
    const rows = filteredList();
    const head = S.columns.map((h) => `<th>${esc(h)}</th>`).join('') + '<th>Trạng thái</th><th>Giờ check-in</th><th>Người check-in</th><th></th>';
    $('#listTable thead').innerHTML = `<tr>${head}</tr>`;
    const colspan = S.columns.length + 4;
    $('#listTable tbody').innerHTML = rows.length ? rows.map((c) => `
      <tr class="${c.checked ? 'is-in' : ''}">
        ${c.values.map((v, i) => `<td class="${i === S.codeIdx ? 'mono' : i === S.nameIdx ? 'name' : ''}">${esc(v)}</td>`).join('')}
        <td>${c.checked ? '<span class="pill ok">✓ Đã check-in</span>' : '<span class="pill">Chưa đến</span>'}</td>
        <td class="mono">${esc(c.time)}</td>
        <td>${esc(c.by)}</td>
        <td>${c.checked
          ? `<button class="btn small ghost danger" type="button" data-act="undo" data-code="${esc(c.code)}">Hủy</button>`
          : `<button class="btn small" type="button" data-act="checkin" data-code="${esc(c.code)}">Check-in</button>`}</td>
      </tr>`).join('') : `<tr class="empty-row"><td colspan="${colspan}">Không có khách nào phù hợp</td></tr>`;
  }

  function codesList() {
    return search($('#codeSearch').value);
  }

  function renderCodes(force) {
    const list = codesList();
    const sig = list.map((c) => c.code + '|' + c.name).join('\n');
    if (!force && sig === S.codesSig) return;
    S.codesSig = sig;
    const grid = $('#codeGrid');
    grid.innerHTML = list.length ? list.map((c) => `
      <div class="bc-card" data-code="${esc(c.code)}">
        <div class="bc-name">${esc(c.name || c.code)}</div>
        <svg class="bc-svg"></svg>
        <div class="bc-actions">
          <button class="btn small" type="button" data-act="label" data-code="${esc(c.code)}">In tem</button>
          <button class="btn small" type="button" data-act="png" data-code="${esc(c.code)}">Tải ảnh PNG</button>
        </div>
      </div>`).join('') : '<p class="muted">Không có khách nào phù hợp.</p>';
    $$('.bc-card', grid).forEach((card) => drawBarcode($('svg', card), card.dataset.code, { width: 2, height: 64, fontSize: 16, margin: 10 }));
  }

  function drawBarcode(target, code, opts) {
    try {
      JsBarcode(target, code, Object.assign({ format: 'CODE128', displayValue: true, font: 'monospace', textMargin: 4, background: '#ffffff', lineColor: '#000000' }, opts));
      return true;
    } catch (e) {
      console.warn('Không tạo được mã vạch cho', code, e);
      return false;
    }
  }

  // ---------- Ảnh PNG / ZIP / In / CSV ----------
  function wrapLines(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.length && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  function cardCanvas(c) {
    const W = 1000, H = 640, pad = 48;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const font = (w, s) => `${w} ${s}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b5cad'; g.fillRect(0, 0, W, 112);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (CFG.ORG_NAME) { g.font = font(800, 24); g.fillText(CFG.ORG_NAME.toUpperCase(), W / 2, 36); }
    g.font = font(600, 34);
    g.fillText(wrapLines(g, CFG.EVENT_NAME, W - 2 * pad, 1)[0] || '', W / 2, CFG.ORG_NAME ? 76 : 56);

    g.fillStyle = '#15203a'; g.font = font(800, 40);
    wrapLines(g, c.name || c.code, W - 2 * pad, 2).forEach((ln, i) => g.fillText(ln, W / 2, 166 + i * 50));

    const bc = document.createElement('canvas');
    for (let mw = 5; mw >= 2; mw--) {
      drawBarcode(bc, c.code, { width: mw, height: 200, fontSize: 40, textMargin: 8, margin: 24 });
      if (bc.width <= W - 2 * pad) break;
    }
    g.drawImage(bc, Math.round((W - bc.width) / 2), 262);
    g.fillStyle = '#5d6679'; g.font = font(400, 22);
    g.fillText('Vui lòng xuất trình mã này tại quầy check-in', W / 2, H - 30);
    return cv;
  }

  const toBlob = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
  const fileBase = (c) => `${c.code}_${slug(c.name) || 'khach-hang'}`;

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  async function downloadPng(code) {
    const c = S.byCode.get(code);
    if (!c) return;
    saveBlob(await toBlob(cardCanvas(c)), fileBase(c) + '.png');
  }

  async function downloadZip() {
    const list = codesList();
    if (!list.length) return toast('Không có khách nào để tải', 'err');
    if (typeof JSZip === 'undefined') return toast('Chưa tải được thư viện nén ZIP, kiểm tra mạng', 'err');
    const btn = $('#zipBtn');
    btn.disabled = true;
    try {
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        btn.textContent = `Đang tạo ảnh ${i + 1}/${list.length}…`;
        zip.file(fileBase(list[i]) + '.png', await toBlob(cardCanvas(list[i])));
        if (i % 10 === 9) await sleep(0);
      }
      btn.textContent = 'Đang nén…';
      saveBlob(await zip.generateAsync({ type: 'blob' }), `ma-vach-khach-hang-${stamp()}.zip`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Tải tất cả ảnh (.zip)';
    }
  }

  // Khổ giấy khi in được đặt động: A4 cho thẻ, LABEL_W × LABEL_H mm cho tem
  function setPageStyle(css) {
    let el = $('#pageStyle');
    if (!el) {
      el = document.createElement('style');
      el.id = 'pageStyle';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function printCards() {
    const list = codesList();
    if (!list.length) return toast('Không có khách nào để in', 'err');
    setPageStyle('@page { size: A4; margin: 10mm; }');
    const area = $('#printArea');
    area.className = 'print-area mode-a4';
    const ev = [CFG.ORG_NAME, CFG.EVENT_NAME].filter(Boolean).join(' · ');
    area.innerHTML = list.map((c) => `<div class="p-card"><div class="p-event">${esc(ev)}</div><div class="p-name">${esc(c.name || c.code)}</div><svg></svg></div>`).join('');
    $$('.p-card svg', area).forEach((svg, i) => drawBarcode(svg, list[i].code, { width: 2, height: 60, fontSize: 15, margin: 8 }));
    window.print();
  }

  /** In tem nhãn LABEL_W × LABEL_H mm: mỗi khách 1 tem (1 trang), gồm tên + mã vạch + mã KH. */
  function printLabels(list) {
    if (!list.length) return toast('Không có khách nào để in', 'err');
    setPageStyle(`@page { size: ${LABEL_W}mm ${LABEL_H}mm; margin: 0; }
      .print-area .lbl { width: ${LABEL_W}mm; height: ${LABEL_H}mm; }`);
    const area = $('#printArea');
    area.className = 'print-area mode-label';
    area.innerHTML = list.map((c) => `<div class="lbl"><div class="lbl-name">${esc(c.name || c.code)}</div><svg class="lbl-bc"></svg><div class="lbl-code">${esc(c.code)}</div></div>`).join('');
    $$('.lbl-bc', area).forEach((svg, i) => {
      // Vẽ mã vạch không kèm chữ (chữ in riêng bên dưới), rồi kéo giãn vừa khung tem
      if (!drawBarcode(svg, list[i].code, { width: 2, height: 60, displayValue: false, margin: 10 })) return;
      const w = parseFloat(svg.getAttribute('width'));
      const h = parseFloat(svg.getAttribute('height'));
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.removeAttribute('style');
    });
    window.print();
  }

  function exportCSV() {
    const rows = filteredList();
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [S.columns.concat(['Đã check-in', 'Giờ check-in', 'Người check-in'])]
      .concat(rows.map((c) => c.values.concat([c.checked ? 'Có' : 'Chưa', c.time, c.by])));
    const csv = '\uFEFF' + lines.map((r) => r.map(cell).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `checkin-${S.filter}-${stamp()}.csv`);
    toast(`Đã xuất ${rows.length} dòng`);
  }

  // ---------- Âm báo ----------
  let actx = null;
  function beep(kind) {
    if (S.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = kind === 'ok' ? [[1046, 0.14]] : kind === 'dup' ? [[660, 0.11], [0, 0.07], [660, 0.11]] : [[200, 0.4]];
      let t = actx.currentTime;
      for (const [f, d] of seq) {
        if (f) {
          const o = actx.createOscillator();
          const gn = actx.createGain();
          o.type = kind === 'err' ? 'square' : 'sine';
          o.frequency.value = f;
          gn.gain.setValueAtTime(0.18, t);
          gn.gain.exponentialRampToValueAtTime(0.001, t + d);
          o.connect(gn).connect(actx.destination);
          o.start(t); o.stop(t + d);
        }
        t += d;
      }
    } catch (e) { /* trình duyệt chặn âm thanh */ }
  }
  function renderMute() {
    $('#muteBtn').innerHTML = S.muted ? ICON.mute : ICON.sound;
    $('#muteBtn').title = S.muted ? 'Đang tắt âm báo — bấm để bật' : 'Đang bật âm báo — bấm để tắt';
  }

  // ---------- Giao diện chung ----------
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3800);
  }

  function setSync(state) {
    const b = $('#syncBtn');
    b.classList.remove('ok', 'err');
    if (state === 'ok') { b.classList.add('ok'); $('#syncText').textContent = (S.demo ? 'Dữ liệu mẫu · ' : 'Đồng bộ ') + fmtClock(Date.now()); }
    if (state === 'err') { b.classList.add('err'); $('#syncText').textContent = 'Mất kết nối'; }
    if (state === 'busy') { $('#syncText').textContent = 'Đang đồng bộ…'; }
  }

  function switchTab(t) {
    S.tab = t;
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    ['scan', 'list', 'codes'].forEach((x) => $('#tab-' + x).classList.toggle('hidden', x !== t));
    if (t === 'list') renderList();
    if (t === 'codes') renderCodes();
    if (t === 'scan') focusScan();
    updateReady();
  }

  function focusScan() {
    if (S.tab === 'scan' && !$('#app').classList.contains('hidden')) $('#scanInput').focus({ preventScroll: true });
  }

  function isTextField(el) {
    return el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
      (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit'].includes(el.type)));
  }

  function updateReady() {
    const a = document.activeElement;
    const ready = !isTextField(a) || a.id === 'scanInput';
    $('.scanbox').classList.toggle('ready', ready);
    $('#scanReadyText').textContent = ready ? 'Sẵn sàng quét' : 'Đang gõ tìm kiếm — bấm vào đây để quét';
  }

  function show(id) {
    ['loading', 'login', 'app'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id));
  }

  function setLoginMsg(msg, isErr) {
    const el = $('#loginMsg');
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }

  // ---------- Đăng nhập ----------
  function renderGoogleButton() {
    if (!CONFIGURED || !(window.google && google.accounts && google.accounts.id)) return;
    const el = $('#gbtn');
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', width: 280 });
  }

  window.onGsiLoaded = function () {
    if (!CONFIGURED || !(window.google && google.accounts && google.accounts.id)) return;
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID.trim(),
      callback: onCredential,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    renderGoogleButton();
  };

  async function onCredential(resp) {
    setLoginMsg('Đang kiểm tra quyền truy cập…');
    try {
      const d = await api('login', { idToken: resp.credential });
      S.session = d.session;
      store.set('ci_session', d.session);
      enterApp(d.user, d);
    } catch (e) {
      setLoginMsg(errorText(e), true);
    }
  }

  function showLogin(msg, isErr) {
    show('login');
    setLoginMsg(msg, isErr !== false && !!msg);
    if (!CONFIGURED) {
      setLoginMsg('Chưa cấu hình API_URL và GOOGLE_CLIENT_ID trong config.js. Bạn có thể dùng thử với dữ liệu mẫu.', false);
      $('#demoBtn').classList.remove('hidden');
    }
    renderGoogleButton();
  }

  function enterApp(user, data) {
    S.user = user || {};
    $('#userEmail').textContent = S.user.email || '';
    $('#userEmail').title = S.user.name || '';
    const av = $('#avatar');
    if (S.user.picture) { av.src = S.user.picture; av.classList.remove('hidden'); } else av.classList.add('hidden');
    $('#demoBadge').classList.toggle('hidden', !S.demo);
    show('app');
    setData(data);
    showIdle();
    switchTab('scan');
  }

  function logout(msg) {
    store.del('ci_session');
    S.session = null; S.user = null; S.demo = false;
    S.customers = []; S.byCode = new Map(); S.codesSig = '';
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* chưa tải GIS */ }
    showLogin(msg, true);
  }

  // ---------- Chế độ dùng thử (dữ liệu mẫu, không ghi Sheet) ----------
  const DEMO = { rows: null, user: { email: 'nhanvien.demo@gmail.com', name: 'Nhân viên dùng thử', picture: '' } };
  const DEMO_COLUMNS = ['STT', 'Ma KH', 'Tên', 'Area-province-dist Code'];
  const DEMO_NAMES = [
    'CÔNG TY TNHH THIẾT BỊ Y TẾ AN KHANG (MẪU)', 'NHÀ THUỐC MINH CHÂU (MẪU)', 'PHÒNG KHÁM ĐA KHOA SÀI GÒN (MẪU)',
    'CỬA HÀNG DỤNG CỤ Y KHOA HÒA BÌNH (MẪU)', 'NGUYỄN VĂN AN (MẪU)', 'CÔNG TY CP DƯỢC PHƯƠNG NAM (MẪU)',
    'HỘ KINH DOANH NHÀ THUỐC THIỆN TÂM (MẪU)', 'TRẦN THỊ BÌNH (MẪU)', 'CÔNG TY TNHH Y TẾ TÂN TIẾN (MẪU)',
    'NHÀ THUỐC BÌNH AN (MẪU)', 'CÂU LẠC BỘ SỨC KHỎE XANH (MẪU)', 'PHÒNG KHÁM GIA ĐÌNH AN TÂM (MẪU)',
  ];

  function demoInit() {
    DEMO.rows = DEMO_NAMES.map((name, i) => {
      const code = 'DEMO' + String(i + 1).padStart(3, '0');
      return { row: i + 2, code, name, values: [String(i + 1), code, name, `HCM${(i % 2) + 1}.7${60 + i}.${27000 + i * 37}`], checked: false, time: '', ts: 0, by: '' };
    });
    const now = Date.now();
    [1, 4, 7].forEach((k, j) => {
      const r = DEMO.rows[k];
      r.checked = true; r.ts = now - (j + 1) * 6 * 60000; r.time = fmtFull(r.ts); r.by = DEMO.user.email;
    });
  }

  async function demoApi(action, body) {
    await sleep(220);
    if (!DEMO.rows) demoInit();
    const clone = (o) => JSON.parse(JSON.stringify(o));
    if (action === 'data' || action === 'login') return { ok: true, user: DEMO.user, columns: DEMO_COLUMNS, customers: clone(DEMO.rows) };
    const code = normCode(body.code);
    const r = DEMO.rows.find((x) => x.code === code);
    if (!r) return { ok: true, status: 'notfound', code };
    if (action === 'undo') {
      Object.assign(r, { checked: false, time: '', ts: 0, by: '' });
      return { ok: true, status: 'undone', customer: clone(r) };
    }
    if (r.checked) return { ok: true, status: 'duplicate', customer: clone(r) };
    r.checked = true; r.ts = Date.now(); r.time = fmtFull(r.ts); r.by = DEMO.user.email;
    return { ok: true, status: 'ok', customer: clone(r) };
  }

  async function startDemo() {
    S.demo = true;
    S.session = 'demo';
    const d = await demoApi('data', {});
    enterApp(d.user, d);
    toast('Đang dùng thử với dữ liệu mẫu — không ghi vào Google Sheet');
  }

  // ---------- Sự kiện ----------
  function bindEvents() {
    $('#demoBtn').addEventListener('click', startDemo);
    $('#logoutBtn').addEventListener('click', () => {
      if (confirm('Đăng xuất khỏi máy này?')) logout('Đã đăng xuất.');
    });
    $('#syncBtn').addEventListener('click', () => refresh(true));
    $('#muteBtn').addEventListener('click', () => {
      S.muted = !S.muted;
      store.set('ci_muted', S.muted ? '1' : '0');
      renderMute();
      if (!S.muted) beep('ok');
    });
    $$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // Ô quét: máy quét gõ mã + Enter (hoặc Tab)
    const scan = $('#scanInput');
    scan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (e.key === 'Tab' && scan.value.trim())) {
        e.preventDefault();
        const v = scan.value;
        scan.value = '';
        handleScan(v);
      }
    });

    // Tra cứu tay
    $('#lookup').addEventListener('input', renderLookup);
    $('#lookup').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const code = normCode(e.target.value);
      if (S.byCode.has(code)) { e.preventDefault(); e.target.value = ''; renderLookup(); handleScan(code); focusScan(); }
    });

    // Danh sách
    $('#listSearch').addEventListener('input', renderList);
    $$('#filterSeg button').forEach((b) => b.addEventListener('click', () => { S.filter = b.dataset.filter; renderList(); }));
    $('#exportBtn').addEventListener('click', exportCSV);

    // Mã vạch
    let codeTimer = null;
    $('#codeSearch').addEventListener('input', () => { clearTimeout(codeTimer); codeTimer = setTimeout(() => renderCodes(), 200); });
    $('#printBtn').addEventListener('click', printCards);
    if ($('#labelBtn')) $('#labelBtn').addEventListener('click', () => printLabels(codesList()));
    $('#zipBtn').addEventListener('click', downloadZip);
    window.addEventListener('afterprint', () => { $('#printArea').innerHTML = ''; $('#printArea').className = 'print-area'; });

    // Nút hành động trong danh sách / kết quả
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const code = b.dataset.code;
        if (b.dataset.act === 'checkin') handleScan(code);
        if (b.dataset.act === 'undo') doUndo(code);
        if (b.dataset.act === 'png') downloadPng(code);
        if (b.dataset.act === 'label' && S.byCode.has(code)) printLabels([S.byCode.get(code)]);
        return;
      }
      // Bấm vào vùng trống ở tab Check-in -> trả con trỏ về ô quét
      if (S.tab === 'scan' && !isTextField(e.target) && !e.target.closest('button, a, label')) setTimeout(focusScan, 0);
    });

    document.addEventListener('focusin', updateReady);
    document.addEventListener('focusout', () => setTimeout(updateReady, 0));

    // Bắt mã từ máy quét kể cả khi con trỏ không ở ô quét (gõ rất nhanh + Enter)
    const kb = { buf: '', t: 0 };
    document.addEventListener('keydown', (e) => {
      if ($('#app').classList.contains('hidden') || isTextField(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (kb.buf.length >= 3 && now - kb.t < 300) { e.preventDefault(); handleScan(kb.buf); }
        kb.buf = '';
        return;
      }
      if (e.key.length === 1) {
        if (now - kb.t > 120) kb.buf = '';
        kb.buf += e.key;
        kb.t = now;
      }
    });

    // Tự đồng bộ giữa nhiều máy
    setInterval(() => {
      if (document.visibilityState === 'visible' && !$('#app').classList.contains('hidden')) refresh(false);
    }, Math.max(5, Number(CFG.REFRESH_SECONDS) || 20) * 1000);
  }

  // ---------- Khởi động ----------
  async function boot() {
    document.title = 'Check-in · ' + CFG.EVENT_NAME;
    $('#loginOrg').textContent = CFG.ORG_NAME;
    $('#loginEvent').textContent = CFG.EVENT_NAME;
    $('#orgName').textContent = CFG.ORG_NAME;
    $('#eventName').textContent = CFG.EVENT_NAME;
    if ($('#labelBtn')) $('#labelBtn').textContent = `In tem ${LABEL_W}×${LABEL_H}mm`;
    if ($('#labelHint')) $('#labelHint').textContent = `${LABEL_W}×${LABEL_H}mm`;
    renderMute();
    bindEvents();
    if (PARAMS.has('demo')) $('#demoBtn').classList.remove('hidden');

    const saved = store.get('ci_session');
    if (CONFIGURED && saved) {
      S.session = saved;
      try {
        const d = await api('data');
        enterApp(d.user, d);
        return;
      } catch (e) {
        store.del('ci_session');
        S.session = null;
        showLogin(e.code === 'network' ? errorText(e) : '', true);
        return;
      }
    }
    showLogin();
  }

  boot();
})();
