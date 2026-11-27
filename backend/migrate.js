/* ترحيل بيانات Realtime Database إلى Firestore (يعمل في المتصفح بحساب المالك أو في Node للاختبار)
 * الاستخدام: await migrateAll(fsApi, rtdbData, log)
 * - fsApi: واجهة __fsBuild('fs')
 * - rtdbData: كائن بالشكل { owner, admins, students, schools, groups, subjects, grades, attendance, notifications }
 * لا يحذف شيئاً من RTDB.
 */
(function (root) {
  function normalize(d) {
    var o = JSON.parse(JSON.stringify(d || {})), skipped = [];
    ['admins', 'students', 'grades', 'notifications'].forEach(function (n) {
      Object.keys(o[n] || {}).forEach(function (k) {
        if (o[n][k] === null || typeof o[n][k] !== 'object') { skipped.push(n + '/' + k); delete o[n][k]; }
      });
    });
    Object.keys(o.notifications || {}).forEach(function (k) { if (typeof o.notifications[k].createdAt !== 'number') o.notifications[k].createdAt = 0; });
    delete o.ownerExcelReports; delete o.ownerExperience; delete o._uid;
    Object.keys(o).forEach(function (k) { if (k.indexOf('notifRead/') === 0) delete o[k]; });
    return { data: o, skipped: skipped };
  }
  async function migrateAll(api, raw, log) {
    log = log || function () {};
    var n = normalize(raw), d = n.data, R = function (p) { return api.ref(p); }, c = {};
    if (d.owner) { await R('owner').set(d.owner); c.owner = 1; }
    for (var name of ['schools', 'groups', 'subjects']) { if (d[name]) { await R(name).set(d[name]); c[name] = Object.keys(d[name]).length; } }
    for (var col of ['admins', 'students', 'grades', 'notifications']) {
      c[col] = 0;
      for (var id of Object.keys(d[col] || {})) { await R(col + '/' + id).set(d[col][id]); c[col]++; }
    }
    c.attendanceDays = 0;
    for (var g of Object.keys(d.attendance || {})) for (var day of Object.keys(d.attendance[g])) { await R('attendance/' + g + '/' + day).set(d.attendance[g][day]); c.attendanceDays++; }
    log('migrated', JSON.stringify(c), 'skipped', JSON.stringify(n.skipped));
    return { counts: c, skipped: n.skipped, normalized: d };
  }
  root.migrateAll = migrateAll; root.migrateNormalize = normalize;
  if (typeof module !== 'undefined') module.exports = { migrateAll: migrateAll, normalize: normalize };
})(typeof window !== 'undefined' ? window : globalThis);
