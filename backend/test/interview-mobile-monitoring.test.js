jest.mock('../src/models',()=>({}));
jest.mock('axios',()=>({post:jest.fn()}));
jest.mock('../src/utils/logger',()=>({warn:jest.fn(),info:jest.fn(),error:jest.fn()}));
const axios=require('axios');
const service=require('../src/services/monitoringService');
const session=id=>({sessionId:`ms_interview_${id}`,participantId:id,status:'ACTIVE',contextType:'INTERVIEW'});
const evidence=(person,laptop)=>({success:true,mobile_evidence:{person_detected:person,laptop_detected:laptop,composition_state:person&&laptop?'VALID':person?'LAPTOP_MISSING':'PERSON_MISSING'}});
beforeEach(()=>{jest.restoreAllMocks();jest.clearAllMocks();service.interviewMobileStates=new Map();service.mobileFrameJobs=new Set();jest.spyOn(service,'reportEvent').mockResolvedValue({})});

test('missing person and laptop recover within the same monitoring session and do not affect another candidate',async()=>{
  axios.post.mockResolvedValueOnce({data:evidence(false,true)}).mockResolvedValueOnce({data:evidence(true,false)}).mockResolvedValueOnce({data:evidence(true,true)}).mockResolvedValueOnce({data:evidence(false,true)});
  const candidate=session(1);
  for(let i=0;i<3;i++)expect(await service.validateInterviewMobile({session:candidate,frame:'jpeg'})).toMatchObject({success:true});
  await service.validateInterviewMobile({session:session(2),frame:'other-jpeg'});
  expect(service.reportEvent.mock.calls.map(([event])=>[event.sessionId,event.eventType])).toEqual([
    ['ms_interview_1','FACE_ABSENT'],['ms_interview_1','LAPTOP_NOT_DETECTED'],['ms_interview_1','COMPOSITION_VALID'],['ms_interview_2','FACE_ABSENT'],
  ]);
  expect(service.interviewMobileStates.get(candidate.sessionId).composition_state).toBe('VALID');
});
test('slow inference coalesces frames per candidate and releases the job after failure',async()=>{
  let release;axios.post.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));
  const running=service.validateInterviewMobile({session:session(1),frame:'first'});
  expect(await service.validateInterviewMobile({session:session(1),frame:'second'})).toEqual({busy:true});
  axios.post.mockResolvedValueOnce({data:evidence(true,true)});
  expect(await service.validateInterviewMobile({session:session(2),frame:'other'})).toMatchObject({success:true});
  release({data:evidence(true,true)});await running;
  axios.post.mockRejectedValueOnce(new Error('AI unavailable'));
  expect(await service.validateInterviewMobile({session:session(1),frame:'retry'})).toEqual({success:false});
  expect(service.mobileFrameJobs.size).toBe(0);
});
test('pre-session checks remain unscored; stable phone detection uses server-authoritative scoring',async()=>{
  const result=evidence(true,true);result.mobile_evidence.phone_stable=true;
  axios.post.mockResolvedValue({data:result});
  await service.validateInterviewMobile({session:{...session(1),status:'CALIBRATING'},frame:'before'});
  expect(service.reportEvent).not.toHaveBeenCalled();
  await service.validateInterviewMobile({session:session(1),frame:'active'});
  expect(service.reportEvent).toHaveBeenCalledWith(expect.objectContaining({sessionId:'ms_interview_1',participantId:1,eventType:'PHONE_DETECTED',serverMobileDetection:true}));
});
