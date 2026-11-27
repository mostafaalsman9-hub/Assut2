const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const compat=require('firebase/compat/app');require('firebase/compat/firestore');
global.window=global;global.setInterval=()=>0;
vm.runInThisContext(fs.readFileSync('/tmp/Assut2/fs-adapter.js','utf8'));
const mig=require('/tmp/Assut2/backend/migrate.js');
const rawBk=JSON.parse(fs.readFileSync('/tmp/rtdb-backup.json','utf8'));
const bk=mig.normalize(rawBk).data; bk._uid=rawBk._uid;
const OWNER=bk._uid;
const mkLs=()=>{const m={};return{getItem:k=>m[k]||null,setItem:(k,v)=>{m[k]=v},removeItem:k=>{delete m[k]},get length(){return Object.keys(m).length},key:i=>Object.keys(m)[i]}};
function apiFor(ctx,uid){
  if(!ctx.__fs){const inst=ctx.firestore();ctx.__fs=inst;ctx.firestore=()=>inst;}
  const fbObj={firestore:Object.assign(()=>ctx.firestore(),{FieldPath:compat.firestore.FieldPath,FieldValue:compat.firestore.FieldValue}),auth:()=>({currentUser:uid?{uid}:null,onAuthStateChanged:()=>()=>{}})};
  return __fsBuild('fs',{firebase:fbObj,localStorage:mkLs(),document:{visibilityState:'visible',addEventListener(){}},setInterval:()=>0});
}
let pass=0,fail=0;
const T=async(name,fn)=>{try{await fn();pass++;console.log('PASS',name)}catch(e){fail++;console.log('FAIL',name,'-',String(e.message).split('\n')[0])}};
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-assut',firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8085}});
 // ترحيل بصلاحيات تجاوز القواعد
 await env.withSecurityRulesDisabled(async ctx=>{
   const a=apiFor(ctx,OWNER); const r=await mig.migrateAll(a,rawBk,console.log); console.log('skipped',r.skipped.join(','));
 });
 const adminUid=Object.keys(bk.admins)[0], studs=Object.keys(bk.students);
 // نختار طالباً وربطه بمجموعة، ومسؤول مجموعة
 const gid=Object.keys(bk.groups)[0], gAdmins=Object.keys(bk.groups[gid].adminIds||{});
 console.log('groups',Object.keys(bk.groups).length,'groupAdmins',gAdmins.length,'admins',Object.keys(bk.admins).length,'students',studs.length);
 const studentWithGroup=studs.find(s=>bk.students[s].groupId)||studs[0];
 const S=studentWithGroup, G=bk.students[S].groupId||gid;
 const own=env.authenticatedContext(OWNER), adm=env.authenticatedContext(adminUid), stu=env.authenticatedContext(S), anon=env.unauthenticatedContext();
 // ===== المالك =====
 await T('owner reads every node identical to RTDB backup',async()=>{
   const a=apiFor(own,OWNER);
   for(const n of ['owner','admins','students','schools','groups','subjects','grades','attendance','notifications']){
     const v=(await a.ref(n).once('value')).val(); assert.deepStrictEqual(v,bk[n]??null,n);}
 });
 await T('owner can write school/group/subject/grade/notification/student',async()=>{
   const a=apiFor(own,OWNER);
   await a.ref('schools/zz').set({name:'t',createdAt:1});
   await a.ref('grades/'+S+'/k1').set({v:1});
   await a.ref('notifications/n1').set({title:'t',createdAt:5,target:'all'});
   await a.ref('students/'+S+'/groupId').set(G);
   await a.ref('attendance/'+G+'/2026-11-02/'+S).set('present');
 });
 // ===== الطالب =====
 await T('student reads own record + schools/groups/subjects + notifications',async()=>{
   const a=apiFor(stu,S);
   assert.ok((await a.ref('students/'+S).once('value')).exists());
   await a.ref('schools').once('value'); await a.ref('groups').once('value'); await a.ref('subjects').once('value'); await a.ref('notifications').once('value');
 });
 await T('student role-scoped load of students (only own) and attendance (own group)',async()=>{
   const a=apiFor(stu,S);
   const st=(await a.ref('students').once('value')).val(); assert.deepStrictEqual(Object.keys(st),[S]);
   const at=(await a.ref('attendance').once('value')).val(); assert.ok(at[G]);
 });
 await T('student reads own grades',async()=>{await apiFor(stu,S).ref('grades/'+S).once('value')});
 await T('DENY student lists all students',()=>assertFails(stu.firestore().collection('students').get()));
 await T('DENY student reads other student',()=>assertFails(stu.firestore().collection('students').doc(studs.find(x=>x!==S)).get()));
 await T('DENY student reads other grades',()=>assertFails(stu.firestore().collection('grades').doc(studs.find(x=>x!==S)).get()));
 await T('DENY student lists all grades',()=>assertFails(stu.firestore().collection('grades').get()));
 await T('DENY student reads all attendance (no group filter)',()=>assertFails(stu.firestore().collection('attendance').get()));
 await T('DENY student attendance of another group',()=>assertFails(stu.firestore().collection('attendance').where('g','==','otherGroup').get()));
 await T('DENY student writes own status',()=>assertFails(stu.firestore().collection('students').doc(S).update({status:'__zz'})));
 await T('DENY student changes own groupId/schoolId',()=>assertFails(stu.firestore().collection('students').doc(S).update({groupId:'x'})));
 await T('DENY student writes grades',()=>assertFails(stu.firestore().collection('grades').doc(S).set({a:1})));
 await T('DENY student writes schools/groups/subjects',()=>assertFails(stu.firestore().collection('meta').doc('schools').set({a:1})));
 await T('DENY student writes notifications',()=>assertFails(stu.firestore().collection('notifications').doc('x').set({a:1})));
 await T('DENY student writes attendance',()=>assertFails(stu.firestore().collection('attendance').doc(G+'~2026-11').set({g:G,d:{}})));
 await T('DENY student reads ownerExperience',()=>assertFails(stu.firestore().collection('meta').doc('ownerExperience').get()));
 await T('DENY student overwrites owner doc',()=>assertFails(stu.firestore().collection('meta').doc('owner').set({uid:S})));
 await T('student CAN write own notifRead',()=>assertSucceeds(stu.firestore().collection('notifRead').doc(S).set({n1:true})));
 await T('DENY student writes others notifRead',()=>assertFails(stu.firestore().collection('notifRead').doc('other').set({n1:true})));
 await T('student can update own non-protected field (phone)',()=>assertSucceeds(stu.firestore().collection('students').doc(S).update({phone:'0100'})));
 // ===== المسؤول =====
 await T('admin lists students and reads grades',async()=>{await assertSucceeds(adm.firestore().collection('students').get());await assertSucceeds(adm.firestore().collection('grades').get())});
 await T('DENY admin writes grades',()=>assertFails(adm.firestore().collection('grades').doc(S).set({a:1})));
 await T('admin can ban/activate a student (status only)',()=>assertSucceeds(adm.firestore().collection('students').doc(S).update({status:'banned'})));
 await T('DENY admin edits student name',()=>assertFails(adm.firestore().collection('students').doc(S).update({name:'hack'})));
 await T('DENY admin changes student group',()=>assertFails(adm.firestore().collection('students').doc(S).update({groupId:'x'})));
 await T('DENY admin sets status other than active/banned',()=>assertFails(adm.firestore().collection('students').doc(S).update({status:'pending'})));
 await T('DENY admin creates school',()=>assertFails(adm.firestore().collection('meta').doc('groups').set({a:1})));
 await T('DENY admin deletes student',()=>assertFails(adm.firestore().collection('students').doc(S).delete()));
 await T('DENY admin reads ownerExperience',()=>assertFails(adm.firestore().collection('meta').doc('ownerExperience').get()));
 await T('DENY admin writes admins doc of another',()=>assertFails(adm.firestore().collection('admins').doc('other').set({email:'e',role:'admin'})));
 await T('admin edits own admin doc but not email/role',async()=>{
   await assertSucceeds(adm.firestore().collection('admins').doc(adminUid).update({phone:'1'}));
   await assertFails(adm.firestore().collection('admins').doc(adminUid).update({role:'owner'}));
   await assertFails(adm.firestore().collection('admins').doc(adminUid).update({email:'x@y.z'}));
 });
 if(gAdmins.length){
   const ga=env.authenticatedContext(gAdmins[0]);
   // هل هو مسؤول (admins doc)؟
   if(bk.admins[gAdmins[0]]){
     await T('group admin can write attendance of own group',()=>assertSucceeds(ga.firestore().collection('attendance').doc(G+'~2026-11').set({g:G,m:'2026-11',d:{'2026-11-03':{[S]:'present'}}})));
     await T('DENY group admin writes attendance of another group',()=>assertFails(ga.firestore().collection('attendance').doc('zzz~2026-11').set({g:'zzz',m:'2026-11',d:{}})));
     await T('DENY group admin mismatched g vs docId',()=>assertFails(ga.firestore().collection('attendance').doc('zzz~2026-11').set({g:G,m:'2026-11',d:{}})));
   }
 }
 // ===== غير مسجل =====
 await T('anon reads owner doc (public, as before)',()=>assertSucceeds(anon.firestore().collection('meta').doc('owner').get()));
 for(const [c,d] of [['students',S],['admins',adminUid],['grades',S],['meta','schools'],['meta','groups'],['notifications','x'],['attendance','x'],['deletedAccounts',S]])
   await T('DENY anon reads '+c+'/'+d,()=>assertFails(anon.firestore().collection(c).doc(d).get()));
 await T('DENY anon writes',()=>assertFails(anon.firestore().collection('students').doc('x').set({status:'pending'})));
 // ===== حساب محذوف =====
 await T('deleted account is locked out',async()=>{
   await env.withSecurityRulesDisabled(async c=>{await c.firestore().collection('deletedAccounts').doc(S).set({uid:S})});
   await assertFails(stu.firestore().collection('students').doc(S).get());
   await assertFails(stu.firestore().collection('meta').doc('schools').get());
 });
 // ===== تسجيل طالب جديد =====
 await T('new student self-registers as pending',async()=>{
   const nu=env.authenticatedContext('newUser1');
   await assertSucceeds(nu.firestore().collection('students').doc('newUser1').set({name:'n',email:'e',status:'pending',createdAt:1}));
   await assertFails(env.authenticatedContext('newUser2').firestore().collection('students').doc('newUser2').set({name:'n',status:'active'}));
 });
 // ===== إنشاء المالك الأول فقط لمن uid مطابق =====
 await T('DENY creating owner doc with someone else uid',async()=>{
   await env.clearFirestore();
   await assertFails(env.authenticatedContext('a1').firestore().collection('meta').doc('owner').set({uid:'b2'}));
   await assertSucceeds(env.authenticatedContext('a1').firestore().collection('meta').doc('owner').set({uid:'a1'}));
 });
 await env.cleanup();
 console.log('\nSUMMARY pass',pass,'fail',fail);
 process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL',e);process.exit(2)});
