/* Short codes resolve to static JSON files in this repository; no login secrets. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('node:crypto').webcrypto);
  else root.ExamPresets = factory(root.ExamCore, root.crypto);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, crypto) {
  'use strict';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX_BYTES = 1024 * 1024;
  const PUBLIC_URL = 'https://holonghin.github.io/exam_timer/', REPOSITORY = 'https://github.com/holonghin/exam_timer';
  const byteLength = text => new TextEncoder().encode(text).length;
  function normalizeCode(raw) {
    const code = String(raw).toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('請輸入正確的 6 碼考試代碼。');
    return code;
  }
  function requestedCode(base) {
    const hash = new URL(base).hash.slice(1);
    if (!hash) return null;
    try { return decodeURIComponent(hash); } catch { return hash; }
  }
  function hostedURL(base) {
    const url = new URL(base);
    if (url.protocol === 'file:') return new URL(PUBLIC_URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('無法使用這個網址載入考試。');
    return url;
  }
  function dataURL(base, raw) { return new URL('exams/' + normalizeCode(raw) + '.json', hostedURL(base)).href; }
  function shortURL(base, raw) {
    const url = hostedURL(base); url.search = ''; url.hash = normalizeCode(raw); return url.href;
  }
  function createPreset(config, random = bytes => crypto.getRandomValues(bytes)) {
    const errors = C.validate(config); if (errors.length) throw new Error(errors.join('\n'));
    const bytes = random(new Uint8Array(6));
    const code = Array.from(bytes, n => ALPHABET[n & 31]).join('');
    const preset = { format: 'exam-timer-preset', version: 1, code, config: C.clone(config) };
    if (byteLength(JSON.stringify(preset)) > MAX_BYTES) throw new Error('考試設定過長，請減少內容後再預存。');
    return preset;
  }
  function decodePreset(text, expectedCode) {
    try {
      if (typeof text !== 'string' || byteLength(text) > MAX_BYTES) throw new Error();
      const value = JSON.parse(text);
      if (value.format !== 'exam-timer-preset' || value.version !== 1 || value.code !== normalizeCode(expectedCode)) throw new Error();
      const config = C.upgrade(value.config); if (C.validate(config).length) throw new Error();
      return config;
    } catch { throw new Error('考試檔案格式不正確，請重新預存。'); }
  }
  function publication(preset) {
    const code = normalizeCode(preset.code), contents = JSON.stringify(preset);
    decodePreset(contents, code);
    const url = new URL(REPOSITORY + '/new/main');
    url.searchParams.set('filename', 'exams/' + code + '.json'); url.searchParams.set('value', contents);
    return { url: url.href.length <= 7600 ? url.href : REPOSITORY + '/upload/main/exams', mode: url.href.length <= 7600 ? 'editor' : 'upload', filename: code + '.json', contents: JSON.stringify(preset, null, 2) };
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const sameConfig = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  async function load(base, raw, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
    const code = normalizeCode(raw), url = new URL(dataURL(base, code));
    // A newly published file must not be masked by a cached 404.
    url.searchParams.set('v', String(Date.now()));
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.href, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (response.status === 404) throw new Error('找不到此考試，請檢查代碼或稍後重試。');
      if (!response.ok) throw new Error('暫時無法載入考試，請稍後重試。');
      if (Number(response.headers?.get('content-length')) > MAX_BYTES) throw new Error('考試檔案過大，請重新預存。');
      return decodePreset(await response.text(), code);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('連線逾時，請再試一次。');
      if (error instanceof TypeError) throw new Error('無法連線，請檢查網路後再試一次。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  return { normalizeCode, requestedCode, dataURL, shortURL, createPreset, decodePreset, publication, sameConfig, load };
});
