'use strict';

/**
 * Language Templates and Code Initialization Utility (Backend)
 */

function toCamelCase(str) {
  if (!str) return 'solution';
  const clean = str.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return 'solution';
  return words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function toSnakeCase(str) {
  if (!str) return 'solution';
  const clean = str.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return 'solution';
  return words.map(w => w.toLowerCase()).join('_');
}

function getOutputString(problem) {
  const p = problem || {};
  if (p.sampleOutput != null && String(p.sampleOutput).trim()) {
    return String(p.sampleOutput).trim();
  }
  if (Array.isArray(p.testCases) && p.testCases.length > 0) {
    const first = p.testCases[0];
    if (first?.expectedOutput != null && String(first.expectedOutput).trim()) {
      return String(first.expectedOutput).trim();
    }
  }
  const title = (p.title || '').toLowerCase();
  if (title.includes('hi')) return 'Hi';
  if (title.includes('hello')) return 'Hello, World!';
  return 'Hi';
}

function getDefaultStarterCode(lang, problem) {
  const p = problem || {};
  const l = String(lang || 'javascript').toLowerCase();
  const fnCamel = toCamelCase(p.title || 'solution');
  const fnSnake = toSnakeCase(p.title || 'solution');

  switch (l) {
    case 'python':
      return `def ${fnSnake}():\n    # Write your solution here\n    pass\n`;

    case 'javascript':
      return `function ${fnCamel}() {\n  // Write your solution here\n}\n`;

    case 'typescript':
      return `function ${fnCamel}(): void {\n  // Write your solution here\n}\n`;

    case 'java':
      return `public class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`;

    case 'cpp':
      return `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`;

    case 'c':
      return `#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`;

    case 'csharp':
      return `using System;\n\npublic class Solution {\n    public static void Main(string[] args) {\n        // Write your solution here\n    }\n}\n`;

    case 'go':
      return `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n}\n`;

    case 'php':
      return `<?php\nfunction ${fnSnake}() {\n    // Write your solution here\n}\n`;

    case 'ruby':
      return `def ${fnSnake}\n  # Write your solution here\nend\n`;

    case 'kotlin':
      return `fun main() {\n    // Write your solution here\n}\n`;

    case 'rust':
      return `fn main() {\n    // Write your solution here\n}\n`;

    case 'swift':
      return `import Foundation\n\n// Write your solution here\n`;

    default:
      return `// Write your solution in ${lang} here\n`;
  }
}

function getDefaultReferenceSolution(lang, problem) {
  const p = problem || {};
  const l = String(lang || 'javascript').toLowerCase();
  const fnCamel = toCamelCase(p.title || 'solution');
  const fnSnake = toSnakeCase(p.title || 'solution');
  const output = getOutputString(p);
  const jsonOutput = JSON.stringify(output);

  switch (l) {
    case 'python':
      return `def ${fnSnake}():\n    print(${jsonOutput})\n\nif __name__ == "__main__":\n    ${fnSnake}()\n`;

    case 'javascript':
      return `function ${fnCamel}() {\n  console.log(${jsonOutput});\n}\n\n${fnCamel}();\n`;

    case 'typescript':
      return `function ${fnCamel}(): void {\n  console.log(${jsonOutput});\n}\n\n${fnCamel}();\n`;

    case 'java':
      return `public class Main {\n    public static void main(String[] args) {\n        System.out.println(${jsonOutput});\n    }\n}\n`;

    case 'cpp':
      return `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << ${jsonOutput} << endl;\n    return 0;\n}\n`;

    case 'c':
      return `#include <stdio.h>\n\nint main() {\n    printf("%s\\n", ${jsonOutput});\n    return 0;\n}\n`;

    case 'csharp':
      return `using System;\n\npublic class Solution {\n    public static void Main(string[] args) {\n        Console.WriteLine(${jsonOutput});\n    }\n}\n`;

    case 'go':
      return `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println(${jsonOutput})\n}\n`;

    case 'php':
      return `<?php\nfunction ${fnSnake}() {\n    echo ${jsonOutput} . "\\n";\n}\n\n${fnSnake}();\n`;

    case 'ruby':
      return `def ${fnSnake}\n  puts ${jsonOutput}\nend\n\n${fnSnake}\n`;

    case 'kotlin':
      return `fun main() {\n    println(${jsonOutput})\n}\n`;

    case 'rust':
      return `fn main() {\n    println!("{}", ${jsonOutput});\n}\n`;

    case 'swift':
      return `import Foundation\n\nprint(${jsonOutput})\n`;

    default:
      return `// Reference solution for ${lang}\n`;
  }
}

module.exports = {
  getDefaultStarterCode,
  getDefaultReferenceSolution,
};
