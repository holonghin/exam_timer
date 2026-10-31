/* Embed production cutouts once; SVG <use> shares them across animation layers. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = function inlineAssets(html, root) {
  return html.replace(/\{\{MASCOT:([a-z-]+)\}\}/g, (_, name) => {
    const bytes = fs.readFileSync(path.join(root, 'src/assets/mascot', name + '.png'));
    return 'data:image/png;base64,' + bytes.toString('base64');
  });
};
