const http=require('http');
const {Server}=require('socket.io');
const {io:connect}=require('socket.io-client');
jest.mock('../src/models',()=>{
  const {Op}=require('sequelize');
  const match=(row,where={})=>Reflect.ownKeys(where).every(key=>{
    if(key===Op.or)return where[key].some(w=>match(row,w));
    const value=where[key], actual=row[key];
    if(value&&typeof value==='object'&&!(value instanceof Date))return Reflect.ownKeys(value).every(op=>op===Op.in?value[op].some(v=>String(v)===String(actual)):op===Op.gt?actual>value[op]:op===Op.gte?actual>=value[op]:false);
    return String(actual)===String(value);
  });
  const table=()=>{
    const rows=[];
    const model={rows,
      create:jest.fn(async data=>{const row={id:rows.length+1,created_at:new Date(),status:'INVITED',participation_seconds:0,...data};row.update=jest.fn(async patch=>Object.assign(row,patch));row.toJSON=()=>({...row});rows.push(row);return row}),
      findAll:jest.fn(async({where={},order}={})=>{const found=rows.filter(row=>match(row,where));return order?found.sort((a,b)=>b.id-a.id):found}),
      findByPk:jest.fn(async id=>rows.find(row=>String(row.id)===String(id))||null),
      findOne:jest.fn(async options=>(await model.findAll(options))[0]||null),
      findOrCreate:jest.fn(async({where,defaults={}})=>{const row=await model.findOne({where});return row?[row,false]:[await model.create({...defaults,...where}),true]}),
      update:jest.fn(async(patch,{where})=>{const rows=await model.findAll({where});for(const row of rows)await row.update(patch);return[rows.length]}),
      count:jest.fn(async options=>(await model.findAll(options)).length),
    };return model;
  };
  let tail=Promise.resolve();
  return {sequelize:{transaction:fn=>{const result=tail.then(()=>fn({LOCK:{UPDATE:'UPDATE'}}));tail=result.catch(()=>{});return result}},Interview:table(),InterviewSession:table(),InterviewParticipant:table(),InterviewDevice:table(),InterviewLog:table(),User:table()};
});
jest.mock('../src/services/monitoringService',()=>{
  const sessions=new Map();
  return {sessions,getSession:jest.fn(async id=>sessions.get(id)),startSession:jest.fn(async input=>{const session={sessionId:`monitor-${input.participantId}-${input.attemptId}`,status:'CALIBRATING',...input};sessions.set(session.sessionId,session);return{session}}),
    startTestSession:jest.fn(async input=>Object.assign(sessions.get(input.sessionId),{status:'ACTIVE',testStartedAt:input.testStartedAt})),
    endSession:jest.fn(async input=>Object.assign(sessions.get(input.sessionId),{status:'COMPLETED'})),
    reportEvent:jest.fn(),getReport:jest.fn(async()=>({finalScore:10,riskLevel:'LOW',totalEvents:2,scoringBreakdown:{mobile:{score:10,max:10,count:1}}})),validateInterviewMobile:jest.fn(async()=>({success:true,mobileEvidence:{person_detected:true,laptop_detected:true,receivedAt:Date.now()}}))};
});
jest.mock('../src/utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));
jest.mock('../src/controllers/interviewController',()=>new Proxy({},{get:()=>((req,res)=>res.status(501).end())}));
jest.mock('../src/middleware/auth',()=>((req,res,next)=>{if(!req.headers['x-test-user'])return res.status(401).end();const id=Number(req.headers['x-test-user']);req.user={id,role:id===99?'TRAINER':'PARTICIPANT'};next()}));
jest.mock('../src/services/interviewAiMonitorService',()=>({processAlert:jest.fn(async()=>({id:1}))}));
jest.mock('../src/socket/crossInstance',()=>({relayEmit:jest.fn((io,kind,target,event,data,options={})=>(options.excludingSocket||io).to(target).emit(event,data))}));
const models=require('../src/models');
const lifecycle=require('../src/services/interviewLifecycleService');
const tokens=require('../src/services/interviewTokenService');
const monitoring=require('../src/services/monitoringService');
const {registerInterviewEvents}=require('../src/socket/interviewEvents');
const host={id:99,role:'TRAINER'};
const candidate=id=>({id,role:'PARTICIPANT'});
const once=(socket,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Missing ${event}`)),3000);socket.once(event,data=>{clearTimeout(timer);resolve(data)})});
const ack=(socket,event,data)=>socket.timeout(3000).emitWithAck(event,data);
async function setup(mode='GROUP_DISCUSSION'){
  const interview=await models.Interview.create({mode,status:'SCHEDULED',candidate_id:1,interviewer_id:99,created_by:99,scheduled_at:new Date(Date.now()-1000),duration_minutes:30,require_mobile_pairing:true,evaluation_criteria:lifecycle.normalizeCriteria([{name:'Communication',maxScore:10,weight:2},{name:'Listening',maxScore:5,weight:1}])});
  for(const id of mode==='GROUP_DISCUSSION'?[1,2,3]:[1])await models.InterviewParticipant.create({interview_id:interview.id,user_id:id,user:{name:`Candidate ${id}`,email:`candidate${id}@example.test`}});
  return interview;
}
beforeEach(()=>{jest.clearAllMocks();Object.values(models).forEach(model=>model.rows?.splice(0));monitoring.sessions.clear()});

test('weighted criteria reject incomplete, duplicate, malformed and out of range input',()=>{
  const criteria=lifecycle.normalizeCriteria([{name:'Speaking',maxScore:10,weight:2},{name:'Listening',maxScore:5,weight:1}]);
  expect(lifecycle.calculateEvaluation(criteria,{scores:{criterion_1:5,criterion_2:5},decision:'SELECTED'},99).overallScore).toBe(66.67);
  for(const scores of [{criterion_1:5},{criterion_1:11,criterion_2:5},{criterion_1:'5',criterion_2:5},{criterion_1:NaN,criterion_2:5}])expect(()=>lifecycle.calculateEvaluation(criteria,{scores,decision:'SELECTED'},99)).toThrow();
  for(const input of [[],[null],[{name:'A',maxScore:0}], [{name:'A',maxScore:10},{name:'a',maxScore:10}]])expect(()=>lifecycle.normalizeCriteria(input)).toThrow();
});

test('concurrent joins share one session, distinct monitoring IDs and stable per-candidate QR codes',async()=>{
  const interview=await setup();
  const [a,b,c]=await Promise.all([lifecycle.join(interview.id,candidate(1)),lifecycle.join(interview.id,candidate(2)),lifecycle.join(interview.id,candidate(1))]);
  expect(models.InterviewSession.rows).toHaveLength(1);
  expect(a.session.id).toBe(b.session.id);expect(a.monitoringSessionId).not.toBe(b.monitoringSessionId);expect(a.monitoringSessionId).toBe(c.monitoringSessionId);
  expect(a.qrPayload.shortUrl).toEqual(c.qrPayload.shortUrl);expect(a.qrPayload.shortUrl).not.toEqual(b.qrPayload.shortUrl);
  await expect(lifecycle.join(interview.id,candidate(20))).rejects.toMatchObject({status:403});
  await expect(lifecycle.start(interview.id,{id:98,role:'TRAINER'})).rejects.toMatchObject({status:403});
});

test('consumed QR survives expiry for same session; wrong candidate and ended session are rejected',async()=>{
  const iv=await setup();await lifecycle.join(iv.id,candidate(2));const device=models.InterviewDevice.rows.find(d=>d.device_type==='MOBILE');
  expect(await tokens.consumePairingToken(device.pairing_token,1)).toMatchObject({success:false,status:403});
  expect(await tokens.consumePairingToken(device.pairing_token,2)).toMatchObject({success:true});
  device.token_expires_at=new Date(Date.now()-60000);
  expect(await tokens.consumePairingToken(device.pairing_token,2)).toMatchObject({success:true,reconnected:true});
  const again=await lifecycle.join(iv.id,candidate(2));expect(again.qrPayload.reusable).toBe(true);
  await lifecycle.end(iv.id,host);
  expect(await tokens.validatePairingToken(device.pairing_token)).toMatchObject({success:false,status:410});
});

test.each(['INTERVIEW','GROUP_DISCUSSION'])('%s start, leave, reconnect, end and private individual results',async mode=>{
  const iv=await setup(mode);const ids=mode==='INTERVIEW'?[1]:[1,2];
  for(const id of ids){await lifecycle.join(iv.id,candidate(id));for(const device of models.InterviewDevice.rows.filter(d=>d.user_id===id))await device.update({status:'CONNECTED'})}
  const session=await lifecycle.start(iv.id,host);const started=session.started_at;
  expect((await lifecycle.start(iv.id,host)).started_at).toBe(started);
  for(const id of ids)await lifecycle.presence(iv,session,id,true);
  await lifecycle.presence(iv,session,1,false);expect(session.status).toBe('ACTIVE');
  expect((await lifecycle.join(iv.id,candidate(1))).session.started_at).toBe(started);
  await lifecycle.presence(iv,session,1,true);
  if(mode==='GROUP_DISCUSSION'){
    const late=await lifecycle.join(iv.id,candidate(3));expect(late.session.started_at).toBe(started);expect(monitoring.sessions.get(late.monitoringSessionId).status).toBe('ACTIVE');
    await expect(lifecycle.saveEvaluation(iv.id,1,host,{})).rejects.toThrow('Complete');
  }
  await lifecycle.end(iv.id,host);const count=monitoring.endSession.mock.calls.length;await lifecycle.end(iv.id,host);expect(monitoring.endSession).toHaveBeenCalledTimes(count);
  await expect(lifecycle.join(iv.id,candidate(1))).rejects.toMatchObject({status:409});
  if(mode==='GROUP_DISCUSSION'){
    const data={scores:{criterion_1:7,criterion_2:4},decision:'SELECTED',comments:'Feedback',summary:'Listened well'};
    await lifecycle.saveEvaluation(iv.id,1,host,data);
    expect((await lifecycle.report(iv.id,candidate(1))).participants[0].evaluation).toBeNull();
    await lifecycle.saveEvaluation(iv.id,1,host,{...data,isPublished:true});
    const own=await lifecycle.report(iv.id,candidate(1));expect(own.participants).toHaveLength(1);expect(own.participants[0].evaluation.overallScore).toBe(73.33);
    expect((await lifecycle.report(iv.id,candidate(2))).participants[0].evaluation).toBeNull();
    expect((await lifecycle.report(iv.id,host)).participants).toHaveLength(3);
    await expect(lifecycle.saveEvaluation(iv.id,2,candidate(1),data)).rejects.toMatchObject({status:403});
  }
});

test('real concurrent sockets isolate phone feeds, permit same-session reconnection and preserve the group when one leaves',async()=>{
  const iv=await setup();const first=await lifecycle.join(iv.id,candidate(1));await lifecycle.join(iv.id,candidate(2));
  const server=http.createServer(),io=new Server(server),clients=[];
  io.on('connection',socket=>{const auth=socket.handshake.auth;socket.userId=auth.id;socket.userRole=auth.id===99?'TRAINER':'PARTICIPANT';socket.userName=`User ${auth.id}`;if(auth.mobile){socket.deviceType='MOBILE';socket.pairingToken=auth.token;socket.currentInterviewId=String(iv.id)}registerInterviewEvents(io,socket)});
  const join=async(id,mobile=false)=>{const token=models.InterviewDevice.rows.find(d=>d.user_id===id&&d.device_type==='MOBILE')?.pairing_token;const socket=connect(`http://127.0.0.1:${server.address().port}`,{transports:['polling'],forceNew:true,auth:{id,mobile,token}});clients.push(socket);await once(socket,'connect');expect(await ack(socket,'join-room',{interviewId:iv.id,deviceType:mobile?'MOBILE':'LAPTOP'})).toMatchObject({success:true,sessionId:first.session.id});return socket};
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const [staff,a,b]=await Promise.all([join(99),join(1),join(2)]);const phone=await join(1,true),phone2=await join(2,true);
    await lifecycle.start(iv.id,host);
    const otherFrames=[];b.on('interview:mobile-frame',frame=>otherFrames.push(frame));
    const ownFrame=once(a,'interview:mobile-frame'),staffFrame=once(staff,'interview:mobile-frame');
    expect(await ack(phone,'interview:yolo_frame',{interviewId:iv.id,participantId:2,sessionId:first.session.id,frame:'jpeg-a'})).toEqual({ok:true});
    expect(await ownFrame).toMatchObject({participantId:1,frame:'jpeg-a'});await staffFrame;expect(otherFrames).toHaveLength(0);
    expect(await ack(phone,'interview:yolo_frame',{interviewId:999,frame:'private'})).toMatchObject({ok:false});
    expect(await ack(a,'join-room',{interviewId:999})).toMatchObject({success:false});
    const left=once(staff,'peer-left');a.disconnect();await left;expect(first.session.status).toBe('ACTIVE');
    const returned=await join(1);expect((await ack(returned,'get-room-state',{interviewId:iv.id})).peers.some(p=>p.userId===2&&p.deviceType==='MOBILE')).toBe(false);
    phone.disconnect();const replacement=await join(1,true);const resumed=once(returned,'interview:mobile-frame');await ack(replacement,'interview:yolo_frame',{interviewId:iv.id,frame:'jpeg-resumed'});expect(await resumed).toMatchObject({participantId:1});
    expect(await ack(b,'end-interview',{interviewId:iv.id})).toMatchObject({success:false});expect(first.session.status).toBe('ACTIVE');
    const end=once(phone2,'interview-ended');expect(await ack(staff,'end-interview',{interviewId:iv.id})).toMatchObject({success:true});await end;
    expect(await ack(replacement,'interview:yolo_frame',{interviewId:iv.id,frame:'after-end'})).toMatchObject({ok:false});
  }finally{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve))}
},15000);

test('report and evaluation HTTP routes publish only the selected candidate and export a scoped workbook',async()=>{
  const express=require('express'),request=require('supertest'),ExcelJS=require('exceljs');
  const app=express();app.use(express.json());app.use('/api/interviews',require('../src/routes/interviewRoutes'));
  const iv=await setup();await lifecycle.join(iv.id,candidate(1));await lifecycle.end(iv.id,host);
  const base=`/api/interviews/${iv.id}`;
  await request(app).get(`${base}/report`).expect(401);
  await request(app).get(`${base}/report`).set('x-test-user','22').expect(403);
  const payload={scores:{criterion_1:9,criterion_2:4},decision:'SELECTED',isPublished:false,comments:'Private draft'};
  await request(app).post(`${base}/participants/1/evaluation`).set('x-test-user','1').send(payload).expect(403);
  await request(app).post(`${base}/participants/1/evaluation`).set('x-test-user','99').send(payload).expect(200);
  const draft=await request(app).get(`${base}/report`).set('x-test-user','1').expect(200);expect(draft.body.participants[0].evaluation).toBeNull();
  await request(app).post(`${base}/participants/1/evaluation`).set('x-test-user','99').send({...payload,isPublished:true}).expect(200);
  const own=await request(app).get(`${base}/report`).set('x-test-user','1').expect(200);expect(own.body.participants).toHaveLength(1);expect(own.body.participants[0].evaluation.overallScore).toBe(86.67);
  const download=await request(app).get(`${base}/report.xlsx`).set('x-test-user','1').buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)))}).expect(200);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(download.body);const sheet=workbook.worksheets[0];expect(sheet.rowCount).toBe(4);expect(sheet.getCell('A4').value).toBe('Candidate 1');expect(sheet.getCell('F4').value).toBe(86.67);
  await request(app).post(`${base}/result`).set('x-test-user','99').send({decision:'SELECTED'}).expect(409);
});
