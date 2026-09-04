'use strict';
// Full authenticated quiz route + live AI + real persistence, all rolled back.
// An isolated empty course prevents private course material reaching the test prompt.
const assert=require('node:assert/strict');
const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=require('../src/models'),{sequelize}=m;
// Capture only reviews of this script's public test content, never credentials.
const provider=require('../src/services/aiProvider'),liveGenerate=provider.generateContent;
provider.generateContent=async options=>{
 const response=await liveGenerate(options);
 if(options.prompt.startsWith('Independently audit')) {
  const text=response.data.candidates[0].content.parts.filter(p=>!p.thought).map(p=>p.text||'').join('');
  const review=JSON.parse(text);
  console.log('Review results:',JSON.stringify(review.reviews.map(r=>({index:r.index,reason:r.reason,correctOption:r.correctOption,relevant:r.relevant,unique:r.unique,unambiguous:r.unambiguous,explanationCorrect:r.explanationCorrect,difficultyCorrect:r.difficultyCorrect}))));
 }
 return response;
};
(async()=>{
 const outer=await sequelize.transaction(),query=sequelize.query.bind(sequelize),transaction=sequelize.transaction.bind(sequelize);
 sequelize.query=(sql,options={})=>query(sql,{...options,transaction:options.transaction||outer});
 sequelize.transaction=(options,callback)=>typeof options==='function'?transaction({transaction:outer},options):transaction({...options,transaction:options?.transaction||outer},callback);
 try {
  let owner,base;
  for(const row of await m.Course.findAll({attributes:['id','trainerId','trainingProgramId']})) {
   const user=await m.User.findByPk(row.trainerId,{attributes:['id','role']});
   if(user?.role==='TRAINER'){owner=user;base=row;break;}
  }
  assert.ok(owner&&base,'A trainer course is required for route verification');
  const course=await m.Course.create({trainerId:owner.id,trainingProgramId:base.trainingProgramId,title:'Quiz rate-limit verification (rolled back)'});
  const token=jwt.sign({id:Number(owner.id),role:'TRAINER',type:'access',jti:crypto.randomUUID()},process.env.JWT_SECRET,{expiresIn:'15m'});
  const app=express();app.use(express.json());app.use('/api/ai-quiz',require('../src/routes/aiQuizRoutes'));
  const start=Date.now();
  const response=await request(app).post('/api/ai-quiz/generate-from-prompt').set('Authorization',`Bearer ${token}`).send({courseId:course.id,questionCount:10,difficulty:'MEDIUM',prompt:'Generate a multiple-choice quiz strictly based on Speed, Distance, and Time, covering formulas, calculations, and real-life problems.'});
  assert.equal(response.status,201,JSON.stringify(response.body));
  const questions=await m.AIQuestion.findAll({where:{quizId:response.body.quiz.id},order:[['order','ASC']]});
  assert.equal(questions.length,10);
  for(const question of questions) {
   const options=await m.AIQuestionOption.findAll({where:{questionId:question.id}});
   assert.equal(options.length,4);assert.equal(options.filter(o=>o.isCorrect).length,1);
  }
  const report={checkedAt:new Date().toISOString(),status:response.status,count:questions.length,elapsedMs:Date.now()-start,topic:response.body.topic,generationSource:response.body.generationSource,questions:questions.map(q=>({question:q.questionText,options:q.options,correctAnswer:q.correctAnswer,explanation:q.explanation}))};
  fs.writeFileSync(path.resolve(__dirname,'../../docs/quiz-rate-limit-live-verification.json'),JSON.stringify(report,null,2));
  console.log(`PASS: HTTP 201; 10 live validated questions and 40 options persisted in ${report.elapsedMs}ms.`);
 } finally {
  sequelize.query=query;sequelize.transaction=transaction;await outer.rollback();await sequelize.close();
  console.log('Rolled back the test course, quiz, questions and options.');
 }
})().catch(error=>{console.error(error.code==='AI_PROVIDERS_UNAVAILABLE'?error.message:'Quiz route verification failed: '+error.message);process.exitCode=1;});
