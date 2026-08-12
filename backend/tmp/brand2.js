const fs = require('fs');
const src = fs.readFileSync('frontend/src/components/saas/Sidebar.jsx', 'utf8');
const i = src.indexOf('BrandLogo');
console.log(src.slice(i - 20, i + 900));
