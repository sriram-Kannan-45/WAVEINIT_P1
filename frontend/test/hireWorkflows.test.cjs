const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const renderer = require('react-test-renderer');
const {MemoryRouter, useLocation} = require('react-router-dom');
const {buildSync} = require('esbuild');
const {act} = renderer;

global.document = {addEventListener(){}, removeEventListener(){}, body:{style:{}}};
global.window = {addEventListener(){}, removeEventListener(){}, history:{replaceState(){}}, location:{origin:'http://localhost'}};
global.localStorage = {getItem(){return null}};

const services = {};
const motion = new Proxy({}, {get:(cache,tag)=>cache[tag] ||= React.forwardRef(({children,...props},ref)=>React.createElement(tag,{...props,ref},children))});
function load(relative) {
  const filename=path.resolve(__dirname,'../src',relative);
  const output=buildSync({entryPoints:[filename],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',
    external:['*services/hiringService','*services/interviewService','*components/Toast','../../Toast'], define:{'import.meta.env':'{}'}}).outputFiles[0].text;
  const mod=new Module(filename,module); mod.filename=filename; mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod.require=id=>{
    if(id==='framer-motion')return {motion,AnimatePresence:({children})=>children};
    if(id==='react-dom')return {...require('react-dom'),createPortal:children=>children};
    if(/services\/(hiringService|interviewService)$/.test(id))return new Proxy({}, {get:(_,key)=>services[/hiringService$/.test(id)?'hire':'interview']?.[key]});
    if(id.endsWith('/Toast'))return toastModule;
    return require(id);
  };
  mod._compile(output,filename); return mod.exports;
}
const toastModule=load('components/Toast.jsx');
const Hire=load('components/admin/hire/HireAssessmentsTab.jsx').default;
const Schedule=load('pages/interview/ScheduleInterview.jsx').default;
const Dashboard=load('pages/interview/InterviewDashboard.jsx').default;
const item={id:1,title:'Developer screening',assessment_type:'QUIZ',engine_id:11,engine_status:'DRAFT',content_count:3};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const text=root=>JSON.stringify(root.toJSON());
const childText=node=>typeof node==='string'?node:Array.isArray(node)?node.map(childText).join(' '):node?.props?childText(node.props.children):'';
const button=(root,label)=>root.root.findAllByType('button').find(b=>childText(b.props.children).includes(label));
let location;
function Location(){location=useLocation();return null;}
async function mount(Component, props={}, route='/admin?tab=hire-assessments') {
  let root;
  await act(async()=>{root=renderer.create(React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(toastModule.ToastProvider,null,React.createElement(Component,props),React.createElement(Location))));});
  return root;
}

test('assessment list settles once; opening content or showing a toast cannot restart the fetch loop', async()=>{
  let calls=0;
  services.hire={listAssessments:async()=>{calls++;return {assessments:[item]}},getAssessment:async()=>({assessment:item}),listCandidates:async()=>({candidates:[]})};
  const root=await mount(Hire,{user:{role:'ADMIN'}});
  await act(async()=>{await delay(240)});
  assert.equal(calls,1); assert.match(text(root),/Developer screening/);
  await act(async()=>{button(root,'Open').props.onClick();await delay(1)});
  assert.match(text(root),/Candidate assignment/);
  await act(async()=>{await delay(450)});
  assert.equal(calls,1);
  await act(async()=>{button(root,'Manage content').props.onClick()});
  assert.equal(location.pathname,'/trainer/quiz/11');assert.equal(location.search,'?from=hire');
  act(()=>root.unmount());
});

test('failed list request stops loading, exposes retry, and recovers',async()=>{
  let calls=0;
  services.hire={listAssessments:async()=>{if(++calls===1)throw Error('Server unavailable');return {assessments:[item]}}};
  const root=await mount(Hire);
  await act(async()=>{await delay(240)});
  assert.match(text(root),/Server unavailable/);assert.doesNotMatch(text(root),/Loading…/);
  await act(async()=>{button(root,'Retry loading').props.onClick();await delay(1)});
  assert.equal(calls,2);assert.match(text(root),/Developer screening/);
  act(()=>root.unmount());
});

test('admin Hire proctoring controls persist on the existing assessment workflow',async()=>{
  const policy={enabled:true,identityVerification:true,livenessDetection:true,continuousFaceVerification:true,mobileRoomScan:true,unauthorizedObjectDetection:true,evidenceCapture:true,voiceWarnings:true,allowParticipantLanguage:true,defaultLanguage:'en-IN',voiceRate:.95,voiceVolume:1,identityCheckIntervalSeconds:30,roomScanMinFrames:6};
  let saved;
  services.hire={listAssessments:async()=>({assessments:[item]}),getAssessment:async()=>({assessment:{...item,proctoring_config:policy}}),listCandidates:async()=>({candidates:[]}),updateProctoringPolicy:async(type,id,value)=>{saved={type,id,value};return {policy:value}}};
  const root=await mount(Hire,{user:{role:'ADMIN',token:'token'}});
  await act(async()=>{await delay(240);button(root,'Open').props.onClick();await delay(1)});
  const enabled=root.root.findAllByType('input').find(input=>input.props.type==='checkbox'&&input.props.checked===true);
  act(()=>enabled.props.onChange({target:{checked:false}}));
  await act(async()=>{button(root,'Save policy').props.onClick();await delay(1)});
  assert.deepEqual({type:saved.type,id:saved.id}, {type:'QUIZ',id:11});
  assert.equal(saved.value.enabled,false);
  act(()=>root.unmount());
});

test('an older search response cannot overwrite the latest filter',async()=>{
  let resolveOld;
  services.hire={listAssessments:({type})=>type==='ALL'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({assessments:[{...item,title:'Coding filter result',assessment_type:'CODING'}]})};
  const root=await mount(Hire);
  await act(async()=>{await delay(240)});
  act(()=>root.root.findByProps({'aria-label':'Assessment type'}).props.onChange({target:{value:'CODING'}}));
  await act(async()=>{await delay(240)});
  await act(async()=>{resolveOld({assessments:[item]});await delay(1)});
  assert.match(text(root),/Coding filter result/);assert.doesNotMatch(text(root),/Developer screening/);
  act(()=>root.unmount());
});

test('closing a pending detail request does not reopen it when the response arrives',async()=>{
  let resolveDetail;
  services.hire={listAssessments:async()=>({assessments:[item]}),getAssessment:()=>new Promise(r=>resolveDetail=r),listCandidates:async()=>({candidates:[]})};
  const root=await mount(Hire);
  await act(async()=>{await delay(240)});
  act(()=>{button(root,'Open').props.onClick()});
  act(()=>button(root,'Back').props.onClick());
  await act(async()=>{resolveDetail({assessment:item});await delay(1)});
  assert.match(text(root),/Create Assessment/);assert.doesNotMatch(text(root),/Candidate assignment/);
  act(()=>root.unmount());
});

test('toast API remains stable after state changes and notifications',async()=>{
  const identities=[];let update,notify;
  function Probe(){const api=toastModule.useToast();const [count,setCount]=React.useState(0);identities.push(api);update=()=>setCount(count+1);notify=()=>api.success('Saved',{duration:1});return null;}
  const root=await mount(Probe);
  act(()=>update());await act(async()=>{notify();await delay(10)});
  assert.ok(identities.length>=2);assert.ok(identities.every(api=>api===identities[0]));
  act(()=>root.unmount());
});

test('Hire interview/GD entries filter the canonical API and open the same scheduler with the right mode',async()=>{
  for(const mode of ['INTERVIEW','GROUP_DISCUSSION']){
    const filters=[];services.interview={list:async p=>{filters.push(p);return {interviews:[]}},getStats:async()=>({})};
    const root=await mount(Dashboard,{user:{id:1,role:'ADMIN'},initialMode:mode});
    assert.equal(filters[0].mode,mode);assert.equal(filters[0].context,'HIRE');
    act(()=>button(root,mode==='INTERVIEW'?'Schedule Interview':'Create GD Session').props.onClick());
    assert.equal(location.pathname,'/interview/schedule');assert.match(location.search,new RegExp(`mode=${mode}`));
    act(()=>root.unmount());
  }
});

test('shared scheduler locks Hire entry mode, while the original scheduler retains both formats',async()=>{
  services.interview={getCandidates:async()=>({candidates:[]}),getInterviewers:async()=>({interviewers:[]})};
  for(const route of ['/interview/schedule','/interview/schedule?mode=GROUP_DISCUSSION&from=hire-gd','/interview/schedule?mode=INTERVIEW&from=hire-interviews']){
    const root=await mount(Schedule,{user:{role:'ADMIN'}},route);
    const format=root.root.findAllByType('select').find(s=>['INTERVIEW','GROUP_DISCUSSION'].includes(s.props.value));
    assert.equal(format.props.disabled,route.includes('from=hire'));
    assert.equal(format.props.value,route.includes('mode=GROUP_DISCUSSION')?'GROUP_DISCUSSION':'INTERVIEW');
    act(()=>button(root,'Back to').props.onClick());
    assert.equal(location.pathname,route.includes('from=hire')?'/admin':'/interviews');
    if(route.includes('hire-gd'))assert.equal(location.search,'?tab=hire-gd');
    act(()=>root.unmount());
  }
});
