/* يضيف عناوين الأعمدة لخلايا الجداول لتظهر كبطاقات على الموبايل */
(function () {
  'use strict';
  var timer = null;
  function label() {
    document.querySelectorAll('.data-table').forEach(function (table) {
      var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { return (th.textContent || '').trim(); });
      if (!heads.length) return;
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (td.tagName === 'TD' && td.getAttribute('data-label') !== (heads[i] || '')) td.setAttribute('data-label', heads[i] || '');
        });
      });
    });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(label, 60); }
  function start() {
    var root = document.getElementById('root') || document.body;
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* تأثيرات: عدّاد أرقام وأيقونة لعنوان كل صفحة */
(function () {
  'use strict';
  var ICONS = {
    'لوحة المتابعة': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    'الطلاب': '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    'المسؤولون': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    'المدارس والمجموعات': '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
    'المواد الدراسية': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>',
    'درجات أعمال السنة': '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    'تسجيل الحضور': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    'الإشعارات': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'حسابي': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  };
  function nf(n) { return n.toLocaleString('ar-EG'); }
  function decorate() {
    var h1 = document.querySelector('.page-heading h1');
    if (h1 && !h1.querySelector('.h1-ico')) {
      var t = (h1.textContent || '').trim();
      var p = ICONS[t] || ICONS['لوحة المتابعة'];
      h1.insertAdjacentHTML('afterbegin', '<svg class="h1-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>');
    }
    document.querySelectorAll('.stat-value').forEach(function (el) {
      if (el.getAttribute('data-counted')) return;
      var raw = (el.textContent || '').trim();
      if (!/^\d+$/.test(raw)) { el.setAttribute('data-counted', '1'); return; }
      el.setAttribute('data-counted', '1');
      var target = parseInt(raw, 10); if (target > 5000 || target === 0) return;
      var start = null;
      function step(ts) { if (start === null) start = ts; var k = Math.min(1, (ts - start) / 700); el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); else el.textContent = raw; }
      requestAnimationFrame(step);
    });
  }
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(decorate, 90); }
  function start() { new MutationObserver(schedule).observe(document.getElementById('root') || document.body, { childList: true, subtree: true }); schedule(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
