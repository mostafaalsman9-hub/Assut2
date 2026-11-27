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
