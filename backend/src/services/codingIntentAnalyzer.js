/**
 * Coding Intent Analyzer
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyzes the trainer's prompt/topic to extract structured programming intent,
 * literal values, input/output requirements, and negative (forbidden) constraints.
 */

const CATEGORIES = {
  PRINT_OUTPUT: 'PRINT_OUTPUT',
  STRING_PROCESSING: 'STRING_PROCESSING',
  ARRAY_PROCESSING: 'ARRAY_PROCESSING',
  SORTING: 'SORTING',
  SEARCHING: 'SEARCHING',
  MATH: 'MATH',
  CONDITIONALS: 'CONDITIONALS',
  LOOPS: 'LOOPS',
  FUNCTIONS: 'FUNCTIONS',
  RECURSION: 'RECURSION',
  OOP: 'OOP',
  DATA_STRUCTURES: 'DATA_STRUCTURES',
  PATTERN_PRINTING: 'PATTERN_PRINTING',
  MULTI_CONCEPT: 'MULTI_CONCEPT',
};

/**
 * Extract literal strings or values explicitly enclosed in quotes or specified after keywords.
 */
function extractLiteralValues(prompt) {
  const literals = [];
  const p = String(prompt || '');

  // 1. Match quoted strings: "Hello World", 'hi'
  const quoteMatches = p.matchAll(/["']([^"']+)["']/g);
  for (const m of quoteMatches) {
    if (m[1] && m[1].trim()) {
      literals.push(m[1].trim());
    }
  }

  // 2. Common print phrasing: print Hello World, display Hi
  const printMatch = p.match(/(?:print|display|echo|output|show|write)\s+(?:the\s+(?:text|string|message)\s+)?([A-Za-z0-9_!?,.\s]+)/i);
  if (printMatch && printMatch[1]) {
    const candidate = printMatch[1].trim();
    // Filter out common instructions
    if (!/^(?:a\s+program|a\s+function|the\s+output|code|solution|algorithm|numbers?|array|string)$/i.test(candidate)) {
      if (!literals.includes(candidate)) {
        literals.push(candidate);
      }
    }
  }

  return literals;
}

/**
 * Classifies the primary programming task from the prompt using deep semantic rules.
 */
function classifyPrimaryTask(prompt) {
  const norm = String(prompt || '').toLowerCase().trim();

  // Pattern printing
  if (/pattern|pyramid|star|diamond|triangle\s+of\s+stars/i.test(norm)) {
    return CATEGORIES.PATTERN_PRINTING;
  }

  // Sorting
  if (/sort|ascending|descending|alphabetical\s+order|order\s+of\s+elements/i.test(norm)) {
    return CATEGORIES.SORTING;
  }

  // Searching
  if (/search|find\s+(?:the\s+)?index|binary\s+search|linear\s+search|lookup/i.test(norm)) {
    return CATEGORIES.SEARCHING;
  }

  // Pure Print Output (e.g. "Print Hello World", "Display hi", "Output text")
  if (/^(?:print|echo|display|output|show|write\s+a\s+program\s+to\s+print)\b/i.test(norm) ||
      /\b(?:print|display)\s+(?:["'][^"']+["']|hello|hi|welcome|text|message)\b/i.test(norm)) {
    // Only if not combined with sorting, searching, or complex algorithms
    if (!/sort|search|array|list|matrix|tree|graph|reverse\s+a\s+string/i.test(norm)) {
      return CATEGORIES.PRINT_OUTPUT;
    }
  }

  // String Processing
  if (/string|palindrome|vowel|consonant|anagram|substring|lowercase|uppercase|reverse\s+(?:the\s+)?string/i.test(norm)) {
    return CATEGORIES.STRING_PROCESSING;
  }

  // Conditionals
  if (/even\s+or\s+odd|odd\s+or\s+even|positive\s+or\s+negative|leap\s+year|grade\s+calculator|divisible\s+by|check\s+if/i.test(norm)) {
    return CATEGORIES.CONDITIONALS;
  }

  // Math / Arithmetic
  if (/factorial|prime|fibonacci|gcd|lcm|power|square\s+root|sum\s+of\s+digits|armstrong|calculate/i.test(norm)) {
    return CATEGORIES.MATH;
  }

  // Array / List Processing
  if (/array|list|maximum|minimum|largest|smallest|second\s+largest|sum\s+of\s+array|reverse\s+an?\s+array|elements/i.test(norm)) {
    return CATEGORIES.ARRAY_PROCESSING;
  }

  // Recursion
  if (/recursion|recursive|tower\s+of\s+hanoi/i.test(norm)) {
    return CATEGORIES.RECURSION;
  }

  // Loops
  if (/loop|while|for\s+loop|iterate|multiplication\s+table|countdown|series/i.test(norm)) {
    return CATEGORIES.LOOPS;
  }

  // OOP
  if (/class|object|inheritance|polymorphism|encapsulation|constructor/i.test(norm)) {
    return CATEGORIES.OOP;
  }

  // Data Structures
  if (/stack|queue|linked\s+list|tree|graph|hash\s*map|heap/i.test(norm)) {
    return CATEGORIES.DATA_STRUCTURES;
  }

  // Functions
  if (/function|method|return/i.test(norm)) {
    return CATEGORIES.FUNCTIONS;
  }

  return CATEGORIES.MULTI_CONCEPT;
}

/**
 * Determine forbidden concepts that must NOT be introduced into the problem.
 */
function getForbiddenConcepts(primaryTask) {
  switch (primaryTask) {
    case CATEGORIES.PRINT_OUTPUT:
      return ['sorting', 'array_transformations', 'searching', 'matrix', 'complex_data_structures', 'dynamic_programming'];
    case CATEGORIES.STRING_PROCESSING:
      return ['sorting', 'graph_algorithms', 'tree_traversals', 'matrix_multiplication'];
    case CATEGORIES.CONDITIONALS:
      return ['sorting', 'graph_algorithms', 'dynamic_programming', 'trees'];
    case CATEGORIES.MATH:
      return ['sorting', 'graph_algorithms', 'string_regex_parsing'];
    default:
      return [];
  }
}

/**
 * Determine the input and output requirements based on the analyzed category and prompt.
 */
function getIORequirements(primaryTask, prompt, literalValues) {
  const norm = String(prompt || '').toLowerCase();

  switch (primaryTask) {
    case CATEGORIES.PRINT_OUTPUT: {
      const target = literalValues[0] || (norm.includes('hello') ? 'Hello, World!' : 'hi');
      return {
        inputRequirements: 'No input required.',
        outputRequirements: `Print the exact text: "${target}"`,
        sampleInput: '',
        sampleOutput: target,
      };
    }

    case CATEGORIES.SORTING: {
      const isDesc = /descending/i.test(norm);
      return {
        inputRequirements: 'An array of numbers or space-separated numbers.',
        outputRequirements: `The numbers sorted in ${isDesc ? 'descending' : 'ascending'} order.`,
        sampleInput: '4 2 8 1 5',
        sampleOutput: isDesc ? '8 5 4 2 1' : '1 2 4 5 8',
      };
    }

    case CATEGORIES.STRING_PROCESSING: {
      if (/reverse/i.test(norm)) {
        return {
          inputRequirements: 'A single string.',
          outputRequirements: 'The reversed string.',
          sampleInput: 'hello',
          sampleOutput: 'olleh',
        };
      }
      if (/palindrome/i.test(norm)) {
        return {
          inputRequirements: 'A single string.',
          outputRequirements: '"true" (or "True") if the string is a palindrome, otherwise "false" (or "False").',
          sampleInput: 'racecar',
          sampleOutput: 'true',
        };
      }
      return {
        inputRequirements: 'A string input.',
        outputRequirements: 'The processed string result.',
        sampleInput: 'sample text',
        sampleOutput: 'result',
      };
    }

    case CATEGORIES.CONDITIONALS: {
      if (/even|odd/i.test(norm)) {
        return {
          inputRequirements: 'A single integer.',
          outputRequirements: '"Even" or "Odd" depending on the number.',
          sampleInput: '4',
          sampleOutput: 'Even',
        };
      }
      if (/positive|negative/i.test(norm)) {
        return {
          inputRequirements: 'A single integer or float.',
          outputRequirements: '"Positive", "Negative", or "Zero".',
          sampleInput: '-5',
          sampleOutput: 'Negative',
        };
      }
      return {
        inputRequirements: 'One or more inputs to evaluate.',
        outputRequirements: 'The conditional result.',
        sampleInput: '10',
        sampleOutput: 'Valid',
      };
    }

    case CATEGORIES.ARRAY_PROCESSING: {
      if (/largest|maximum/i.test(norm)) {
        return {
          inputRequirements: 'An array of integers.',
          outputRequirements: 'The maximum value in the array.',
          sampleInput: '1 9 3 7 5',
          sampleOutput: '9',
        };
      }
      if (/smallest|minimum/i.test(norm)) {
        return {
          inputRequirements: 'An array of integers.',
          outputRequirements: 'The minimum value in the array.',
          sampleInput: '4 1 8 0 2',
          sampleOutput: '0',
        };
      }
      return {
        inputRequirements: 'An array of elements.',
        outputRequirements: 'The processed array or computed scalar value.',
        sampleInput: '1 2 3 4 5',
        sampleOutput: '15',
      };
    }

    case CATEGORIES.MATH: {
      if (/factorial/i.test(norm)) {
        return {
          inputRequirements: 'A single non-negative integer n.',
          outputRequirements: 'The factorial of n (n!).',
          sampleInput: '5',
          sampleOutput: '120',
        };
      }
      if (/fibonacci/i.test(norm)) {
        return {
          inputRequirements: 'An integer n.',
          outputRequirements: 'The n-th Fibonacci number.',
          sampleInput: '6',
          sampleOutput: '8',
        };
      }
      if (/prime/i.test(norm)) {
        return {
          inputRequirements: 'An integer n.',
          outputRequirements: '"Prime" or "Not Prime" (or true/false).',
          sampleInput: '7',
          sampleOutput: 'Prime',
        };
      }
      return {
        inputRequirements: 'Numeric input value(s).',
        outputRequirements: 'The mathematical computation result.',
        sampleInput: '5',
        sampleOutput: '25',
      };
    }

    default:
      return {
        inputRequirements: 'Input according to problem description.',
        outputRequirements: 'Expected result formatted as required.',
        sampleInput: '',
        sampleOutput: '',
      };
  }
}

/**
 * Main function: Analyzes the prompt and returns a complete Intent Profile.
 */
function analyzePromptIntent(prompt, difficulty = 'MEDIUM') {
  const cleanPrompt = String(prompt || '').trim();
  const primaryTask = classifyPrimaryTask(cleanPrompt);
  const literalValues = extractLiteralValues(cleanPrompt);
  const forbiddenConcepts = getForbiddenConcepts(primaryTask);
  const io = getIORequirements(primaryTask, cleanPrompt, literalValues);

  return {
    rawPrompt: cleanPrompt,
    difficulty: (difficulty || 'MEDIUM').toUpperCase(),
    primaryProgrammingTask: primaryTask,
    problemIntent: `Solve a coding challenge focused strictly on ${primaryTask.replace(/_/g, ' ').toLowerCase()}: "${cleanPrompt}".`,
    literalValues,
    forbiddenConcepts,
    inputRequirements: io.inputRequirements,
    outputRequirements: io.outputRequirements,
    sampleInput: io.sampleInput,
    sampleOutput: io.sampleOutput,
  };
}

module.exports = {
  CATEGORIES,
  classifyPrimaryTask,
  extractLiteralValues,
  analyzePromptIntent,
};
