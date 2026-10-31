/* Visual state and cancellable, single-turn animation scheduling; no exam mutations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamMascot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function poseAt(times, now) {
    if (now >= times.end) return 'finished';
    if (now < times.start) return 'waiting';
    if (now >= times.final) return 'focused';
    if (now >= times.handin) return 'relaxed';
    return 'reading';
  }
  function createPageTurner({ onTurn, onRest, random = Math.random,
    setTimer = setTimeout, clearTimer = clearTimeout, turnDuration = 1100 }) {
    let enabled = false, turning = false, timer = null;
    function clear() { if (timer !== null) clearTimer(timer); timer = null; }
    function schedule() {
      if (!enabled) return;
      // Draw a fresh 4–10 second rest AFTER each finished page turn.
      const delay = 4000 + Math.floor(Math.max(0, Math.min(1, random())) * 6000);
      timer = setTimer(() => {
        timer = null;
        if (!enabled) return;
        turning = true;
        onTurn();
        // Also settle if the browser omits animationend (e.g. rendering suspension).
        timer = setTimer(complete, turnDuration + 150);
      }, delay);
    }
    function complete() {
      if (!turning) return;
      clear(); turning = false; onRest(); schedule();
    }
    function setEnabled(value) {
      const next = !!value;
      if (next === enabled) return;
      enabled = next; clear(); turning = false; onRest();
      if (enabled) schedule();
    }
    function dispose() { enabled = false; clear(); turning = false; onRest(); }
    return { setEnabled, complete, dispose };
  }
  return { poseAt, createPageTurner };
});
