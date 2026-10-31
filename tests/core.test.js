const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const fresh = () => C.clone(C.defaults);
const at = time => Date.parse('2026-10-31T' + time + '+08:00');

test('default configuration is valid and has the specified schedule', () => {
  const c = fresh(), t = C.schedule(c); assert.deepEqual(C.validate(c), []);
  assert.deepEqual(Object.fromEntries(C.anchors.map(k => [k, C.hhmm(t[k])])), { admission: '08:45', start: '09:00', late: '09:20', handin: '09:40', half: '11:00', final: '11:25', end: '11:30' });
});
for (const [time, phase, fixed] of [
  ['08:44:59', 'waiting', 0], ['08:45:00', 'entry', 2], ['08:59:59', 'entry', 2],
  ['09:00:00', 'exam', 4], ['09:39:59', 'exam', 4], ['09:40:00', 'submit', 4],
  ['11:24:59', 'submit', 4], ['11:25:00', 'last', 4], ['11:29:59', 'last', 4], ['11:30:00', 'finished', 0]
]) test('phase and fixed rules at ' + time, () => {
  const s = C.stateAt(fresh(), at(time)); assert.equal(s.stage.id, phase); assert.equal(s.fixed.length, fixed);
});
test('start shift translates subsequent times while preserving entry and custom offsets', () => {
  const c = fresh(); c.events.handin.offset = 45; const old = C.schedule(c); c.start = '09:10'; const t = C.schedule(c);
  assert.equal(t.admission, old.admission);
  for (const id of C.anchors.filter(k => k !== 'admission')) assert.equal(t[id] - old[id], 10 * C.MIN, id);
  assert.equal(t.handin - t.start, 45 * C.MIN); assert.deepEqual(C.validate(c), []);
});
test('independent extension only moves end-relative events and final phase', () => {
  const c = fresh(), old = C.schedule(c); c.extension = 10; const t = C.schedule(c);
  for (const id of ['admission', 'start', 'late', 'handin']) assert.equal(t[id], old[id]);
  for (const id of ['half', 'final', 'end']) assert.equal(t[id] - old[id], 10 * C.MIN);
  assert.equal(C.stateAt(c, at('11:25:00')).stage.id, 'submit');
  assert.equal(C.stateAt(c, at('11:35:00')).stage.id, 'last');
});
test('combined shift and extension update every referenced time', () => {
  const c = fresh(); c.start = '09:10'; c.extension = 10;
  assert.equal(C.interpolate('{admission}|{start}|{late}|{handin}|{half}|{final}|{end}', c), '08:45|09:10|09:30|09:50|11:20|11:45|11:50');
  assert.ok(C.stateAt(c, at('09:15:00')).rules.includes('09:50 後才可以交卷。'));
});
test('changing last interval updates title and text', () => {
  const c = fresh(); c.events.final.offset = -10;
  const s = C.stateAt(c, at('11:20:00')); assert.equal(s.title, '最後 10 分鐘'); assert.ok(s.reminders.includes('考試剩下最後 10 分鐘。'));
});
test('final-stage submission instruction is an ordinary deletable rule', () => {
  const c = fresh(); assert.equal(C.stateAt(c, at('11:25:00')).rules.length, 2);
  c.phases.find(p => p.id === 'last').rules.splice(0, 1); const rules = C.stateAt(c, at('11:25:00')).rules;
  assert.equal(rules.length, 1); assert.ok(rules.includes('請再次確認姓名、學號及班級。'));
});
test('reminders activate at boundaries, expire, can disable and follow extension', () => {
  const c = fresh();
  assert.equal(C.stateAt(c, at('09:19:59')).reminders.length, 0);
  assert.equal(C.stateAt(c, at('09:20:00')).reminders.length, 1);
  assert.equal(C.stateAt(c, at('09:21:59')).reminders.length, 1);
  assert.equal(C.stateAt(c, at('09:22:00')).reminders.length, 0);
  c.reminders[0].enabled = false; assert.equal(C.stateAt(c, at('09:20:00')).reminders.length, 0);
  c.extension = 10; assert.equal(C.stateAt(c, at('11:00:00')).reminders.length, 0);
  assert.match(C.stateAt(c, at('11:10:00')).reminders[0], /30 分鐘/);
  assert.equal(C.stateAt(c, at('11:40:00')).reminders.length, 0);
});
test('countdown switches targets exactly at boundaries without negatives', () => {
  const c = fresh(); assert.equal(C.stateAt(c, at('08:59:59')).remaining, 1);
  assert.equal(C.stateAt(c, at('09:00:00')).remaining, 40 * 60);
  assert.equal(C.stateAt(c, at('09:39:59')).remaining, 1);
  assert.equal(C.stateAt(c, at('09:40:00')).remaining, 110 * 60);
  assert.equal(C.stateAt(c, at('11:30:01')).remaining, 0);
  assert.equal(C.durationText(78), '01:18'); assert.equal(C.durationText(6600), '01:50:00');
});
test('timeline has real proportions and clamps outside exam', () => {
  const c = fresh(); assert.equal(C.stateAt(c, at('08:00:00')).progress, 0);
  assert.equal(C.stateAt(c, at('10:15:00')).progress, .5);
  assert.equal(C.stateAt(c, at('11:31:00')).progress, 1);
  assert.equal(C.stateAt(c, at('09:40:00')).progress, 40 / 150);
});
test('Taipei UTC+8 date and weekday are independent of host timezone', () => {
  const p = C.parts(Date.parse('2026-10-30T16:05:07Z'));
  assert.deepEqual(p, { date: '2026-10-31', h: 0, m: 5, s: 7, weekday: '六' });
});
test('cross-midnight exam remains ordered and labels next-day events', () => {
  const c = fresh(); c.admission = '22:45'; c.start = '23:00';
  assert.deepEqual(C.validate(c), []); assert.equal(C.tokens(c).end, '11/01 01:30');
  assert.equal(C.stateAt(c, Date.parse('2026-11-01T01:30:00+08:00')).stage.id, 'finished');
});
test('custom phase add, edit, deletion and order are determined by time', () => {
  const c = fresh(); c.phases.push({ id: 'custom', anchor: 'start', offset: 25, title: '自訂提醒', tone: 'sage', rules: [{ text: '結束時間 {end}' }] });
  assert.deepEqual(C.validate(c), []); assert.equal(C.stateAt(c, at('09:25:00')).title, '自訂提醒');
  assert.deepEqual(C.stateAt(c, at('09:25:00')).rules, ['結束時間 11:30']);
  c.phases.at(-1).offset = 30; assert.equal(C.stateAt(c, at('09:25:00')).stage.id, 'exam');
  c.phases.pop(); assert.equal(C.stateAt(c, at('09:30:00')).stage.id, 'exam');
});
test('rules can be added, changed and deleted without altering defaults', () => {
  const c = fresh(); c.fixed.push({ id: 'custom', from: 'handin', until: 'end', text: '新規則' });
  assert.equal(C.stateAt(c, at('09:39:00')).fixed.length, 4);
  assert.equal(C.stateAt(c, at('09:40:00')).fixed.length, 5);
  c.fixed.at(-1).text = '新規則二'; assert.ok(C.stateAt(c, at('09:40:00')).fixed.includes('新規則二'));
  c.fixed.pop(); assert.equal(C.stateAt(c, at('09:40:00')).fixed.length, 4);
  assert.equal(C.defaults.fixed.length, 4);
});
test('invalid chronology, duplicate stages, missing end and unknown tokens are rejected', () => {
  let c = fresh(); c.start = '08:30'; assert.ok(C.validate(c).some(x => x.includes('入場')));
  c = fresh(); c.events.handin.offset = 150; assert.ok(C.validate(c).some(x => x.includes('時間順序')));
  c = fresh(); c.phases[1].anchor = 'admission'; assert.ok(C.validate(c).some(x => x.includes('同一時間')));
  c = fresh(); c.phases.pop(); assert.ok(C.validate(c).some(x => x.includes('結束時')));
  c = fresh(); c.fixed[0].text = '{bad}'; assert.ok(C.validate(c).some(x => x.includes('未知時間')));
});
test('corrupt imports, bad dates and non-numeric data fail safely', () => {
  for (const value of [null, {}, [], 'oops', { version: 99 }, { ...fresh(), date: '2026-02-30' }, { ...fresh(), start: '99:99' }, { ...fresh(), extension: -1 }, { ...fresh(), duration: '150' }]) assert.ok(C.validate(value).length);
});
test('JSON export/import preserves all authored settings', () => {
  const c = fresh(); c.room = '理學院 301'; c.start = '09:07'; c.extension = 13;
  const imported = JSON.parse(JSON.stringify(c)); assert.deepEqual(C.validate(imported), []); assert.deepEqual(C.stateAt(imported, at('09:30:00')), C.stateAt(c, at('09:30:00')));
});
test('a custom end reminder is visible at end and expires; in-exam reminders stop at end', () => {
  const c = fresh(); c.reminders.push({ id: 'end', at: 'end', minutes: 2, enabled: true, text: '結束提醒' });
  assert.deepEqual(C.validate(c), []);
  assert.deepEqual(C.stateAt(c, at('11:30:00')).reminders, ['結束提醒']);
  assert.deepEqual(C.stateAt(c, at('11:32:00')).reminders, []);
  c.reminders[1].minutes = 60;
  assert.deepEqual(C.stateAt(c, at('11:30:00')).reminders, ['結束提醒']);
  c.reminders[1].minutes = .5; assert.ok(C.validate(c).length);
});
