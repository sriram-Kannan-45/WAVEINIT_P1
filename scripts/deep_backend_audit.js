const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'backend', 'src', 'controllers');
const servicesDir = path.join(__dirname, '..', 'backend', 'src', 'services');

let issues = [];

function checkControllerFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(path.join(__dirname, '..', 'backend'), filePath);
  
  // 1. Check for missing return after res.status(...).json(...) or res.json(...) before another res.
  const lines = content.split('\n');
  let insideFunc = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for Model.query without await in async functions
    const unawaitedModelCall = /(?:const|let|var)\s+\w+\s*=\s*(?:User|Course|Training|AIQuiz|AIQuestion|QuizAttempt|QuizResult|Enrollment|Interview|InterviewSession|AssessmentSession|Lesson|LessonProgress)\.(?:find|create|update|destroy|count|bulkCreate)\(/;
    if (unawaitedModelCall.test(line) && !line.includes('await') && !line.includes('return') && !line.includes('Promise.')) {
      issues.push({
        file: rel,
        line: i + 1,
        type: 'POSSIBLE_MISSING_AWAIT',
        code: line.trim()
      });
    }

    // Check for double response patterns (res.status(...).json(...) followed by res.json or similar on same branch)
    if (/^\s*res\.status\(\d+\)\.json\(/.test(line) && !line.includes('return') && !lines[i - 1]?.includes('return')) {
      // Check if subsequent lines in block also call res.
      let hasNextRes = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 15); j++) {
        if (lines[j].includes('} catch') || lines[j].includes('return res.') || lines[j].includes('return;')) break;
        if (lines[j].includes('res.json(') || lines[j].includes('res.status(')) {
          hasNextRes = true;
          break;
        }
      }
      if (hasNextRes) {
        issues.push({
          file: rel,
          line: i + 1,
          type: 'POTENTIAL_DOUBLE_RESPONSE',
          code: line.trim()
        });
      }
    }
  }
}

const controllerFiles = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));
for (const file of controllerFiles) {
  checkControllerFile(path.join(controllersDir, file));
}

const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
for (const file of serviceFiles) {
  checkControllerFile(path.join(servicesDir, file));
}

console.log('Checked controllers & services. Issues found:', issues.length);
if (issues.length > 0) {
  console.log(JSON.stringify(issues, null, 2));
}
