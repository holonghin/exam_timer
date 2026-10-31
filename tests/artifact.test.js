const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
test('standalone and offline deliverables are identical and have no external resources', () => {
  assert.equal(html, fs.readFileSync(path.join(root, 'offline.html'), 'utf8'));
  assert.doesNotMatch(html, /\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:|\bfetch\s*\(|\bXMLHttpRequest\b/);
  assert.doesNotMatch(html, /INLINE_(?:STYLE|CORE|MASCOT|APP)/);
});
test('all bundled scripts parse and every static element id is unique', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; assert.equal(scripts.length, 3);
  scripts.forEach((m, i) => new vm.Script(m[1], { filename: 'inline-' + i + '.js' }));
  const markup = html.split('<script>')[0]; const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size);
});
test('build output is synchronized with sources', () => {
  let expected = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  for (const [token, file] of [['STYLE', 'style.css'], ['CORE', 'core.js'], ['MASCOT', 'mascot.js'], ['APP', 'app.js']]) expected = expected.replace('/* INLINE_' + token + ' */', () => fs.readFileSync(path.join(root, 'src', file), 'utf8'));
  assert.equal(html, expected);
});
test('visible header contains only the Chinese titles with the numeric default', () => {
  const header = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)[1];
  assert.doesNotMatch(header, /CALCULUS|EXAM DAY/);
  assert.match(header, /id="exam-title">微積分1<\/span>/);
  assert.match(header, /id="exam-subtitle">期中考試<\/span>/);
});
