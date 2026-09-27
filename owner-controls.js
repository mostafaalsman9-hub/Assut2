/* منصة علوم الرياضة: ضوابط المالك وتثبيت التطبيق.
 * هذا الملف يكمّل الواجهة الحالية، بينما تظل Firebase Rules هي الحماية الأساسية.
 */
(function () {
  'use strict';

  var CONFIG = window.PLATFORM_FIREBASE_CONFIG;
  var installPrompt = null;
  var currentUser = null;
  var firebaseApp = null;
  var firebaseAuth = null;
  var ownerExperienceRef = null;
  var observerStarted = false;

  function textOf(element) {
    return (element && (element.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function isStandalone() {
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function getRole() {
    var badge = document.querySelector('.top-actions .badge');
    var roleText = textOf(badge);
    if (roleText.indexOf('مالك') !== -1 || document.querySelector('.sidebar .nav-item span') &&
        Array.prototype.some.call(document.querySelectorAll('.sidebar .nav-item span'), function (node) {
          return textOf(node) === 'المسؤولون';
        })) return 'owner';
    if (roleText.indexOf('مسؤول') !== -1) return 'admin';
    if (roleText.indexOf('طالب') !== -1) return 'student';
    return null;
  }

  function installStyle() {
    if (document.getElementById('owner-controls-style')) return;
    var style = document.createElement('style');
    style.id = 'owner-controls-style';
    style.textContent =
      '.owner-experience{margin:0 0 22px;background:linear-gradient(135deg,#fffdf5,#fff);border:1px solid #eadbb0;border-radius:18px;box-shadow:0 5px 18px #725b1b12;overflow:hidden}' +
      '.owner-experience-head{display:flex;align-items:center;gap:10px;padding:17px 20px;border-bottom:1px solid #f0e7cd;color:#6e5312}' +
      '.owner-experience-head h3{margin:0;font-size:15px;font-weight:800;flex:1}' +
      '.owner-experience-body{padding:18px 20px}.owner-experience textarea{display:block;width:100%;min-height:112px;resize:vertical;border:1px solid #e4d6aa;border-radius:10px;padding:11px 12px;color:#4f431f;background:#fffef9;font:inherit;font-size:13px;line-height:1.8;box-sizing:border-box;outline:none}.owner-experience textarea:focus{border-color:#c49b38;box-shadow:0 0 0 3px #c49b3820}.owner-experience-actions{display:flex;align-items:center;gap:10px;margin-top:12px}.owner-experience-note{color:#8d7a45;font-size:11px;flex:1}.install-action{font-size:11px!important;padding:7px 10px!important;color:#146d62!important;border-color:#a9d0c8!important;background:#effaf7!important}';
    document.head.appendChild(style);
  }

  function addInstallAction() {
    if (isStandalone() || document.querySelector('.install-action')) return;
    var actions = document.querySelector('.top-actions');
    if (!actions) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button small install-action';
    button.textContent = 'تثبيت التطبيق';
    button.title = 'تثبيت منصة علوم الرياضة على جهازك';
    button.addEventListener('click', function () {
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.then(function () {
          installPrompt = null;
          button.remove();
        }).catch(function () {});
      } else {
        window.alert('من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».');
      }
    });
    actions.insertBefore(button, actions.firstChild);
  }

  function hideAdminControls() {
    if (getRole() !== 'admin') return;
    document.querySelectorAll('.sidebar .nav-item, .mobile-nav button').forEach(function (button) {
      if (textOf(button).indexOf('الدرجات') !== -1) {
        button.setAttribute('aria-hidden', 'true');
        button.style.display = 'none';
      }
    });
    document.querySelectorAll('.button').forEach(function (button) {
      var label = textOf(button);
      if (label === 'إسناد' || label === 'الطلاب' || label === 'حفظ الاختيارات') {
        button.setAttribute('aria-hidden', 'true');
        button.style.display = 'none';
      }
    });
    var heading = document.querySelector('.page-heading h1');
    if (heading && textOf(heading) === 'درجات أعمال السنة') {
      var home = Array.prototype.find.call(document.querySelectorAll('.sidebar .nav-item'), function (button) {
        return textOf(button).indexOf('لوحة المتابعة') !== -1;
      });
      if (home) home.click();
    }
  }

  function createOwnerExperience() {
    if (getRole() !== 'owner' || !currentUser) return;
    var content = document.querySelector('.content-inner');
    if (!content || document.querySelector('.owner-experience')) return;
    var section = document.createElement('section');
    section.className = 'owner-experience';
    section.innerHTML =
      '<div class="owner-experience-head"><span aria-hidden="true">✦</span><h3>عن المنصة — خبرات المالك</h3><span class="badge orange">للمالك فقط</span></div>' +
      '<div class="owner-experience-body"><textarea maxlength="5000" aria-label="خبرات المالك" placeholder="اكتب هنا خبراتك أو ملاحظاتك الخاصة بالمنصة..."></textarea>' +
      '<div class="owner-experience-actions"><span class="owner-experience-note">لا تظهر هذه الملاحظات إلا لحساب المالك.</span><button type="button" class="button primary small">حفظ الخبرات</button></div></div>';
    content.insertBefore(section, content.firstChild);
    var textarea = section.querySelector('textarea');
    var saveButton = section.querySelector('button');
    if (ownerExperienceRef) {
      ownerExperienceRef.once('value').then(function (snapshot) {
        var value = snapshot.val();
        if (value && typeof value.text === 'string') textarea.value = value.text;
      }).catch(function () {});
    }
    saveButton.addEventListener('click', function () {
      if (!ownerExperienceRef || !currentUser) return;
      saveButton.disabled = true;
      ownerExperienceRef.set({
        text: textarea.value.trim(),
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      }).then(function () {
        saveButton.textContent = 'تم الحفظ';
        window.setTimeout(function () {
          saveButton.textContent = 'حفظ الخبرات';
          saveButton.disabled = false;
        }, 1600);
      }).catch(function () {
        saveButton.disabled = false;
        window.alert('تعذر حفظ الخبرات. تحقق من نشر Firebase Rules.');
      });
    });
  }

  function handleOwnerDeleteClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var button = target.closest('.data-table tbody button.button.danger');
    if (!button || textOf(button).indexOf('حذف') === -1) return;

    var heading = textOf(document.querySelector('.page-heading h1'));
    var collection = heading === 'المسؤولون' ? 'admins' : heading === 'الطلاب' ? 'students' : null;
    if (!collection) return;

    // Stop the bundled app's direct Realtime Database deletion handler. The
    // ownerDeleteAccount callable removes both the Auth user and its data.
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    if (getRole() !== 'owner' || !currentUser || !firebaseApp || !firebaseAuth) {
      window.alert('حذف الحسابات متاح للمالك فقط.');
      return;
    }

    var row = button.closest('tr');
    var emailNode = row && row.querySelector('.person small');
    var nameNode = row && row.querySelector('.person strong');
    var email = textOf(emailNode).toLowerCase();
    var name = textOf(nameNode);
    if (!email || !name) {
      window.alert('تعذر تحديد بيانات الحساب. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }

    firebaseApp.database().ref(collection).once('value').then(function (snapshot) {
      var matches = [];
      snapshot.forEach(function (child) {
        var record = child.val();
        if (record && typeof record.email === 'string' && record.email.trim().toLowerCase() === email) {
          matches.push({ uid: child.key, record: record });
        }
      });

      if (matches.length !== 1) {
        throw new Error(matches.length ? 'يوجد أكثر من حساب بهذا البريد؛ لم يُحذف أي حساب.' : 'لم يتم العثور على الحساب. حدّث الصفحة وحاول مرة أخرى.');
      }

      if (typeof window.openOwnerDeleteDialog !== 'function') {
        throw new Error('نافذة تأكيد الحذف غير متاحة. حدّث الصفحة وحاول مرة أخرى.');
      }

      var targetUser = matches[0];
      return window.openOwnerDeleteDialog({
        name: name,
        email: email,
        role: collection === 'admins' ? 'المسؤول' : 'الطالب',
        onConfirm: function () {
          var signedInUser = firebaseAuth.currentUser;
          if (!signedInUser || signedInUser.uid !== currentUser.uid || getRole() !== 'owner') {
            throw new Error('انتهت جلسة المالك. سجّل الدخول مجددًا ثم حاول.');
          }
          var deleteAccount = firebaseApp.functions('us-central1').httpsCallable('deletePlatformAccount');
          return deleteAccount({ uid: targetUser.uid });
        }
      });
    }).catch(function (error) {
      console.error('تعذر بدء حذف الحساب', error);
      window.alert(error && error.message ? error.message : 'تعذر حذف الحساب. تحقق من اتصال Firebase ثم حاول مرة أخرى.');
    });
  }

  function refreshUi() {
    installStyle();
    addInstallAction();
    hideAdminControls();
    createOwnerExperience();
  }

  function start() {
    if (observerStarted) return;
    observerStarted = true;
    installStyle();
    document.addEventListener('click', handleOwnerDeleteClick, true);
    if (window.firebase && CONFIG) {
      try {
        var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CONFIG);
        firebaseApp = app;
        firebaseAuth = app.auth();
        ownerExperienceRef = app.database().ref('ownerExperience');
        firebaseAuth.onAuthStateChanged(function (user) {
          currentUser = user;
          if (user) {
            app.database().ref('deletedAccounts/' + user.uid).once('value').then(function (snapshot) {
              if (snapshot.exists() && firebaseAuth.currentUser && firebaseAuth.currentUser.uid === user.uid) {
                window.alert('هذا الحساب محذوف ولا يمكنه استخدام المنصة.');
                return firebaseAuth.signOut();
              }
              return null;
            }).catch(function (error) {
              console.warn('تعذر التحقق من حالة الحساب', error);
            });
          }
          refreshUi();
        });
      } catch (error) {
        console.warn('تعذر تشغيل ضوابط المالك', error);
      }
    }
    var observer = new MutationObserver(function () {
      window.clearTimeout(observer._timer);
      observer._timer = window.setTimeout(refreshUi, 40);
    });
    observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    window.setTimeout(refreshUi, 500);
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
    refreshUi();
  });
  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    var button = document.querySelector('.install-action');
    if (button) button.remove();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();(function () {
  'use strict';

  var STYLE_ID = 'owner-delete-dialog-style';
  var DIALOG_ID = 'owner-delete-dialog';
  var activeDialog = null;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.owner-delete-dialog{' +
        'width:min(440px,calc(100vw - 32px));' +
        'padding:0;' +
        'border:1px solid #d8e4e1;' +
        'border-radius:18px;' +
        'background:#fffdfa;' +
        'color:#173c39;' +
        'box-shadow:0 24px 70px rgba(18,62,59,.22),0 4px 14px rgba(18,62,59,.08);' +
        'font-family:inherit;' +
        'overflow:hidden;' +
        'direction:rtl;' +
        'text-align:right;' +
      '}' +
      '.owner-delete-dialog::backdrop{' +
        'background:rgba(13,45,43,.44);' +
        'backdrop-filter:blur(2px);' +
      '}' +
      '.owner-delete-dialog__inner{padding:24px 24px 20px}' +
      '.owner-delete-dialog__header{display:flex;align-items:flex-start;gap:13px;margin-bottom:19px}' +
      '.owner-delete-dialog__mark{' +
        'display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;' +
        'border-radius:12px;background:#fff1e7;color:#b5542f;border:1px solid #f0c6ac;' +
        'font-size:21px;font-weight:800;line-height:1;' +
      '}' +
      '.owner-delete-dialog__title{margin:0;color:#173c39;font-size:18px;font-weight:800;line-height:1.45}' +
      '.owner-delete-dialog__subtitle{margin:3px 0 0;color:#6c817d;font-size:12px;line-height:1.7}' +
      '.owner-delete-dialog__copy{margin:0 0 17px;color:#49615d;font-size:13px;line-height:1.9}' +
      '.owner-delete-dialog__identity{' +
        'display:grid;gap:8px;margin:0 0 19px;padding:13px 14px;' +
        'border:1px solid #dce8e5;border-radius:12px;background:#f4faf8;' +
      '}' +
      '.owner-delete-dialog__identity-row{display:flex;align-items:baseline;gap:10px;min-width:0}' +
      '.owner-delete-dialog__label{flex:0 0 53px;color:#78908b;font-size:11px;font-weight:700}' +
      '.owner-delete-dialog__value{min-width:0;overflow-wrap:anywhere;color:#214943;font-size:13px;font-weight:700}' +
      '.owner-delete-dialog__value--email{direction:ltr;text-align:right;font-weight:500}' +
      '.owner-delete-dialog__role{' +
        'display:inline-flex;align-items:center;width:max-content;padding:3px 9px;border-radius:999px;' +
        'background:#e2f2ee;color:#17675d;font-size:11px;font-weight:800;' +
      '}' +
      '.owner-delete-dialog__warning{margin:0 0 20px;color:#a24d2c;font-size:12px;font-weight:700;line-height:1.75}' +
      '.owner-delete-dialog__actions{display:flex;align-items:center;justify-content:flex-start;gap:9px}' +
      '.owner-delete-dialog__button{' +
        'min-width:102px;min-height:40px;padding:9px 16px;border-radius:9px;' +
        'font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,opacity .16s ease,transform .16s ease;' +
      '}' +
      '.owner-delete-dialog__button:active:not(:disabled){transform:translateY(1px)}' +
      '.owner-delete-dialog__button:focus-visible{outline:3px solid rgba(28,120,108,.28);outline-offset:2px}' +
      '.owner-delete-dialog__button:disabled{cursor:not-allowed;opacity:.58}' +
      '.owner-delete-dialog__button--cancel{border:1px solid #c9d9d6;background:#fffdfa;color:#365b55}' +
      '.owner-delete-dialog__button--cancel:hover:not(:disabled){background:#eef7f4;border-color:#9fc5bd}' +
      '.owner-delete-dialog__button--delete{border:1px solid #b5542f;background:#b5542f;color:#fff9f5}' +
      '.owner-delete-dialog__button--delete:hover:not(:disabled){background:#984526;border-color:#984526}' +
      '.owner-delete-dialog__status{min-height:22px;margin:0 0 12px;font-size:12px;line-height:1.7}' +
      '.owner-delete-dialog__status--error{padding:9px 10px;border:1px solid #efc5b1;border-radius:8px;background:#fff3ed;color:#a33f21;font-weight:700}' +
      '.owner-delete-dialog__success{padding:15px 4px 7px;text-align:center}' +
      '.owner-delete-dialog__success-mark{' +
        'display:grid;place-items:center;width:52px;height:52px;margin:0 auto 12px;border-radius:50%;' +
        'background:#e3f3ed;color:#167263;border:1px solid #add9c9;font-size:26px;font-weight:800;' +
      '}' +
      '.owner-delete-dialog__success-title{margin:0;color:#17675d;font-size:17px;font-weight:800}' +
      '.owner-delete-dialog__success-copy{margin:5px 0 0;color:#617a75;font-size:12px;line-height:1.7}' +
      '@media (max-width:480px){' +
        '.owner-delete-dialog{width:calc(100vw - 24px);border-radius:16px}' +
        '.owner-delete-dialog__inner{padding:21px 18px 17px}' +
        '.owner-delete-dialog__actions{flex-direction:column-reverse;align-items:stretch}' +
        '.owner-delete-dialog__button{width:100%}' +
      '}';
    document.head.appendChild(style);
  }

  function roleDetails(role) {
    var value = String(role == null ? '' : role).toLowerCase();
    var isStudent = value.indexOf('student') !== -1 || value.indexOf('طالب') !== -1;
    return isStudent
      ? { label: 'طالب', description: 'حذف حساب الطالب' }
      : { label: 'مسؤول', description: 'حذف حساب المسؤول' };
  }

  function makeElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function settleSafely(resolve, value) {
    try {
      resolve(value);
    } catch (ignore) {
      /* The promise resolver is intentionally isolated from cleanup. */
    }
  }

  window.openOwnerDeleteDialog = function (options) {
    options = options || {};

    return new Promise(function (resolve) {
      addStyles();

      if (activeDialog && activeDialog.parentNode) {
        activeDialog._ownerDeleteFinish(false);
      }

      var name = String(options.name == null ? '' : options.name).trim() || 'بدون اسم';
      var email = String(options.email == null ? '' : options.email).trim() || 'لا يوجد بريد إلكتروني';
      var details = roleDetails(options.role);
      var restoreFocus = document.activeElement;
      var dialog = document.createElement('dialog');
      var finished = false;
      var busy = false;

      dialog.id = DIALOG_ID;
      dialog.className = 'owner-delete-dialog';
      dialog.setAttribute('aria-labelledby', DIALOG_ID + '-title');
      dialog.setAttribute('aria-describedby', DIALOG_ID + '-description');

      var inner = makeElement('div', 'owner-delete-dialog__inner');
      var header = makeElement('div', 'owner-delete-dialog__header');
      var mark = makeElement('div', 'owner-delete-dialog__mark', '!');
      mark.setAttribute('aria-hidden', 'true');
      var headingWrap = makeElement('div');
      var title = makeElement('h2', 'owner-delete-dialog__title', 'تأكيد حذف الحساب');
      title.id = DIALOG_ID + '-title';
      var subtitle = makeElement('p', 'owner-delete-dialog__subtitle', details.description);
      headingWrap.appendChild(title);
      headingWrap.appendChild(subtitle);
      header.appendChild(mark);
      header.appendChild(headingWrap);

      var copy = makeElement(
        'p',
        'owner-delete-dialog__copy',
        'هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم حذف بيانات الحساب من المنصة.'
      );
      copy.id = DIALOG_ID + '-description';

      var identity = makeElement('div', 'owner-delete-dialog__identity');
      identity.setAttribute('aria-label', 'بيانات الحساب المراد حذفه');
      var nameRow = makeElement('div', 'owner-delete-dialog__identity-row');
      nameRow.appendChild(makeElement('span', 'owner-delete-dialog__label', 'الاسم'));
      nameRow.appendChild(makeElement('strong', 'owner-delete-dialog__value', name));
      var emailRow = makeElement('div', 'owner-delete-dialog__identity-row');
      emailRow.appendChild(makeElement('span', 'owner-delete-dialog__label', 'البريد'));
      emailRow.appendChild(makeElement('span', 'owner-delete-dialog__value owner-delete-dialog__value--email', email));
      var roleRow = makeElement('div', 'owner-delete-dialog__identity-row');
      roleRow.appendChild(makeElement('span', 'owner-delete-dialog__label', 'النوع'));
      roleRow.appendChild(makeElement('span', 'owner-delete-dialog__role', details.label));
      identity.appendChild(nameRow);
      identity.appendChild(emailRow);
      identity.appendChild(roleRow);

      var warning = makeElement(
        'p',
        'owner-delete-dialog__warning',
        'لن يتمكن هذا الحساب من تسجيل الدخول بعد الحذف.'
      );

      var status = makeElement('p', 'owner-delete-dialog__status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.hidden = true;

      var actions = makeElement('div', 'owner-delete-dialog__actions');
      var cancelButton = makeElement('button', 'owner-delete-dialog__button owner-delete-dialog__button--cancel', 'إلغاء');
      cancelButton.type = 'button';
      var deleteButton = makeElement('button', 'owner-delete-dialog__button owner-delete-dialog__button--delete', 'حذف الحساب');
      deleteButton.type = 'button';
      actions.appendChild(cancelButton);
      actions.appendChild(deleteButton);

      inner.appendChild(header);
      inner.appendChild(copy);
      inner.appendChild(identity);
      inner.appendChild(warning);
      inner.appendChild(status);
      inner.appendChild(actions);
      dialog.appendChild(inner);
      document.body.appendChild(dialog);
      activeDialog = dialog;

      function restorePreviousFocus() {
        if (restoreFocus && typeof restoreFocus.focus === 'function' && document.contains(restoreFocus)) {
          try {
            restoreFocus.focus({ preventScroll: true });
          } catch (ignore) {
            restoreFocus.focus();
          }
        }
      }

      function removeDialog() {
        if (activeDialog === dialog) activeDialog = null;
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        restorePreviousFocus();
      }

      function finish(value) {
        if (finished) return;
        finished = true;
        if (dialog.open) dialog.close();
        removeDialog();
        settleSafely(resolve, value);
      }

      dialog._ownerDeleteFinish = finish;

      function setBusy(value) {
        busy = value;
        cancelButton.disabled = value;
        deleteButton.disabled = value;
        dialog.setAttribute('aria-busy', value ? 'true' : 'false');
      }

      function showError(message) {
        status.hidden = false;
        status.className = 'owner-delete-dialog__status owner-delete-dialog__status--error';
        status.textContent = message;
        deleteButton.focus();
      }

      function showSuccess() {
        inner.textContent = '';
        var success = makeElement('div', 'owner-delete-dialog__success');
        var successMark = makeElement('div', 'owner-delete-dialog__success-mark', '✓');
        successMark.setAttribute('aria-hidden', 'true');
        var successTitle = makeElement('h2', 'owner-delete-dialog__success-title', 'تم حذف الحساب');
        var successCopy = makeElement('p', 'owner-delete-dialog__success-copy', 'تمت إزالة الحساب من المنصة بنجاح.');
        success.appendChild(successMark);
        success.appendChild(successTitle);
        success.appendChild(successCopy);
        inner.appendChild(success);
        dialog.setAttribute('aria-labelledby', DIALOG_ID + '-success-title');
        successTitle.id = DIALOG_ID + '-success-title';
        successTitle.tabIndex = -1;
        successTitle.focus();
        window.setTimeout(function () {
          finish(true);
        }, 850);
      }

      function confirmDelete() {
        if (busy || finished) return;
        setBusy(true);
        status.hidden = true;
        Promise.resolve()
          .then(function () {
            if (typeof options.onConfirm !== 'function') {
              throw new Error('onConfirm is not available');
            }
            return options.onConfirm({ name: name, email: email, role: options.role });
          })
          .then(function () {
            if (finished) return;
            showSuccess();
          })
          .catch(function () {
            if (finished) return;
            setBusy(false);
            showError('تعذر حذف الحساب. حاول مرة أخرى أو تحقق من صلاحيات المالك.');
          });
      }

      cancelButton.addEventListener('click', function () {
        if (!busy) finish(false);
      });
      deleteButton.addEventListener('click', confirmDelete);
      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        if (!busy) finish(false);
      });
      dialog.addEventListener('close', function () {
        if (!finished && !busy) finish(false);
      });

      try {
        dialog.showModal();
        window.setTimeout(function () {
          if (!finished) cancelButton.focus();
        }, 0);
      } catch (error) {
        finish(false);
      }
    });
  };
})();