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
        sampleInput: 'sample',
        sampleOutput: 'elpmas',
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

const WORD_TO_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Extracts requested problem count from user's free-text prompt.
 * If not specified, returns 1 by default. Sane cap is 10.
 */
function extractRequestedProblemCount(prompt) {
  const p = String(prompt || '').toLowerCase().trim();

  // 1. "3 problems", "5 coding questions", "2 easy challenges", "4 tasks"
  const countMatch = p.match(/\b(\d+)\s*(?:(?:easy|medium|hard|simple|basic|coding|programming|algorithm|new)\s+)*(?:problems?|questions?|tasks?|challenges?|exercises?|programs?)\b/i);
  if (countMatch && countMatch[1]) {
    const num = parseInt(countMatch[1], 10);
    if (!isNaN(num) && num > 0) return Math.min(num, 10);
  }

  // 2. "three problems", "four coding tasks", "two easy questions", etc.
  const wordMatch = p.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:easy|medium|hard|simple|basic|coding|programming|algorithm|new)\s+)*(?:problems?|questions?|tasks?|challenges?|exercises?|programs?)\b/i);
  if (wordMatch && wordMatch[1] && WORD_TO_NUM[wordMatch[1]]) {
    return WORD_TO_NUM[wordMatch[1]];
  }

  // 3. "generate 3 on ...", "create 2 on ...", "give me 4 ..."
  const genMatch = p.match(/\b(?:generate|create|write|make|give\s+me)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (genMatch && genMatch[1]) {
    const val = genMatch[1].toLowerCase();
    if (WORD_TO_NUM[val]) return WORD_TO_NUM[val];
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) return Math.min(num, 10);
  }

  return 1;
}

const SUBTOPIC_BANK = {
  SORTING: [
    {
      subtopic: 'Sort Array in Ascending Order',
      angle: 'Ascending order array sort',
      description: 'Sort an integer array in non-decreasing (ascending) order.',
      testCases: [
        { input: '4 2 8 1 5', expectedOutput: '1 2 4 5 8', isHidden: false, description: 'Basic array sort' },
        { input: '10', expectedOutput: '10', isHidden: false, description: 'Single element' },
        { input: '-3 0 -5 2 1', expectedOutput: '-5 -3 0 1 2', isHidden: true, description: 'Negative numbers' },
        { input: '5 5 2 2 8 8', expectedOutput: '2 2 5 5 8 8', isHidden: true, description: 'Duplicate values' }
      ]
    },
    {
      subtopic: 'Sort Array in Descending Order',
      angle: 'Descending order array sort',
      description: 'Sort an integer array in non-increasing (descending) order.',
      testCases: [
        { input: '3 1 4 1 5 9', expectedOutput: '9 5 4 3 1 1', isHidden: false, description: 'Descending sort' },
        { input: '7', expectedOutput: '7', isHidden: false, description: 'Single element' },
        { input: '-2 -8 4 0 1', expectedOutput: '4 1 0 -2 -8', isHidden: true, description: 'Mixed signs' }
      ]
    },
    {
      subtopic: 'Sort Array and Remove Duplicate Values',
      angle: 'Ascending sort with duplicate elimination',
      description: 'Sort an array in ascending order and eliminate duplicate elements.',
      testCases: [
        { input: '4 2 2 8 4 1 5', expectedOutput: '1 2 4 5 8', isHidden: false, description: 'Sort unique' },
        { input: '3 3 3 3', expectedOutput: '3', isHidden: false, description: 'All identical' },
        { input: '9 1 9 2 8 2', expectedOutput: '1 2 8 9', isHidden: true, description: 'Multiple duplicates' }
      ]
    },
    {
      subtopic: 'Sort Array by Absolute Magnitude',
      angle: 'Sorting by absolute values',
      description: 'Sort an array in ascending order based on the absolute value of each number.',
      testCases: [
        { input: '-10 2 -3 1', expectedOutput: '1 2 -3 -10', isHidden: false, description: 'Absolute magnitude sort' },
        { input: '-5 5 -1 1 0', expectedOutput: '0 -1 1 -5 5', isHidden: true, description: 'Ties in absolute values' }
      ]
    },
    {
      subtopic: 'Sort Even Numbers First Then Odd Numbers',
      angle: 'Parity-based custom sort',
      description: 'Sort an array such that all even numbers come first in ascending order, followed by odd numbers in ascending order.',
      testCases: [
        { input: '5 3 2 8 1 4', expectedOutput: '2 4 8 1 3 5', isHidden: false, description: 'Even before odd' },
        { input: '1 3 5 7', expectedOutput: '1 3 5 7', isHidden: true, description: 'Only odd numbers' },
        { input: '6 2 4 8', expectedOutput: '2 4 6 8', isHidden: true, description: 'Only even numbers' }
      ]
    },
    {
      subtopic: 'Sort Array of Strings Alphabetically',
      angle: 'Lexicographical string sorting',
      description: 'Sort an array of space-separated strings in alphabetical order.',
      testCases: [
        { input: 'banana apple cherry date', expectedOutput: 'apple banana cherry date', isHidden: false, description: 'Alphabetical sort' },
        { input: 'zebra monkey elephant', expectedOutput: 'elephant monkey zebra', isHidden: true, description: 'Animals sort' }
      ]
    }
  ],
  SEARCHING: [
    {
      subtopic: 'Find Element Index in Array',
      angle: 'Linear/Binary search for target element index',
      description: 'Given an array of integers and a target value on the first line, return the 0-based index of the target or -1 if not found.',
      testCases: [
        { input: '5\n10 20 30 40 50\n30', expectedOutput: '2', isHidden: false, description: 'Element present' },
        { input: '4\n1 3 5 7\n9', expectedOutput: '-1', isHidden: false, description: 'Element absent' },
        { input: '3\n-5 0 5\n-5', expectedOutput: '0', isHidden: true, description: 'First element' }
      ]
    },
    {
      subtopic: 'Binary Search in Sorted Array',
      angle: 'Binary search algorithm',
      description: 'Implement binary search to find target value in a sorted array and return its index or -1.',
      testCases: [
        { input: '5\n1 3 5 7 9\n7', expectedOutput: '3', isHidden: false, description: 'Binary search hit' },
        { input: '4\n2 4 6 8\n5', expectedOutput: '-1', isHidden: false, description: 'Binary search miss' },
        { input: '5\n10 20 30 40 50\n50', expectedOutput: '4', isHidden: true, description: 'Last element' }
      ]
    },
    {
      subtopic: 'Count Occurrences of Target Element',
      angle: 'Frequency counting of target search key',
      description: 'Count how many times a target integer appears in an array.',
      testCases: [
        { input: '6\n1 2 2 3 2 4\n2', expectedOutput: '3', isHidden: false, description: 'Multiple occurrences' },
        { input: '4\n5 6 7 8\n9', expectedOutput: '0', isHidden: false, description: 'Zero occurrences' }
      ]
    },
    {
      subtopic: 'Find First and Last Position of Target in Sorted Array',
      angle: 'First and last index boundary search',
      description: 'Find the starting and ending index of a given target value in a sorted array as two space-separated integers, or -1 -1 if not found.',
      testCases: [
        { input: '6\n5 7 7 8 8 10\n8', expectedOutput: '3 4', isHidden: false, description: 'Range found' },
        { input: '6\n5 7 7 8 8 10\n6', expectedOutput: '-1 -1', isHidden: true, description: 'Range missing' }
      ]
    },
    {
      subtopic: 'Find Peak Element in Array',
      angle: 'Peak element detection',
      description: 'Find an element in an array that is greater than or equal to its neighbors and return its value.',
      testCases: [
        { input: '4\n1 2 3 1', expectedOutput: '3', isHidden: false, description: 'Single peak' },
        { input: '5\n1 2 1 3 5', expectedOutput: '2', isHidden: true, description: 'First peak' }
      ]
    }
  ],
  STRING_PROCESSING: [
    {
      subtopic: 'Reverse a String',
      angle: 'String reversal',
      description: 'Read a string and print its reverse.',
      testCases: [
        { input: 'hello', expectedOutput: 'olleh', isHidden: false, description: 'Reverse hello' },
        { input: 'RaceCar', expectedOutput: 'raCecaR', isHidden: true, description: 'Case preserved' }
      ]
    },
    {
      subtopic: 'Check Palindrome String',
      angle: 'Palindrome verification',
      description: 'Determine if a given string reads the same backwards and forwards (case-insensitive). Return true or false.',
      testCases: [
        { input: 'radar', expectedOutput: 'true', isHidden: false, description: 'Palindrome word' },
        { input: 'hello', expectedOutput: 'false', isHidden: false, description: 'Non-palindrome' },
        { input: 'Racecar', expectedOutput: 'true', isHidden: true, description: 'Mixed case palindrome' }
      ]
    },
    {
      subtopic: 'Count Vowels and Consonants in String',
      angle: 'Vowel and consonant tally',
      description: 'Count the total number of vowels and consonants in a given string and output them formatted as "Vowels: X, Consonants: Y".',
      testCases: [
        { input: 'hello world', expectedOutput: 'Vowels: 3, Consonants: 7', isHidden: false, description: 'Two words' },
        { input: 'aeiou', expectedOutput: 'Vowels: 5, Consonants: 0', isHidden: true, description: 'All vowels' }
      ]
    },
    {
      subtopic: 'Check Anagram of Two Strings',
      angle: 'Anagram detection',
      description: 'Given two strings separated by a newline, return true if they are anagrams of each other, otherwise false.',
      testCases: [
        { input: 'listen\nsilent', expectedOutput: 'true', isHidden: false, description: 'Valid anagram' },
        { input: 'hello\nworld', expectedOutput: 'false', isHidden: false, description: 'Invalid anagram' }
      ]
    },
    {
      subtopic: 'Capitalize First Letter of Each Word',
      angle: 'Title casing string transformation',
      description: 'Transform a string by capitalizing the first letter of each word.',
      testCases: [
        { input: 'welcome to wave init lms', expectedOutput: 'Welcome To Wave Init Lms', isHidden: false, description: 'Sentence title case' }
      ]
    }
  ],
  CONDITIONALS: [
    {
      subtopic: 'Check Even or Odd Integer',
      angle: 'Parity check',
      description: 'Given an integer, print "Even" if it is even, or "Odd" if it is odd.',
      testCases: [
        { input: '4', expectedOutput: 'Even', isHidden: false, description: 'Even number' },
        { input: '7', expectedOutput: 'Odd', isHidden: false, description: 'Odd number' },
        { input: '0', expectedOutput: 'Even', isHidden: true, description: 'Zero is even' },
        { input: '-3', expectedOutput: 'Odd', isHidden: true, description: 'Negative odd' }
      ]
    },
    {
      subtopic: 'Check Positive, Negative, or Zero',
      angle: 'Sign classification',
      description: 'Given a number, print "Positive", "Negative", or "Zero".',
      testCases: [
        { input: '15', expectedOutput: 'Positive', isHidden: false, description: 'Positive' },
        { input: '-8', expectedOutput: 'Negative', isHidden: false, description: 'Negative' },
        { input: '0', expectedOutput: 'Zero', isHidden: true, description: 'Zero' }
      ]
    },
    {
      subtopic: 'Find Maximum of Three Numbers',
      angle: 'Ternary comparison',
      description: 'Given three space-separated integers, output the maximum value.',
      testCases: [
        { input: '10 45 23', expectedOutput: '45', isHidden: false, description: 'Max in middle' },
        { input: '-5 -2 -9', expectedOutput: '-2', isHidden: true, description: 'All negative' }
      ]
    },
    {
      subtopic: 'Leap Year Validator',
      angle: 'Calendar conditional check',
      description: 'Determine if a given year is a leap year. Output "Leap Year" or "Not Leap Year".',
      testCases: [
        { input: '2024', expectedOutput: 'Leap Year', isHidden: false, description: 'Divisible by 4' },
        { input: '1900', expectedOutput: 'Not Leap Year', isHidden: true, description: 'Centurial exception' },
        { input: '2000', expectedOutput: 'Leap Year', isHidden: true, description: '400-year exception' }
      ]
    }
  ],
  MATH: [
    {
      subtopic: 'Calculate Factorial of Number',
      angle: 'Factorial computation',
      description: 'Given a non-negative integer n, calculate and output n!.',
      testCases: [
        { input: '5', expectedOutput: '120', isHidden: false, description: 'Factorial of 5' },
        { input: '0', expectedOutput: '1', isHidden: false, description: 'Factorial of 0' },
        { input: '1', expectedOutput: '1', isHidden: true, description: 'Factorial of 1' },
        { input: '7', expectedOutput: '5040', isHidden: true, description: 'Factorial of 7' }
      ]
    },
    {
      subtopic: 'Find N-th Fibonacci Number',
      angle: 'Fibonacci sequence',
      description: 'Compute the n-th Fibonacci number where F(0) = 0, F(1) = 1.',
      testCases: [
        { input: '6', expectedOutput: '8', isHidden: false, description: 'F(6)' },
        { input: '0', expectedOutput: '0', isHidden: true, description: 'F(0)' },
        { input: '10', expectedOutput: '55', isHidden: true, description: 'F(10)' }
      ]
    },
    {
      subtopic: 'Check Prime Number',
      angle: 'Primality test',
      description: 'Given an integer n > 1, print "Prime" if it is a prime number, otherwise "Not Prime".',
      testCases: [
        { input: '7', expectedOutput: 'Prime', isHidden: false, description: '7 is prime' },
        { input: '12', expectedOutput: 'Not Prime', isHidden: false, description: '12 is composite' },
        { input: '2', expectedOutput: 'Prime', isHidden: true, description: '2 is smallest prime' }
      ]
    },
    {
      subtopic: 'Calculate Sum of Digits',
      angle: 'Digit extraction and sum',
      description: 'Given a positive integer, compute the sum of its digits.',
      testCases: [
        { input: '12345', expectedOutput: '15', isHidden: false, description: 'Sum 1..5' },
        { input: '9001', expectedOutput: '10', isHidden: true, description: 'Zeros handled' }
      ]
    },
    {
      subtopic: 'Greatest Common Divisor (GCD)',
      angle: 'Euclidean GCD',
      description: 'Given two positive integers separated by space, calculate their greatest common divisor (GCD).',
      testCases: [
        { input: '48 18', expectedOutput: '6', isHidden: false, description: 'GCD of 48 and 18' },
        { input: '101 103', expectedOutput: '1', isHidden: true, description: 'Coprime integers' }
      ]
    }
  ],
  ARRAY_PROCESSING: [
    {
      subtopic: 'Find Maximum and Minimum in Array',
      angle: 'Min-max finding',
      description: 'Find the minimum and maximum numbers in an array and output them as "Min: X, Max: Y".',
      testCases: [
        { input: '3 9 1 7 5', expectedOutput: 'Min: 1, Max: 9', isHidden: false, description: 'Standard array' },
        { input: '-4 -10 -2', expectedOutput: 'Min: -10, Max: -2', isHidden: true, description: 'Negative numbers' }
      ]
    },
    {
      subtopic: 'Calculate Sum and Average of Array Elements',
      angle: 'Sum and mean calculation',
      description: 'Calculate the sum of all elements in an integer array.',
      testCases: [
        { input: '1 2 3 4 5', expectedOutput: '15', isHidden: false, description: 'Sum 1..5' },
        { input: '-10 20 -5 15', expectedOutput: '20', isHidden: true, description: 'Mixed sign sum' }
      ]
    },
    {
      subtopic: 'Rotate Array to the Right by K Steps',
      angle: 'Array cyclic rotation',
      description: 'Given an array on line 1 and integer k on line 2, rotate the array to the right by k steps.',
      testCases: [
        { input: '1 2 3 4 5\n2', expectedOutput: '4 5 1 2 3', isHidden: false, description: 'Rotate by 2' },
        { input: '10 20 30\n3', expectedOutput: '10 20 30', isHidden: true, description: 'Rotate by length' }
      ]
    },
    {
      subtopic: 'Find Second Largest Number in Array',
      angle: 'Second order statistic',
      description: 'Find the second largest unique value in an integer array.',
      testCases: [
        { input: '12 35 1 10 34 1', expectedOutput: '34', isHidden: false, description: 'Second largest' },
        { input: '10 10 9', expectedOutput: '9', isHidden: true, description: 'Duplicate maximum' }
      ]
    }
  ],
  PRINT_OUTPUT: [
    {
      subtopic: 'Print Exact Message Output',
      angle: 'Exact string literal output',
      description: 'Write a program that outputs the exact required text to standard output.',
      testCases: [
        { input: '', expectedOutput: 'Hello, World!', isHidden: false, description: 'Standard greeting' },
        { input: '\n', expectedOutput: 'Hello, World!', isHidden: true, description: 'Whitespace check' }
      ]
    }
  ]
};

/**
 * Picks N canonical subtopics from the category subtopic bank.
 */
function pickSubtopics(category, count = 1, rawPrompt = '', literalValues = []) {
  const n = Math.max(1, Math.min(count, 10));
  
  if (category === CATEGORIES.PRINT_OUTPUT) {
    const targetText = (literalValues && literalValues[0]) ||
      (/\bprint\s+([A-Za-z0-9_!?,.\s]+)/i.exec(rawPrompt)?.[1]?.trim()) ||
      'Hello, World!';
    return [{
      subtopic: `Print "${targetText}"`,
      angle: `Exact output of "${targetText}"`,
      description: `Write a program that prints the exact text "${targetText}" to stdout.`,
      targetText,
      testCases: [
        { input: '', expectedOutput: targetText, isHidden: false, description: `Print exact text: ${targetText}` },
        { input: '\n', expectedOutput: targetText, isHidden: true, description: 'Whitespace check' }
      ]
    }];
  }

  const bank = SUBTOPIC_BANK[category] || [
    {
      subtopic: `Core Problem on ${rawPrompt}`,
      angle: `Direct implementation of ${rawPrompt}`,
      description: `Implement a program solving ${rawPrompt}.`,
      testCases: [{ input: '1 2 3', expectedOutput: '6', isHidden: false, description: 'Sample' }]
    }
  ];

  const picked = [];
  for (let i = 0; i < n; i++) {
    const base = bank[i % bank.length];
    if (i < bank.length) {
      picked.push({ ...base });
    } else {
      // Add modifier variation for count > bank size
      const cycle = Math.floor(i / bank.length) + 1;
      picked.push({
        ...base,
        subtopic: `${base.subtopic} (Variation ${cycle})`,
        angle: `${base.angle} with extended edge cases`,
        description: `${base.description} (handling large bounds and edge cases)`,
      });
    }
  }

  return picked;
}

/**
 * Main function: Analyzes the prompt and returns a complete Intent Profile.
 */
function analyzePromptIntent(prompt, difficulty = 'MEDIUM', explicitCount = null) {
  const cleanPrompt = String(prompt || '').trim();
  const primaryTask = classifyPrimaryTask(cleanPrompt);
  const literalValues = extractLiteralValues(cleanPrompt);
  const forbiddenConcepts = getForbiddenConcepts(primaryTask);
  const io = getIORequirements(primaryTask, cleanPrompt, literalValues);

  const requestedCount = explicitCount && parseInt(explicitCount, 10) > 0
    ? Math.min(Math.max(1, parseInt(explicitCount, 10)), 10)
    : extractRequestedProblemCount(cleanPrompt);

  const subtopics = pickSubtopics(primaryTask, requestedCount, cleanPrompt, literalValues);

  return {
    rawPrompt: cleanPrompt,
    requestedCount,
    difficulty: (difficulty || 'MEDIUM').toUpperCase(),
    primaryProgrammingTask: primaryTask,
    problemIntent: `Solve a coding challenge focused strictly on ${primaryTask.replace(/_/g, ' ').toLowerCase()}: "${cleanPrompt}".`,
    literalValues,
    forbiddenConcepts,
    inputRequirements: io.inputRequirements,
    outputRequirements: io.outputRequirements,
    sampleInput: io.sampleInput,
    sampleOutput: io.sampleOutput,
    subtopics,
  };
}

module.exports = {
  CATEGORIES,
  SUBTOPIC_BANK,
  pickSubtopics,
  classifyPrimaryTask,
  extractLiteralValues,
  extractRequestedProblemCount,
  analyzePromptIntent,
};

