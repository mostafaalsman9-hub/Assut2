/* استيراد حسابات الطلاب من ملف Excel/CSV: للمالك فقط.
 * الحماية الفعلية تظل في Firebase Rules: الكتابة في students للمالك فقط بحالة active.
 */
(function () {
  'use strict';
  var CONFIG = window.PLATFORM_FIREBASE_CONFIG;
  var MAX_ROWS = 300;
  var xlsxPromise = null;
  var dialog = null;
  var running = false;

  var ALIASES = {
    name: ['الاسم', 'اسم الطالب', 'اسم', 'name', 'full name', 'student name'],
    email: ['البريد', 'البريد الالكتروني', 'البريد الإلكتروني', 'الايميل', 'الإيميل', 'ايميل', 'email', 'e-mail', 'mail'],
    phone: ['الهاتف', 'رقم الهاتف', 'التليفون', 'الموبايل', 'رقم الموبايل', 'phone', 'mobile', 'tel'],
    password: ['كلمة المرور', 'الباسورد', 'باسورد', 'password', 'pass'],
    group: ['المجموعة', 'مجموعة', 'group']
  };

  function norm(v) {
    return String(v == null ? '' : v).replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function text(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function isOwner() { return window.__platformOwnerVerified === true; }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) {
      xlsxPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = './xlsx.full.min.js?v=1';
        s.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('xlsx')); };
        s.onerror = function () { xlsxPromise = null; reject(new Error('xlsx')); };
        document.head.appendChild(s);
      });
    }
    return xlsxPromise;
  }

  function getDb() {
    var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CONFIG);
    return { app: app, db: app.database() };
  }

  function genPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var out = '';
    var buf = new Uint32Array(10);
    window.crypto.getRandomValues(buf);
    for (var i = 0; i < 10; i++) out += chars[buf[i] % chars.length];
    return out;
  }

  function styles() {
    if (document.getElementById('student-import-style')) return;
    var st = document.createElement('style');
    st.id = 'student-import-style';
    st.textContent =
      '.si-bar{margin:0 0 14px;display:flex;gap:8px;flex-wrap:wrap}' +
      '.si-bar .button{flex:0 1 auto}' +
      '.si-dialog{border:0;padding:0;border-radius:16px;width:min(920px,96vw);max-height:92vh;direction:rtl;font-family:inherit;box-shadow:0 20px 60px #0004}' +
      '.si-dialog::backdrop{background:#0008}' +
      '.si-wrap{padding:18px;display:flex;flex-direction:column;gap:12px;max-height:92vh;overflow:auto}' +
      '.si-wrap h2{margin:0;font-size:18px;color:#173f3d}' +
      '.si-wrap p,.si-wrap li{font-size:12.5px;color:#4d6865;line-height:1.9;margin:0}' +
      '.si-wrap ul{margin:0;padding:0 18px}' +
      '.si-row{display:flex;gap:8px;flex-wrap:wrap}.si-row .button{flex:1;min-width:140px}' +
      '.si-table{overflow:auto;border:1px solid #dae7e5;border-radius:10px;max-height:300px}' +
      '.si-table table{width:100%;border-collapse:collapse;font-size:12px;min-width:620px}' +
      '.si-table th,.si-table td{padding:6px 8px;border-bottom:1px solid #eef3f2;text-align:right;white-space:nowrap}' +
      '.si-table th{background:#f3f8f7;position:sticky;top:0}' +
      '.si-ok{color:#15766b;font-weight:700}.si-bad{color:#a64d3f;font-weight:700}.si-warn{color:#9a6b12;font-weight:700}' +
      '.si-sum{font-size:13px;font-weight:700;color:#173f3d;line-height:1.8}' +
      '.si-rows{display:flex;flex-direction:column;gap:10px;max-height:46vh;overflow:auto;padding:2px}' +
      '.si-mrow{display:grid;grid-template-columns:1.2fr 1.4fr 1.2fr 1fr auto;gap:8px;align-items:center;padding:10px;border:1px solid #dae7e5;border-radius:12px;background:#fbfdfd;position:relative}' +
      '.si-mrow.bad{border-color:#d9776a;background:#fff6f4}' +
      '.si-mrow input,.si-mrow select{width:100%;min-width:0;padding:9px 10px;border:1px solid #cddcde;border-radius:10px;font-size:13px;font-family:inherit}' +
      '@media(max-width:720px){.si-mrow{grid-template-columns:1fr}.si-mrow::before{content:"طالب " attr(data-n);font-size:12px;font-weight:800;color:#0f766e}}' +
      '.si-bar-wrap{height:8px;border-radius:6px;background:#e5eeed;overflow:hidden}.si-bar-in{height:100%;width:0;background:#15766b;transition:width .2s}';
    document.head.appendChild(st);
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadTemplate() {
    loadXlsx().then(function (X) {
      var ws = X.utils.aoa_to_sheet([
        ['الاسم', 'البريد الإلكتروني', 'الهاتف', 'كلمة المرور', 'المجموعة'],
        ['أحمد محمد علي', 'ahmed@example.com', '01000000000', '', '']
      ]);
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'الطلاب');
      X.writeFile(wb, 'قالب-استيراد-الطلاب.xlsx');
    }).catch(function () { alert('تعذر تحميل مكتبة Excel. تأكد من الاتصال بالإنترنت.'); });
  }

  function readContext() {
    var f = getDb();
    return Promise.all([f.db.ref('students').once('value'), f.db.ref('groups').once('value')]).then(function (s) {
      var students = s[0].val() || {}, groups = s[1].val() || {};
      var emails = {};
      Object.keys(students).forEach(function (k) { if (students[k] && students[k].email) emails[String(students[k].email).toLowerCase()] = true; });
      var glist = Object.keys(groups).map(function (id) { return { id: id, name: groups[id].name || '', schoolId: groups[id].schoolId || '' }; });
      return { emails: emails, groups: glist };
    });
  }

  function mapColumns(headerRow) {
    var map = {};
    headerRow.forEach(function (h, i) {
      var n = norm(h);
      Object.keys(ALIASES).forEach(function (key) {
        if (map[key] != null) return;
        if (ALIASES[key].some(function (a) { return norm(a) === n; })) map[key] = i;
      });
    });
    return map;
  }

  function parseRows(aoa, ctx) {
    var rows = [];
    if (!aoa.length) return { error: 'الملف فاضي.' };
    var headerIndex = 0;
    for (var i = 0; i < Math.min(aoa.length, 5); i++) {
      var m = mapColumns(aoa[i].map(text));
      if (m.name != null && m.email != null) { headerIndex = i; break; }
    }
    var map = mapColumns(aoa[headerIndex].map(text));
    if (map.name == null || map.email == null) return { error: 'لازم الصف الأول يحتوي على عمودين على الأقل: الاسم والبريد الإلكتروني.' };
    var seen = {};
    for (var r = headerIndex + 1; r < aoa.length; r++) {
      var line = aoa[r];
      if (!line || line.every(function (c) { return text(c) === ''; })) continue;
      var row = {
        line: r + 1,
        name: text(line[map.name]),
        email: text(line[map.email]).toLowerCase(),
        phone: map.phone != null ? text(line[map.phone]) : '',
        password: map.password != null ? String(line[map.password] == null ? '' : line[map.password]).trim() : '',
        groupName: map.group != null ? text(line[map.group]) : '',
        errors: [], warnings: [], group: null, generated: false
      };
      if (row.phone && /^\d{9,10}$/.test(row.phone) && row.phone[0] !== '0') row.phone = '0' + row.phone;
      if (!row.name) row.errors.push('الاسم ناقص');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.errors.push('البريد غير صحيح');
      if (row.password && row.password.length < 6) row.errors.push('كلمة المرور أقل من 6');
      if (!row.password) { row.password = genPassword(); row.generated = true; }
      if (row.email && seen[row.email]) row.errors.push('مكرر داخل الملف');
      if (row.email) seen[row.email] = true;
      if (row.email && ctx.emails[row.email]) row.errors.push('الطالب موجود بالفعل');
      if (row.groupName) {
        var g = ctx.groups.filter(function (x) { return norm(x.name) === norm(row.groupName); });
        if (g.length === 1) row.group = g[0]; else row.warnings.push(g.length ? 'مجموعتين بنفس الاسم' : 'المجموعة غير موجودة');
      }
      rows.push(row);
    }
    if (!rows.length) return { error: 'مفيش صفوف بيانات تحت العناوين.' };
    if (rows.length > MAX_ROWS) return { error: 'الحد الأقصى ' + MAX_ROWS + ' طالب في المرة الواحدة.' };
    return { rows: rows };
  }

  function createStudents(rows, onProgress) {
    var f = getDb();
    var secondary = window.firebase.initializeApp(CONFIG, 'import-' + Date.now());
    var sAuth = secondary.auth();
    var results = [];
    var chain = Promise.resolve();
    rows.forEach(function (row, idx) {
      chain = chain.then(function () {
        var res = { row: row, status: '', uid: '' };
        return sAuth.createUserWithEmailAndPassword(row.email, row.password).then(function (cred) {
          var user = cred.user;
          res.uid = user.uid;
          return user.updateProfile({ displayName: row.name }).catch(function () {}).then(function () {
            var rec = { name: row.name, email: row.email, phone: row.phone, status: 'active', createdAt: Date.now() };
            if (row.group) { rec.groupId = row.group.id; rec.schoolId = row.group.schoolId || ''; }
            return f.db.ref('students/' + user.uid).set(rec);
          }).then(function () {
            res.status = 'created';
          }).catch(function (e) {
            res.status = 'failed: ' + (e && e.code || 'db');
            return user.delete().catch(function () {});
          });
        }).catch(function (e) {
          var code = e && e.code || '';
          res.status = code === 'auth/email-already-in-use' ? 'skipped: البريد مسجل في Firebase بالفعل' : 'failed: ' + code;
        }).then(function () {
          return sAuth.signOut().catch(function () {});
        }).then(function () {
          results.push(res);
          onProgress(idx + 1, rows.length);
          return new Promise(function (r) { setTimeout(r, 350); });
        });
      });
    });
    return chain.then(function () {
      return secondary.delete().catch(function () {});
    }).then(function () { return results; });
  }

  function resultsFile(results) {
    var X = window.XLSX;
    var aoa = [['الاسم', 'البريد الإلكتروني', 'كلمة المرور', 'المجموعة', 'النتيجة']];
    results.forEach(function (r) {
      aoa.push([r.row.name, r.row.email, r.status === 'created' ? r.row.password : '', r.row.group ? r.row.group.name : '', r.status]);
    });
    var ws = X.utils.aoa_to_sheet(aoa);
    var wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'النتائج');
    X.writeFile(wb, 'نتيجة-استيراد-الطلاب.xlsx');
  }

  function openDialog() {
    styles();
    if (dialog) dialog.remove();
    dialog = document.createElement('dialog');
    dialog.className = 'si-dialog';
    var wrap = el('div', 'si-wrap');
    wrap.appendChild(el('h2', '', 'استيراد الطلاب من Excel'));
    var info = el('ul');
    ['الصف الأول عناوين الأعمدة: الاسم، البريد الإلكتروني (إجباريين). الهاتف، كلمة المرور، المجموعة (اختياريين).',
     'لو كلمة المرور فاضية بيتولد باسورد قوي لكل طالب، وهيظهر في ملف النتيجة اللي بتحمله بعد الإنشاء (مش بيتحفظ في أي مكان تاني).',
     'اسم المجموعة لازم يطابق مجموعة موجودة. الطلاب بيتفعلوا على طول. بدون مجموعة بيتفعلوا من غير ربط.',
     'الطالب الموجود بالفعل (نفس البريد) بيتم تخطيه. الحد الأقصى ' + MAX_ROWS + ' طالب.'].forEach(function (t) { info.appendChild(el('li', '', t)); });
    wrap.appendChild(info);
    var row1 = el('div', 'si-row');
    var tplBtn = el('button', 'button', 'تحميل قالب Excel'); tplBtn.type = 'button';
    var fileLabel = el('label', 'button primary', 'اختيار ملف Excel أو CSV'); fileLabel.style.position = 'relative'; fileLabel.style.cursor = 'pointer';
    var file = document.createElement('input'); file.type = 'file'; file.accept = '.xlsx,.xls,.csv'; file.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0 0 0 0)'; file.id = 'si-file';
    fileLabel.appendChild(file);
    var closeBtn = el('button', 'button', 'إغلاق'); closeBtn.type = 'button';
    row1.appendChild(tplBtn); row1.appendChild(fileLabel); row1.appendChild(closeBtn);
    wrap.appendChild(row1);
    var msg = el('div', 'si-sum');
    var tableBox = el('div', 'si-table'); tableBox.hidden = true;
    var progress = el('div', 'si-bar-wrap'); progress.hidden = true;
    var progressIn = el('div', 'si-bar-in'); progress.appendChild(progressIn);
    var go = el('button', 'button primary', 'إنشاء الحسابات'); go.type = 'button'; go.hidden = true;
    wrap.appendChild(msg); wrap.appendChild(tableBox); wrap.appendChild(progress); wrap.appendChild(go);
    dialog.appendChild(wrap);
    document.body.appendChild(dialog);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');

    var parsed = null;
    tplBtn.addEventListener('click', downloadTemplate);
    closeBtn.addEventListener('click', function () { if (!running) dialog.close(); });
    dialog.addEventListener('cancel', function (e) { if (running) e.preventDefault(); });

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      msg.textContent = 'جاري قراءة الملف...'; tableBox.hidden = true; go.hidden = true;
      Promise.all([loadXlsx(), f.arrayBuffer(), readContext()]).then(function (a) {
        var X = a[0];
        var wb = X.read(a[1], { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var aoa = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        parsed = parseRows(aoa, a[2]);
        if (parsed.error) { msg.textContent = parsed.error; msg.className = 'si-sum si-bad'; return; }
        render(parsed.rows);
      }).catch(function (e) {
        console.error('student-import', e);
        msg.className = 'si-sum si-bad';
        msg.textContent = 'تعذر قراءة الملف. تأكد إنه Excel (xlsx/xls) أو CSV. (' + (e && (e.message || e.code) || 'error') + ')';
      });
    });

    function render(rows) {
      var ok = rows.filter(function (r) { return !r.errors.length; });
      msg.className = 'si-sum';
      msg.textContent = 'صالح للإنشاء: ' + ok.length + ' من ' + rows.length + (rows.length - ok.length ? ' (الباقي هيتخطى)' : '');
      tableBox.hidden = false; tableBox.textContent = '';
      var t = el('table'); var h = el('tr');
      ['#', 'الاسم', 'البريد', 'الهاتف', 'المجموعة', 'الباسورد', 'الحالة'].forEach(function (x) { h.appendChild(el('th', '', x)); });
      t.appendChild(h);
      rows.forEach(function (r) {
        var tr = el('tr');
        [r.line, r.name, r.email, r.phone, r.group ? r.group.name : (r.groupName || '-'), r.generated ? 'تلقائي' : 'من الملف'].forEach(function (x) { tr.appendChild(el('td', '', String(x))); });
        var st = r.errors.length ? el('td', 'si-bad', r.errors.join('، ')) : el('td', r.warnings.length ? 'si-warn' : 'si-ok', r.warnings.length ? 'جاهز (' + r.warnings.join('، ') + ')' : 'جاهز');
        tr.appendChild(st); t.appendChild(tr);
      });
      tableBox.appendChild(t);
      go.hidden = !ok.length;
      go.textContent = 'إنشاء ' + ok.length + ' حساب';
      go.onclick = function () {
        if (running || !isOwner()) return;
        if (!window.confirm('هيتم إنشاء ' + ok.length + ' حساب طالب حقيقي. تأكيد؟')) return;
        running = true; go.disabled = true; file.disabled = true; progress.hidden = false;
        createStudents(ok, function (d, total) {
          progressIn.style.width = Math.round(d / total * 100) + '%';
          msg.textContent = 'جاري الإنشاء ' + d + ' / ' + total;
        }).then(function (results) {
          running = false;
          var created = results.filter(function (r) { return r.status === 'created'; }).length;
          msg.className = 'si-sum si-ok';
          msg.textContent = 'تم إنشاء ' + created + ' من ' + results.length + '. جاري تحميل ملف النتيجة (فيه كلمات المرور).';
          try { resultsFile(results); } catch (e) {}
          go.hidden = true;
        });
      };
    }
  }


  /* إضافة عدة طلاب يدويا: صفوف تحت بعض، إنشاء الحسابات وحفظ Excel */
  function openMulti() {
    styles();
    if (dialog) dialog.remove();
    dialog = document.createElement('dialog');
    dialog.className = 'si-dialog';
    var wrap = el('div', 'si-wrap');
    wrap.appendChild(el('h2', '', 'إضافة عدة طلاب'));
    wrap.appendChild(el('p', '', 'اكتب كل طالب في صف: الاسم والبريد الإلكتروني وكلمة المرور (لو فاضية بتتولد تلقائياً). المجموعة اختيارية. بعد الإنشاء ينزل ملف Excel فيه الحسابات.'));
    var rowsBox = el('div', 'si-rows');
    var msg = el('div', 'si-sum');
    var progress = el('div', 'si-bar-wrap'); progress.hidden = true;
    var progressIn = el('div', 'si-bar-in'); progress.appendChild(progressIn);
    var groups = [];
    var actions = el('div', 'si-row');
    var addBtn = el('button', 'button', '+ إضافة صف'); addBtn.type = 'button';
    var addFive = el('button', 'button', '+ 5 صفوف'); addFive.type = 'button';
    var saveList = el('button', 'button', 'حفظ القائمة كـ Excel'); saveList.type = 'button';
    var go = el('button', 'button primary', 'إنشاء الحسابات وحفظ Excel'); go.type = 'button';
    var closeBtn = el('button', 'button', 'إغلاق'); closeBtn.type = 'button';
    [addBtn, addFive, saveList, go, closeBtn].forEach(function (b) { actions.appendChild(b); });
    wrap.appendChild(rowsBox); wrap.appendChild(actions); wrap.appendChild(msg); wrap.appendChild(progress);
    dialog.appendChild(wrap);
    document.body.appendChild(dialog);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');

    function addRow() {
      var r = el('div', 'si-mrow');
      var n = document.createElement('input'); n.placeholder = 'الاسم'; n.setAttribute('aria-label', 'الاسم'); n.autocomplete = 'off';
      var em = document.createElement('input'); em.type = 'email'; em.placeholder = 'البريد الإلكتروني'; em.dir = 'ltr'; em.setAttribute('aria-label', 'البريد'); em.autocomplete = 'off';
      var pw = document.createElement('input'); pw.placeholder = 'كلمة المرور (تلقائي لو فاضي)'; pw.dir = 'ltr'; pw.setAttribute('aria-label', 'كلمة المرور'); pw.autocomplete = 'off';
      var g = document.createElement('select'); g.setAttribute('aria-label', 'المجموعة');
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'بدون مجموعة'; g.appendChild(o0);
      groups.forEach(function (x) { var o = document.createElement('option'); o.value = x.name; o.textContent = x.name; g.appendChild(o); });
      var del = el('button', 'button small danger', 'حذف'); del.type = 'button';
      del.addEventListener('click', function () { if (rowsBox.children.length > 1) r.remove(); else { n.value = em.value = pw.value = ''; } renumber(); });
      [n, em, pw, g, del].forEach(function (x) { r.appendChild(x); });
      rowsBox.appendChild(r); renumber();
      return n;
    }
    function renumber() { Array.prototype.forEach.call(rowsBox.children, function (r, i) { r.setAttribute('data-n', String(i + 1)); }); }
    function collect() {
      var aoa = [['الاسم', 'البريد الإلكتروني', 'الهاتف', 'كلمة المرور', 'المجموعة']];
      var map = [];
      Array.prototype.forEach.call(rowsBox.children, function (r, i) {
        var v = r.querySelectorAll('input,select');
        var line = [v[0].value, v[1].value, '', v[2].value, v[3].value];
        if (line.every(function (c) { return text(c) === ''; })) return;
        aoa.push(line); map.push(i + 1);
      });
      return { aoa: aoa, map: map };
    }
    readContext().then(function (c) { groups = c.groups; Array.prototype.forEach.call(rowsBox.querySelectorAll('select'), function (sel) { groups.forEach(function (x) { var o = document.createElement('option'); o.value = x.name; o.textContent = x.name; sel.appendChild(o); }); }); }).catch(function () {});
    addRow(); addRow(); addRow();
    addBtn.addEventListener('click', function () { addRow().focus(); });
    addFive.addEventListener('click', function () { for (var i = 0; i < 5; i++) addRow(); });
    closeBtn.addEventListener('click', function () { if (!running) dialog.close(); });
    dialog.addEventListener('cancel', function (e) { if (running) e.preventDefault(); });
    saveList.addEventListener('click', function () {
      var c = collect();
      if (c.aoa.length < 2) { msg.className = 'si-sum si-bad'; msg.textContent = 'مفيش بيانات تتحفظ.'; return; }
      loadXlsx().then(function (X) {
        var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(c.aoa), 'الطلاب'); X.writeFile(wb, 'قائمة-الطلاب.xlsx');
      });
    });
    go.addEventListener('click', function () {
      if (running || !isOwner()) return;
      var c = collect();
      if (!c.aoa.length || c.aoa.length < 2) { msg.className = 'si-sum si-bad'; msg.textContent = 'أضف طالب واحد على الأقل.'; return; }
      msg.className = 'si-sum'; msg.textContent = 'جاري التحقق...';
      Promise.all([loadXlsx(), readContext()]).then(function (a) {
        var parsed = parseRows(c.aoa, a[1]);
        if (parsed.error) { msg.className = 'si-sum si-bad'; msg.textContent = parsed.error; return; }
        var bad = [];
        Array.prototype.forEach.call(rowsBox.children, function (r) { r.classList.remove('bad'); });
        parsed.rows.forEach(function (row, i) {
          var rowEl = rowsBox.children[c.map[i] - 1];
          if (row.errors.length) { bad.push('صف ' + c.map[i] + ': ' + row.errors.join('، ')); if (rowEl) rowEl.classList.add('bad'); }
        });
        if (bad.length) { msg.className = 'si-sum si-bad'; msg.textContent = 'صحح الأخطاء الأول: ' + bad.join(' | '); return; }
        if (!window.confirm('هيتم إنشاء ' + parsed.rows.length + ' حساب طالب حقيقي. تأكيد؟')) return;
        running = true; go.disabled = true; progress.hidden = false;
        return createStudents(parsed.rows, function (d, total) {
          progressIn.style.width = Math.round(d / total * 100) + '%';
          msg.className = 'si-sum'; msg.textContent = 'جاري الإنشاء ' + d + ' / ' + total;
        }).then(function (results) {
          running = false; go.disabled = false;
          var created = results.filter(function (r) { return r.status === 'created'; }).length;
          var failed = results.filter(function (r) { return r.status !== 'created'; });
          msg.className = failed.length ? 'si-sum si-warn' : 'si-sum si-ok';
          msg.textContent = 'تم إنشاء ' + created + ' من ' + results.length + (failed.length ? ' | لم يتم: ' + failed.map(function (r) { return r.row.email + ' (' + r.status + ')'; }).join('، ') : '') + '. تم تحميل ملف Excel بالنتيجة.';
          try { resultsFile(results); } catch (e) {}
        });
      }).catch(function (e) { running = false; go.disabled = false; msg.className = 'si-sum si-bad'; msg.textContent = 'حصل خطأ: ' + (e && (e.message || e.code) || 'error'); });
    });
  }

  function inject() {
    if (!isOwner()) { var old = document.querySelector('.si-bar'); if (old) old.remove(); return; }
    var h1 = document.querySelector('.page-heading h1');
    var existing = document.querySelector('.si-bar');
    if (!h1 || text(h1.textContent) !== 'الطلاب') { if (existing) existing.remove(); return; }
    if (existing) return;
    styles();
    var bar = el('div', 'si-bar');
    var btn = el('button', 'button', 'استيراد طلاب من Excel'); btn.type = 'button';
    btn.addEventListener('click', openDialog);
    var btn2 = el('button', 'button primary', 'إضافة عدة طلاب'); btn2.type = 'button';
    btn2.addEventListener('click', openMulti);
    bar.appendChild(btn2);
    bar.appendChild(btn);
    var heading = h1.closest('.page-heading');
    heading.parentNode.insertBefore(bar, heading.nextSibling);
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(inject, 80); }
  function start() {
    var root = document.getElementById('root') || document.body;
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    window.addEventListener('platform-owner-status', schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
