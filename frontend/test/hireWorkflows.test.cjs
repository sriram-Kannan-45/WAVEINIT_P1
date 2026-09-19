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
  assert.equal(location.pathname,'/trainer/quiz/11');
  assert.match(location.search,/from=hire/);
  assert.match(location.search,/hireId=1/);
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

test('Hire assessment details expose direct first-class quiz creation and editing', async () => {
  let ensuredQuizId = null;
  const noContentQuizItem = {
    id: 10,
    title: 'Frontend React Test',
    assessment_type: 'QUIZ',
    engine_id: null,
    engine_status: 'DRAFT',
    content_count: 0,
    quiz_metrics: { exists: false, id: null, title: 'Frontend React Test', status: 'DRAFT', question_count: 0 },
    coding_metrics: { exists: false, id: null, title: null, status: 'DRAFT', problem_count: 0 },
  };

  services.hire = {
    listAssessments: async () => ({ assessments: [noContentQuizItem] }),
    getAssessment: async () => ({ assessment: noContentQuizItem }),
    listCandidates: async () => ({ candidates: [] }),
    ensureQuiz: async (id) => {
      ensuredQuizId = id;
      return { quiz: { id: 77, title: 'Frontend React Test' } };
    },
  };

  const root = await mount(Hire, { user: { role: 'ADMIN' } });
  await act(async () => { await delay(240) });
  await act(async () => { button(root, 'Open').props.onClick(); await delay(1) });

  // Empty state and direct creation actions should be visible
  assert.match(text(root), /No assessment content yet/);
  assert.match(text(root), /Multiple-choice assessment questions/);
  const createQuizBtn = button(root, 'Create Quiz');
  assert.ok(createQuizBtn, 'Direct Create Quiz button must be present in header/card');

  // Clicking + Create Quiz invokes ensureQuiz and navigates to the shared Quiz Creator with hire context
  await act(async () => { createQuizBtn.props.onClick(); await delay(1) });
  assert.equal(ensuredQuizId, 10);
  assert.equal(location.pathname, '/trainer/quiz/77');
  assert.match(location.search, /from=hire/);
  assert.match(location.search, /hireId=10/);
  assert.match(location.search, /action=create/);

  act(() => root.unmount());
});

test('Hire assessment details expose direct first-class coding creation and deep-linking restoration', async () => {
  let ensuredCodingId = null;
  const codingItem = {
    id: 20,
    title: 'Backend Systems Assessment',
    assessment_type: 'CODING',
    engine_id: 88,
    engine_status: 'PUBLISHED',
    content_count: 3,
    quiz_metrics: { exists: false, id: null, title: null, status: 'DRAFT', question_count: 0 },
    coding_metrics: { exists: true, id: 88, title: 'Backend Systems Assessment', status: 'PUBLISHED', problem_count: 3 },
  };

  services.hire = {
    listAssessments: async () => ({ assessments: [codingItem] }),
    getAssessment: async () => ({ assessment: codingItem }),
    listCandidates: async () => ({ candidates: [] }),
    ensureCoding: async (id) => {
      ensuredCodingId = id;
      return { codingAssessment: { id: 88, title: 'Backend Systems Assessment' } };
    },
  };

  // Mount directly with deep-link query ?selectedId=20
  const root = await mount(Hire, { user: { role: 'ADMIN' } }, '/admin?tab=hire-assessments&selectedId=20');
  await act(async () => { await delay(240) });

  // Detail view should already be open without clicking "Open"
  assert.match(text(root), /Backend Systems Assessment/);
  assert.match(text(root), /Assessment content & results/);
  assert.match(text(root), /3.*Problems/);
  assert.match(text(root), /Published/);

  // Since coding content already exists with 3 problems, button should show "Edit Coding"
  const editCodingBtn = button(root, 'Edit Coding');
  assert.ok(editCodingBtn, 'Edit Coding button must be present instead of Create');

  await act(async () => { editCodingBtn.props.onClick(); await delay(1) });
  assert.equal(location.pathname, '/trainer/coding/88');
  assert.match(location.search, /from=hire/);
  assert.match(location.search, /hireId=20/);

  act(() => root.unmount());
});

test('Combined Hire assessment shows both Quiz and Coding creation cards and actions', async () => {
  const combinedItem = {
    id: 30,
    title: 'Fullstack Engineer Test',
    assessment_type: 'COMBINED',
    engine_id: 101,
    engine_status: 'DRAFT',
    content_count: 12,
    quiz_metrics: { exists: true, id: 101, title: 'Fullstack Quiz', status: 'PUBLISHED', question_count: 10 },
    coding_metrics: { exists: true, id: 202, title: 'Fullstack Coding', status: 'DRAFT', problem_count: 2 },
  };

  services.hire = {
    listAssessments: async () => ({ assessments: [combinedItem] }),
    getAssessment: async () => ({ assessment: combinedItem }),
    listCandidates: async () => ({ candidates: [] }),
  };

  const root = await mount(Hire, { user: { role: 'ADMIN' } }, '/admin?tab=hire-assessments&selectedId=30');
  await act(async () => { await delay(240) });

  // Both Quiz and Coding cards must be visible
  assert.match(text(root), /10.*Questions/);
  assert.match(text(root), /2.*Problems/);
  assert.ok(button(root, 'Edit Quiz'), 'Must have Edit Quiz button');
  assert.ok(button(root, 'Edit Coding'), 'Must have Edit Coding button');
  assert.ok(button(root, 'View Questions'), 'Must have View Questions button');
  assert.ok(button(root, 'View Problems'), 'Must have View Problems button');

  act(() => root.unmount());
});

