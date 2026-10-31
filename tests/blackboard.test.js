const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const fresh=()=>C.clone(C.defaults);
const at=t=>Date.parse('2026-10-31T'+t+'+08:00');
const empty=()=>C.clone(C.defaults.attendance);
test('default title stays numeric and optional board values start unset',()=>{
 const c=fresh(); assert.equal(c.title,'微積分1'); assert.equal(c.teacher,''); assert.equal(c.questionCount,null);
 assert.deepEqual(c.attendance,{expected:null,present:null,absent:null,manualOrder:[]}); assert.deepEqual(C.validate(c),[]);
});
for(const [a,av,b,bv,result] of [
 ['expected','60','present','58',{expected:60,present:58,absent:2}],
 ['present','58','absent','2',{expected:60,present:58,absent:2}],
 ['absent','2','expected','60',{expected:60,present:58,absent:2}]
]) test('attendance derives third field from '+a+' and '+b,()=>{
 let state=C.editAttendance(empty(),a,av).value; const changed=C.editAttendance(state,b,bv);
 for(const key of Object.keys(result)) assert.equal(changed.value[key],result[key]);
 assert.deepEqual(changed.value.manualOrder,[a,b]); assert.deepEqual(changed.errors,[]);
});
test('most recently edited pair replaces previous sources and survives JSON',()=>{
 let a=C.editAttendance(empty(),'expected','60').value; a=C.editAttendance(a,'present','58').value;
 a=C.editAttendance(a,'absent','3').value; assert.equal(a.expected,61); assert.deepEqual(a.manualOrder,['present','absent']);
 a=JSON.parse(JSON.stringify(a)); a=C.editAttendance(a,'expected','62').value;
 assert.equal(a.present,59); assert.deepEqual(a.manualOrder,['absent','expected']);
});
test('blank is not zero and clearing a source clears dependent totals',()=>{
 let a=C.editAttendance(empty(),'expected','0').value; assert.equal(a.expected,0); assert.equal(a.present,null); assert.equal(a.absent,null);
 a=C.editAttendance(a,'present','0').value; assert.equal(a.absent,0);
 a=C.editAttendance(a,'expected','').value; assert.equal(a.expected,null); assert.equal(a.absent,null); assert.equal(a.present,0);
});
test('bad counts remain invalid drafts and never create a negative derived count',()=>{
 for(const raw of ['-1','1.5','abc','1e2','9007199254740992']) assert.ok(C.editAttendance(empty(),'expected',raw).errors.length);
 let a=C.editAttendance(empty(),'expected','50').value; const result=C.editAttendance(a,'present','60');
 assert.equal(result.value.absent,null); assert.ok(result.errors.length);
 const c=fresh(); c.attendance=result.value; assert.ok(C.validate(c).length);
});
test('question count permits null and zero but refuses negative/fractional values',()=>{
 for(const value of [null,0,6]) {const c=fresh();c.questionCount=value;assert.deepEqual(C.validate(c),[]);}
 for(const value of [-1,1.5,'6',NaN]) {const c=fresh();c.questionCount=value;assert.ok(C.validate(c).length);}
});
test('teacher, question count, counts and visibility persist through export/import',()=>{
 const c=fresh(); c.teacher='測試老師'; c.questionCount=6;c.showTeacher=false;
 c.attendance=C.editAttendance(C.editAttendance(empty(),'expected','60').value,'present','58').value;
 const copy=C.upgrade(JSON.parse(JSON.stringify(c))); assert.deepEqual(copy,c); assert.deepEqual(C.validate(copy),[]);
});
test('quiz has 17:30–18:20 timing, three-minute preparation and 20-minute reminder',()=>{
 const c=C.makeTemplate('quiz'),t=C.schedule(c);assert.deepEqual(C.validate(c),[]);
 assert.equal(t.start,at('17:30:00'));assert.equal(t.end,at('18:20:00'));assert.equal(t.admission,at('17:27:00'));
 assert.equal(t.final,at('18:15:00'));assert.equal(t.half,at('18:00:00'));assert.equal(t.handin,undefined);
 assert.equal(c.admissionEnabled,false);assert.equal(c.showTeacher,false);assert.equal(c.showQuestions,false);assert.equal(c.showAttendance,false);
 assert.ok(!c.fixed.some(r=>r.id==='bathroom'));assert.ok(!JSON.stringify(c.phases).includes('背包'));
 assert.equal(C.stateAt(c,at('17:27:00')).stage.id,'entry');assert.equal(C.stateAt(c,at('17:30:00')).stage.id,'exam');
 assert.match(C.stateAt(c,at('18:00:00')).reminders[0],/20 分鐘/);
});
test('quiz fields stay available and can be explicitly enabled',()=>{
 const c=C.makeTemplate('quiz');c.showTeacher=true;c.showQuestions=true;c.showAttendance=true;
 c.teacher='老師';c.questionCount=3;assert.deepEqual(C.validate(c),[]);
});
test('exam and quiz suspend-submission rule is highlighted by default',()=>{
 for(const id of ['exam','quiz']){const c=C.makeTemplate(id);assert.equal(c.phases.find(p=>p.id==='last').rules.find(r=>r.text.includes('暫停提前交卷')).highlight,true);}
});
test('both templates show revised pre-exam notice until shifted start',()=>{
 for(const id of ['exam','quiz']){let c=C.makeTemplate(id);c=C.shiftStart(c,90);const t=C.schedule(c);
 assert.ok(C.stateAt(c,t.start-1).rules.some(r=>r.includes('請等候監考人員宣布開始')));
 assert.ok(!C.stateAt(c,t.start).rules.some(r=>r.includes('請等候監考人員宣布開始')));}
});
test('clear creates an empty draft which cannot apply without basic information',()=>{
 const c=C.makeTemplate('blank');assert.equal(c.title,'');assert.equal(c.date,'');assert.equal(c.start,'');assert.equal(c.duration,null);
 assert.deepEqual(c.events,{});assert.deepEqual(c.phases,[]);assert.deepEqual(c.fixed,[]);assert.deepEqual(c.reminders,[]);
 assert.equal(c.teacher,'');assert.equal(c.questionCount,null);assert.deepEqual(c.attendance,empty());
 const errors=C.validate(c);assert.ok(errors.some(e=>e.includes('名稱')));assert.ok(errors.some(e=>e.includes('日期')));assert.ok(errors.some(e=>e.includes('開始')));assert.ok(errors.some(e=>e.includes('長度')));
});
test('custom template works after filling basics, even with no extra stages/rules',()=>{
 const c=C.makeTemplate('blank');Object.assign(c,{title:'自訂測驗',date:'2026-10-31',start:'15:00',duration:30});
 assert.deepEqual(C.validate(c),[]);assert.equal(C.stateAt(c,at('15:10:00')).title,'考試進行中');assert.equal(C.stateAt(c,at('15:30:00')).title,'考試結束');
 assert.deepEqual(C.stateAt(c,at('15:10:00')).rules,[]);
});
test('templates are independent fresh copies and never mutate active settings',()=>{
 const active=fresh(),exam=C.makeTemplate('exam'),quiz=C.makeTemplate('quiz');quiz.phases[0].rules[0].text='changed';
 assert.notEqual(exam.phases[0].rules[0].text,'changed');assert.deepEqual(active,C.defaults);
});
test('seconds-based shifting preserves entry and translates every subsequent node exactly',()=>{
 for(const seconds of [1,29,90,-30,300,-300]){const c=fresh(),shifted=C.shiftStart(c,seconds),a=C.schedule(c),b=C.schedule(shifted);
 assert.equal(a.admission,b.admission);for(const id of C.getAnchors(c).filter(k=>k!=='admission'))assert.equal(b[id]-a[id],seconds*1000,id);
 assert.equal(b.end-b.start,a.end-a.start);assert.deepEqual(C.validate(shifted),[]);}
 const c=C.shiftStart(fresh(),90);assert.equal(c.start,'09:01:30');assert.equal(C.tokens(c).handin,'09:41:30');assert.equal(C.tokens(c).end,'11:31:30');
});
test('seconds shifts and independent extension combine without reducing exam duration',()=>{
 let c=C.shiftStart(fresh(),330);c.extension=10;const t=C.schedule(c);
 assert.equal(C.timeLabel(t.start,c.date),'09:05:30');assert.equal(C.timeLabel(t.handin,c.date),'09:45:30');
 assert.equal(C.timeLabel(t.final,c.date),'11:40:30');assert.equal(C.timeLabel(t.end,c.date),'11:45:30');
 assert.equal(C.stateAt(c,at('09:45:29')).remaining,1);
});
test('shift bounds and malformed second values are rejected',()=>{
 for(const seconds of [NaN,1.5,86400,-86400])assert.throws(()=>C.shiftStart(fresh(),seconds));
 assert.ok(Number.isNaN(C.parseTime('09:00:60')));assert.equal(C.parseTime('09:00:30'),540.5);
});
test('legacy settings receive only missing board defaults and preserve custom rules/times',()=>{
 const c=fresh();for(const k of ['blackboardVersion','templateId','teacher','questionCount','attendance','admissionEnabled','preparationMinutes','showClass','showRoom','showTeacher','showQuestions','showAttendance'])delete c[k];
 c.start='09:07';c.room='A301';c.phases[0].rules[0].text='考試開始前，請勿翻閱試卷內頁或提前作答，僅可閱讀封面說明。請等候助教宣布開始。';
 const next=C.upgrade(c);assert.deepEqual(C.validate(next),[]);assert.equal(next.start,'09:07');assert.equal(next.room,'A301');
 assert.equal(next.phases[0].rules[0].text,C.defaults.phases[0].rules[0].text);assert.deepEqual(C.upgrade(next),next);
});
