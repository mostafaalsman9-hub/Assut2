/* fs-adapter.js
 * طبقة وصول للبيانات تدعم وضعين بنفس الواجهة:
 *   rtdb : Firebase Realtime Database (الوضع الحالي، سلوك مطابق)
 *   fs   : Cloud Firestore مع تخزين مؤقت لتقليل القراءات
 * يتم اختيار الوضع من window.__DB_MODE (الافتراضي rtdb).
 */
(function (global) {
  'use strict';

  var FS_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';

  function getApp(fb) {
    if (!fb.apps) return fb; // اختبارات
    return fb.apps.length ? fb.app() : fb.initializeApp(global.PLATFORM_FIREBASE_CONFIG);
  }

  function seg(p) { return String(p || '').split('/').filter(Boolean); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function Snap(key, val) { this.key = key; this._v = val === undefined ? null : val; }
  Snap.prototype.val = function () { return clone(this._v); };
  Snap.prototype.exists = function () { return this._v !== null && this._v !== undefined; };
  Snap.prototype.child = function (p) {
    var cur = this._v;
    seg(p).forEach(function (k) { cur = cur && typeof cur === 'object' ? cur[k] : null; });
    var parts = seg(p);
    return new Snap(parts[parts.length - 1] || null, cur === undefined ? null : cur);
  };
  Snap.prototype.forEach = function (cb) {
    var v = this._v;
    if (!v || typeof v !== 'object') return false;
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length; i++) {
      if (cb(new Snap(keys[i], v[keys[i]])) === true) return true;
    }
    return false;
  };

  function Ref(path, api) {
    this.path = seg(path).join('/');
    var p = seg(path);
    this.key = p.length ? p[p.length - 1] : null;
    this._api = api;
  }
  Ref.prototype.child = function (p) { return new Ref(this.path + '/' + seg(p).join('/'), this._api); };
  Ref.prototype.once = function () { return this._api.get(this); };
  Ref.prototype.set = function (v) { return this._api.set(this, v); };
  Ref.prototype.remove = function () { return this._api.set(this, null); };
  Ref.prototype.update = function (m) { return this._api.update(this, m); };
  Ref.prototype.push = function () { return this._api.push(this); };

  /* ---------- معرّف مرتب زمنياً (مثل push في RTDB) ---------- */
  var lastTs = 0, lastRand = [];
  var CH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  function pushId() {
    var now = Date.now(), dup = now === lastTs; lastTs = now;
    var ts = new Array(8), i;
    for (i = 7; i >= 0; i--) { ts[i] = CH.charAt(now % 64); now = Math.floor(now / 64); }
    var id = ts.join('');
    if (!dup) { for (i = 0; i < 12; i++) lastRand[i] = Math.floor(Math.random() * 64); }
    else { for (i = 11; i >= 0 && lastRand[i] === 63; i--) lastRand[i] = 0; if (i >= 0) lastRand[i]++; }
    for (i = 0; i < 12; i++) id += CH.charAt(lastRand[i]);
    return id;
  }

  /* ================= وضع RTDB ================= */
  function rtdbApi(env) {
    var api = { mode: 'rtdb' };
    function app() { return getApp(env.firebase); }
    function dbi() { return app().database(); }
    // الـ compat يستعيد جلسته بعد المودولار بقليل: ننتظر المستخدم قبل أي قراءة غير عامة
    function authReady(path) {
      var a = app().auth();
      if (seg(path)[0] === 'owner' || a.currentUser) return Promise.resolve();
      if (!global.localStorage || !global.localStorage.getItem('assut_session')) return Promise.resolve();
      return new Promise(function (res) {
        var done = false, un = null;
        var t = setTimeout(function () { if (!done) { done = true; un && un(); res(); } }, 6000);
        un = a.onAuthStateChanged(function (u) { if (u && !done) { done = true; clearTimeout(t); un && un(); res(); } });
      });
    }
    function rf(ref) { return ref.path ? dbi().ref(ref.path) : dbi().ref(); }
    api.ref = function (p) { return new Ref(p, api); };
    api.get = function (ref) { return authReady(ref.path).then(function () { return rf(ref).once('value'); }).then(function (s) { return new Snap(ref.key, s.val()); }); };
    api.onValue = function (ref, cb, err) {
      var dead = false, off = null;
      authReady(ref.path).then(function () {
        if (dead) return;
        var r = rf(ref);
        var h = r.on('value', function (s) { cb(new Snap(ref.key, s.val())); }, err);
        off = function () { r.off('value', h); };
      });
      return function () { dead = true; if (off) off(); };
    };
    api.set = function (ref, v) { return authReady(ref.path).then(function () { return rf(ref).set(v === undefined ? null : v); }); };
    api.remove = function (ref) { return authReady(ref.path).then(function () { return rf(ref).remove(); }); };
    api.push = function (ref) { var k = rf(ref).push().key; return new Ref(ref.path + '/' + k, api); };
    api.update = function (ref, m) { return authReady('x').then(function () { return rf(ref).update(m); }); };
    api.transaction = function (ref, fn) {
      return authReady(ref.path).then(function () { return rf(ref).transaction(fn); }).then(function (r) { return { committed: r.committed, snapshot: new Snap(ref.key, r.snapshot.val()) }; });
    };
    api.refresh = function () {};
    api.dbFor = function (app) { return app.database(); };
    return api;
  }

  /* ================= وضع Firestore ================= */
  var TTL = { // بالدقائق
    latestNotif: 1, owner: 30, ownerExperience: 5, ownerExcelReports: 30,
    schools: 30, groups: 30, subjects: 30,
    admins: 10, students: 10, grades: 10, attendance: 10,
    notifications: 3, notifRead: 5, deletedAccounts: 5
  };
  var BUNDLE = { latestNotif: 1, schools: 1, groups: 1, subjects: 1, owner: 1, ownerExperience: 1, ownerExcelReports: 1 };
  var COLL = { admins: 1, students: 1, grades: 1, notifications: 1, notifRead: 1, deletedAccounts: 1 };
  var NOTIF_LIMIT = 50;

  // يحوّل مساراً إلى موضع في Firestore
  function locate(parts) {
    var top = parts[0];
    if (BUNDLE[top]) return { col: 'meta', doc: top, field: parts.slice(1) };
    if (COLL[top]) return { col: top, doc: parts[1] || null, field: parts.slice(2) };
    if (top === 'attendance') {
      var g = parts[1], d = parts[2];
      if (!g) return { col: 'attendance', doc: null, field: [] };
      if (!d) return { col: 'attendance', doc: null, group: g, field: [] };
      var mo = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : 'legacy';
      return { col: 'attendance', doc: g + '~' + mo, group: g, month: mo, field: ['d', d].concat(parts.slice(3)) };
    }
    throw new Error('مسار غير مدعوم: ' + parts.join('/'));
  }

  function clean(v) {
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v)) { var o = {}; v.forEach(function (x, i) { var c = clean(x); if (c !== undefined) o[i] = c; }); return Object.keys(o).length ? o : undefined; }
    if (typeof v === 'object') {
      var r = {}, n = 0;
      Object.keys(v).forEach(function (k) { var c = clean(v[k]); if (c !== undefined) { r[k] = c; n++; } });
      return n ? r : undefined;
    }
    return v;
  }
  function nest(fields, val) { var o = val; for (var i = fields.length - 1; i >= 0; i--) { var t = {}; t[fields[i]] = o; o = t; } return o; }
  function getIn(obj, fields) {
    var cur = obj;
    for (var i = 0; i < fields.length; i++) { if (cur === null || cur === undefined || typeof cur !== 'object') return null; cur = cur[fields[i]]; }
    return cur === undefined ? null : cur;
  }
  function setIn(obj, fields, val) {
    if (!fields.length) return val;
    var root = (obj && typeof obj === 'object') ? obj : {};
    var cur = root;
    for (var i = 0; i < fields.length - 1; i++) {
      if (!cur[fields[i]] || typeof cur[fields[i]] !== 'object') { if (val === null) return root; cur[fields[i]] = {}; }
      cur = cur[fields[i]];
    }
    var last = fields[fields.length - 1];
    if (val === null || val === undefined) delete cur[last]; else cur[last] = val;
    return root;
  }

  function fsApi(env) {
    var api = { mode: 'fs' };
    var fb = env.firebase;
    var store = env.localStorage;
    var mem = {};           // path -> {t, v}
    var listeners = [];     // {path, cb, err, last}
    var sdkPromise = null;
    var roleCache = {};

    function loadSdk() {
      if (fb.firestore) return Promise.resolve();
      if (sdkPromise) return sdkPromise;
      sdkPromise = new Promise(function (res, rej) {
        var s = env.document.createElement('script');
        s.src = FS_SDK; s.onload = res; s.onerror = function () { rej(new Error('تعذر تحميل Firestore')); };
        env.document.head.appendChild(s);
      });
      return sdkPromise;
    }
    var fsInst = null;
    function fsdb() {
      return loadSdk().then(function () {
        if (!fsInst) {
          fsInst = getApp(fb).firestore();
          try { fsInst.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
        }
        return fsInst;
      });
    }
    function curUser() { var a = getApp(fb).auth(); return a && a.currentUser; }
    function authReady() {
      if (curUser()) return Promise.resolve(curUser());
      return new Promise(function (res) {
        var done = false, un = null;
        var t = setTimeout(function () { if (!done) { done = true; if (un) un(); res(null); } }, 8000);
        un = getApp(fb).auth().onAuthStateChanged(function (u) { if (u && !done) { done = true; clearTimeout(t); un && un(); res(u); } });
      });
    }
    function uid() { var u = curUser(); return u ? u.uid : 'anon'; }

    /* ---------- التخزين المؤقت ---------- */
    function ttlFor(path) { var t = TTL[seg(path)[0]]; return (t === undefined ? 5 : t) * 60000; }
    function ck(path) { return 'fsc1:' + uid() + ':' + path; }
    function cacheGet(path, ignoreAge) {
      var e = mem[ck(path)];
      if (!e && store) {
        try { var raw = store.getItem(ck(path)); if (raw) { e = JSON.parse(raw); mem[ck(path)] = e; } } catch (x) {}
      }
      if (!e) return null;
      if (!ignoreAge && Date.now() - e.t > ttlFor(path)) return null;
      return e;
    }
    // التخزين الدائم (للعمل بدون إنترنت) للطالب فقط. المالك والمسؤول: ذاكرة الجلسة فقط
    function isStudentSync() {
      var u = uid();
      if (roleCache[u]) return roleCache[u] === 'student';
      try { return !!store && store.getItem('assut_role:' + u) === 'student'; } catch (x) { return false; }
    }
    function cachePut(path, v, t, f) {
      var now = Date.now();
      var e = { t: t || now, f: f || now, v: v === undefined ? null : v };
      mem[ck(path)] = e;
      if (store && isStudentSync()) { try { store.setItem(ck(path), JSON.stringify(e)); } catch (x) { /* ممتلئ */ } }
    }
    function flushOrWipe(role) {
      var prefix = 'fsc1:' + uid() + ':';
      if (!store) return;
      try {
        store.setItem('assut_role:' + uid(), role);
        if (role === 'student') { Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix) === 0) { try { store.setItem(k, JSON.stringify(mem[k])); } catch (x) {} } }); }
        else { var del = []; for (var i = 0; i < store.length; i++) { var k = store.key(i); if (k && k.indexOf(prefix) === 0) del.push(k); } del.forEach(function (k) { store.removeItem(k); }); }
      } catch (x) {}
    }
    function allCacheKeys() {
      var prefix = 'fsc1:' + uid() + ':', keys = {};
      Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix) === 0) keys[k.slice(prefix.length)] = 1; });
      if (store) { try { for (var i = 0; i < store.length; i++) { var k = store.key(i); if (k && k.indexOf(prefix) === 0) keys[k.slice(prefix.length)] = 1; } } catch (x) {} }
      return Object.keys(keys);
    }
    // تطبيق كتابة محلية على المخزن المؤقت ليظهر أثرها فوراً دون قراءة جديدة
    function applyLocal(path, val) {
      var P = seg(path), v = val === undefined ? null : val;
      allCacheKeys().forEach(function (key) {
        var K = seg(key), e = cacheGet(key, true);
        if (!e) return;
        var n = Math.min(K.length, P.length), same = true;
        for (var i = 0; i < n; i++) if (K[i] !== P[i]) { same = false; break; }
        if (!same) return;
        if (P.length >= K.length) { e.v = setIn(e.v, P.slice(K.length), v); }
        else { e.v = getIn(v, K.slice(P.length)); }
        e.v = e.v === undefined ? null : e.v;
        cachePut(key, e.v, e.t, e.f);
      });
      notify(P.join('/'));
    }
    function dropCache(path) {
      var P = seg(path).join('/');
      allCacheKeys().forEach(function (key) {
        if (key === P || key.indexOf(P + '/') === 0 || P.indexOf(key + '/') === 0) {
          delete mem[ck(key)]; if (store) { try { store.removeItem(ck(key)); } catch (x) {} }
        }
      });
    }
    api.clearCache = function () {
      Object.keys(mem).forEach(function (k) { delete mem[k]; });
      if (store) { try { var del = []; for (var i = 0; i < store.length; i++) { var k = store.key(i); if (k && k.indexOf('fsc1:') === 0) del.push(k); } del.forEach(function (k) { store.removeItem(k); }); } catch (x) {} }
    };

    /* ---------- القراءة من Firestore ---------- */
    function snapToObj(qs) { var o = {}; qs.forEach(function (d) { o[d.id] = d.data(); }); return o; }
    function rawRead(path) {
      var parts = seg(path);
      var L = locate(parts);
      return authReady().then(function () { return fsdb(); }).then(function (db) {
        var top = parts[0];
        if (L.doc) {
          return db.collection(L.col).doc(L.doc).get().then(function (d) {
            return d.exists ? getIn(d.data(), L.field) : null;
          });
        }
        if (top === 'attendance') {
          var q = db.collection('attendance');
          if (L.group) q = q.where('g', '==', L.group);
          return q.get().then(function (qs) {
            var out = {};
            qs.forEach(function (d) {
              var x = d.data(), g = x.g;
              Object.keys(x.d || {}).forEach(function (date) { out[g] = out[g] || {}; out[g][date] = x.d[date]; });
            });
            if (L.group) return out[L.group] || null;
            return Object.keys(out).length ? out : null;
          });
        }
        var cq = db.collection(L.col);
        if (top === 'notifications') cq = cq.orderBy('createdAt', 'desc').limit(NOTIF_LIMIT);
        return cq.get().then(function (qs) { var o = snapToObj(qs); return Object.keys(o).length ? o : null; });
      });
    }

    // الدور الحالي: owner | admin | student
    function roleOf() {
      var u = uid();
      if (roleCache[u]) return Promise.resolve(roleCache[u]);
      return api.get(api.ref('owner')).then(function (os) {
        if (os.exists() && os.val().uid === u) return 'owner';
        return api.get(api.ref('admins/' + u)).then(function (as) { return as.exists() ? 'admin' : 'student'; });
      }).then(function (r) { roleCache[u] = r; flushOrWipe(r); return r; });
    }

    // قراءة مع مراعاة دور الطالب: لا يحمّل إلا بياناته ومجموعته
    function readNode(path) {
      var parts = seg(path), top = parts[0];
      if (parts.length === 1 && (top === 'students' || top === 'attendance')) {
        return roleOf().then(function (role) {
          if (role !== 'student') return rawRead(path);
          var u = uid();
          if (top === 'students') {
            return api.get(api.ref('students/' + u)).then(function (s) { var o = {}; if (s.exists()) o[u] = s.val(); return Object.keys(o).length ? o : null; });
          }
          return api.get(api.ref('students/' + u)).then(function (s) {
            var gid = s.exists() && s.val().groupId;
            if (!gid) return null;
            return api.get(api.ref('attendance/' + gid)).then(function (gs) {
              var data = gs.val();
              if (!data) return null;
              var out = {}, mine = {};
              Object.keys(data).forEach(function (date) { if (data[date] && data[date][u] !== undefined) { mine[date] = {}; mine[date][u] = data[date][u]; } });
              out[gid] = mine; return out;
            });
          });
        });
      }
      return rawRead(path);
    }

    // قراءة الفروقات فقط (للطالب): الإشعارات الأحدث، وشهر الحضور الحالي والسابق
    function deltaRead(path, oldV) {
      var parts = seg(path);
      return authReady().then(fsdb).then(function (db) {
        if (parts[0] === 'notifications' && parts.length === 1) {
          var mx = 0; Object.keys(oldV || {}).forEach(function (k) { var c = oldV[k] && oldV[k].createdAt; if (c > mx) mx = c; });
          return db.collection('notifications').where('createdAt', '>', mx).orderBy('createdAt', 'desc').limit(NOTIF_LIMIT).get().then(function (qs) {
            var o = oldV ? JSON.parse(JSON.stringify(oldV)) : {}; qs.forEach(function (d) { o[d.id] = d.data(); });
            var ks = Object.keys(o).sort(function (a, b) { return (o[b].createdAt || 0) - (o[a].createdAt || 0); }).slice(0, NOTIF_LIMIT);
            var r = {}; ks.forEach(function (k) { r[k] = o[k]; }); return ks.length ? r : null;
          });
        }
        if (parts[0] === 'attendance' && parts.length === 2) {
          var g = parts[1], d = new Date(), ym = function (dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2); };
          var cur = ym(d), prev = ym(new Date(d.getFullYear(), d.getMonth() - 1, 1));
          return Promise.all([prev, cur].map(function (m) { return db.collection('attendance').doc(g + '~' + m).get().then(function (x) { return [m, x.exists ? x.data().d || {} : {}]; }); })).then(function (rs) {
            var o = oldV ? JSON.parse(JSON.stringify(oldV)) : {};
            rs.forEach(function (r) {
              Object.keys(o).forEach(function (dt) { if (dt.indexOf(r[0]) === 0) delete o[dt]; });
              Object.keys(r[1]).forEach(function (dt) { o[dt] = r[1][dt]; });
            });
            return Object.keys(o).length ? o : null;
          });
        }
        return null;
      });
    }
    function canDelta(path) { var p = seg(path); return (p[0] === 'notifications' && p.length === 1) || (p[0] === 'attendance' && p.length === 2); }
    function fetchFresh(path) {
      var old = cacheGet(path, true), offline = env.navigator && env.navigator.onLine === false;
      var fallback = function (e) { if (old && isStudentSync()) return old.v; throw e; };
      if (offline) return Promise.resolve().then(function () { return fallback(new Error('لا يوجد اتصال بالإنترنت')); });
      if (old && isStudentSync() && canDelta(path) && Date.now() - (old.f || old.t) < 86400000) {
        return deltaRead(path, old.v).then(function (v) { cachePut(path, v, null, old.f || old.t); return v; }).catch(fallback);
      }
      return readNode(path).then(function (v) { cachePut(path, v); return v; }).catch(fallback);
    }
    api.ref = function (p) { return new Ref(p, api); };
    api.get = function (ref) {
      var c = cacheGet(ref.path);
      if (c) return Promise.resolve(new Snap(ref.key, c.v));
      // قراءة جزء من عقدة محمّلة بالفعل من المخزن بدل قراءة جديدة
      var parts = seg(ref.path);
      for (var n = parts.length - 1; n >= 1; n--) {
        var pc = cacheGet(parts.slice(0, n).join('/'));
        if (pc) return Promise.resolve(new Snap(ref.key, getIn(pc.v, parts.slice(n))));
      }
      return fetchFresh(ref.path).then(function (v) { return new Snap(ref.key, v); });
    };

    /* ---------- الاشتراك (بدون مستمعات لحظية) ---------- */
    function notify(path) {
      listeners.slice().forEach(function (l) {
        var a = seg(l.path).join('/'), b = seg(path).join('/');
        if (a === b || a.indexOf(b + '/') === 0 || b.indexOf(a + '/') === 0) {
          var c = cacheGet(l.path, true);
          if (c) emit(l, c.v);
        }
      });
    }
    function emit(l, v) {
      var s = JSON.stringify(v === undefined ? null : v);
      if (s === l.last) return;
      l.last = s;
      try { l.cb(new Snap(l.ref.key, v)); } catch (e) { console.warn(e); }
    }
    api.onValue = function (ref, cb, err) {
      var l = { path: ref.path, ref: ref, cb: cb, err: err, last: null, dead: false };
      listeners.push(l);
      var c = cacheGet(ref.path);
      if (c) { Promise.resolve().then(function () { if (!l.dead) emit(l, c.v); }); }
      else {
        fetchFresh(ref.path).then(function (v) { if (!l.dead) emit(l, v); })
          .catch(function (e) { if (!l.dead && err) err(e); });
      }
      return function () { l.dead = true; var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    };
    function refreshStale(force) {
      if (env.document && env.document.visibilityState === 'hidden') return;
      listeners.slice().forEach(function (l) {
        if (!force && cacheGet(l.path)) return;
        fetchFresh(l.path).then(function (v) { if (!l.dead) emit(l, v); }).catch(function () {});
      });
    }
    api.refresh = function () { refreshStale(true); };
    if (env.setInterval) env.setInterval(function () { refreshStale(false); }, 60000);
    if (env.document && env.document.addEventListener) env.document.addEventListener('visibilitychange', function () { refreshStale(false); });

    /* ---------- الكتابة ---------- */
    function FP(fields) { var F = fb.firestore.FieldPath; return new (Function.prototype.bind.apply(F, [null].concat(fields)))(); }
    function docRef(db, L) { return db.collection(L.col).doc(L.doc); }
    function extra(L) { return L.col === 'attendance' ? { g: L.group, m: L.month } : {}; }

    function writeOne(db, L, val, batch) {
      var ref = docRef(db, L), v = clean(val);
      var tgt = batch || { set: function (r, d) { return r.set(d); }, update: function (r) { var a = Array.prototype.slice.call(arguments, 1); return r.update.apply(r, a); }, delete: function (r) { return r.delete(); } };
      if (!L.field.length) {
        if (v === undefined) return tgt.delete(ref);
        return tgt.set(ref, v);
      }
      var fp = FP(L.field);
      if (v === undefined) {
        // حذف حقل (يتجاهل الخطأ لو المستند غير موجود)
        if (batch) return batch.update(ref, fp, fb.firestore.FieldValue.delete());
        return ref.update(fp, fb.firestore.FieldValue.delete()).catch(function (e) { if (e && e.code === 'not-found') return null; throw e; });
      }
      if (batch) return batch.update(ref, fp, v);
      return ref.update(fp, v).catch(function (e) {
        if (e && e.code === 'not-found') {
          var o = nest(L.field, v);
          var base = extra(L); Object.keys(base).forEach(function (k) { o[k] = base[k]; });
          return ref.set(o);
        }
        throw e;
      });
    }

    api.set = function (ref, val) {
      var parts = seg(ref.path), L = locate(parts);
      if (!L.doc) return Promise.reject(new Error('كتابة غير مدعومة على ' + ref.path));
      return authReady().then(fsdb).then(function (db) { return writeOne(db, L, val); }).then(function () { applyLocal(ref.path, val === undefined ? null : val); });
    };
    api.remove = function (ref) { return api.set(ref, null); };
    api.push = function (ref) { return new Ref(ref.path + '/' + pushId(), api); };
    api.update = function (ref, map) {
      var base = seg(ref.path).join('/');
      var keys = Object.keys(map || {});
      return authReady().then(fsdb).then(function (db) {
        var batch = db.batch(), ops = [];
        keys.forEach(function (k) {
          var full = (base ? base + '/' : '') + seg(k).join('/');
          var L = locate(seg(full));
          if (!L.doc) throw new Error('كتابة غير مدعومة على ' + full);
          var v = map[k];
          if (L.field.length && L.col === 'attendance') { /* مستند الحضور قد لا يكون موجوداً */
            ops.push(function () { return writeOne(db, L, v); }); return;
          }
          writeOne(db, L, v, batch);
        });
        return batch.commit().then(function () {
          return ops.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
        });
      }).then(function () {
        keys.forEach(function (k) { applyLocal((base ? base + '/' : '') + seg(k).join('/'), map[k] === undefined ? null : map[k]); });
      });
    };
    api.transaction = function (ref, fn) {
      var L = locate(seg(ref.path));
      if (!L.doc || L.field.length) return Promise.reject(new Error('transaction غير مدعومة على ' + ref.path));
      return authReady().then(fsdb).then(function (db) {
        var dr = docRef(db, L), result = { committed: false, value: null };
        return db.runTransaction(function (t) {
          return t.get(dr).then(function (d) {
            var cur = d.exists ? d.data() : null;
            var nv = fn(cur);
            if (nv === undefined) { result = { committed: false, value: cur }; return; }
            var c = clean(nv);
            if (c === undefined) t.delete(dr); else t.set(dr, c);
            result = { committed: true, value: c === undefined ? null : c };
          });
        }).then(function () {
          if (result.committed) applyLocal(ref.path, result.value);
          return { committed: result.committed, snapshot: new Snap(ref.key, result.value) };
        });
      });
    };
    api.dbFor = function () { return api.db; };
    return api;
  }

  function build(mode, env) {
    env = env || { firebase: global.firebase, localStorage: global.localStorage, document: global.document, setInterval: global.setInterval.bind(global) };
    var api = mode === 'fs' ? fsApi(env) : rtdbApi(env);
    api.db = { ref: function (p) { return api.ref(p || ''); } };
    if (mode === 'rtdb') api.dbFor = function (app) { return app.database(); };
    return api;
  }

  global.__fsBuild = build;
  var real = null;
  function lazy() { if (!real) real = build(global.__DB_MODE || 'rtdb'); return real; }
  global.__fs = new Proxy({}, { get: function (_, k) { var r = lazy(); var v = r[k]; return typeof v === 'function' ? v.bind(r) : v; } });
  global.__fsTTL = TTL;
})(typeof window !== 'undefined' ? window : globalThis);
