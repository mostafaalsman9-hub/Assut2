# نموذج البيانات المشترك (Cloud Firestore)

مصمم ليستخدمه الموقع وتطبيق أندرويد وتطبيق سطح المكتب بنفس المشروع (drali-f6b14). القواعد في `firestore.rules`.
الموقع يصل للبيانات عبر `fs-adapter.js` فقط (طبقة وصول). التطبيقات الأخرى تستخدم Firestore SDK مباشرة بنفس المستندات التالية.

| المسار | المحتوى |
|---|---|
| `meta/owner` | `{uid,name,email,phone,createdAt}` قراءة عامة (لإعداد المنصة أول مرة) |
| `meta/schools` | حقل لكل مدرسة: `{schoolId:{name,adminIds:{uid:true},createdAt}}` |
| `meta/groups` | `{groupId:{name,schoolId,adminIds:{uid:true},createdAt}}` |
| `meta/subjects` | `{subjectId:{name,code,max,createdAt}}` |
| `meta/ownerExperience` | `{text,updatedAt,updatedBy}` للمالك فقط |
| `admins/{uid}` | `{name,email,phone,role:'admin',createdAt}` |
| `students/{uid}` | `{name,email,phone,status:'pending'|'active'|'banned',groupId,schoolId,createdAt}` |
| `grades/{studentUid}` | حقل لكل درجة: `{gradeId:{subjectId,value,...}}` |
| `attendance/{groupId}~{yyyy-mm}` | `{g:groupId, m:'yyyy-mm', d:{ 'yyyy-mm-dd': {studentUid:'present'|'absent'|'late'} }}` (الأقدم غير المنتظم في `~legacy`) |
| `notifications/{id}` | `{title,body,target,targetId,createdAt,createdBy}` (يُقرأ آخر 50) |
| `notifRead/{uid}` | `{notificationId:true}` |
| `deletedAccounts/{uid}` | `{uid,name,email,role,deletedAt,deletedBy}` يمنع الحساب من الدخول |

ملاحظات القراءة الموفرة: المدارس والمجموعات والمواد مستند واحد لكل منها (قراءة واحدة)، الحضور مستند لكل مجموعة وشهر، الطالب يحمّل سجله ومجموعته فقط، ولا مستمعات لحظية على قوائم كبيرة.
