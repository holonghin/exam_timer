const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const text='考試剩下最後 {finalMinutes} 分鐘。';
function legacy(id='exam'){
 const c=C.makeTemplate(id);delete c.noticeVersion;
 c.reminders=c.reminders.filter(r=>r.id!=='final-reminder');
 c.phases.find(p=>p.id==='last').rules.unshift({text});
 if(id==='quiz'){c.subtitle='隨堂測驗';c.phases.find(p=>p.id==='finished').rules.push({text:'請留在座位，待助教清點並確認試卷份數後再離場。'});}
 return c;
}
test('exam and quiz use a timed final warning banner, never a duplicate numbered rule',()=>{
 for(const id of ['exam','quiz']){
   const c=C.makeTemplate(id),t=C.schedule(c);
   assert.deepEqual(C.stateAt(c,t.final-1).reminders,[]);
   assert.deepEqual(C.stateAt(c,t.final).reminders,['考試剩下最後 5 分鐘。']);
   assert.ok(!C.stateAt(c,t.final).rules.some(r=>r.startsWith('考試剩下最後')));
   assert.deepEqual(C.stateAt(c,t.final+2*C.MIN).reminders,[]);
   c.start=C.shiftStart(c,90).start;c.extension=10;
   const shifted=C.schedule(c);assert.deepEqual(C.stateAt(c,shifted.final).reminders,['考試剩下最後 5 分鐘。']);
 }
});
test('old exact defaults move once into editable timed reminders and quiz becomes 小考',()=>{
 for(const id of ['exam','quiz']){
   const c=legacy(id),next=C.upgrade(c);
   assert.deepEqual(C.validate(next),[]);assert.equal(next.reminders.filter(r=>r.id==='final-reminder').length,1);
   assert.ok(!next.phases.find(p=>p.id==='last').rules.some(r=>r.text===text));
   assert.deepEqual(C.upgrade(next),next);
   if(id==='quiz'){assert.equal(next.subtitle,'小考');assert.ok(!JSON.stringify(next.phases.find(p=>p.id==='finished')).includes('清點'));}
   else assert.ok(JSON.stringify(next.phases.find(p=>p.id==='finished')).includes('清點'));
 }
});
test('migration preserves edited or deliberately deleted final warnings and custom quiz wording',()=>{
 const c=legacy('quiz'),last=c.phases.find(p=>p.id==='last');
 last.rules[0].text='自訂最後提醒';c.subtitle='甲班小考';
 c.phases.find(p=>p.id==='finished').rules.at(-1).text='請依現場指示離場';
 let next=C.upgrade(c);assert.equal(next.subtitle,c.subtitle);assert.ok(!next.reminders.some(r=>r.id==='final-reminder'));assert.ok(JSON.stringify(next.phases).includes('自訂最後提醒'));assert.ok(JSON.stringify(next.phases).includes('請依現場指示離場'));
 last.rules.shift();next=C.upgrade(c);assert.ok(!next.reminders.some(r=>r.id==='final-reminder'));
 const current=C.makeTemplate('exam');current.reminders=current.reminders.filter(r=>r.id!=='final-reminder');assert.deepEqual(C.upgrade(current),current);
});
