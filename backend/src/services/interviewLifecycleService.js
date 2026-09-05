const { Op } = require('sequelize');
const { sequelize, Interview, InterviewSession, InterviewParticipant, InterviewDevice, InterviewLog, User } = require('../models');
const monitoring = require('./monitoringService');
const tokens = require('./interviewTokenService');
const qr = require('../utils/interviewQrGenerator');

const same = (a,b) => String(a) === String(b);
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const DEFAULT_CRITERIA = ['Communication','Confidence','Participation','Relevant points','Listening and interaction','Team collaboration','Subject knowledge','Leadership','Overall performance'];
function criteria(value) {
  const entries=value == null ? DEFAULT_CRITERIA.map(name=>({name,maxScore:10,weight:1})) : value;
  if (!Array.isArray(entries) || !entries.length || entries.length>20) fail('Provide between 1 and 20 evaluation criteria.');
  const names=new Set();
  return entries.map((item,index)=>{
    const name=String(item?.name||'').trim(), maxScore=Number(item?.maxScore), weight=Number(item?.weight??1);
    if (!name || name.length>80 || names.has(name.toLowerCase()) || !Number.isFinite(maxScore) || maxScore<=0 || maxScore>100 || !Number.isFinite(weight) || weight<=0 || weight>100) fail('Criteria need unique names, a maximum score and a positive weight.');
    names.add(name.toLowerCase()); return {id:`criterion_${index+1}`,name,maxScore,weight};
  });
}
function evaluate(criteriaList, input, decidedBy) {
  if (!input?.scores || Array.isArray(input.scores)) fail('Scores are required.');
  if (!['SELECTED','REJECTED','ON_HOLD'].includes(input.decision)) fail('Choose a valid result decision.');
  if (Object.keys(input.scores).length !== criteriaList.length) fail('Score every configured criterion.');
  let total=0,weights=0; const scores={};
  for(const criterion of criteriaList) {
    const value=input.scores[criterion.id];
    if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>criterion.maxScore) fail(`Invalid score for ${criterion.name}.`);
    scores[criterion.id]=value;total+=value/criterion.maxScore*criterion.weight;weights+=criterion.weight;
  }
  return {scores,overallScore:Math.round(total/weights*10000)/100,decision:input.decision,
    comments:String(input.comments||'').slice(0,5000),summary:String(input.summary||'').slice(0,5000),
    isPublished:input.isPublished===true,decidedBy,decidedAt:new Date().toISOString()};
}

class InterviewLifecycleService {
  isManager(interview,user) { return user.role==='ADMIN' || (['TRAINER','ADMIN'].includes(user.role) && (same(interview.interviewer_id,user.id)||same(interview.created_by,user.id))); }
  async member(interview,userId, options={}) {
    if(interview.mode!=='GROUP_DISCUSSION' && !same(interview.candidate_id,userId))return null;
    const existing=await InterviewParticipant.findOne({...options,where:{interview_id:interview.id,user_id:userId}});
    if(existing) return existing;
    if(interview.mode!=='GROUP_DISCUSSION' && same(interview.candidate_id,userId)) {
      const [row]=await InterviewParticipant.findOrCreate({...options,where:{interview_id:interview.id,user_id:userId},defaults:{status:'INVITED'}});
      return row;
    }
    return null;
  }
  async access(interviewId,user,managerOnly=false) {
    const interview=await Interview.findByPk(interviewId);
    if(!interview) fail('Interview not found',404);
    if(this.isManager(interview,user)) return interview;
    if(managerOnly || !(await this.member(interview,user.id))) fail('Access denied',403);
    return interview;
  }
  assertOpen(interview) {
    if(!['SCHEDULED','IN_PROGRESS'].includes(interview.status)) fail('This session has ended or was cancelled.',409);
    if(Date.now()<new Date(interview.scheduled_at).getTime()-(interview.grace_period_minutes||10)*60000) fail('This session is not yet open for joining.');
  }
  async session(interviewId) {
    return sequelize.transaction(async transaction=>{
      const interview=await Interview.findByPk(interviewId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!interview) fail('Interview not found',404);
      this.assertOpen(interview);
      let session=await InterviewSession.findOne({transaction,where:{interview_id:interview.id,status:{[Op.in]:['WAITING','ACTIVE']}}});
      if(!session) session=await InterviewSession.create({interview_id:interview.id,status:'WAITING'},{transaction});
      return session;
    });
  }
  async ensureMonitor(interview,session,userId) {
    const participant=await this.member(interview,userId);
    if(!participant) return null;
    return sequelize.transaction(async transaction=>{
      const locked=await InterviewParticipant.findByPk(participant.id,{transaction,lock:transaction.LOCK.UPDATE});
      let monitor=locked.monitoring_session_id && await monitoring.getSession(locked.monitoring_session_id);
      if(!monitor) {
        ({session:monitor}=await monitoring.startSession({participantId:userId,contextType:'INTERVIEW',contextId:interview.id,attemptId:session.id,mobileEnabled:false}));
        await locked.update({monitoring_session_id:monitor.sessionId},{transaction});
      }
      if(session.status==='ACTIVE' && monitor.status!=='ACTIVE') await monitoring.startTestSession({sessionId:monitor.sessionId,testStartedAt:session.started_at,configuredDurationSeconds:interview.duration_minutes*60});
      return monitor;
    });
  }
  async join(interviewId,user) {
    const interview=await this.access(interviewId,user);
    const session=await this.session(interview.id);
    const participant=await this.member(interview,user.id);
    let device=await InterviewDevice.findOne({where:{session_id:session.id,user_id:user.id,device_type:'LAPTOP'}});
    if(!device) device=await InterviewDevice.create({session_id:session.id,user_id:user.id,device_type:'LAPTOP',status:'PAIRED'});
    const monitor=participant ? await this.ensureMonitor(interview,session,user.id) : null;
    let qrPayload=null;
    if(participant && interview.require_mobile_pairing) {
      const token=await tokens.generatePairingToken(session.id,user.id,'MOBILE');
      qrPayload={...qr.generatePairingPayload({interviewId:interview.id,sessionId:session.id,token:token.token}),expiresAt:token.expiresAt,reusable:token.reusable};
    }
    const devices=await InterviewDevice.findAll({where:{session_id:session.id,...(participant?{user_id:user.id}:{})}});
    return {interview:interview.toJSON(),session,device,qrPayload,monitoringSessionId:monitor?.sessionId||null,
      devices:devices.map(d=>({userId:d.user_id,deviceType:d.device_type,status:d.status,connectedAt:d.connected_at}))};
  }
  async presence(interview,session,userId,connected) {
    const member=await this.member(interview,userId); if(!member) return;
    await sequelize.transaction(async transaction=>{
      const row=await InterviewParticipant.findByPk(member.id,{transaction,lock:transaction.LOCK.UPDATE});
      if(connected && row.status!=='CONNECTED') await row.update({status:'CONNECTED',joined_at:row.joined_at||new Date(),last_joined_at:new Date(),left_at:null},{transaction});
      if(!connected && row.status==='CONNECTED') {
        const from=Math.max(new Date(row.last_joined_at||Date.now()).getTime(),new Date(session.started_at||Date.now()).getTime());
        const seconds=session.started_at?Math.max(0,Math.floor((Math.min(Date.now(),new Date(session.ended_at||Date.now()).getTime())-from)/1000)):0;
        await row.update({status:'DISCONNECTED',left_at:new Date(),participation_seconds:Number(row.participation_seconds||0)+seconds},{transaction});
      }
    });
  }
  async start(interviewId,user) {
    await this.access(interviewId,user,true);
    const session=await sequelize.transaction(async transaction=>{
      const interview=await Interview.findByPk(interviewId,{transaction,lock:transaction.LOCK.UPDATE}); this.assertOpen(interview);
      const current=await InterviewSession.findOne({transaction,where:{interview_id:interview.id,status:{[Op.in]:['WAITING','ACTIVE']}}});
      if(!current) fail('No waiting session found',404); if(current.status==='ACTIVE') return current;
      const members=await InterviewParticipant.findAll({transaction,where:{interview_id:interview.id}});
      const devices=await InterviewDevice.findAll({transaction,where:{session_id:current.id,status:'CONNECTED'}});
      const ready=members.filter(p=>devices.some(d=>same(d.user_id,p.user_id)&&d.device_type==='LAPTOP') && (!interview.require_mobile_pairing || devices.some(d=>same(d.user_id,p.user_id)&&d.device_type==='MOBILE')));
      if(ready.length<(interview.mode==='GROUP_DISCUSSION'?2:1)) fail('Waiting for candidates to connect their required laptop and mobile cameras.');
      await current.update({status:'ACTIVE',started_at:new Date()},{transaction});
      await interview.update({status:'IN_PROGRESS'},{transaction});
      await InterviewLog.create({session_id:current.id,actor_id:user.id,event_type:'INTERVIEW_STARTED'},{transaction});
      return current;
    });
    const members=await InterviewParticipant.findAll({where:{interview_id:interviewId}});
    const interview=await Interview.findByPk(interviewId);
    for(const row of members) if(row.monitoring_session_id) {
      const monitor=await monitoring.getSession(row.monitoring_session_id);
      if(monitor?.status!=='ACTIVE') await monitoring.startTestSession({sessionId:row.monitoring_session_id,testStartedAt:session.started_at,configuredDurationSeconds:interview.duration_minutes*60});
    }
    return session;
  }
  async end(interviewId,user) {
    const interview=await this.access(interviewId,user,true);
    const session=await sequelize.transaction(async transaction=>{
      await Interview.findByPk(interviewId,{transaction,lock:transaction.LOCK.UPDATE});
      const current=await InterviewSession.findOne({transaction,where:{interview_id:interviewId},order:[['id','DESC']]});
      if(!current) fail('No session found',404);
      if(current.status!=='ENDED') {
        await current.update({status:'ENDED',ended_at:new Date()},{transaction});
        await Interview.update({status:'COMPLETED'},{where:{id:interviewId},transaction});
        await InterviewLog.create({session_id:current.id,actor_id:user.id,event_type:'INTERVIEW_ENDED'},{transaction});
      }
      return current;
    });
    for(const row of await InterviewParticipant.findAll({where:{interview_id:interviewId}})) {
      await this.presence(interview,session,row.user_id,false);
      await sequelize.transaction(async transaction=>{
        const locked=await InterviewParticipant.findByPk(row.id,{transaction,lock:transaction.LOCK.UPDATE});
        if(locked.monitoring_session_id && (await monitoring.getSession(locked.monitoring_session_id))?.status!=='COMPLETED') {
          await monitoring.endSession({sessionId:locked.monitoring_session_id,participantId:locked.user_id,actualTestDurationSeconds:session.started_at?Math.max(0,(new Date(session.ended_at)-new Date(session.started_at))/1000):0});
        }
      });
    }
    await InterviewDevice.update({status:'DISCONNECTED',disconnected_at:new Date()},{where:{session_id:session.id}});
    return session;
  }
  async saveEvaluation(interviewId,userId,actor,input) {
    const interview=await this.access(interviewId,actor,true);
    if(interview.mode!=='GROUP_DISCUSSION' || interview.status!=='COMPLETED') fail('Complete the Group Discussion before evaluating candidates.');
    const member=await this.member(interview,userId); if(!member) fail('Candidate not found',404);
    const result=evaluate(interview.evaluation_criteria,input,actor.id);
    await member.update({evaluation:result}); return result;
  }
  async report(interviewId,user) {
    const interview=await this.access(interviewId,user);
    const manager=this.isManager(interview,user);
    const session=await InterviewSession.findOne({where:{interview_id:interviewId},order:[['id','DESC']]});
    const members=await InterviewParticipant.findAll({where:{interview_id:interviewId,...(!manager?{user_id:user.id}:{})},include:[{model:User,as:'user',attributes:['id','name','email']}]});
    const participants=[];
    for(const member of members) {
      const evaluation=manager||member.evaluation?.isPublished?member.evaluation:null;
      let report=null;
      if(member.monitoring_session_id && (manager||evaluation)) report=await monitoring.getReport({sessionId:member.monitoring_session_id,contextType:'INTERVIEW'});
      const running=member.status==='CONNECTED'&&session?.started_at?Math.max(0,(Math.min(Date.now(),new Date(session.ended_at||Date.now()).getTime())-Math.max(new Date(member.last_joined_at).getTime(),new Date(session.started_at).getTime()))/1000):0;
      participants.push({userId:member.user_id,name:member.user?.name,email:member.user?.email,status:member.status,joinedAt:member.joined_at,
        participationSeconds:Math.round(Number(member.participation_seconds||0)+running),evaluation,
        monitoring:report?{sessionId:member.monitoring_session_id,score:report.finalScore,riskLevel:report.riskLevel,totalEvents:report.totalEvents,scoringBreakdown:report.scoringBreakdown}:null});
    }
    return {interview:{id:interview.id,title:interview.title,description:interview.description,mode:interview.mode,status:interview.status,scheduledAt:interview.scheduled_at,durationMinutes:interview.duration_minutes},
      session:session?{id:session.id,status:session.status,startedAt:session.started_at,endedAt:session.ended_at,durationSeconds:session.started_at?Math.max(0,Math.floor((new Date(session.ended_at||Date.now())-new Date(session.started_at))/1000)):0}:null,
      criteria:interview.evaluation_criteria||[],participants,canEvaluate:manager};
  }
}
module.exports=new InterviewLifecycleService();
module.exports.normalizeCriteria=criteria;
module.exports.calculateEvaluation=evaluate;
