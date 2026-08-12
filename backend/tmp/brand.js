const fs = require('fs');
const src = fs.readFileSync('frontend/src/components/saas/Sidebar.jsx', 'utf8');
console.log('len', src.length);
const i = src.indexOf('WAVE INIT');
console.log(src.slice(Math.max(0, i - 800), i + 400));
