jest.mock('../src/services/interviewNotificationService', () => ({notifyCreated:jest.fn(),scheduleReminder:jest.fn()}));
jest.mock('../src/services/notificationService', () => ({createNotification:jest.fn(),CATEGORIES:{ACADEMIC:'ACADEMIC'}}));
const models = require('../src/models');
const {sequelize} = require('../src/config/db');
const interview = require('../src/controllers/interviewController');
const hiring = require('../src/controllers/hiringController');
const hiringService = require('../src/services/hiringService');
const lifecycle = require('../src/services/interviewLifecycleService');
const quizRoutes = require('../src/routes/quizzesRoutes');
const coding = require('../src/controllers/codingAssessmentController');
const reports = require('../src/controllers/reportController');
const response = () => ({statusCode:200,status(code){this.statusCode=code;return this},json:jest.fn(),setHeader:jest.fn(),send:jest.fn()});
const request = body => ({body,params:{id:1},query:{},user:{id:99,role:'ADMIN'},get:()=> 'localhost',app:{get:()=>null},protocol:'http'});
const row = data => ({...data, update:jest.fn(async function(patch){Object.assign(this,patch);return this}),toJSON(){return {...this}}});
afterEach(()=>jest.restoreAllMocks());

function scheduleMocks() {
  jest.spyOn(models.User,'findOne').mockImplementation(async({where})=>row({id:where.id,role:Number(where.id)===90?'TRAINER':'PARTICIPANT',status:'APPROVED'}));
  jest.spyOn(models.User,'count').mockImplementation(async({where})=>where.id[require('sequelize').Op.in].length);
  jest.spyOn(models.InterviewParticipant,'findAll').mockResolvedValue([]);
  jest.spyOn(models.InterviewParticipant,'bulkCreate').mockResolvedValue([]);
  jest.spyOn(models.Interview,'findAll').mockResolvedValue([]);
  jest.spyOn(models.Interview,'create').mockImplementation(async data=>row({id:501,...data}));
  jest.spyOn(sequelize,'transaction').mockImplementation(async cb=>cb({}));
}
const sessionBody=(context='HIRE',candidateIds=[1,2,3,4,5,6])=>({context,mode:'GROUP_DISCUSSION',candidateIds,interviewerId:90,scheduledAt:'2027-01-10T10:00:00Z',durationMinutes:30,meetingType:'IN_PLATFORM'});

test.each([[1,2,3,4,5],[1,2,3,4,5,6,7],[1,2,3,4,5,5],[1,2,3,4,5,6,6]])('Hire GD rejects invalid roster %j without creating a session',async(...ids)=>{
  scheduleMocks(); const res=response();
  await interview.createInterview(request(sessionBody('HIRE',ids)),res);
  expect(res.statusCode).toBe(400);expect(models.Interview.create).not.toHaveBeenCalled();
});
test('Hire GD persists six distinct candidates and one trainer in the existing interview tables',async()=>{
  scheduleMocks(); const res=response();await interview.createInterview(request(sessionBody()),res);
  expect(res.statusCode).toBe(201);
  expect(models.Interview.create).toHaveBeenCalledWith(expect.objectContaining({context:'HIRE',mode:'GROUP_DISCUSSION',interviewer_id:90}),expect.anything());
  expect(models.InterviewParticipant.bulkCreate.mock.calls[0][0]).toHaveLength(6);
});
test('ordinary GD still accepts two candidates and normal interviews still accept one',async()=>{
  scheduleMocks();
  for(const body of [sessionBody('TRAINING',[1,2]),{...sessionBody('TRAINING'),mode:'INTERVIEW',candidateId:1}]){
    const res=response();await interview.createInterview(request(body),res);expect(res.statusCode).toBe(201);
  }
});
test('Hire GD rejects multiple moderators and a non-trainer moderator',async()=>{
  scheduleMocks();
  for(const interviewerId of [[90,91],2]){
    const res=response();await interview.createInterview(request({...sessionBody(),interviewerId}),res);expect(res.statusCode).toBe(400);
  }
});
test('participant detail hides other candidate evaluations and unpublished own feedback',async()=>{
  const session=row({id:1,mode:'GROUP_DISCUSSION',interviewer_id:90,created_by:99,context:'HIRE',participants:[{user_id:1,evaluation:{isPublished:false,scores:{secret:2}}},{user_id:2,evaluation:{isPublished:true,scores:{secret:5}}}]});
  jest.spyOn(models.Interview,'findByPk').mockResolvedValue(session);
  jest.spyOn(models.InterviewParticipant,'findOne').mockResolvedValue({user_id:1});
  const res=response();await interview.getInterview({...request({}),user:{id:1,role:'PARTICIPANT'}},res);
  expect(res.statusCode).toBe(200);
  expect(res.json.mock.calls[0][0].interview.participants.every(p=>!p.evaluation)).toBe(true);
});
test('unassigned trainer cannot retrieve a Hire interview',async()=>{
  jest.spyOn(models.Interview,'findByPk').mockResolvedValue(row({id:1,context:'HIRE',mode:'GROUP_DISCUSSION',interviewer_id:90,created_by:99}));
  jest.spyOn(models.InterviewParticipant,'findOne').mockResolvedValue(null);
  const res=response();await interview.getInterview({...request({}),user:{id:80,role:'TRAINER'}},res);expect(res.statusCode).toBe(403);
});
test('all six GD evaluations unlock EVALUATED and remain editable for publication afterward',async()=>{
  const session=row({id:1,context:'HIRE',mode:'GROUP_DISCUSSION',status:'COMPLETED',interviewer_id:90,created_by:99,evaluation_criteria:lifecycle.normalizeCriteria([{name:'Communication',maxScore:10,weight:1}])});
  const members=[1,2,3,4,5,6].map(user_id=>row({user_id}));
  jest.spyOn(models.Interview,'findByPk').mockResolvedValue(session);
  jest.spyOn(models.InterviewParticipant,'findOne').mockImplementation(async({where})=>members.find(p=>p.user_id===where.user_id));
  jest.spyOn(models.InterviewParticipant,'findAll').mockResolvedValue(members);
  for(const p of members)await lifecycle.saveEvaluation(1,p.user_id,{id:90,role:'TRAINER'},{scores:{criterion_1:8},decision:'ON_HOLD',isPublished:false});
  expect(session.status).toBe('EVALUATED');
  await lifecycle.saveEvaluation(1,1,{id:90,role:'TRAINER'},{scores:{criterion_1:9},decision:'SELECTED',isPublished:true});
  expect(members[0].evaluation.isPublished).toBe(true);expect(members[1].evaluation.isPublished).toBe(false);
});
test.each(['QUIZ','CODING'])('Hire %s publishing invokes the canonical handler',async type=>{
  jest.spyOn(models.HiringAssessment,'findByPk').mockResolvedValue({id:1,assessment_type:type,quiz_id:11,coding_assessment_id:22});
  const handler=jest.spyOn(type==='QUIZ'?quizRoutes:coding,type==='QUIZ'?'publishQuiz':'publish').mockImplementation(async(req,res)=>res.status(422).json({error:'Canonical validation failed'}));
  const res=response();await hiring.publishAssessment(request({}),res);
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({id:type==='QUIZ'?11:22})}),res);
  expect(res.statusCode).toBe(422);
});
test('publishing a Hire quiz does not attach it to an unrelated training',async()=>{
  const quiz=row({id:11,context:'HIRE',status:'DRAFT',trainerId:99});
  jest.spyOn(models.AIQuiz,'findByPk').mockResolvedValue(quiz);
  jest.spyOn(models.AIQuestion,'findAll').mockResolvedValue([{marks:2}]);
  jest.spyOn(models.QuizAssignment,'findAll').mockResolvedValue([]);
  jest.spyOn(models.Training,'findOne').mockResolvedValue({id:123});
  const res=response();await quizRoutes.publishQuiz({...request({}),params:{id:11}},res);
  expect(res.statusCode).toBe(200);expect(quiz.status).toBe('PUBLISHED');
  expect(models.Training.findOne).not.toHaveBeenCalled();expect(quiz.trainingId).toBeUndefined();
});
test('a hiring quiz without questions cannot publish or mutate its status',async()=>{
  const quiz=row({id:11,context:'HIRE',status:'DRAFT',trainerId:99});
  jest.spyOn(models.AIQuiz,'findByPk').mockResolvedValue(quiz);
  jest.spyOn(models.AIQuestion,'findAll').mockResolvedValue([]);
  const res=response();await quizRoutes.publishQuiz(request({}),res);
  expect(res.statusCode).toBe(400);expect(quiz.update).not.toHaveBeenCalled();
});

test('Hire quiz metadata requires assignment and never exposes authoring answers to a candidate',async()=>{
  const quiz=row({id:11,context:'HIRE',questions:[{answer:'secret'}]});
  jest.spyOn(models.AIQuiz,'findByPk').mockResolvedValue(quiz);
  const assignment=jest.spyOn(models.QuizAssignment,'findOne').mockResolvedValue(null);
  const handler=quizRoutes.stack.find(layer=>layer.route?.path==='/:id'&&layer.route.methods.get).route.stack[0].handle;
  const req={...request({}),user:{id:1,role:'PARTICIPANT'}};
  const denied=response();await handler(req,denied);expect(denied.statusCode).toBe(403);
  assignment.mockResolvedValue({id:1});
  const allowed=response();await handler(req,allowed);
  expect(allowed.statusCode).toBe(200);expect(allowed.json.mock.calls[0][0].quiz.questions).toBeUndefined();
});

test('CSV import normalizes email, skips duplicates and retains unregistered candidates',async()=>{
  const workflow={id:1,assessment_type:'QUIZ',quiz_id:11};const candidates=[];
  jest.spyOn(models.HiringAssessment,'findByPk').mockResolvedValue(workflow);
  jest.spyOn(models.HiringCandidate,'findOne').mockImplementation(async({where})=>candidates.find(c=>c.email===where.email));
  jest.spyOn(models.HiringCandidate,'create').mockImplementation(async data=>{const c=row({id:candidates.length+1,...data});candidates.push(c);return c});
  jest.spyOn(models.User,'findOne').mockImplementation(async({where})=>where.email==='ready@example.test'?{id:10,status:'APPROVED'}:null);
  jest.spyOn(hiringService,'assignCandidate').mockResolvedValue({assignment:{id:1}});
  jest.spyOn(hiringService,'recomputeAssessmentStatus').mockResolvedValue('ASSIGNED');
  const req=request({});req.file={buffer:Buffer.from('Email,Name\n READY@example.test ,Ready\nready@example.test,Duplicate\npending@example.test,"Pending, Person"\ninvalid,Invalid')};
  const res=response();await hiring.uploadCandidatesCsv(req,res);
  expect(res.json.mock.calls[0][0].summary).toMatchObject({registeredAndAssigned:1,unregistered:1,duplicatesInCsv:1,invalidEmails:1});
  expect(candidates).toHaveLength(2);expect(candidates[1].full_name).toBe('Pending, Person');
  expect(models.User.findOne.mock.calls.every(([q])=>q.where.role==='PARTICIPANT')).toBe(true);
});
test('registration recheck assigns an approved participant once through the canonical quiz assignment',async()=>{
  const workflow={id:1,assessment_type:'QUIZ',quiz_id:11};
  const candidate=row({id:2,email:'pending@example.test',registration_status:'NOT_REGISTERED',assignment_status:'NOT_ASSIGNED'});
  const assignments=[];
  jest.spyOn(models.HiringAssessment,'findByPk').mockResolvedValue(workflow);
  jest.spyOn(models.HiringCandidate,'findAll').mockResolvedValue([candidate]);
  jest.spyOn(models.HiringCandidate,'findByPk').mockResolvedValue(candidate);
  jest.spyOn(models.User,'findOne').mockResolvedValue({id:20,status:'APPROVED'});
  jest.spyOn(models.HiringAssignment,'findOrCreate').mockImplementation(async({defaults})=>{const a=row({id:9,candidate_id:2,...defaults});assignments.push(a);return[a,true]});
  jest.spyOn(models.HiringAssignment,'findAll').mockResolvedValue(assignments);
  jest.spyOn(models.QuizAssignment,'findOrCreate').mockResolvedValue([{id:19},true]);
  jest.spyOn(models.QuizAttempt,'findOne').mockResolvedValue(null);
  jest.spyOn(sequelize,'transaction').mockImplementation(async cb=>cb({}));
  workflow.update=jest.fn();
  const first=await hiringService.recheckCandidateRegistration(1);
  const again=await hiringService.recheckCandidateRegistration(1);
  expect(first.newlyAssigned).toBe(1);expect(again.newlyAssigned).toBe(0);
  expect(models.QuizAssignment.findOrCreate).toHaveBeenCalledTimes(1);
  expect(assignments[0].quiz_assignment_id).toBe(19);
});
test('existing admin report accepts Hire context and links to canonical reports',async()=>{
  jest.spyOn(models.HiringAssessment,'findAll').mockResolvedValue([{id:1,assessment_type:'QUIZ',quiz_id:11,quiz:{title:'Screening',status:'PUBLISHED'}}]);
  jest.spyOn(models.Interview,'findAll').mockResolvedValue([{id:3,mode:'GROUP_DISCUSSION',status:'EVALUATED',participants:[{evaluation:{}}]}]);
  for(const name of ['HiringAssessment','Interview','HiringCandidate','HiringAssignment','QuizAttempt'])jest.spyOn(models[name],'count').mockResolvedValue(1);
  const res=response();await reports.getAdminReport({...request({}),query:{context:'HIRE'}},res);
  const data=res.json.mock.calls[0][0].data;
  expect(data.context).toBe('HIRE');expect(data.records.map(r=>r.reportUrl)).toEqual(['/trainer/quiz/11?from=hire','/interview/3?from=hire-gd']);
});
