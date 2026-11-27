/* حفظ بيانات الدخول عبر مدير كلمات المرور في المتصفح/الهاتف (Credential Management). لا يخزن التطبيق أي كلمة مرور بنفسه. */
(function () {
  var pending = null, timer = null;
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || !f.querySelector) return;
    var pw = f.querySelector('input[autocomplete="current-password"]'), em = f.querySelector('input[autocomplete="username"]');
    if (!pw || !em || !pw.value || !em.value) return;
    pending = { id: em.value.trim(), password: pw.value };
    clearTimeout(timer);
    var tries = 0;
    (function check() {
      // نجاح الدخول = اختفاء شاشة الدخول
      if (!pending) return;
      if (!document.querySelector('.auth-page input[autocomplete="current-password"]')) { save(); return; }
      if (++tries < 40) timer = setTimeout(check, 400); else pending = null;
    })();
  }, true);
  function save() {
    var c = pending; pending = null;
    try {
      if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
        navigator.credentials.store(new PasswordCredential({ id: c.id, password: c.password, name: c.id })).catch(function () {});
      }
    } catch (x) {}
    c = null;
  }
})();
