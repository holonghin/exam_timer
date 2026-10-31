const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const M = require('../src/mascot.js');
const fresh = () => C.clone(C.defaults);
const at = time => Date.parse('2026-10-31T' + time + '+08:00');
test('custom nodes support entry/start/end anchors, rename, shifting and extension', () => {
  const c = fresh(); c.events.entrycheck = { label: '入場檢查', anchor: 'admission', offset: 5 };
  c.events.check = { label: '檢查資料', anchor: 'start', offset: 60 }; c.events.ten = { label: '剩十分鐘', anchor: 'end', offset: -10 };
  assert.deepEqual(C.validate(c), []); const before = C.schedule(c); c.start = '09:10'; c.extension = 5; const after = C.schedule(c);
  assert.equal(after.entrycheck, before.entrycheck); assert.equal(after.check - before.check, 10 * C.MIN); assert.equal(after.ten - before.ten, 15 * C.MIN);
  c.events.check.label = '資料提醒'; assert.equal(C.eventName(c, 'check'), '資料提醒');
});
test('custom nodes can anchor phases, fixed rules, reminders and dynamic text', () => {
  const c = fresh(); c.events.check = { label: '檢查資料', anchor: 'start', offset: 60 };
  c.phases.push({ id: 'check-phase', anchor: 'check', offset: 0, title: '資料檢查', tone: 'sage', rules: [{text:'請在 {check} 檢查個人資料。'}] });
  c.fixed.push({ id:'extra', from:'check', until:'end', text:'提醒 {check}' });
  c.reminders.push({id:'extra', at:'check', minutes:2, enabled:true, text:'提醒 {check}'});
  assert.deepEqual(C.validate(c), []); const s = C.stateAt(c, at('10:00:00'));
  assert.equal(s.stage.id, 'check-phase'); assert.match(s.rules[0], /10:00/); assert.ok(s.fixed.includes('提醒 10:00')); assert.ok(s.reminders.includes('提醒 10:00'));
});
test('deleting hand-in removes dependencies and counts down to end without NaN', () => {
  const c = fresh(), next = C.removeEvent(c, 'handin'); assert.deepEqual(C.validate(next), []);
  assert.ok(!Object.hasOwn(next.events, 'handin')); assert.ok(!next.phases.some(p => p.anchor === 'handin'));
  assert.ok(!next.phases.some(p => p.rules.some(r => r.text.includes('{handin}'))));
  assert.ok(Object.hasOwn(c.events, 'handin')); const s = C.stateAt(next, at('09:10:00'));
  assert.equal(s.countdownLabel, '距離考試結束'); assert.equal(s.remaining, 140 * 60); assert.ok(Number.isFinite(s.progress));
});
test('final and half nodes can be deleted with their minute-token dependencies', () => {
  const c = fresh(); c.fixed.push({id:'extra',from:'start',until:'end',text:'剩餘 {halfMinutes} 分鐘'});
  let next = C.removeEvent(c, 'half'); next = C.removeEvent(next, 'final'); assert.deepEqual(C.validate(next), []);
  assert.equal(next.reminders.length, 1); assert.equal(next.fixed.length, 4);
  assert.equal(C.tokens(next).finalMinutes, undefined); assert.equal(C.tokens(next).halfMinutes, undefined);
  assert.equal(M.poseAt(C.schedule(next), at('11:28:00')), 'relaxed');
});
test('all optional nodes can be removed while basic exam timing remains valid', () => {
  let c = fresh(); for (const id of Object.keys(c.events)) c = C.removeEvent(c, id);
  assert.deepEqual(C.validate(c), []); assert.deepEqual(C.getAnchors(c), ['admission','start','end']);
  assert.deepEqual(C.schedule(c), {admission:at('08:45:00'),start:at('09:00:00'),end:at('11:30:00')});
  assert.equal(C.stateAt(c, at('11:30:00')).stage.id, 'finished'); assert.equal(C.stateAt(c, at('09:38:42')).countdownLabel, '距離考試結束');
});
test('custom node deletion removes referencing content and preserves end boundary', () => {
  const c = fresh(); c.events.check = {label:'確認',anchor:'start',offset:60};
  c.phases.push({id:'custom',anchor:'check',offset:0,title:'確認',tone:'sage',rules:[]});
  c.phases.at(-2).title = '結束 {check}';
  c.phases[1].rules.push({text:'提醒',until:'check'},{text:'時間 {check}'});
  c.fixed.push({id:'custom',from:'check',until:'end',text:'確認'});
  c.reminders.push({id:'custom',at:'check',minutes:2,enabled:true,text:'確認'});
  const next = C.removeEvent(c, 'check'); assert.deepEqual(C.validate(next), []);
  assert.equal(next.phases.some(p=>p.id==='custom'),false); assert.equal(next.phases.find(p=>p.id==='finished').title,'考試結束');
  assert.equal(next.phases[1].rules.length,4); assert.equal(next.fixed.length,4); assert.equal(next.reminders.length,3);
});
test('invalid node identifiers, cyclic bases and dangling references are rejected', () => {
  let c = fresh(); c.events.end = {anchor:'start',offset:10}; assert.ok(C.validate(c).length);
  c = fresh(); c.events.bad = {anchor:'bad',offset:0}; assert.ok(C.validate(c).length);
  c = fresh(); c.events.check = {anchor:'start',offset:9999}; assert.ok(C.validate(c).length);
  c = fresh(); delete c.events.handin; assert.ok(C.validate(c).length);
});
test('JSON round trip preserves custom nodes and deliberate deletions', () => {
  let c = C.removeEvent(fresh(),'late'); c.events.check = {label:'檢查資料',anchor:'start',offset:60};
  const copy = C.upgrade(JSON.parse(JSON.stringify(c))); assert.deepEqual(C.validate(copy),[]); assert.deepEqual(copy.events,c.events);
  assert.deepEqual(C.schedule(copy),C.schedule(c)); assert.equal(C.eventName(copy,'check'),'檢查資料');
});
