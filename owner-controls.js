/* منصة علوم الرياضة: ضوابط المالك وتثبيت التطبيق.
 * هذا الملف يكمّل الواجهة الحالية، بينما تظل Firebase Rules هي الحماية الأساسية.
 */
(function () {
  'use strict';

  var CONFIG = window.PLATFORM_FIREBASE_CONFIG;
  var PLATFORM_OWNER_UID = 'WjInTQuev0eXJsaq3eTW1HKen013';
  var installPrompt = null;
  var currentUser = null;
  var firebaseApp = null;
  var firebaseAuth = null;
  var ownerExperienceRef = null;
  var observerStarted = false;
  var ownerVerified = false;

  function textOf(element) {
    return (element && (element.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function isStandalone() {
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function getRole() {
    if (ownerVerified === true || window.__platformOwnerVerified === true) return 'owner';
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

  function getCurrentUser() {
    return currentUser || (firebaseAuth && firebaseAuth.currentUser) || null;
  }

  function isKnownOwner(user) {
    return !!user && String(user.uid || '') === PLATFORM_OWNER_UID;
  }

  function verifyOwner() {
    var user = getCurrentUser();
    if (!firebaseApp || !firebaseAuth || !user) return Promise.resolve(false);
    return firebaseApp.database().ref('owner/uid').once('value').then(function (snapshot) {
      var databaseOwnerUid = String(snapshot.val() || '');
      return databaseOwnerUid === String(user.uid || '') || isKnownOwner(user);
    }).catch(function () {
      // The Firebase Rules remain the real protection. This UID fallback only
      // keeps the owner UI usable while Firebase finishes restoring its state.
      return isKnownOwner(user);
    });
  }

  function updateOwnerStatus() {
    return verifyOwner().then(function (isOwner) {
      ownerVerified = isOwner === true;
      window.__platformOwnerVerified = ownerVerified;
      return ownerVerified;
    });
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

    if (!firebaseApp || !firebaseAuth || !getCurrentUser()) {
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

       verifyOwner().then(function (isOwner) {
      if (!isOwner) {
           throw new Error('حساب المالك الحالي غير مرتبط بسجل owner/uid في Firebase.');
      }
         ownerVerified = true;
         window.__platformOwnerVerified = true;
      return firebaseApp.database().ref(collection).once('value');
    }).then(function (snapshot) {
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
          var signedInUser = getCurrentUser();
          if (!signedInUser) {
            throw new Error('انتهت جلسة المالك. سجّل الدخول مجددًا ثم حاول.');
          }
          return verifyOwner().then(function (isOwner) {
            if (!isOwner) {
              throw new Error('حساب المالك الحالي غير مرتبط بسجل owner/uid في Firebase.');
            }
            var updates = {};
            var deletedAt = Date.now();
            updates[collection + '/' + targetUser.uid] = null;
            updates['deletedAccounts/' + targetUser.uid] = {
              uid: targetUser.uid,
              name: targetUser.record.name || name,
              email: targetUser.record.email || email,
              role: collection === 'admins' ? 'admin' : 'student',
              deletedAt: deletedAt,
              deletedBy: signedInUser.uid
            };
            if (collection === 'students') {
              updates['grades/' + targetUser.uid] = null;
            }
            return firebaseApp.database().ref().update(updates);
          });
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
    if (!window.firebase || !CONFIG) {
      window.setTimeout(start, 250);
      return;
    }
    observerStarted = true;
    installStyle();
    document.addEventListener('click', handleOwnerDeleteClick, true);
    try {
      var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CONFIG);
      firebaseApp = app;
      firebaseAuth = app.auth();
      ownerExperienceRef = app.database().ref('ownerExperience');
      firebaseAuth.onAuthStateChanged(function (user) {
        currentUser = user;
        ownerVerified = false;
        window.__platformOwnerVerified = false;
        if (!user) {
          refreshUi();
          return;
        }
        var ownerCheck = updateOwnerStatus();
        var deletedCheck = app.database().ref('deletedAccounts/' + user.uid).once('value').then(function (snapshot) {
          if (snapshot.exists() && firebaseAuth.currentUser && firebaseAuth.currentUser.uid === user.uid) {
            window.alert('هذا الحساب محذوف ولا يمكنه استخدام المنصة.');
            return firebaseAuth.signOut();
          }
          return null;
        }).catch(function (error) {
          console.warn('تعذر التحقق من حالة الحساب', error);
        });
        Promise.all([ownerCheck, deletedCheck]).then(function () {
          refreshUi();
        }).catch(function () {
          refreshUi();
        });
      });
    } catch (error) {
      console.warn('تعذر تشغيل ضوابط المالك', error);
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

/* تصدير تقارير Excel للمالك فقط.
 * التقارير تُنشأ محلياً في المتصفح ولا تُحفظ في Firebase.
 * لذلك لا تظهر أدواتها في حساب الطالب أو المسؤول، وتظل قواعد Firebase
 * هي الحاجز الأساسي للوصول إلى البيانات.
 */
(function () {
  'use strict';

  var STYLE_ID = 'owner-excel-reports-style';
  var PLATFORM_OWNER_UID = 'WjInTQuev0eXJsaq3eTW1HKen013';
  var reportPanel = null;
  var reportObserver = null;
  var reportStore = null;
  var refreshTimer = null;
  var MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  function textOf(element) {
    return (element && (element.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function isOwner() {
    var user = window.firebase && window.firebase.apps && window.firebase.apps.length
      ? window.firebase.app().auth().currentUser
      : null;
    if (user && String(user.uid || '') === PLATFORM_OWNER_UID) return true;
    if (window.__platformOwnerVerified === true) return true;
    if (window.__platformOwnerVerified === false) return false;
    var badge = document.querySelector('.top-actions .badge');
    return textOf(badge).indexOf('مالك') !== -1;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.owner-excel-panel{direction:rtl}' +
      '.owner-excel-panel .excel-intro{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px;padding:18px 20px;color:#6d5314;background:linear-gradient(135deg,#fff9e8,#fff);border:1px solid #ead8a4;border-radius:16px}' +
      '.owner-excel-panel .excel-intro strong{display:block;color:#725817;margin-bottom:5px}' +
      '.owner-excel-panel .excel-intro p{margin:0;color:#8d7a45;font-size:12px;line-height:1.8}' +
      '.owner-excel-panel .excel-intro span{font-size:24px;line-height:1}' +
      '.owner-excel-panel .excel-toolbar{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding:16px 20px}' +
      '.owner-excel-panel .excel-toolbar .field{min-width:170px;margin:0;flex:1}' +
      '.owner-excel-panel .excel-toolbar .field.excel-type{min-width:185px}' +
      '.owner-excel-panel .excel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}' +
      '.owner-excel-panel .excel-actions .button{flex:1;min-width:180px}' +
      '.owner-excel-panel .excel-preview{overflow:auto}' +
      '.owner-excel-panel .excel-preview table{min-width:760px}' +
      '.owner-excel-panel .excel-preview td,.owner-excel-panel .excel-preview th{white-space:nowrap}' +
      '.owner-excel-panel .excel-status{min-height:22px;margin:6px 0 12px;color:#47716b;font-size:12px}' +
      '.owner-excel-panel .excel-status.error{color:#a64d3f}' +
      '.owner-excel-panel .excel-note{color:#879998;font-size:11px;margin-top:10px}' +
      '@media(max-width:720px){.owner-excel-panel .excel-toolbar{padding:14px}.owner-excel-panel .excel-toolbar .field{min-width:100%;flex-basis:100%}.owner-excel-panel .excel-actions .button{min-width:100%}}';
    document.head.appendChild(style);
  }

  function getFirebase() {
    var config = window.PLATFORM_FIREBASE_CONFIG;
    if (!window.firebase || !config) return null;
    try {
      var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      return { app: app, auth: app.auth(), db: app.database() };
    } catch (error) {
      console.warn('تعذر تجهيز تصدير Excel', error);
      return null;
    }
  }

  function readOwnerData() {
    var firebase = getFirebase();
    var user = firebase && firebase.auth.currentUser;
    if (!firebase || !user) return Promise.reject(new Error('يجب تسجيل الدخول بحساب المالك.'));
    return firebase.db.ref('owner/uid').once('value').then(function (ownerSnapshot) {
      if (ownerSnapshot.val() !== user.uid) {
        throw new Error('تقارير Excel متاحة لحساب المالك فقط.');
      }
      return Promise.all([
        firebase.db.ref('students').once('value'),
        firebase.db.ref('groups').once('value'),
        firebase.db.ref('subjects').once('value'),
        firebase.db.ref('attendance').once('value'),
        firebase.db.ref('grades').once('value')
      ]);
    }).then(function (snapshots) {
      function value(index) {
        return snapshots[index].val() || {};
      }
      reportStore = {
        students: objectList(value(0)),
        groups: objectList(value(1)),
        subjects: objectList(value(2)),
        attendance: value(3),
        grades: value(4)
      };
      reportStore.students.sort(sortByName);
      reportStore.groups.sort(sortByName);
      reportStore.subjects.sort(sortByName);
      return reportStore;
    });
  }

  function objectList(value) {
    return Object.keys(value || {}).map(function (id) {
      var item = value[id] || {};
      return Object.assign({ id: id }, item);
    });
  }

  function sortByName(first, second) {
    return String(first.name || '').localeCompare(String(second.name || ''), 'ar');
  }

  function localDateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function addDays(date, amount) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function monthDates(monthValue) {
    var parts = String(monthValue || '').split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || !month) return [];
    var count = new Date(year, month, 0).getDate();
    var dates = [];
    for (var day = 1; day <= count; day += 1) {
      dates.push(year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
    }
    return dates;
  }

  function weekDates(startValue) {
    var parts = String(startValue || '').split('-');
    if (parts.length !== 3) return [];
    var start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(start.getTime())) return [];
    var dates = [];
    for (var index = 0; index < 7; index += 1) {
      dates.push(localDateKey(addDays(start, index)));
    }
    return dates;
  }

  function todayMonth() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function todayYear() {
    return String(new Date().getFullYear());
  }

  function groupName(groupId) {
    var group = reportStore.groups.find(function (item) { return item.id === groupId; });
    return group ? group.name || 'دون مجموعة' : 'دون مجموعة';
  }

  function studentsFor(groupId) {
    return reportStore.students.filter(function (student) {
      var active = student.status === 'active';
      return active && (!groupId || student.groupId === groupId);
    });
  }

  function recordFor(student, date) {
    var groupAttendance = reportStore.attendance[student.groupId] || {};
    var dayAttendance = groupAttendance[date] || {};
    return dayAttendance[student.id] || null;
  }

  function statusLabel(record) {
    if (!record || !record.status) return '—';
    if (record.status === 'present') return 'حاضر';
    if (record.status === 'late') return 'متأخر';
    if (record.status === 'absent') return 'غائب';
    return String(record.status);
  }

  function attendanceSummary(student, dates) {
    var presentDates = [];
    var absentDates = [];
    dates.forEach(function (date) {
      var status = recordFor(student, date) && recordFor(student, date).status;
      if (status === 'present' || status === 'late') presentDates.push(date);
      if (status === 'absent') absentDates.push(date);
    });
    return {
      presentDates: presentDates,
      absentDates: absentDates,
      present: presentDates.length,
      absent: absentDates.length
    };
  }

  function dayList(dates) {
    return dates.join('، ');
  }

  function dayNumbers(dates) {
    return dates.map(function (date) { return String(Number(date.slice(-2))); }).join('، ');
  }

  function attendanceReport(type, groupId, rangeValue) {
    var students = studentsFor(groupId);
    var headers = ['اسم الطالب', 'المجموعة'];
    var rows = [];
    if (type === 'yearly') {
      headers = headers.concat(['إجمالي الحضور', 'إجمالي الغياب', 'أيام الحضور خلال العام', 'أيام الغياب خلال العام']);
      MONTHS.forEach(function (month) {
        headers.push(month + ' - الحضور');
        headers.push(month + ' - الغياب');
        headers.push(month + ' - أيام الحضور');
        headers.push(month + ' - أيام الغياب');
      });
      students.forEach(function (student) {
        var totalPresent = 0;
        var totalAbsent = 0;
        var allPresent = [];
        var allAbsent = [];
        var row = [student.name || 'بدون اسم', groupName(student.groupId)];
        var year = Number(rangeValue) || Number(todayYear());
        MONTHS.forEach(function (month, index) {
          var monthNumber = String(index + 1).padStart(2, '0');
          var dates = monthDates(String(year) + '-' + monthNumber);
          var summary = attendanceSummary(student, dates);
          totalPresent += summary.present;
          totalAbsent += summary.absent;
          allPresent = allPresent.concat(summary.presentDates);
          allAbsent = allAbsent.concat(summary.absentDates);
          row.push(summary.present, summary.absent, dayNumbers(summary.presentDates), dayNumbers(summary.absentDates));
        });
        row.splice(2, 0, totalPresent, totalAbsent, dayList(allPresent), dayList(allAbsent));
        rows.push(row);
      });
      return { headers: headers, rows: rows, sheet: 'حضور سنوي ' + rangeValue };
    }

    var dates = type === 'weekly' ? weekDates(rangeValue) : monthDates(rangeValue);
    headers = headers.concat(['عدد الحضور', 'عدد الغياب', 'أيام الحضور', 'أيام الغياب']);
    dates.forEach(function (date) { headers.push(date); });
    students.forEach(function (student) {
      var summary = attendanceSummary(student, dates);
      var row = [
        student.name || 'بدون اسم',
        groupName(student.groupId),
        summary.present,
        summary.absent,
        dayList(summary.presentDates),
        dayList(summary.absentDates)
      ];
      dates.forEach(function (date) { row.push(statusLabel(recordFor(student, date))); });
      rows.push(row);
    });
    return {
      headers: headers,
      rows: rows,
      sheet: type === 'weekly' ? 'حضور أسبوعي' : 'حضور شهري'
    };
  }

  function gradesReport(groupId) {
    var students = studentsFor(groupId);
    var subjects = reportStore.subjects;
    var headers = ['اسم الطالب', 'المجموعة'].concat(subjects.map(function (subject) {
      return subject.name || 'مادة';
    }));
    headers.push('إجمالي الدرجات');
    var rows = students.map(function (student) {
      var gradeRecord = reportStore.grades[student.id] || {};
      var total = 0;
      var row = [student.name || 'بدون اسم', groupName(student.groupId)];
      subjects.forEach(function (subject) {
        var record = gradeRecord[subject.id] || {};
        var value = record.value === undefined || record.value === null ? '' : record.value;
        if (value !== '' && !isNaN(Number(value))) total += Number(value);
        row.push(value);
      });
      row.push(total);
      return row;
    });
    return { headers: headers, rows: rows, sheet: 'درجات الطلاب' };
  }

  function xmlEscape(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function workbookXml(report) {
    function cell(value) {
      var isNumber = typeof value === 'number' && isFinite(value);
      return '<Cell><Data ss:Type="' + (isNumber ? 'Number' : 'String') + '">' +
        xmlEscape(value) + '</Data></Cell>';
    }
    var xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="' + xmlEscape(String(report.sheet).slice(0, 31)) + '"><Table><Row>';
    report.headers.forEach(function (header) { xml += cell(header); });
    xml += '</Row>';
    report.rows.forEach(function (row) {
      xml += '<Row>';
      row.forEach(function (value) { xml += cell(value); });
      xml += '</Row>';
    });
    xml += '</Table></Worksheet></Workbook>';
    return xml;
  }

  function downloadReport(report, filename) {
    var blob = new Blob(['\ufeff', workbookXml(report)], {
      type: 'application/vnd.ms-excel;charset=utf-8'
    });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1000);
  }

  function makeElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, error) {
    if (!reportPanel) return;
    var status = reportPanel.querySelector('[data-excel-status]');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'excel-status' + (error ? ' error' : '');
  }

  function selectedGroup() {
    var select = reportPanel && reportPanel.querySelector('[data-report-group]');
    return select ? select.value : '';
  }

  function selectedType() {
    var select = reportPanel && reportPanel.querySelector('[data-report-type]');
    return select ? select.value : 'weekly';
  }

  function selectedRange(type) {
    if (!reportPanel) return '';
    if (type === 'weekly') return reportPanel.querySelector('[data-report-week]').value;
    if (type === 'monthly') return reportPanel.querySelector('[data-report-month]').value;
    return reportPanel.querySelector('[data-report-year]').value;
  }

  function renderPreview(report) {
    if (!reportPanel) return;
    var target = reportPanel.querySelector('[data-excel-preview]');
    target.textContent = '';
    if (!report.rows.length) {
      target.appendChild(makeElement('div', 'empty-state', 'لا يوجد طلاب مفعّلون في الاختيار الحالي.'));
      return;
    }
    var wrap = makeElement('div', 'table-wrap');
    var table = makeElement('table', 'data-table');
    var thead = makeElement('thead');
    var headRow = makeElement('tr');
    report.headers.forEach(function (header) { headRow.appendChild(makeElement('th', '', header)); });
    thead.appendChild(headRow);
    var tbody = makeElement('tbody');
    report.rows.forEach(function (row) {
      var tr = makeElement('tr');
      row.forEach(function (value) { tr.appendChild(makeElement('td', '', value)); });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    target.appendChild(wrap);
  }

  function refreshPreview() {
    if (!reportPanel || !reportStore) return;
    var type = selectedType();
    var range = selectedRange(type);
    if (!range) {
      setStatus('اختر الفترة أولاً لعرض التقرير.', true);
      return;
    }
    var report = attendanceReport(type, selectedGroup(), range);
    renderPreview(report);
    setStatus('تم تجهيز معاينة ' + (type === 'weekly' ? 'الحضور الأسبوعي' : type === 'monthly' ? 'الحضور الشهري' : 'الحضور السنوي') + '، ويمكن تحميلها كملف Excel.');
  }

  function refreshRangeVisibility() {
    if (!reportPanel) return;
    var type = selectedType();
    reportPanel.querySelector('[data-range-week]').style.display = type === 'weekly' ? '' : 'none';
    reportPanel.querySelector('[data-range-month]').style.display = type === 'monthly' ? '' : 'none';
    reportPanel.querySelector('[data-range-year]').style.display = type === 'yearly' ? '' : 'none';
    refreshPreview();
  }

  function populateGroups() {
    var select = reportPanel.querySelector('[data-report-group]');
    select.textContent = '';
    select.appendChild(makeElement('option', '', 'كل المجموعات'));
    reportStore.groups.forEach(function (group) {
      var option = makeElement('option', '', group.name || 'مجموعة');
      option.value = group.id;
      select.appendChild(option);
    });
  }

  function buildPanel() {
    var content = document.querySelector('.content-inner');
    if (!content || !isOwner()) return;
    installStyle();
    if (reportPanel && reportPanel.parentNode) return;
    reportPanel = makeElement('section', 'owner-excel-panel');
    reportPanel.innerHTML =
      '<div class="page-heading"><div><h1>ملفات Excel</h1><p>تقارير الحضور والدرجات — للمالك فقط</p></div></div>' +
      '<div class="excel-intro"><span aria-hidden="true">📊</span><div><strong>تصدير منظم لبيانات الطلاب</strong><p>الحضور الأسبوعي والشهري يعرض كل يوم، بينما الحضور السنوي يلخص كل شهر بأيام الحضور والغياب. ملف الدرجات يضع اسم الطالب أولاً ثم المواد في أعمدة مستقلة.</p></div></div>' +
      '<div class="card excel-toolbar">' +
      '<div class="field excel-type"><label>نوع تقرير الحضور</label><select data-report-type><option value="weekly">أسبوعي — 7 أيام</option><option value="monthly">شهري — كل أيام الشهر</option><option value="yearly">سنوي — ملخص كل شهر</option></select></div>' +
      '<div class="field"><label>المجموعة</label><select data-report-group><option>جاري التحميل...</option></select></div>' +
      '<div class="field" data-range-week><label>بداية الأسبوع</label><input type="date" data-report-week></div>' +
      '<div class="field" data-range-month style="display:none"><label>الشهر</label><input type="month" data-report-month value="' + todayMonth() + '"></div>' +
      '<div class="field" data-range-year style="display:none"><label>السنة</label><input type="number" min="2000" max="2100" data-report-year value="' + todayYear() + '"></div>' +
      '</div>' +
      '<div class="excel-actions"><button type="button" class="button primary" data-download-attendance>تحميل حضور النوع المحدد</button><button type="button" class="button" data-download-grades>تحميل درجات الطلاب</button><button type="button" class="button" data-refresh-excel>تحديث البيانات</button></div>' +
      '<div class="excel-status" data-excel-status role="status" aria-live="polite">جاري قراءة بيانات المالك...</div>' +
      '<div class="card"><div class="card-header"><h3>المعاينة</h3><small>سيتم تحميل نفس الجدول بصيغة Excel</small></div><div class="excel-preview" data-excel-preview></div></div>' +
      '<p class="excel-note">الملفات بصيغة Excel 2003 XML وتفتح مباشرة في Excel وGoogle Sheets. لا يتم حفظ نسخة من الملف داخل Firebase.</p>';
    Array.prototype.slice.call(content.children).forEach(function (child) {
      child.style.display = 'none';
      child.setAttribute('data-hidden-for-owner-excel', 'true');
    });
    content.appendChild(reportPanel);
    var now = new Date();
    var monday = addDays(now, -(now.getDay() === 0 ? 6 : now.getDay() - 1));
    reportPanel.querySelector('[data-report-week]').value = localDateKey(monday);
    reportPanel.querySelector('[data-report-type]').addEventListener('change', refreshRangeVisibility);
    reportPanel.querySelector('[data-report-group]').addEventListener('change', refreshPreview);
    reportPanel.querySelector('[data-report-week]').addEventListener('change', refreshPreview);
    reportPanel.querySelector('[data-report-month]').addEventListener('change', refreshPreview);
    reportPanel.querySelector('[data-report-year]').addEventListener('change', refreshPreview);
    reportPanel.querySelector('[data-download-attendance]').addEventListener('click', function () {
      try {
        if (!reportStore) throw new Error('لم تكتمل قراءة البيانات بعد.');
        var type = selectedType();
        var range = selectedRange(type);
        if (!range) throw new Error('اختر الفترة أولاً.');
        var report = attendanceReport(type, selectedGroup(), range);
        var suffix = type === 'weekly' ? 'weekly' : type === 'monthly' ? 'monthly' : 'yearly';
        downloadReport(report, 'attendance-' + suffix + '-' + range + '.xls');
        setStatus('تم تحميل ملف الحضور بنجاح.');
      } catch (error) {
        setStatus(error.message || 'تعذر إنشاء ملف الحضور.', true);
      }
    });
    reportPanel.querySelector('[data-download-grades]').addEventListener('click', function () {
      try {
        if (!reportStore) throw new Error('لم تكتمل قراءة البيانات بعد.');
        downloadReport(gradesReport(selectedGroup()), 'student-grades-' + new Date().toISOString().slice(0, 10) + '.xls');
        setStatus('تم تحميل ملف درجات الطلاب بنجاح.');
      } catch (error) {
        setStatus(error.message || 'تعذر إنشاء ملف الدرجات.', true);
      }
    });
    reportPanel.querySelector('[data-refresh-excel]').addEventListener('click', function () {
      loadReportData();
    });
    loadReportData();
  }

  function loadReportData() {
    if (!reportPanel) return;
    setStatus('جاري قراءة بيانات الطلاب والحضور والدرجات...');
    reportPanel.querySelector('[data-refresh-excel]').disabled = true;
    readOwnerData().then(function () {
      populateGroups();
      reportPanel.querySelector('[data-refresh-excel]').disabled = false;
      refreshPreview();
    }).catch(function (error) {
      reportPanel.querySelector('[data-refresh-excel]').disabled = false;
      setStatus(error.message || 'تعذر قراءة بيانات Firebase.', true);
    });
  }

  function restoreApp() {
    if (!reportPanel) return;
    var content = reportPanel.parentNode;
    reportPanel.remove();
    Array.prototype.slice.call(content.children).forEach(function (child) {
      if (child.getAttribute('data-hidden-for-owner-excel') === 'true') {
        child.style.display = '';
        child.removeAttribute('data-hidden-for-owner-excel');
      }
    });
    reportPanel = null;
  }

  function openReports() {
    if (!isOwner()) return;
    buildPanel();
  }

  function addNavButton(container, mobile) {
    if (!container || container.querySelector('[data-owner-excel-nav]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = mobile ? '' : 'nav-item';
    button.setAttribute('data-owner-excel-nav', 'true');
    button.innerHTML = mobile ? '<span aria-hidden="true">📊</span><span>Excel</span>' : '<span aria-hidden="true">▦</span><span>ملفات Excel</span>';
    button.addEventListener('click', openReports);
    container.appendChild(button);
  }

  function syncOwnerUi() {
    installStyle();
    if (!isOwner()) {
      document.querySelectorAll('[data-owner-excel-nav]').forEach(function (button) { button.remove(); });
      if (reportPanel) restoreApp();
      return;
    }
    addNavButton(document.querySelector('.sidebar'), false);
    addNavButton(document.querySelector('.mobile-nav'), true);
  }

  document.addEventListener('click', function (event) {
    if (!reportPanel || !event.target || typeof event.target.closest !== 'function') return;
    var navButton = event.target.closest('.sidebar .nav-item, .mobile-nav button');
    if (navButton && !navButton.hasAttribute('data-owner-excel-nav')) restoreApp();
  }, true);

  function start() {
    if (reportObserver) return;
    installStyle();
    reportObserver = new MutationObserver(function () {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(syncOwnerUi, 80);
    });
    reportObserver.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    window.setTimeout(syncOwnerUi, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();