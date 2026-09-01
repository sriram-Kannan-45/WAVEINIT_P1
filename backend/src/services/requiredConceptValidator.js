'use strict';

/**
 * Language-aware Required Concept Validator
 * ─────────────────────────────────────────
 * Checks a participant's submitted code for the trainer's "Required Concepts"
 * (e.g. must use a for loop, must use a while loop, must use a function).
 * Detection is language-aware rather than a naive global substring search.
 */

const CONCEPT_LABELS = {
  for_loop: 'for loop',
  while_loop: 'while loop',
  if_else: 'if/else',
  function: 'function',
  recursion: 'recursion',
  array: 'array/list',
  class: 'class',
  print: 'output (print)',
  custom: 'custom requirement',
};

function checkForLoop(code, lang) {
  if (lang === 'python') return /\bfor\s+[\w,\s()\[\]]+\s+in\b/.test(code);
  if (lang === 'go') return /\bfor\b/.test(code);
  if (lang === 'rust') return /\bfor\b[\s\S]*\bin\b/.test(code) || /\bloop\b/.test(code);
  if (lang === 'php') return /\b(for|foreach)\s*\(/.test(code);
  if (lang === 'kotlin' || lang === 'swift') return /\bfor\s+[\w,\s()]+\s+in\b/.test(code) || /\bfor\s*\(/.test(code);
  // C-family + JS/TS + Java + C#: for(...) or for(... of ...) or for(... in ...)
  return /\bfor\s*\(/.test(code) || /\bfor\s+await\s*\(/.test(code);
}

function checkWhileLoop(code, lang) {
  if (lang === 'python') return /\bwhile\b/.test(code);
  if (lang === 'go') return /\bfor\b/.test(code) || /\bwhile\b/.test(code);
  if (lang === 'rust') return /\bwhile\b|\bloop\b/.test(code);
  if (lang === 'swift') return /\bwhile\b|\brepeat\b/.test(code);
  // C-family + JS/TS + Java: while(...)
  return /\bwhile\s*\(/.test(code) || /\bwhile\s+/.test(code);
}

function checkIfElse(code, lang) {
  const hasIf = /\bif\s*\(/.test(code) || (lang === 'python' ? /\bif\b/.test(code) : /\bif\b/.test(code));
  const hasElse = /\belse\b/.test(code) || (lang === 'python' ? /\belif\b|\belse\b/.test(code) : /\belse\b/.test(code));
  return hasIf && hasElse;
}

const FUNCTION_KEYWORDS = {
  python: /\bdef\s+\w+\s*\(/,
  javascript: /\bfunction\s*\w*\s*\(|\([^)]*\)\s*=>|\b\w+\s*=>/,
  typescript: /\bfunction\s*\w*\s*\(|\([^)]*\)\s*=>|\b\w+\s*=>/,
  go: /\bfunc\b/,
  rust: /\bfn\b/,
  php: /\bfunction\b/,
  kotlin: /\bfun\b/,
  swift: /\bfunc\b/,
};

function checkFunction(code, lang) {
  const kw = FUNCTION_KEYWORDS[lang];
  if (kw) return kw.test(code);
  // C-family / Java / C#: method/function declaration like ... name(args) { — excluding keywords
  const re = /([a-zA-Z_][\w<>,\s\[\].]*)\s+([a-zA-Z_][\w]*)\s*\([^)]*\)\s*\{/;
  let m;
  const guard = new RegExp(re);
  const excluded = /^(for|while|if|switch|catch|function|static|class)$/;
  let searchStr = code;
  while ((m = guard.exec(searchStr))) {
    const name = m[2];
    if (!excluded.test(name)) return true;
    searchStr = searchStr.slice(m.index + m[0].length);
  }
  return false;
}

function extractFunctionNames(code, lang) {
  const names = [];
  const patterns = {
    python: /\bdef\s+(\w+)\s*\(/g,
    javascript: /\bfunction\s+(\w+)\s*\(|\bconst\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g,
    typescript: /\bfunction\s+(\w+)\s*\(|\bconst\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g,
    go: /\bfunc\s*\(?[^)]*\)?\s+(\w+)\s*\(/g,
    rust: /\bfn\s+(\w+)\s*\(/g,
    php: /\bfunction\s+(\w+)\s*\(/g,
    kotlin: /\bfun\s+(\w+)\s*\(/g,
    swift: /\bfunc\s+(\w+)\s*\(/g,
  };
  const pat = patterns[lang];
  if (!pat) return names;
  let m;
  while ((m = pat.exec(code))) {
    const fnName = m[1] || m[2];
    if (fnName) names.push(fnName);
  }
  return names;
}

function checkRecursion(code, lang) {
  const hasFn = checkFunction(code, lang);
  if (!hasFn) return false;
  const names = extractFunctionNames(code, lang);
  return names.some((name) => {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');
    let count = 0;
    while (re.exec(code)) {
      count++;
      if (count >= 2) return true;
    }
    return false;
  });
}

function checkArray(code, lang) {
  if (lang === 'python') return /\blist\s*\(|\b\[[^\]]*\]/.test(code);
  if (lang === 'java' || lang === 'csharp' || lang === 'kotlin') {
    return /\bList\s*<|\bArrayList\b|new\s+(int|String|char|double|long|Object)\s*\[|\[\]/g.test(code);
  }
  if (lang === 'cpp') return /std::vector|\[\]|\bint\s+\w+\s*\[|new\s+\w+\s*\[/.test(code);
  if (lang === 'go') return /\b\[\]|\bmake\(\[\]|append\(/.test(code);
  if (lang === 'rust') return /\bVec\b|\[[^\]]*\]/.test(code);
  if (lang === 'php') return /\b(array|\[\])\b|\b\[\s*[^\]]*\s*\]/.test(code);
  if (lang === 'javascript' || lang === 'typescript' || lang === 'swift') {
    return /\bArray\b|\[[^\]]*\]|\.push\(|\.map\(|\.filter\(/.test(code);
  }
  return /\bArray\b|\[[^\]]*\]|vector|std::array/.test(code);
}

function checkClass(code, lang) {
  if (lang === 'rust') return /\bstruct\b/.test(code);
  if (lang === 'go') return /\bstruct\b/.test(code);
  return /\bclass\b/.test(code);
}

function checkPrint(code, lang) {
  if (lang === 'python') return /\bprint\s*\(/.test(code);
  if (lang === 'java' || lang === 'kotlin') return /System\.out\.print|print\s*\(|println\s*\(/.test(code);
  if (lang === 'javascript' || lang === 'typescript') return /console\.log\s*\(/.test(code);
  if (lang === 'cpp' || lang === 'c') return /printf\s*\(|std::?cout\s*<</.test(code);
  if (lang === 'csharp') return /Console\.Write|Console\.Out\.Write/.test(code);
  if (lang === 'php') return /\becho\b|\bprint\s*\(|printf\s*\(/.test(code);
  if (lang === 'ruby') return /\bputs\b|\bprint\b/.test(code);
  if (lang === 'swift') return /\bprint\s*\(/.test(code);
  if (lang === 'go') return /fmt\.Print|fmt\.Println|fmt\.Printf/.test(code);
  if (lang === 'rust') return /println!|print!/.test(code);
  return /\bprint\s*\(/.test(code);
}

function checkCustom(rule, code) {
  const mode = (rule && rule.mode) || 'contains';
  const query = (rule && (rule.query || rule.value || '')).toString();
  if (!query) return true;
  if (mode === 'notContains') return !code.includes(query);
  return code.includes(query);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate required concepts against submitted code.
 * @param {string} code       The participant's source code.
 * @param {string} language   Judge language id (e.g. "python").
 * @param {Array}  requiredConcepts  List of concept ids and/or {id, mode, query} for custom.
 * @returns {{ok: boolean, results: Array<{concept: string, label: string, satisfied: boolean, custom?: object}>, message?: string}}
 */
function checkRequiredConcepts(code, language, requiredConcepts) {
  const lang = String(language || '').toLowerCase();
  const raw = Array.isArray(requiredConcepts) ? requiredConcepts : [];
  const results = [];

  for (const entry of raw) {
    let id = entry;
    let rule = null;
    if (entry && typeof entry === 'object') {
      id = entry.id || entry.concept;
      rule = entry;
    }
    id = String(id || '').toLowerCase();
    if (!id) continue;

    let satisfied = false;
    switch (id) {
      case 'for_loop': satisfied = checkForLoop(code, lang); break;
      case 'while_loop': satisfied = checkWhileLoop(code, lang); break;
      case 'if_else': satisfied = checkIfElse(code, lang); break;
      case 'function': satisfied = checkFunction(code, lang); break;
      case 'recursion': satisfied = checkRecursion(code, lang); break;
      case 'array': satisfied = checkArray(code, lang); break;
      case 'class': satisfied = checkClass(code, lang); break;
      case 'print': satisfied = checkPrint(code, lang); break;
      case 'custom': satisfied = checkCustom(rule, code); break;
      default:
        satisfied = code.toLowerCase().includes(String(id).toLowerCase());
        break;
    }

    results.push({
      concept: id,
      label: CONCEPT_LABELS[id] || (rule ? 'custom requirement' : String(id).replace(/_/g, ' ')),
      satisfied,
      ...(rule ? { custom: { mode: rule.mode, query: rule.query || rule.value } } : {}),
    });
  }

  const ok = results.every((r) => r.satisfied);
  let message = '';
  if (!ok) {
    const missing = results.filter(r => !r.satisfied).map(r => r.label);
    if (missing.length === 1) {
      message = `Your solution must use a ${missing[0]} as required by this problem.`;
    } else {
      message = `Your solution must satisfy all required concepts: ${missing.join(', ')}.`;
    }
  }

  return { ok, results, message };
}

module.exports = {
  checkRequiredConcepts,
  CONCEPT_LABELS,
  SUPPORTED_CONCEPTS: [
    'for_loop', 'while_loop', 'if_else', 'function', 'recursion', 'array', 'class', 'print', 'custom',
  ],
};

