(() => {
  'use strict';
  const C = window.ExamCore, $ = id => document.getElementById(id);
  const KEY = 'calculus-exam-timer.v1';
  let config = C.clone(C.defaults), draft, configRevision = 0, simulation = null, toastTimer;
  let storageMessage = '設定儲存在此裝置';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = C.upgrade(JSON.parse(saved));
      if (C.validate(parsed).length) storageMessage = '舊設定無效，已載入預設';
      else {
        config = parsed;
        // Persist the migration marker so deleted notices do not return next visit.
        if (JSON.stringify(parsed) !== saved) {
          try { localStorage.setItem(KEY, JSON.stringify(parsed)); }
          catch { storageMessage = '設定已升級但無法儲存；請匯出備份'; }
        }
      }
    }
  } catch { storageMessage = '無法讀取儲存設定；請匯出備份'; }
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = motionPreference.matches;
  const pageTurner = window.ExamMascot.createPageTurner({
    onTurn: () => $('mascot-slot').classList.add('is-turning'),
    onRest: () => $('mascot-slot').classList.remove('is-turning')
  });
  const pageSheet = document.querySelector('.mascot-page');
  pageSheet.addEventListener('animationend', event => {
    if (event.animationName === 'mascot-page-turn') pageTurner.complete();
  });
  function syncMascot(times, instant) {
    const pose = window.ExamMascot.poseAt(times, instant);
    $('mascot-slot').dataset.state = pose;
    pageTurner.setEnabled(pose === 'reading' && config.mascotVisible && config.mascotAnimated && !motionPreference.matches && !document.hidden);
  }
  motionPreference.addEventListener('change', () => syncMascot(C.schedule(config), now()));
  window.addEventListener('pagehide', () => pageTurner.dispose());
  let scrollPaused = reducedMotion, hovering = false, focusing = false, lastFrame = 0, scrollPosition = 0, pauseUntil = 0;
  let signature = '', overflow = false;
  const uid = () => 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const button = (text, fn, className) => { const b = node('button', className, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(config)); storageMessage = '設定已儲存在此裝置'; }
    catch { storageMessage = '設定已套用，但無法儲存；請匯出備份'; }
    $('save-status').textContent = storageMessage;
  }
  function now() { return simulation ? simulation.epoch + (performance.now() - simulation.base) * simulation.speed : Date.now(); }
  function metadata() {
    $('mascot-slot').hidden = !config.mascotVisible;
    $('mascot-slot').classList.toggle('is-still', !config.mascotAnimated);
    $('exam-title').textContent = config.title; $('exam-subtitle').textContent = config.subtitle;
    document.title = config.title + ' · ' + config.subtitle + '計時器';
    $('exam-date').textContent = config.date.replaceAll('-', '/') + '（' + C.parts(C.dayEpoch(config.date)).weekday + '）';
    $('exam-class').textContent = '班別：' + (config.className || '未設定'); $('exam-room').textContent = '考場：' + (config.room || '未設定');
    $('exam-class').hidden = !config.showClass; $('exam-room').hidden = !config.showRoom;
    $('exam-teacher').hidden = !config.showTeacher;
    $('exam-teacher').textContent = '老師：' + (config.teacher || '未設定');
    const statistics = [];
    if (config.showQuestions && config.questionCount !== null) statistics.push('共 ' + config.questionCount + ' 大題');
    if (config.showAttendance) for (const [key, label] of [['expected', '應到'], ['present', '實到'], ['absent', '缺考']]) if (config.attendance[key] !== null) statistics.push(label + ' ' + config.attendance[key]);
    $('exam-statistics').replaceChildren(...statistics.map(text => node('span', '', text)));
    $('exam-statistics').hidden = !statistics.length;
    $('save-status').textContent = storageMessage;
    const t = C.schedule(config), total = t.end - t.start;
    $('exam-range').textContent = C.timeLabel(t.start, config.date) + ' — ' + C.timeLabel(t.end, config.date);
    ['start', 'handin', 'end'].forEach(id => $('time-' + id).textContent = Number.isFinite(t[id]) ? C.timeLabel(t[id], config.date) : '');
    $('handin-node').hidden = !Number.isFinite(t.handin);
    $('handin-node').querySelector('span').firstChild.textContent = config.events.handin?.label || '可交卷';
    if (Number.isFinite(t.handin)) $('handin-node').style.left = ((t.handin - t.start) / total * 100) + '%';
    $('timeline').classList.toggle('crowded', Number.isFinite(t.handin) && ((t.handin - t.start) / total < .18 || (t.handin - t.start) / total > .82));
    const seg = $('timeline-segments'); seg.replaceChildren();
    const bounds = [t.start, t.handin, t.final, t.end].filter(Number.isFinite);
    bounds.slice(0, -1).forEach((at, i) => {
      const color = Number.isFinite(t.final) && at >= t.final ? 'peach' : Number.isFinite(t.handin) && at < t.handin ? 'rose' : 'sage';
      const s = node('span', color); s.style.width = (bounds[i + 1] - at) / total * 100 + '%'; seg.append(s);
    });
    $('phase-ticks').replaceChildren();
    for (const p of C.phases(config)) if (p.at > t.start && p.at < t.end && p.at !== t.handin) {
      const tick = node('i', 'phase-tick'); tick.style.left = (p.at - t.start) / total * 100 + '%'; tick.title = C.interpolate(p.title, config) + ' · ' + C.timeLabel(p.at, config.date); $('phase-ticks').append(tick);
    }
    const extra = $('extra-timepoints'); extra.replaceChildren();
    for (const id of Object.keys(config.events)) {
      if (t[id] > t.start && t[id] < t.end && !['handin', 'final'].includes(id)) {
        const tick = node('i', 'phase-tick event-tick'); tick.style.left = (t[id] - t.start) / total * 100 + '%'; tick.title = C.eventName(config, id) + ' · ' + C.timeLabel(t[id], config.date); $('phase-ticks').append(tick);
      }
      if (!['late', 'handin', 'half', 'final'].includes(id)) extra.append(node('span', '', C.timeLabel(t[id], config.date) + ' ' + C.eventName(config, id)));
    }
    extra.hidden = !extra.childElementCount;
    requestAnimationFrame(fitTimelineLabels);
    signature = ''; render();
  }
  function fitTimelineLabels() {
    if ($('handin-node').hidden) { $('timeline').classList.remove('crowded'); return; }
    const a = $('time-start').getBoundingClientRect(), b = $('time-handin').getBoundingClientRect(), c = $('time-end').getBoundingClientRect();
    $('timeline').classList.toggle('crowded', a.right + 12 > b.left || b.right + 12 > c.left);
  }
  new ResizeObserver(fitTimelineLabels).observe($('timeline'));
  function list(items, el, numbered = false) {
    let ruleNumber = 0;
    el.replaceChildren(...items.map((item, i) => {
      const text = typeof item === 'string' ? item : item.text, highlight = typeof item === 'object' && item.highlight;
      const li = node('li', highlight ? 'rule-notice' : '');
      if (highlight) li.append(node('span', 'notice-label', '請留意'));
      else if (numbered) li.append(node('span', 'rule-number', String(++ruleNumber).padStart(2, '0')));
      li.append(document.createTextNode(text)); return li;
    }));
  }
  function render() {
    const instant = now(), s = C.stateAt(config, instant), p = C.parts(instant);
    syncMascot(s.t, instant);
    $('clock-hm').textContent = C.hhmm(instant); $('clock-sec').textContent = String(p.s).padStart(2, '0');
    $('actual-date').hidden = p.date === config.date;
    $('actual-date').textContent = '現在日期 ' + p.date.replaceAll('-', ' / ');
    $('countdown-label').textContent = s.countdownLabel; $('countdown').textContent = instant >= s.t.end ? '00:00' : C.durationText(s.remaining);
    $('now-marker').style.left = s.progress * 100 + '%'; $('timeline-elapsed').style.width = s.progress * 100 + '%';
    $('timeline').setAttribute('aria-valuenow', Math.round(s.progress * 100));
    $('progress-caption').textContent = instant < s.t.start ? '尚未開始' : instant >= s.t.end ? '已完成' : Math.floor(s.progress * 100) + '%';
    const nextSig = JSON.stringify([configRevision, s.stage.id, s.fixed, s.rules, s.reminders]);
    if (signature !== nextSig) {
      signature = nextSig;
      $('status').className = 'status-pill ' + s.stage.tone; $('status-text').textContent = s.title;
      $('phase-chip').textContent = s.title;
      $('fixed-section').hidden = !s.fixed.length; list(s.fixed, $('fixed-rules')); list(s.ruleItems, $('stage-rules'), true);
      $('reminder-banner').hidden = !s.reminders.length; $('reminder-banner').textContent = s.reminders.join('　');
      scrollPosition = 0; $('scroll-viewport').scrollTop = 0; pauseUntil = performance.now() + 3000;
      requestAnimationFrame(measureScroll);
    }
    if (simulation) $('simulation-summary').textContent = p.date.replaceAll('-', '/') + ' · ' + (simulation.speed ? simulation.speed + ' 倍速' : '已暫停');
  }
  function measureScroll() {
    const content = $('scroll-content'), viewport = $('scroll-viewport');
    content.querySelectorAll('[data-copy]').forEach(el => el.remove());
    overflow = $('stage-rules').scrollHeight > viewport.clientHeight + 2;
    if (overflow && config.autoScroll) {
      const duplicate = $('stage-rules').cloneNode(true); duplicate.removeAttribute('id'); duplicate.dataset.copy = 'true'; duplicate.setAttribute('aria-hidden', 'true'); duplicate.style.paddingTop = '26px'; content.append(duplicate);
    }
    scrollPosition = 0; viewport.scrollTop = 0; pauseUntil = performance.now() + 3000;
    scrollUI();
  }
  function scrollUI() {
    $('scroll-toggle').hidden = !overflow || !config.autoScroll;
    $('scroll-toggle').textContent = scrollPaused ? '繼續捲動' : '暫停捲動';
    $('scroll-hint').textContent = !overflow ? '安心作答，慢慢來。' : !config.autoScroll ? '上下捲動，閱讀全部提醒' : scrollPaused ? '已暫停 · 可手動捲動' : '↑ 緩慢循環上捲 · 移入暫停';
  }
  function animateScroll(timestamp) {
    const elapsed = Math.min((timestamp - lastFrame) / 1000, .1); lastFrame = timestamp;
    if (overflow && config.autoScroll && !scrollPaused && !hovering && !focusing && timestamp > pauseUntil && !$('settings-dialog').open) {
      const viewport = $('scroll-viewport'), cycle = $('stage-rules').offsetHeight + 26;
      scrollPosition += elapsed * config.scrollSpeed;
      if (scrollPosition >= cycle) { scrollPosition %= cycle; pauseUntil = timestamp + 2500; }
      viewport.scrollTop = scrollPosition;
    }
    requestAnimationFrame(animateScroll);
  }
  $('scroll-toggle').onclick = () => { scrollPaused = !scrollPaused; scrollPosition = $('scroll-viewport').scrollTop; scrollUI(); };
  $('scroll-viewport').addEventListener('mouseenter', () => hovering = true);
  $('scroll-viewport').addEventListener('mouseleave', () => { hovering = false; scrollPosition = $('scroll-viewport').scrollTop; pauseUntil = performance.now() + 1500; });
  $('scroll-viewport').addEventListener('focusin', () => focusing = true);
  $('scroll-viewport').addEventListener('focusout', () => { focusing = false; scrollPosition = $('scroll-viewport').scrollTop; });
  $('scroll-viewport').addEventListener('wheel', () => { pauseUntil = performance.now() + 4000; setTimeout(() => scrollPosition = $('scroll-viewport').scrollTop, 200); }, { passive: true });
  $('scroll-viewport').addEventListener('touchstart', () => hovering = true, { passive: true });
  $('scroll-viewport').addEventListener('touchend', () => { hovering = false; pauseUntil = performance.now() + 5000; setTimeout(() => scrollPosition = $('scroll-viewport').scrollTop, 500); }, { passive: true });
  new ResizeObserver(measureScroll).observe($('scroll-viewport'));
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('此瀏覽器不支援網頁全螢幕，請使用瀏覽器的全螢幕功能。'); }
  }
  $('fullscreen').onclick = fullscreen;
  document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '離開全螢幕' : '進入全螢幕'); });
  document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey && !$('settings-dialog').open && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); fullscreen(); } });
  function chooseTab(name) {
    if (name === 'rules') { renderFixed(); renderPhases(); renderReminders(); }
    document.querySelectorAll('[data-tab]').forEach(el => { const active = el.dataset.tab === name; el.classList.toggle('active', active); el.setAttribute('aria-pressed', active); });
    document.querySelectorAll('[data-panel]').forEach(el => el.hidden = el.dataset.panel !== name);
    $('settings-errors').hidden = true;
  }
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => chooseTab(el.dataset.tab));
  const fields = ['title', 'subtitle', 'className', 'room', 'teacher', 'questionCount', 'date', 'admission', 'admissionEnabled', 'start', 'duration', 'extension', 'preparationMinutes', 'showClass', 'showRoom', 'showTeacher', 'showQuestions', 'showAttendance', 'autoScroll', 'scrollSpeed', 'mascotVisible', 'mascotAnimated'];
  function fillFields() {
    for (const name of fields) { const input = $('settings-form').elements.namedItem(name); if (input.type === 'checkbox') input.checked = draft[name]; else input.value = draft[name] ?? ''; }
    $('template-select').value = draft.templateId;
    $('admission-field').hidden = !draft.admissionEnabled;
    $('preparation-field').hidden = draft.admissionEnabled;
    updateOptionalFields();
    fillAttendance();
  }
  function updateOptionalFields() {
    const options = { showClass: ['className'], showRoom: ['room'], showTeacher: ['teacher'], showQuestions: ['questionCount'], showAttendance: ['attendance-expected', 'attendance-present', 'attendance-absent'] };
    for (const [flag, names] of Object.entries(options)) {
      const enabled = draft[flag];
      $('settings-form').elements.namedItem(flag).closest('label').classList.toggle('muted-field', !enabled);
      for (const name of names) {
        const input = $('settings-form').elements.namedItem(name) || $(name);
        input.disabled = !enabled; (input.closest('label') || input.parentElement).classList.toggle('muted-field', !enabled);
      }
    }
  }
  function fillAttendance() {
    for (const key of ['expected', 'present', 'absent']) $('attendance-' + key).value = draft.attendance[key] ?? '';
    const errors = C.attendanceErrors(draft.attendance);
    $('attendance-help').textContent = errors.length ? errors.join(' ') : '輸入任意兩欄，自動計算第三欄；以最近手動修改的兩欄為準。';
    $('attendance-help').classList.toggle('danger', !!errors.length);
  }
  for (const key of ['expected', 'present', 'absent']) $('attendance-' + key).addEventListener('input', event => {
    draft.attendance = C.editAttendance(draft.attendance, key, event.target.value).value;
    fillAttendance(); dirtyNote();
  });
  for (const name of fields) {
    const input = $('settings-form').elements.namedItem(name);
    input.addEventListener('input', () => {
      if (name === 'questionCount') { const parsed = C.parseCount(input.value); draft[name] = Number.isNaN(parsed) ? input.value : parsed; }
      else draft[name] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.value === '' && name === 'duration' ? null : Number(input.value) : input.value;
      if (name === 'admissionEnabled') { $('admission-field').hidden = !draft.admissionEnabled; $('preparation-field').hidden = draft.admissionEnabled; }
      if (name.startsWith('show')) updateOptionalFields();
      updatePreview(); dirtyNote();
    });
  }
  function dirtyNote() { $('draft-note').textContent = JSON.stringify(draft) === JSON.stringify(config) ? '修改後按「套用設定」才生效。' : '有尚未套用的修改'; }
  function showErrors(errors) { $('settings-errors').textContent = errors.join('\n'); $('settings-errors').hidden = !errors.length; if (errors.length) $('settings-errors').scrollIntoView({ block: 'nearest' }); }
  function openSettings() {
    draft = C.clone(config); fillFields(); renderEditors(); updatePreview(); dirtyNote(); chooseTab('general');
    const p = C.parts(now()); $('sim-datetime').value = p.date + 'T' + C.hhmm(now()) + ':' + String(p.s).padStart(2, '0');
    renderJumps(); $('settings-dialog').showModal();
  }
  $('settings-open').onclick = openSettings;
  $('settings-close').onclick = $('settings-cancel').onclick = () => $('settings-dialog').close();
  $('settings-form').onsubmit = event => {
    event.preventDefault(); const errors = C.validate(draft); if (errors.length) { showErrors(errors); return; }
    config = C.clone(draft); configRevision++; persist(); metadata(); $('settings-dialog').close(); toast(storageMessage);
  };
  function labeled(label, control) { const l = node('label', '', label); l.append(control); return l; }
  function input(value, fn, type = 'text') { const el = node('input'); el.type = type; el.value = value; el.addEventListener('input', () => { fn(type === 'number' ? Number(el.value) : el.value); dirtyNote(); updatePreview(); }); return el; }
  function textarea(value, fn, label) { const el = node('textarea'); el.value = value; el.rows = 2; el.setAttribute('aria-label', label); el.addEventListener('input', () => { fn(el.value); dirtyNote(); }); return el; }
  function select(value, values, fn, label) {
    const el = node('select'); if (label) el.setAttribute('aria-label', label);
    for (const [v, text] of values) { const opt = node('option', '', text); opt.value = v; el.append(opt); } el.value = value;
    el.onchange = () => { fn(el.value); dirtyNote(); updatePreview(); }; return el;
  }
  const anchorOptions = () => C.getAnchors(draft).map(k => [k, C.eventName(draft, k)]);
  const colorOptions = [['sage', '鼠尾草綠'], ['rose', '櫻花粉'], ['peach', '奶油杏'], ['lavender', '淡紫色']];
  function deleteButton(array, index, rerender) { return button('刪除', () => { array.splice(index, 1); rerender(); dirtyNote(); updatePreview(); }, 'danger'); }
  function renderEvents() {
    $('event-editors').replaceChildren();
    for (const id of Object.keys(draft.events)) {
      const row = node('div', 'event-row');
      row.append(labeled('節點名稱', input(C.eventName(draft, id), v => draft.events[id].label = v)));
      row.append(labeled('時間基準', select(draft.events[id].anchor, [['admission', '開放入場'], ['start', '考試開始'], ['end', '考試結束']], v => draft.events[id].anchor = v)));
      row.append(labeled('相差分鐘', input(draft.events[id].offset, v => draft.events[id].offset = v, 'number')));
      const actions = node('div', 'event-actions'); actions.append(node('code', '', '{' + id + '}'), button('刪除節點', () => {
        const label = C.eventName(draft, id), before = draft, next = C.removeEvent(draft, id);
        const countRules = c => c.fixed.length + c.phases.reduce((n, p) => n + p.rules.length, 0);
        const removed = `${before.phases.length - next.phases.length} 個階段、${countRules(before) - countRules(next)} 條規則、${before.reminders.length - next.reminders.length} 個提醒`;
        draft = next; renderEditors(); updatePreview(); dirtyNote(); toast('草稿已刪除「' + label + '」及 ' + removed + '；套用後生效。');
      }, 'danger'));
      row.append(actions); $('event-editors').append(row);
    }
  }
  function renderFixed() {
    $('fixed-editors').replaceChildren();
    draft.fixed.forEach((rule, i) => {
      const card = node('div', 'editor-card'); card.append(textarea(rule.text, v => rule.text = v, '固定規則 ' + (i + 1)));
      const grid = node('div', 'field-grid'); grid.append(labeled('開始顯示', select(rule.from, anchorOptions(), v => rule.from = v)), labeled('停止顯示', select(rule.until, anchorOptions(), v => rule.until = v))); card.append(grid);
      const row = node('div', 'delete-row'); row.append(node('span', '', '固定規則 ' + (i + 1)), deleteButton(draft.fixed, i, renderFixed)); card.append(row); $('fixed-editors').append(card);
    });
  }
  function renderPhaseRules(p, container) {
    container.replaceChildren();
    p.rules.forEach((r, i) => {
      const row = node('div', 'rule-editor'); row.append(textarea(r.text, v => r.text = v, '階段規則 ' + (i + 1)));
      const controls = node('div', 'rule-controls');
      const highlight = node('input'); highlight.type = 'checkbox'; highlight.checked = !!r.highlight;
      highlight.onchange = () => { r.highlight = highlight.checked; dirtyNote(); };
      const highlightLabel = node('label', 'check'); highlightLabel.append(highlight, document.createTextNode('強調這條規則')); controls.append(highlightLabel);
      const up = button('上移', () => { [p.rules[i - 1], p.rules[i]] = [p.rules[i], p.rules[i - 1]]; renderPhaseRules(p, container); dirtyNote(); }); up.disabled = i === 0;
      const down = button('下移', () => { [p.rules[i + 1], p.rules[i]] = [p.rules[i], p.rules[i + 1]]; renderPhaseRules(p, container); dirtyNote(); }); down.disabled = i === p.rules.length - 1;
      controls.append(up, down, deleteButton(p.rules, i, () => renderPhaseRules(p, container))); row.append(controls);
      container.append(row);
    });
    container.append(button('＋ 新增這個階段的規則', () => { p.rules.push({ text: '請輸入規則內容。' }); renderPhaseRules(p, container); dirtyNote(); }));
  }
  function renderPhases(openId) {
    $('phase-editors').replaceChildren();
    draft.phases.forEach((p, i) => {
      const card = node('details', 'editor-card'); card.open = p.id === openId;
      const summary = node('summary', '', p.title); card.append(summary);
      const grid = node('div', 'field-grid');
      grid.append(labeled('階段名稱', input(p.title, v => { p.title = v; summary.textContent = v; })), labeled('顏色', select(p.tone, colorOptions, v => p.tone = v)), labeled('開始基準', select(p.anchor, anchorOptions(), v => p.anchor = v)), labeled('相差分鐘', input(p.offset, v => p.offset = v, 'number')));
      card.append(grid); const rules = node('div', 'phase-rules'); renderPhaseRules(p, rules); card.append(rules);
      const row = node('div', 'delete-row'); row.append(node('span', '', '開始後持續至下一階段'), deleteButton(draft.phases, i, renderPhases)); card.append(row); $('phase-editors').append(card);
    });
  }
  function renderReminders() {
    $('reminder-editors').replaceChildren();
    draft.reminders.forEach((r, i) => {
      const card = node('div', 'editor-card'); card.append(textarea(r.text, v => r.text = v, '定時提醒 ' + (i + 1)));
      const grid = node('div', 'field-grid'); grid.append(labeled('顯示時間', select(r.at, anchorOptions(), v => r.at = v)), labeled('顯示長度（分鐘）', input(r.minutes, v => r.minutes = v, 'number'))); card.append(grid);
      const row = node('div', 'delete-row'), check = node('input'); check.type = 'checkbox'; check.checked = r.enabled; check.onchange = () => { r.enabled = check.checked; dirtyNote(); };
      const label = node('label', 'check'); label.append(check, document.createTextNode('啟用提醒')); row.append(label, deleteButton(draft.reminders, i, renderReminders)); card.append(row); $('reminder-editors').append(card);
    });
  }
  function renderEditors() { renderEvents(); renderFixed(); renderPhases(); renderReminders(); }
  $('add-event').onclick = () => {
    if (Object.keys(draft.events).length >= 40) { showErrors(['最多可設定 40 個時間節點。']); return; }
    draft.events[uid()] = { label: '自訂節點', anchor: 'start', offset: 60 };
    renderEvents(); updatePreview(); dirtyNote();
  };
  $('add-fixed').onclick = () => { draft.fixed.push({ id: uid(), from: 'start', until: 'end', text: '請輸入規則內容。' }); renderFixed(); dirtyNote(); };
  $('add-phase').onclick = () => {
    const t = C.schedule(draft), occupied = new Set(C.phases(draft).map(p => p.at));
    let offset = 1; while (occupied.has(t.start + offset * C.MIN)) offset++;
    const p = { id: uid(), title: '自訂階段', anchor: 'start', offset, tone: 'sage', rules: [{ text: '請輸入這個階段的提醒。' }] };
    draft.phases.push(p); renderPhases(p.id); dirtyNote();
  };
  $('add-reminder').onclick = () => { draft.reminders.push({ id: uid(), at: 'start', minutes: 2, enabled: true, text: '請輸入提醒內容。' }); renderReminders(); dirtyNote(); };
  function updatePreview() {
    const target = $('schedule-preview'); target.replaceChildren();
    try {
      const t = C.schedule(draft), before = C.schedule(config);
      if (Object.values(t).some(v => !Number.isFinite(v))) throw new Error();
      for (const id of C.getAnchors(draft).sort((a, b) => t[a] - t[b])) {
        const row = node('div', 'preview-item'); row.append(node('span', '', C.eventName(draft, id))); const right = node('div');
        if (Number.isFinite(before[id]) && before[id] !== t[id]) right.append(node('small', '', C.timeLabel(before[id], config.date) + ' →'));
        right.append(node('strong', '', C.timeLabel(t[id], draft.date))); row.append(right); target.append(row);
      }
      for (const id of Object.keys(config.events).filter(id => !Object.hasOwn(draft.events, id))) target.append(node('p', 'help danger', '已刪除：' + C.eventName(config, id) + '（引用它的階段、規則與提醒也會移除）'));
      const errors = C.validate(draft); if (errors.length) target.append(node('p', 'help', errors.join(' ')));
    } catch { target.append(node('p', 'help', '請填入完整日期與時間，以預覽時程。')); }
  }
  document.querySelectorAll('[data-shift]').forEach(b => b.onclick = () => {
    shiftDraft(Number(b.dataset.shift) * 60);
  });
  function shiftDraft(seconds) {
    try { draft = C.shiftStart(draft, seconds); fillFields(); updatePreview(); dirtyNote(); }
    catch (error) { showErrors([error.message]); }
  }
  function customShift(sign) {
    const minutes = C.parseCount($('shift-minutes').value), seconds = C.parseCount($('shift-seconds').value);
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes > 1439 || seconds > 59 || minutes * 60 + seconds === 0) { showErrors(['請輸入非負整數分鐘及 0–59 秒，合計至少 1 秒。']); return; }
    shiftDraft(sign * (minutes * 60 + seconds));
  }
  $('shift-back').onclick = () => customShift(-1);
  $('shift-forward').onclick = () => customShift(1);
  function loadTemplate() {
    draft = C.makeTemplate($('template-select').value, draft.date || config.date || C.defaults.date);
    fillFields(); renderEditors(); updatePreview(); dirtyNote(); showErrors([]);
    toast(draft.templateId === 'blank' ? '已清空草稿；請填寫基本考試資訊後再套用。' : '模板已載入草稿；套用後生效。');
  }
  $('template-load').onclick = loadTemplate;
  $('template-select').onchange = loadTemplate;
  $('reset-config').onclick = () => { draft = C.clone(C.defaults); fillFields(); renderEditors(); updatePreview(); dirtyNote(); toast('預設已載入草稿；套用後才生效。'); };
  $('export-config').onclick = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = 'exam-settings-' + config.date + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('import-config').onclick = () => $('import-file').click();
  $('import-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('設定檔不能超過 1 MB。');
      const parsed = C.upgrade(JSON.parse(await file.text())), errors = C.validate(parsed); if (errors.length) throw new Error(errors.join('\n'));
      draft = parsed; fillFields(); renderEditors(); updatePreview(); dirtyNote(); toast('已匯入草稿，請檢查後套用。');
    } catch (e) { showErrors(['匯入失敗：' + e.message]); } finally { event.target.value = ''; }
  };
  function startSimulation(epoch, speed) {
    if (!Number.isFinite(epoch)) { showErrors(['請選擇有效模擬日期與時間。']); return; }
    simulation = { epoch, base: performance.now(), speed, resumeSpeed: speed || 1 };
    document.body.classList.add('simulating'); $('simulation-banner').hidden = false; $('clock-mode').textContent = '模擬時間'; $('sim-pause').textContent = speed ? '暫停' : '播放';
    $('settings-dialog').close(); render();
  }
  function stopSimulation() { simulation = null; document.body.classList.remove('simulating'); $('simulation-banner').hidden = true; $('clock-mode').textContent = '現在時間'; render(); }
  function simulationAllowed() { if (JSON.stringify(draft) !== JSON.stringify(config)) { showErrors(['有尚未套用的修改。請先套用設定，再重新開啟模擬測試。']); return false; } return true; }
  $('sim-start').onclick = () => { if (simulationAllowed()) startSimulation(Date.parse($('sim-datetime').value + '+08:00'), Number($('sim-speed').value)); };
  $('sim-exit').onclick = stopSimulation;
  $('sim-real').onclick = () => { stopSimulation(); $('settings-dialog').close(); };
  $('sim-pause').onclick = () => { if (!simulation) return; const epoch = now(), speed = simulation.speed ? 0 : simulation.resumeSpeed; if (simulation.speed) simulation.resumeSpeed = simulation.speed; simulation.epoch = epoch; simulation.base = performance.now(); simulation.speed = speed; $('sim-pause').textContent = speed ? '暫停' : '播放'; render(); };
  function renderJumps() {
    $('sim-jumps').replaceChildren(); const t = C.schedule(config);
    for (const id of C.getAnchors(config).sort((a, b) => t[a] - t[b])) $('sim-jumps').append(button(C.timeLabel(t[id], config.date) + ' ' + C.eventName(config, id), () => { if (simulationAllowed()) startSimulation(t[id], Number($('sim-speed').value)); }));
  }
  // Resolve from absolute time on every tick: background throttling cannot accumulate drift.
  document.addEventListener('visibilitychange', () => { syncMascot(C.schedule(config), now()); if (!document.hidden) render(); });
  window.addEventListener('pageshow', render);
  metadata(); setInterval(render, 200); requestAnimationFrame(animateScroll);
})();
