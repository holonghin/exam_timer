const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const fresh = () => C.clone(C.defaults);
const at = time => Date.parse('2026-10-31T' + time + '+08:00');
const notice = c => c.phases.find(p => p.id === 'entry').rules.find(r => r.id === 'entry-cover-notice');
const present = (c, time) => C.stateAt(c, at(time)).ruleItems.some(r => r.id === 'entry-cover-notice');

test('new defaults use 微積分1 and enable visible animated mascot', () => {
  const c = fresh(); assert.equal(c.title, '微積分1'); assert.equal(c.mascotVisible, true); assert.equal(c.mascotAnimated, true); assert.deepEqual(C.validate(c), []);
});
test('highlighted editable notice appears only after entry and before start', () => {
  const c = fresh(); assert.equal(notice(c).highlight, true);
  assert.equal(present(c, '08:44:59'), false); assert.equal(present(c, '08:45:00'), true);
  assert.equal(present(c, '08:59:59'), true); assert.equal(present(c, '09:00:00'), false);
  assert.equal(present(c, '09:40:00'), false); assert.equal(present(c, '11:30:00'), false);
});
test('notice follows delayed start and hides at the exact new start', () => {
  const c = fresh(); c.start = '09:17';
  assert.equal(present(c, '09:00:00'), true); assert.equal(present(c, '09:16:59'), true); assert.equal(present(c, '09:17:00'), false);
});
test('notice still stops at start if entry phase is retained past start', () => {
  const c = fresh(); c.phases = c.phases.filter(p => p.id !== 'exam');
  assert.equal(present(c, '08:59:59'), true); assert.equal(present(c, '09:00:00'), false);
});
test('notice supports ordinary text edits, emphasis changes and deletion', () => {
  const c = fresh(); notice(c).text = '請等候 {start} 開始。'; notice(c).highlight = false;
  assert.ok(C.stateAt(c, at('08:50:00')).rules.includes('請等候 09:00 開始。'));
  const entry = c.phases.find(p => p.id === 'entry'); entry.rules = entry.rules.filter(r => r.id !== 'entry-cover-notice');
  assert.equal(present(C.upgrade(JSON.parse(JSON.stringify(c))), '08:50:00'), false);
});
function legacy() { const c = fresh(); delete c.contentRevision; delete c.mascotVisible; delete c.mascotAnimated; c.title = '微積分一'; c.phases[0].rules.shift(); return c; }
test('legacy upgrade preserves custom times, room, fixed rules and phase edits', () => {
  const c = legacy(); c.start = '09:10'; c.extension = 5; c.room = 'A301'; c.fixed[0].text = '自訂規則'; c.phases[0].rules[0].text = '自訂入場規則';
  const upgraded = C.upgrade(c); assert.deepEqual(C.validate(upgraded), []); assert.equal(upgraded.title, '微積分1');
  assert.deepEqual(C.schedule(upgraded), C.schedule(c)); assert.deepEqual(upgraded.fixed, c.fixed); assert.equal(upgraded.room, 'A301');
  assert.equal(upgraded.phases[0].rules[1].text, '自訂入場規則'); assert.equal(c.contentRevision, undefined);
  assert.deepEqual(C.upgrade(upgraded), upgraded);
});
test('migration preserves custom titles, skips deleted entry phase and avoids duplicate notices', () => {
  const c = legacy(); c.title = '微積分甲班'; c.phases[0].rules.push(C.clone(notice(fresh())));
  const upgraded = C.upgrade(c); assert.equal(upgraded.title, c.title); assert.equal(upgraded.phases[0].rules.filter(r => r.id === 'entry-cover-notice').length, 1);
  c.phases.shift(); assert.equal(C.upgrade(c).phases.some(p => p.id === 'entry'), false);
});
test('animation settings and notice presentation never change the schedule or countdown', () => {
  const a = fresh(), b = fresh(); b.mascotAnimated = false; b.mascotVisible = false;
  assert.deepEqual(C.stateAt(a, at('09:38:42')), C.stateAt(b, at('09:38:42')));
  assert.equal(C.upgrade(JSON.parse(JSON.stringify(b))).mascotVisible, false);
});
test('bad new options and unsupported revisions are rejected', () => {
  for (const value of [{...fresh(), mascotVisible:'yes'}, {...fresh(), mascotAnimated:null}, {...fresh(), contentRevision:99}]) assert.ok(C.validate(C.upgrade(value)).length);
  const c = fresh(); notice(c).until = 'invalid'; assert.ok(C.validate(c).length);
});
test('legacy rule options are preserved as data and no longer hide phase rules', () => {
  const c = fresh(), rule = c.phases.find(p=>p.id==='last').rules[1];
  c.holdFinal=false; rule.enabled=false; rule.condition='holdFinal'; rule.until='start';
  const restored=C.upgrade(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(restored,c); assert.deepEqual(C.validate(restored),[]);
  assert.ok(C.stateAt(restored,at('11:25:00')).rules.includes(rule.text));
});
test('every stage supports rule addition, text edits, deletion and persistence', () => {
  const c=fresh(), times=C.schedule(c);
  for(const phase of c.phases){
    const time=times[phase.anchor]+phase.offset*C.MIN;
    phase.rules.push({text:'新增規則'}); assert.ok(C.stateAt(c,time).rules.includes('新增規則'));
    phase.rules.at(-1).text='修改規則'; assert.ok(C.stateAt(c,time).rules.includes('修改規則'));
    phase.rules.pop(); const restored=C.upgrade(JSON.parse(JSON.stringify(c)));
    assert.ok(!C.stateAt(restored,time).rules.includes('修改規則')); assert.deepEqual(C.validate(restored),[]);
  }
});
