/* Pure scheduling logic. No DOM, network, or machine-local timezone dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MIN = 60000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const entryNotice = { id: 'entry-cover-notice', highlight: true, until: 'start', text: '考試開始前，請勿翻閱試卷內頁或提前作答，僅可閱讀封面說明。請等候監考人員宣布開始。' };
  const defaults = {
    version: 1, contentRevision: 2, title: '微積分1', subtitle: '期中考試', className: '', room: '',
    blackboardVersion: 1, templateId: 'exam', teacher: '', questionCount: null,
    attendance: { expected: null, present: null, absent: null, manualOrder: [] },
    admissionEnabled: true, preparationMinutes: 3,
    showClass: true, showRoom: true, showTeacher: true, showQuestions: true, showAttendance: true,
    date: '2026-10-31', admission: '08:45', start: '09:00', duration: 150, extension: 0,
    autoScroll: true, scrollSpeed: 14, mascotVisible: true, mascotAnimated: true,
    events: {
      late: { anchor: 'start', offset: 20 }, handin: { anchor: 'start', offset: 40 },
      half: { anchor: 'end', offset: -30 }, final: { anchor: 'end', offset: -5 }
    },
    reminders: [
      { id: 'late-reminder', at: 'late', minutes: 2, enabled: true, text: '遲到同學請先向助教登記。' },
      { id: 'half-reminder', at: 'half', minutes: 2, enabled: true, text: '考試剩下 {halfMinutes} 分鐘，請留意作答時間。' }
    ],
    fixed: [
      { id: 'question', from: 'start', until: 'end', text: '有問題請舉手，等待助教協助。' },
      { id: 'bathroom', from: 'start', until: 'end', text: '如需上廁所，請先舉手；每個考場同一時間僅限一人前往。' },
      { id: 'phone', from: 'admission', until: 'end', text: '手機請關機，並收妥電子設備。' },
      { id: 'calculator', from: 'admission', until: 'end', text: '不得使用計算機及電子辭典。' }
    ],
    phases: [
      { id: 'entry', anchor: 'admission', offset: 0, title: '入場準備', tone: 'peach', rules: [
        clone(entryNotice),
        { text: '請依座位表入座。' }, { text: '請將背包放到前面。' }, { text: '請將學生證放在桌面右上角。' }
      ] },
      { id: 'exam', anchor: 'start', offset: 0, title: '尚不可交卷', tone: 'rose', rules: [
        { text: '考試已開始，請安靜作答。' }, { text: '{handin} 後才可以交卷。' },
        { text: '請勿與其他同學交談。' }, { text: '考試加油！' }
      ] },
      { id: 'submit', anchor: 'handin', offset: 0, title: '可以交卷', tone: 'sage', rules: [
        { text: '現在可以交卷。' }, { text: '交卷前請確認姓名、學號及班級。' }, { text: '交卷離場時請保持安靜。' }
      ] },
      { id: 'last', anchor: 'final', offset: 0, title: '最後 {finalMinutes} 分鐘', tone: 'peach', rules: [
        { text: '考試剩下最後 {finalMinutes} 分鐘。' },
        { text: '暫停提前交卷，請等候考試結束後統一收卷。', highlight: true },
        { text: '請再次確認姓名、學號及班級。' }
      ] },
      { id: 'finished', anchor: 'end', offset: 0, title: '考試結束', tone: 'lavender', rules: [
        { text: '考試時間已結束，請立即停止作答。' }, { text: '請依助教指示交卷。' },
        { text: '請留在座位，待助教清點並確認試卷份數後再離場。' }, { text: '大家辛苦了！你們很棒！' }
      ] }
    ]
  };
  const countFields = ['expected', 'present', 'absent'];
  function parseCount(raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : NaN;
    return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : NaN;
  }
  function attendanceErrors(a) {
    if (!a || typeof a !== 'object') return ['人數設定格式錯誤。'];
    if (countFields.some(k => a[k] !== null && (!Number.isSafeInteger(a[k]) || a[k] < 0))) return ['人數只接受非負整數，空白不等於 0。'];
    if (!Array.isArray(a.manualOrder) || a.manualOrder.length > 2 || a.manualOrder.some(k => !countFields.includes(k)) || new Set(a.manualOrder).size !== a.manualOrder.length) return ['人數編輯順序格式錯誤。'];
    if (a.expected !== null && ((a.present !== null && a.present > a.expected) || (a.absent !== null && a.absent > a.expected))) return ['實到或缺考人數不能大於應到人數。'];
    if (a.present !== null && a.absent !== null && !Number.isSafeInteger(a.present + a.absent)) return ['人數超出可儲存範圍。'];
    if (countFields.every(k => a[k] !== null) && a.expected !== a.present + a.absent) return ['應到人數須等於實到與缺考人數之和。'];
    return [];
  }
  function editAttendance(current, key, raw) {
    if (!countFields.includes(key)) throw new Error('未知人數欄位。');
    const next = clone(current), parsed = parseCount(raw);
    // Keep invalid input visible in the draft; never silently convert it to zero.
    next[key] = Number.isNaN(parsed) ? String(raw) : parsed;
    const previous = Array.isArray(next.manualOrder) ? next.manualOrder : [];
    next.manualOrder = previous.filter(k => k !== key);
    if (parsed !== null) next.manualOrder.push(key);
    next.manualOrder = next.manualOrder.slice(-2);
    for (const k of countFields) if (!next.manualOrder.includes(k)) next[k] = null;
    if (next.manualOrder.length === 2 && next.manualOrder.every(k => Number.isSafeInteger(next[k]) && next[k] >= 0)) {
      const third = countFields.find(k => !next.manualOrder.includes(k));
      const value = third === 'expected' ? next.present + next.absent : third === 'present' ? next.expected - next.absent : next.expected - next.present;
      if (Number.isSafeInteger(value) && value >= 0) next[third] = value;
    }
    return { value: next, errors: attendanceErrors(next) };
  }
  function makeTemplate(id, date = defaults.date) {
    if (!['exam', 'quiz', 'blank'].includes(id)) throw new Error('未知模板。');
    const c = clone(defaults); c.templateId = id; c.date = date;
    if (id === 'exam') return c;
    c.admissionEnabled = false; c.admission = '';
    c.showTeacher = false; c.showQuestions = false; c.showAttendance = false;
    if (id === 'blank') {
      Object.assign(c, { title: '', subtitle: '', date: '', start: '', duration: null, preparationMinutes: 0, showClass: false, showRoom: false, events: {}, phases: [], fixed: [], reminders: [] });
      return c;
    }
    Object.assign(c, { subtitle: '隨堂測驗', start: '17:30', duration: 50, preparationMinutes: 3 });
    c.events = { half: { anchor: 'end', offset: -20, label: '剩餘20分鐘提醒' }, final: { anchor: 'end', offset: -5 } };
    c.phases = [
      { id: 'entry', anchor: 'admission', offset: 0, title: '考前準備', tone: 'peach', rules: [clone(entryNotice), { text: '請收妥與考試無關的物品，準備作答。' }, { text: '請將學生證放在桌面右上角。' }] },
      { id: 'exam', anchor: 'start', offset: 0, title: '考試進行中', tone: 'sage', rules: [{ text: '考試已開始，請安靜作答。' }, { text: '請勿與其他同學交談。' }, { text: '考試加油！' }] },
      clone(defaults.phases.find(p => p.id === 'last')), clone(defaults.phases.find(p => p.id === 'finished'))
    ];
    c.fixed = c.fixed.filter(r => r.id !== 'bathroom');
    c.reminders = [{ id: 'half-reminder', at: 'half', minutes: 2, enabled: true, text: '考試剩下 {halfMinutes} 分鐘，請留意作答時間。' }];
    return c;
  }
  const isUnconfigured = c => c.templateId === 'blank' && (!c.date || !c.start || !Number.isInteger(c.duration) || c.duration < 1);
  function shiftStart(c, seconds) {
    if (!Number.isSafeInteger(seconds)) throw new Error('平移量須為整數秒。');
    const value = Math.round(parseTime(c.start) * 60) + seconds;
    if (!Number.isFinite(value) || value < 0 || value >= 86400) throw new Error('開考時間超出當日；請先調整日期。');
    const next = clone(c), h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
    next.start = pad(h) + ':' + pad(m) + (s ? ':' + pad(s) : '');
    return next;
  }
  const anchors = ['admission', 'start', 'late', 'handin', 'half', 'final', 'end'];
  const names = { admission: '開放入場', start: '考試開始', late: '遲到提示', handin: '開放交卷', half: '剩餘時間提醒', final: '最後階段', end: '考試結束' };
  const getAnchors = c => ['admission', 'start', ...Object.keys(c.events), 'end'];
  const eventName = (c, id) => id === 'admission' && c.admissionEnabled === false ? '考前準備' : c.events[id]?.label ?? names[id] ?? id;
  function removeEvent(c, id) {
    if (!Object.hasOwn(c.events, id)) return clone(c);
    const next = clone(c), deletedTokens = new Set([id]);
    if (id === 'final') deletedTokens.add('finalMinutes');
    if (id === 'half') deletedTokens.add('halfMinutes');
    const references = text => [...String(text).matchAll(/\{([^{}]+)\}/g)].some(m => deletedTokens.has(m[1]));
    delete next.events[id];
    next.phases = next.phases.filter(p => p.anchor !== id && (!references(p.title) || (p.anchor === 'end' && p.offset === 0))).map(p => ({
      ...p, title: references(p.title) ? '考試結束' : p.title,
      rules: p.rules.filter(r => r.until !== id && !references(r.text))
    }));
    next.fixed = next.fixed.filter(r => r.from !== id && r.until !== id && !references(r.text));
    next.reminders = next.reminders.filter(r => r.at !== id && !references(r.text));
    return next;
  }
  // Upgrade once: a deliberately edited/deleted new rule stays edited/deleted on reload.
  function upgrade(value) {
    const c = clone(value);
    if (!c || typeof c !== 'object' || c.version !== 1) return c;
    if (c.contentRevision === undefined) {
      c.contentRevision = 2;
      if (c.mascotVisible === undefined) c.mascotVisible = true;
      if (c.mascotAnimated === undefined) c.mascotAnimated = true;
      if (c.title === '微積分一') c.title = '微積分1';
      if (Array.isArray(c.phases)) {
      const entry = c.phases.find(p => p.id === 'entry') || c.phases.find(p => p.anchor === 'admission' && p.offset === 0);
      if (entry && Array.isArray(entry.rules) && !entry.rules.some(r => r.id === entryNotice.id || r.text === entryNotice.text)) entry.rules.unshift(clone(entryNotice));
      }
    }
    if (c.contentRevision === 2 && c.blackboardVersion === undefined) {
      for (const k of ['templateId', 'teacher', 'questionCount', 'attendance', 'admissionEnabled', 'preparationMinutes', 'showClass', 'showRoom', 'showTeacher', 'showQuestions', 'showAttendance']) if (c[k] === undefined) c[k] = clone(defaults[k]);
      c.blackboardVersion = 1;
      for (const p of c.phases || []) for (const r of p.rules || []) {
        if (r.id === entryNotice.id && r.text === '考試開始前，請勿翻閱試卷內頁或提前作答，僅可閱讀封面說明。請等候助教宣布開始。') r.text = entryNotice.text;
        if (r.text === '暫停提前交卷，請等候考試結束後統一收卷。' && r.highlight === undefined) r.highlight = true;
      }
    }
    return c;
  }
  function parseTime(value) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return NaN;
    const [h, m, s = 0] = value.split(':').map(Number);
    return h < 24 && m < 60 && s < 60 ? h * 60 + m + s / 60 : NaN;
  }
  function dayEpoch(date) { return Date.parse(date + 'T00:00:00+08:00'); }
  function schedule(c) {
    const day = dayEpoch(c.date);
    const t = { start: day + Math.round(parseTime(c.start) * MIN) };
    t.admission = c.admissionEnabled === false ? t.start - (c.preparationMinutes || 0) * MIN : day + Math.round(parseTime(c.admission) * MIN);
    t.end = t.start + (Number(c.duration) + Number(c.extension)) * MIN;
    for (const [id, event] of Object.entries(c.events)) t[id] = t[event.anchor] + Number(event.offset) * MIN;
    return t;
  }
  function parts(epoch) {
    const d = new Date(epoch + 8 * 60 * MIN);
    return { date: d.toISOString().slice(0, 10), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), weekday: '日一二三四五六'[d.getUTCDay()] };
  }
  const pad = n => String(n).padStart(2, '0');
  function hhmm(epoch) { const p = parts(epoch); return pad(p.h) + ':' + pad(p.m); }
  function timeLabel(epoch, date) {
    const p = parts(epoch);
    return (p.date === date ? '' : p.date.slice(5).replace('-', '/') + ' ') + hhmm(epoch) + (p.s ? ':' + pad(p.s) : '');
  }
  function tokens(c, t = schedule(c)) {
    const result = { date: c.date.replaceAll('-', '/') };
    if (Object.hasOwn(c.events, 'final')) result.finalMinutes = String((t.end - t.final) / MIN);
    if (Object.hasOwn(c.events, 'half')) result.halfMinutes = String((t.end - t.half) / MIN);
    for (const id of getAnchors(c)) result[id] = timeLabel(t[id], c.date);
    return result;
  }
  function interpolate(text, c, t) {
    const values = tokens(c, t);
    return text.replace(/\{([^{}]+)\}/g, (match, key) => values[key] ?? match);
  }
  function phases(c, t = schedule(c)) {
    return c.phases.map(p => ({ ...p, at: t[p.anchor] + Number(p.offset) * MIN })).sort((a, b) => a.at - b.at);
  }
  function stateAt(c, now) {
    const t = schedule(c);
    const stages = phases(c, t);
    let stage = stages.filter(p => p.at <= now).at(-1);
    if (c.templateId === 'blank') {
      if (!stage || now >= t.end && stage.at < t.end) stage = { id: now >= t.end ? 'finished' : now >= t.start ? 'exam' : 'waiting', title: now >= t.end ? '考試結束' : now >= t.start ? '考試進行中' : '等候考試', tone: 'sage', rules: [] };
    }
    stage ||= { id: 'waiting', title: c.admissionEnabled === false ? '等候考試' : '等候入場', tone: 'lavender', rules: c.admissionEnabled === false ? [] : [{ text: '{admission} 開放入場，請稍候。' }] };
    const fixed = c.fixed.filter(r => now >= t[r.from] && now < t[r.until]).map(r => interpolate(r.text, c, t));
    // Phase membership controls display. Preserve legacy options in saved data,
    // but no hidden enable/hold/stop controls affect ordinary phase rules now.
    // The pre-exam notice retains its required hard stop at the adjusted start.
    const ruleItems = stage.rules.filter(r => r.id !== entryNotice.id || now < t.start).map(r => ({ ...r, text: interpolate(r.text, c, t) }));
    const rules = ruleItems.map(r => r.text);
    const reminders = c.reminders.filter(r => {
      const start = t[r.at], stop = start + r.minutes * MIN;
      return r.enabled && now >= start && now < (start < t.end ? Math.min(t.end, stop) : stop);
    }).map(r => interpolate(r.text, c, t));
    const target = now < t.start ? t.start : now < t.handin ? t.handin : t.end;
    const countdownLabel = now < t.start ? '距離考試開始' : now < t.handin ? '距離' + eventName(c, 'handin') : now < t.end ? '距離考試結束' : '考試已結束';
    return { t, stage, title: interpolate(stage.title, c, t), fixed, rules, ruleItems, reminders, countdownLabel,
      remaining: Math.max(0, Math.ceil((target - now) / 1000)), progress: Math.max(0, Math.min(1, (now - t.start) / (t.end - t.start))) };
  }
  function durationText(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function validate(c) {
    const errors = [];
    const need = (ok, message) => { if (!ok) errors.push(message); };
    try {
      need(c.version === 1, '設定版本不相容。');
      need(c.contentRevision === 2, '設定內容版本不相容。');
      need(['exam', 'quiz', 'blank'].includes(c.templateId), '模板格式錯誤。');
      need(['showClass', 'showRoom', 'showTeacher', 'showQuestions', 'showAttendance'].every(k => typeof c[k] === 'boolean'), '資訊顯示選項格式錯誤。');
      need(typeof c.teacher === 'string' && c.teacher.length <= 100, '老師姓名須為 100 字以內的文字。');
      need(c.questionCount === null || Number.isSafeInteger(c.questionCount) && c.questionCount >= 0, '大題數只接受非負整數，或留空。');
      errors.push(...attendanceErrors(c.attendance));
      need(typeof c.admissionEnabled === 'boolean' && Number.isInteger(c.preparationMinutes) && c.preparationMinutes >= 0 && c.preparationMinutes <= 120, '考前準備時間須為 0–120 分鐘。');
      need(typeof c.mascotVisible === 'boolean' && typeof c.mascotAnimated === 'boolean', '吉祥物開關設定格式錯誤。');
      for (const field of ['title', 'subtitle', 'className', 'room']) need(typeof c[field] === 'string' && c[field].length <= 100, '考試資訊須為 100 字以內的文字。');
      need(c.title.trim().length > 0, '請填寫考試名稱。');
      if (isUnconfigured(c)) {
        need(/^\d{4}-\d{2}-\d{2}$/.test(c.date) && parts(dayEpoch(c.date)).date === c.date, '請填寫有效考試日期。');
        need(Number.isFinite(parseTime(c.start)), '請填寫有效開始時間。');
        need(Number.isInteger(c.duration) && c.duration > 0 && c.duration <= 1440, '考試長度須為 1–1440 分鐘。');
        return [...new Set(errors)];
      }
      need(/^\d{4}-\d{2}-\d{2}$/.test(c.date) && parts(dayEpoch(c.date)).date === c.date, '請填寫有效考試日期。');
      need(Number.isFinite(parseTime(c.start)) && (c.admissionEnabled === false || Number.isFinite(parseTime(c.admission))), '請填寫有效入場及開始時間。');
      need(Number.isInteger(c.duration) && c.duration > 0 && c.duration <= 1440, '原訂考試長度須為 1–1440 分鐘。');
      need(Number.isInteger(c.extension) && c.extension >= 0 && c.extension <= 1440, '額外延長須為 0–1440 分鐘。');
      need(typeof c.autoScroll === 'boolean', '開關設定格式錯誤。');
      need(Number.isFinite(c.scrollSpeed) && c.scrollSpeed >= 5 && c.scrollSpeed <= 40, '捲動速度須為每秒 5–40 像素。');
      need(c.events && typeof c.events === 'object' && !Array.isArray(c.events) && Object.keys(c.events).length <= 40, '最多可設定 40 個時間節點。');
      const activeAnchors = getAnchors(c);
      for (const [id, event] of Object.entries(c.events)) {
        need(/^[a-z][a-z0-9_-]{0,59}$/.test(id) && !['admission', 'start', 'end', 'date', 'finalMinutes', 'halfMinutes', '__proto__', 'constructor', 'prototype'].includes(id), '時間節點識別碼無效或與基準時間重複。');
        need(['admission', 'start', 'end'].includes(event.anchor) && Number.isInteger(event.offset), '時間節點須以入場、開始或結束為基準，並使用整數分鐘。');
        need(event.label === undefined || (typeof event.label === 'string' && event.label.trim().length > 0 && event.label.length <= 60), '時間節點名稱須為 1–60 字。');
      }
      const t = schedule(c);
      need(t.admission <= t.start, '入場時間不能晚於開始時間。');
      const hasHandin = Object.hasOwn(c.events, 'handin'), hasFinal = Object.hasOwn(c.events, 'final');
      need((!hasHandin || t.start < t.handin && t.handin < t.end) && (!hasFinal || t.start < t.final && t.final < t.end) && (!hasHandin || !hasFinal || t.handin < t.final), '時間順序須為：開始 < 開放交卷 < 最後階段 < 結束（已刪除的節點略過）。');
      for (const id of Object.keys(c.events)) need(t[id] >= t.admission && t[id] <= t.end, '時間節點須介於入場與考試結束之間。');
      const textOK = text => {
        need(typeof text === 'string' && text.trim().length > 0 && text.length <= 2000, '規則與階段名稱不可空白，且須在 2000 字內。');
        if (typeof text === 'string') for (const match of text.matchAll(/\{([^{}]+)\}/g)) need(Object.hasOwn(tokens(c, t), match[1]), '未知時間代碼：{' + match[1] + '}');
      };
      need(Array.isArray(c.phases) && (c.templateId === 'blank' || c.phases.length > 0) && c.phases.length <= 40, '最多可設定 40 個階段。');
      const ids = new Set(), times = new Set();
      for (const p of c.phases) {
        need(typeof p.id === 'string' && !ids.has(p.id), '階段識別碼不能重複。'); ids.add(p.id);
        need(activeAnchors.includes(p.anchor) && Number.isInteger(p.offset), '階段時間基準或分鐘格式錯誤。');
        const at = t[p.anchor] + p.offset * MIN;
        need(at >= t.admission && at <= t.end, '階段開始須介於入場與結束時間。');
        need(!times.has(at), '兩個階段不能在同一時間開始。'); times.add(at);
        textOK(p.title);
        need(['peach', 'rose', 'sage', 'lavender'].includes(p.tone), '階段顏色格式錯誤。');
        need(Array.isArray(p.rules) && p.rules.length <= 100, '每階段最多 100 條規則。');
        for (const r of p.rules) {
          textOK(r.text); need(!r.condition || r.condition === 'holdFinal', '規則顯示條件格式錯誤。');
          need(r.highlight === undefined || typeof r.highlight === 'boolean', '醒目提醒設定格式錯誤。');
          need(r.enabled === undefined || typeof r.enabled === 'boolean', '規則啟用設定格式錯誤。');
          need(r.until === undefined || activeAnchors.includes(r.until), '規則停止顯示時間格式錯誤。');
        }
      }
      // End is a safety boundary even when preceding stages are customized.
      need(c.templateId === 'blank' || c.phases.some(p => p.anchor === 'end' && p.offset === 0), '請保留一個於考試結束時開始的階段。');
      need(Array.isArray(c.fixed) && c.fixed.length <= 40, '固定規則最多 40 條。');
      for (const r of c.fixed) { textOK(r.text); need(activeAnchors.includes(r.from) && activeAnchors.includes(r.until) && t[r.from] < t[r.until], '固定規則的結束時間須晚於開始時間。'); }
      need(Array.isArray(c.reminders) && c.reminders.length <= 40, '提醒最多 40 條。');
      for (const r of c.reminders) { textOK(r.text); need(activeAnchors.includes(r.at) && typeof r.enabled === 'boolean' && Number.isInteger(r.minutes) && r.minutes >= 1 && r.minutes <= 60, '提醒須使用有效時間節點，顯示長度為 1–60 整數分鐘。'); }
    } catch { errors.push('設定內容不完整或格式錯誤。'); }
    return [...new Set(errors)];
  }
  return { MIN, defaults, clone, upgrade, anchors, names, getAnchors, eventName, removeEvent, parseCount, attendanceErrors, editAttendance, makeTemplate, isUnconfigured, shiftStart, parseTime, dayEpoch, schedule, parts, hhmm, timeLabel, tokens, interpolate, phases, stateAt, durationText, validate };
});
