jest.mock('axios',()=>({post:jest.fn()}));
jest.mock('groq-sdk',()=>jest.fn());
const axios=require('axios'),Groq=require('groq-sdk');
const generator=require('../src/services/promptQuizGenerator');
// Fixtures exercise transport/orchestration only; runtime generation never imports them.
const fixtures=require('../../docs/speed-distance-time-verification.json').questions;
test('eight accepted questions survive a 42-second rate limit while only the final two resume',async()=>{
 jest.useFakeTimers();
 const oldGemini=process.env.GEMINI_API_KEY,oldGroq=process.env.GROQ_API_KEY;
 process.env.GEMINI_API_KEY='test-only';process.env.GROQ_API_KEY='test-only';
 let limited=false;
 const create=jest.fn(async payload=>{
  const prompt=payload.messages.find(m=>m.role==='user').content;
  let result;
  if(prompt.startsWith('Analyze')) result={valid:true,sourceRelevant:false,topic:'Speed, Distance, and Time',domain:'Mathematics',concepts:['speed','distance','time'],requirements:['calculations'],needsRetrieval:false,retrievalQuery:'',marksPerQuestion:1};
  else if(prompt.startsWith('Generate only')) {
   const slots=JSON.parse(prompt.split('Missing slots: ')[1].split('\nPreviously accepted')[0]);
   if(slots[0].id===8&&!limited){limited=true;throw {status:429,headers:{'retry-after':'42'}};}
   result={questions:slots.map(slot=>({...fixtures[slot.id],slot:slot.id,questionType:'MCQ',difficulty:slot.difficulty,topic:'Motion'}))};
  } else {
   const candidates=JSON.parse(prompt.split('Candidates: ')[1]);
   result={reviews:candidates.map((q,index)=>({index,relevant:true,unique:true,unambiguous:true,explanationCorrect:true,difficultyCorrect:true,sourceSupported:true,correctOption:q.options.indexOf(fixtures.find(f=>f.question===q.question).correctAnswer),correctAnswer:'',reason:''}))};
  }
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]};
 });
 Groq.mockImplementation(()=>({chat:{completions:{create}}}));axios.post.mockRejectedValue({response:{status:429}});
 try {
  const pending=generator.generate('Speed, Distance, and Time',10,'MEDIUM');
  await jest.advanceTimersByTimeAsync(0);
  expect(limited).toBe(true);
  await jest.advanceTimersByTimeAsync(42250);
  const questions=await pending;
  expect(questions).toHaveLength(10);expect(()=>generator.assertVerifiedQuestions(questions)).not.toThrow();
  expect(questions.slice(0,8).map(q=>q.question)).toEqual(fixtures.slice(0,8).map(q=>q.question));
  const generations=create.mock.calls.map(([p])=>p).filter(p=>p.messages[1].content.startsWith('Generate only'));
  expect(generations).toHaveLength(3);
  expect(generations[2]).toBe(generations[1]);
  expect(generations[1].messages[1].content).toContain('Missing slots: [{"id":8');
 } finally {
  jest.useRealTimers();
  if(oldGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGemini;
  if(oldGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldGroq;
 }
});
