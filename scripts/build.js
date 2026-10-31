/* No dependencies. Both distributables are self-contained, identical HTML. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
for (const [token, file] of [['STYLE', 'style.css'], ['CORE', 'core.js'], ['MASCOT', 'mascot.js'], ['APP', 'app.js']]) {
  html = html.replace('/* INLINE_' + token + ' */', () => fs.readFileSync(path.join(root, 'src', file), 'utf8'));
}
html = require('./inline-assets')(html, root);
for (const file of ['index.html', 'offline.html']) fs.writeFileSync(path.join(root, file), html, 'utf8');
fs.writeFileSync(path.join(root, '.nojekyll'), '');
console.log('Built index.html and offline.html (' + Buffer.byteLength(html) + ' bytes each).');
