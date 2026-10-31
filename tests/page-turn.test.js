const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/mascot.js');
const C = require('../src/core.js');
function harness(randomValues = [0, .5, 1]) {
  let time = 0, serial = 0, draws = 0;
  const pending = new Map(), turns = [], rests = [];
  const controller = M.createPageTurner({
    random: () => randomValues[draws++ % randomValues.length],
    setTimer: (fn, delay) => { const id = ++serial; pending.set(id, { at: time + delay, fn }); return id; },
    clearTimer: id => pending.delete(id), onTurn: () => turns.push(time), onRest: () => rests.push(time)
  });
  function advance(ms) {
    const target = time + ms;
    for (let i = 0; i < 100; i++) {
      const due = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
      if (!due || due[1].at > target) { time = target; return; }
      time = due[1].at; pending.delete(due[0]); due[1].fn();
    }
    throw new Error('Unexpected timer loop');
  }
  return { controller, advance, turns, rests, pending, next: () => [...pending.values()][0]?.at, draws: () => draws };
}
test('poses follow scheduled start, final interval and end, including adjusted times', () => {
  const c = C.clone(C.defaults); c.start = '09:10'; c.extension = 10; const t = C.schedule(c);
  assert.equal(M.poseAt(t, t.admission), 'waiting'); assert.equal(M.poseAt(t, t.start - 1), 'waiting');
  assert.equal(M.poseAt(t, t.start), 'reading'); assert.equal(M.poseAt(t, t.final - 1), 'reading');
  assert.equal(M.poseAt(t, t.final), 'focused'); assert.equal(M.poseAt(t, t.end - 1), 'focused');
  assert.equal(M.poseAt(t, t.end), 'finished'); assert.equal(M.poseAt(t, t.end + 10000), 'finished');
});
test('each page turns once, then rests a newly sampled 4–10 seconds AFTER completion', () => {
  const h = harness(); h.controller.setEnabled(true);
  assert.equal(h.next(), 4000); h.advance(3999); assert.deepEqual(h.turns, []);
  h.advance(1); assert.deepEqual(h.turns, [4000]);
  h.advance(1100); h.controller.complete(); assert.equal(h.next(), 12100);
  h.advance(6999); assert.equal(h.turns.length, 1); h.advance(1); assert.deepEqual(h.turns, [4000, 12100]);
  h.advance(1100); h.controller.complete(); assert.equal(h.next(), 23200);
  h.advance(9999); assert.equal(h.turns.length, 2); h.advance(1); assert.equal(h.turns.length, 3);
});
test('normal render ticks do not restart or multiply an existing timeout', () => {
  const h = harness(); h.controller.setEnabled(true);
  for (let i = 0; i < 10; i++) { h.advance(200); h.controller.setEnabled(true); }
  assert.equal(h.pending.size, 1); assert.equal(h.draws(), 1); assert.equal(h.next(), 4000);
});
test('completion is idempotent and there is no immediate reverse turn', () => {
  const h = harness(); h.controller.setEnabled(true); h.advance(4000); h.controller.complete();
  const next = h.next(), rests = h.rests.length;
  h.controller.complete(); h.controller.complete(); assert.equal(h.next(), next); assert.equal(h.rests.length, rests);
  h.advance(6999); assert.equal(h.turns.length, 1); assert.equal(h.pending.size, 1);
});
test('fallback settles a missing animationend exactly once', () => {
  const h = harness(); h.controller.setEnabled(true); h.advance(5250);
  assert.deepEqual(h.turns, [4000]); assert.equal(h.next(), 12250);
  h.controller.complete(); assert.equal(h.next(), 12250); assert.equal(h.draws(), 2);
});
test('hiding, reducing motion or leaving reading cancels both a pending and active turn', () => {
  const h = harness(); h.controller.setEnabled(true); h.advance(2000); h.controller.setEnabled(false); h.advance(20000);
  assert.deepEqual(h.turns, []); assert.equal(h.pending.size, 0);
  h.controller.setEnabled(true); h.advance(7000); assert.equal(h.turns.length, 1);
  h.controller.setEnabled(false); h.controller.complete(); h.advance(20000);
  assert.equal(h.turns.length, 1); assert.equal(h.pending.size, 0);
});
test('disposing removes timers and resuming waits a fresh random interval', () => {
  const h = harness(); h.controller.setEnabled(true); h.controller.dispose(); h.advance(20000);
  assert.deepEqual(h.turns, []); assert.equal(h.pending.size, 0);
  h.controller.setEnabled(true); h.advance(6999); assert.equal(h.turns.length, 0); h.advance(1); assert.equal(h.turns.length, 1);
});
