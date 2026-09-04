'use strict';
// Authenticated real API routes + real PostgreSQL, isolated in a rollback.
// --live uses configured AI; default fixtures exercise generation and review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const m = require('../src/models');
const {sequelize} = m;
const prompt = 'Generate a quiz on Speed, Distance, and Time with clear multiple-choice questions covering basic formulas, calculations, and real-life problems';
// Historical questions are test fixtures only; never imported by runtime generation.
const source = require('../../docs/speed-distance-time-verification.json').questions.map(q => ({...q,questionText:q.question,correctOption:q.options.indexOf(q.correctAnswer),correctAnswer:String(q.options.indexOf(q.correctAnswer)),difficulty:'MEDIUM',questionType:'MCQ',topic:'Motion'}));
const live = process.argv.includes('--live');
(async()=>{
  const outer=await sequelize.transaction(), originalQuery=sequelize.query.bind(sequelize), originalTransaction=sequelize.transaction.bind(sequelize);
  const originalPost=axios.post, originalKey=process.env.GEMINI_API_KEY;
  const prompts=[];
  sequelize.query=(sql,options={})=>originalQuery(sql,{...options,transaction:options.transaction||outer});
  sequelize.transaction=(options,callback)=>typeof options==='function'?originalTransaction({transaction:outer},options):originalTransaction({...options,transaction:options?.transaction||outer},callback);
  if(!live){
    process.env.GEMINI_API_KEY='fixture-only';
    axios.post=async(url,payload)=>{
      const text=payload.contents[0].parts[0].text;prompts.push(text);
      let answer;
      if(text.startsWith('Analyze the quiz request')) answer=JSON.stringify({valid:true,sourceRelevant:false,topic:'Speed, Distance, and Time',domain:'Mathematics',concepts:['speed','distance','time'],requirements:['formulas','calculations'],needsRetrieval:false,retrievalQuery:'',marksPerQuestion:1});
      else if(text.startsWith('Independently audit')) {
        const candidates=JSON.parse(text.split('Candidates: ')[1]);
        answer=JSON.stringify({reviews:candidates.map((q,index)=>({index,relevant:true,unique:true,unambiguous:true,explanationCorrect:true,difficultyCorrect:true,sourceSupported:true,correctOption:q.correctOption,correctAnswer:'',reason:''}))});
      } else if(text.startsWith('Generate only')) {
        const slots=JSON.parse(text.split('Missing slots: ')[1].split('\nPreviously accepted')[0]);
        answer=JSON.stringify({questions:slots.map(slot=>({...source[slot.id],correctAnswer:source[slot.id].options[source[slot.id].correctOption],slot:slot.id,difficulty:slot.difficulty}))});
      }
      else if(text.startsWith('Is the proposed reply safe'))answer=JSON.stringify({safe:true});
      else if(text.includes('live quiz assessment'))answer='Identify the quantity being asked for. Check whether every measurement uses compatible units before applying a relationship.';
      else answer='Separate reading the input from deciding what property matters. What observation distinguishes the two possible groups?';
      return {data:{candidates:[{finishReason:'STOP',content:{parts:[{text:answer}]}}]}};
    };
  }
  try{
    let course,trainer;
    for(const row of await m.Course.findAll({attributes:['id','trainerId','trainingProgramId']})){
      const owner=await m.User.findByPk(row.trainerId,{attributes:['id','role']});
      if(owner?.role==='TRAINER'){course=row;trainer=owner;break;}
    }
    const participant=await m.User.findOne({where:{role:'PARTICIPANT'},attributes:['id','role']});
    assert.ok(course&&trainer&&participant,'Trainer course and participant are required');
    const token=user=>jwt.sign({id:Number(user.id),role:user.role,type:'access',jti:crypto.randomUUID()},process.env.JWT_SECRET,{expiresIn:'15m'});
    const trainerToken=token(trainer), participantToken=token(participant);
    const app=express();app.use(express.json());
    app.use('/api/ai-quiz',require('../src/routes/aiQuizRoutes'));
    app.use('/api/coding',require('../src/routes/codingAssessmentRoutes'));
    const generated=await request(app).post('/api/ai-quiz/generate-from-prompt').set('Authorization',`Bearer ${trainerToken}`).send({prompt,courseId:course.id,questionCount:10,difficulty:'Medium'});
    assert.equal(generated.status,201,JSON.stringify(generated.body));
    const quiz=await m.AIQuiz.findByPk(generated.body.quiz.id);
    await quiz.update({aiHelpLimit:-1,aiAssistantEnabled:true});
    const questions=await m.AIQuestion.findAll({where:{quizId:quiz.id},order:[['order','ASC']]});
    assert.equal(questions.length,10);
    assert.ok(!quiz.title.includes('Generate a quiz'));
    for(const q of questions){
      const opts=await m.AIQuestionOption.findAll({where:{questionId:q.id}});
      assert.equal(opts.length,4);assert.equal(opts.filter(o=>o.isCorrect).length,1);
      assert.ok(/speed|distance|time|journey|km\/h|m\/s/i.test(q.questionText));
      assert.ok(!/caching|architecture|runtime|part \d/i.test(q.questionText));
      if(!live){
        const expected=source.find(row=>row.questionText===q.questionText);
        assert.ok(expected);assert.equal(q.options[Number(q.correctAnswer)],expected.options[expected.correctOption]);
      }
    }
    const output={source:generated.body.generationSource,topic:generated.body.topic,questions:questions.map(q=>({question:q.questionText,options:q.options,correctAnswer:q.options[Number(q.correctAnswer)],explanation:q.explanation}))};
    if(live) fs.writeFileSync(path.resolve(__dirname,'../../docs/live-quiz-verification.json'),JSON.stringify(output,null,2));
    console.log(`PASS: 10 relevant, unique questions and 40 choices saved; source=${output.source}`);
    const quizAttempt=await m.QuizAttempt.create({quizId:quiz.id,participantId:participant.id,status:'IN_PROGRESS'});
    const quizSession=crypto.randomUUID();
    await m.AssessmentSession.create({attemptId:quizAttempt.id,quizId:quiz.id,participantId:participant.id,sessionToken:quizSession,assessmentType:'quiz',expiresAt:new Date(Date.now()+900000)});
    // Demonstrate the original history ordering failure without touching schema.
    await assert.rejects(originalTransaction({transaction:outer},t=>m.QuizAiHelp.findAll({order:[['createdAt','ASC']],transaction:t})),e=>e.original?.code==='42703');
    const askQuiz=(questionId,question='Give me a hint without the answer')=>request(app).post(`/api/ai-quiz/participant/${quizAttempt.id}/quiz-ai-assist`).set('Authorization',`Bearer ${participantToken}`).set('X-Assessment-Session',quizSession).send({questionId,question});
    for(const id of [questions[3].id,questions[6].id,questions[3].id]){
      const reply=await askQuiz(id);assert.equal(reply.status,200,JSON.stringify(reply.body));assert.ok(reply.body.response.trim());
      const key=questions.find(q=>q.id===id);assert.ok(!reply.body.response.includes(key.options[Number(key.correctAnswer)]));
    }
    const quizHelps=await m.QuizAiHelp.findAll({where:{attemptId:quizAttempt.id}});assert.equal(quizHelps.length,3);
    assert.equal((await quizAttempt.reload()).aiHelpUsage,3);
    if(!live){const sent=prompts.filter(p=>p.includes('live quiz assessment')&&!p.startsWith('Is the proposed reply safe'));assert.ok(sent[0].includes(questions[3].questionText));assert.ok(sent[1].includes(questions[6].questionText));assert.ok(!sent[1].includes(questions[3].questionText));}
    console.log('PASS: Quiz mentor current-question context, history query, three saved replies, no answer reveal');
    const assessment=await m.CodingAssessment.create({trainerId:trainer.id,courseId:course.id,title:'Rollback mentor verification',aiAssistantEnabled:true});
    const problem=await m.CodingProblem.create({assessmentId:assessment.id,title:'Odd or even',description:'Read an integer and determine whether it is odd or even.',inputFormat:'One integer',outputFormat:'A classification',programmingLanguage:'python',expectedSolution:'SECRET_REFERENCE_NOT_FOR_MODEL'});
    const codingAttempt=await m.CodingAttempt.create({assessmentId:assessment.id,participantId:participant.id,status:'IN_PROGRESS'});
    const codingSession=crypto.randomUUID();
    await m.AssessmentSession.create({codingAttemptId:codingAttempt.id,assessmentId:assessment.id,participantId:participant.id,sessionToken:codingSession,assessmentType:'coding',expiresAt:new Date(Date.now()+900000)});
    const askCoding=question=>request(app).post('/api/coding/participant/assist').set('Authorization',`Bearer ${participantToken}`).set('X-Assessment-Session',codingSession).send({attemptId:codingAttempt.id,problemId:problem.id,question,language:'python',code:'n = input()',errorContext:'TypeError: unsupported operand type'});
    for(const question of ['Explain this problem','Help me understand my error','Give me the full code']){
      const reply=await askCoding(question);assert.equal(reply.status,200,JSON.stringify(reply.body));assert.ok(reply.body.response.length>30);assert.ok(!/SECRET_REFERENCE|print\(|return\s+['"]/.test(reply.body.response));
    }
    assert.equal(await m.CodingAiHelp.count({where:{attemptId:codingAttempt.id}}),3);
    if(!live){const sent=prompts.filter(p=>p.includes('live coding assessment'));assert.ok(sent.every(p=>p.includes('Odd or even')&&p.includes('n = input()')&&p.includes('TypeError')));assert.ok(sent.every(p=>!p.includes('SECRET_REFERENCE')));}
    console.log('PASS: Coding mentor context, submitted code and error, three saved replies, no reference solution sent');
    for(const [model,ask,attempt,field] of [[m.QuizAiHelp,()=>askQuiz(questions[3].id),quizAttempt,'aiHelpUsage'],[m.CodingAiHelp,()=>askCoding('Hint please'),codingAttempt,'aiHelpUsage']]){
      const before=JSON.stringify((await attempt.reload())[field]),create=model.create;
      model.create=async()=>{throw new Error('Injected persistence failure')};
      try{assert.equal((await ask()).status,500);}finally{model.create=create;}
      assert.equal(JSON.stringify((await attempt.reload())[field]),before);
      assert.equal((await ask()).status,200);
    }
    console.log('PASS: both mentor save failures roll back usage and subsequent retries succeed');
  }finally{
    axios.post=originalPost;if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;
    sequelize.query=originalQuery;sequelize.transaction=originalTransaction;await outer.rollback();await sequelize.close();
    console.log('Rolled back all verification quizzes, attempts, questions, and exchanges.');
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
