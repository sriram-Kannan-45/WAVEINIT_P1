const fs = require('fs');
const src = fs.readFileSync('frontend/src/components/saas/Sidebar.jsx', 'utf8');
const re = /WAVE INIT/g;
let m;
while ((m = re.exec(src))) {
  console.log('=== around', m.index, '===');
  console.log(src.slice(Math.max(0, m.index - 700), m.index + 300));
  console.log();
}
