'use strict';
// Public synthetic lesson text; no LMS records or private student data are read.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ai=require('../src/services/aiService');
const section=process.argv.find(s=>s.startsWith('--section='))?.split('=')[1] || 'course';
const notes='Today we studied photosynthesis in plants. Chlorophyll absorbs light energy. Plants use carbon dioxide and water to produce glucose and release oxygen. Light-dependent reactions occur in thylakoid membranes and produce ATP and NADPH. The Calvin cycle occurs in the stroma and uses ATP and NADPH to fix carbon dioxide into sugars. Light intensity, carbon dioxide concentration and temperature can limit the rate of photosynthesis.';
(async()=>{
 let result;
 if(section==='course') {
  result=await ai.generateCourseStructure({prompt:'Create a two-hour introductory biology course with two modules covering today’s lesson. Include clear topic durations.',text:notes});
  assert.equal(result.generationSource,'ai-verified');
 } else if(section==='document') {
  const file=path.resolve(__dirname,'../tmp/restoration-lesson.txt');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,notes);
  try {result=await ai.generateQuizFromFile({filePath:file,originalName:'todays-lesson.txt',fileType:'text/plain',numQuestions:2,difficulty:'EASY',questionType:'MCQ',instructions:'Quiz only on today’s photosynthesis lesson.'});} finally {fs.unlinkSync(file);}
  assert.equal(result.questions.length,2);assert.equal(result.generationSource,'ai-verified');
 } else if(section==='coding') {
  result=await ai.generateCodingProblemsFromPrompt('Generate one beginner Python problem that reads an integer and outputs its square. Include three distinct tests, at least one public and one hidden.',1,'EASY',['python']);
  assert.equal(result.problems.length,1);assert.equal(result.allPassed,true);
 } else throw new Error('Unknown verification section');
 fs.writeFileSync(path.resolve(__dirname,`../../docs/ai-restoration-live-${section}.json`),JSON.stringify({checkedAt:new Date().toISOString(),section,result},null,2));
 console.log(`PASS: live ${section}; no LMS records saved.`);
})().catch(error=>{console.error(JSON.stringify({code:error.code,message:error.code?error.message:'Live verification failed',status:error.status}));process.exitCode=1;});
