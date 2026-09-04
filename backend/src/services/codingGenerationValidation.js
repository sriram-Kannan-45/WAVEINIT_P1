'use strict';
const {runTests}=require('./codeExecutionService');
const failure=message=>Object.assign(new Error(message),{status:502,code:'CODING_VALIDATION_FAILED'});
async function normalizeProblems(rawProblems,langs,prompt,difficulty) {
  const problems=[],titles=new Set();
  for (const p of rawProblems) {
    for (const field of ['title','description','inputFormat','outputFormat','explanation']) if (typeof p?.[field]!=='string' || !p[field].trim()) throw failure(`Missing coding problem ${field}.`);
    if (titles.has(p.title.trim().toLowerCase()) || /\bpart\s+\d+\b/i.test(p.title)) throw failure('Repeated coding problem.');
    titles.add(p.title.trim().toLowerCase());
    if (!Array.isArray(p.testCases) || p.testCases.length<3) throw failure('A coding problem requires at least three meaningful test cases.');
    const testCases=p.testCases.map(tc=>{
      if (tc.input==null || tc.expectedOutput==null || typeof tc.isHidden!=='boolean') throw failure('Invalid coding test case.');
      return {...tc,input:String(tc.input),expectedOutput:String(tc.expectedOutput)};
    });
    if (!testCases.some(t=>t.isHidden) || !testCases.some(t=>!t.isHidden)) throw failure('Both public and hidden test cases are required.');
    if (new Set(testCases.map(t=>t.input)).size!==testCases.length) throw failure('Repeated test input.');
    const languageSolutions={...p.languageSolutions};
    for (const entry of p.languages || []) languageSolutions[entry.language]=entry;
    const languages=[];
    for (const language of langs) {
      const solution=languageSolutions[language];
      if (!solution?.starterCode?.trim() || !solution?.referenceSolution?.trim()) throw failure(`Missing generated code for ${language}.`);
      const results=await runTests(solution.referenceSolution,language,testCases,5,256);
      if (results.length!==testCases.length || results.some(r=>!r.passed || r.error)) throw failure(`The ${language} reference solution did not pass the supplied tests.`);
      languages.push({...solution,language,starterCodeSource:'generated',referenceSolutionSource:'generated',generationStatus:'completed'});
    }
    const marks=p.marks ?? (difficulty==='EASY'?10:difficulty==='HARD'?30:20);
    if (!Number.isInteger(marks) || marks<=0) throw failure('Invalid coding marks.');
    const actualDifficulty=String(p.difficulty || difficulty).toUpperCase();
    if (!['EASY','MEDIUM','HARD'].includes(actualDifficulty) || (difficulty!=='MIXED' && actualDifficulty!==difficulty)) throw failure('Coding difficulty does not match the request.');
    problems.push({...p,difficulty:actualDifficulty,marks,timeLimit:5,memoryLimit:256,languages,languageSolutions,testCases,
      programmingLanguage:langs[0],starterCode:languageSolutions[langs[0]].starterCode,expectedSolution:languageSolutions[langs[0]].referenceSolution,
      validationStatus:'VALIDATED',validationDetail:null});
  }
  return {title:`Coding Assessment: ${problems[0]?.title || prompt}`,languages:langs,problems,allPassed:true};
}
module.exports={normalizeProblems};
