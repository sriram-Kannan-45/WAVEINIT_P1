const fs = require('fs');
for (const f of ['StatusStrip','InterviewToolbar','VideoTile']) {
  const p = 'frontend/src/components/interview/' + f + '.jsx';
  console.log('=== ' + f + ' ===');
  console.log(fs.readFileSync(p, 'utf8'));
  console.log();
}
