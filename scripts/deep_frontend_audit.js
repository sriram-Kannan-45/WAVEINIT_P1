const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'frontend', 'src');
let issues = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(srcDir, filePath);
  const lines = content.split('\n');

  // 1. Check useEffect without dependency array
  // Pattern: useEffect(() => { ... }) where there is no comma before closing parenthesis
  let effectDepth = 0;
  let effectStartLine = 0;
  let effectBody = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for conditional hook calls: if (...) { const [x, setX] = useState...
    if (/^\s*if\s*\([^)]+\)\s*\{?\s*(?:const|let|var)?\s*\[?\w+\]?\s*=\s*use(?:State|Effect|Memo|Callback|Ref)/.test(line)) {
      issues.push({
        file: rel,
        line: i + 1,
        type: 'CONDITIONAL_HOOK_CALL',
        code: line.trim()
      });
    }

    // Check for useEffect missing dependency array: useEffect(() => { ... }) without second arg
    if (/useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/.test(line)) {
      let parenCount = 0;
      let hasSecondArg = false;
      let j = i;
      let fullBlock = '';
      while (j < lines.length && j < i + 100) {
        fullBlock += lines[j] + '\n';
        for (const char of lines[j]) {
          if (char === '(') parenCount++;
          if (char === ')') parenCount--;
        }
        if (parenCount === 0 && j > i) {
          // Check if before the final closing paren there's a comma array
          if (!/,\s*\[[^\]]*\]\s*\)/.test(fullBlock)) {
            issues.push({
              file: rel,
              line: i + 1,
              type: 'USE_EFFECT_MISSING_DEPENDENCY_ARRAY',
              detail: 'useEffect has no second argument dependency array (runs on every render)'
            });
          }
          break;
        }
        j++;
      }
    }
  }
}

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.cert') scan(full);
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      checkFile(full);
    }
  }
}

scan(srcDir);
console.log('Checked frontend files. React hook lifecycle issues found:', issues.length);
if (issues.length > 0) {
  console.log(JSON.stringify(issues, null, 2));
}
