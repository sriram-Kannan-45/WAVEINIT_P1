'use strict';
const {runTests}=require('./codeExecutionService');
const failure=message=>Object.assign(new Error(message),{status:502,code:'CODING_VALIDATION_FAILED'});

async function normalizeProblems(rawProblems,langs,prompt,difficulty) {
  const problems=[],titles=new Set();
  const inputList = Array.isArray(rawProblems) ? rawProblems : [];

  for (const p of inputList) {
    try {
      if (!p || typeof p !== 'object') continue;
      for (const field of ['title','description','inputFormat','outputFormat']) {
        if (typeof p?.[field]!=='string' || !p[field].trim()) {
          p[field] = p[field] || `${field} for ${p.title || 'problem'}`;
        }
      }
      if (typeof p.explanation !== 'string' || !p.explanation.trim()) {
        p.explanation = 'Reference solution implements the required algorithmic logic.';
      }

      const cleanTitle = (p.title || '').trim().toLowerCase();
      if (!cleanTitle || titles.has(cleanTitle) || /\bpart\s+\d+\b/i.test(p.title)) continue;
      titles.add(cleanTitle);

      if (!Array.isArray(p.testCases) || p.testCases.length < 2) continue;

      const testCases = p.testCases.map((tc, idx) => {
        const isHidden = typeof tc?.isHidden === 'boolean' ? tc.isHidden : (idx === p.testCases.length - 1);
        return {
          ...tc,
          input: String(tc?.input != null ? tc.input : ''),
          expectedOutput: String(tc?.expectedOutput != null ? tc.expectedOutput : ''),
          isHidden
        };
      });

      // Ensure both visible and hidden test cases exist
      if (!testCases.some(t => t.isHidden) && testCases.length > 1) {
        testCases[testCases.length - 1].isHidden = true;
      }
      if (!testCases.some(t => !t.isHidden) && testCases.length > 0) {
        testCases[0].isHidden = false;
      }

      const languageSolutions = { ...(p.languageSolutions || {}) };
      for (const entry of p.languages || []) {
        if (entry?.language) languageSolutions[entry.language] = entry;
      }

      const languages = [];
      let problemValid = true;

      for (const language of langs) {
        const solution = languageSolutions[language];
        if (!solution?.starterCode?.trim() || !solution?.referenceSolution?.trim()) {
          problemValid = false;
          break;
        }

        const results = await runTests(solution.referenceSolution, language, testCases, 5, 256);

        const allPassed = results.length === testCases.length && results.every(r => r.passed && !r.error);
        if (!allPassed) {
          problemValid = false;
          break;
        }

        languages.push({
          ...solution,
          language,
          starterCodeSource: 'generated',
          referenceSolutionSource: 'generated',
          generationStatus: 'completed'
        });
      }

      if (!problemValid || languages.length === 0) continue;

      const marks = Number.isInteger(p.marks) && p.marks > 0 ? p.marks : (difficulty === 'EASY' ? 10 : difficulty === 'HARD' ? 30 : 20);
      const actualDifficulty = ['EASY', 'MEDIUM', 'HARD'].includes(String(p.difficulty || '').toUpperCase())
        ? String(p.difficulty).toUpperCase()
        : (difficulty === 'MIXED' ? 'MEDIUM' : difficulty);

      problems.push({
        ...p,
        difficulty: actualDifficulty,
        marks,
        timeLimit: 5,
        memoryLimit: 256,
        languages,
        languageSolutions,
        testCases,
        programmingLanguage: langs[0],
        starterCode: languages[0]?.starterCode || '',
        expectedSolution: languages[0]?.referenceSolution || '',
        validationStatus: 'VALIDATED',
        validationDetail: null
      });
    } catch (problemErr) {
      // Individual problem normalization error; continue to next problem
    }
  }

  if (problems.length === 0) {
    throw failure('The generated coding problems did not pass reference solution validation. Please retry.');
  }

  return {
    title: `Coding Assessment: ${problems[0]?.title || prompt}`,
    languages: langs,
    problems,
    allPassed: true
  };
}

module.exports = { normalizeProblems };
