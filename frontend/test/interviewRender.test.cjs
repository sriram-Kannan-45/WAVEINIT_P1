const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {buildSync}=require('esbuild');

function component(relative){
  const filename=path.resolve(__dirname,'../src',relative);
  const output=buildSync({entryPoints:[filename],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}}).outputFiles[0].text;
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(output,filename);return mod.exports.default;
}
const ActiveRoom=component('components/interview/room/ActiveRoom.jsx');
const MobileFeed=component('components/interview/room/MobileFeedTile.jsx');
const render=(Component,props)=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Component,props)));
const interview={id:1,mode:'GROUP_DISCUSSION',title:'Team discussion',durationMinutes:30,require_mobile_pairing:true,participants:[1,2,3].map(id=>({user_id:id,user:{name:`Candidate ${id}`}}))};

test('group staff room renders every candidate with independent camera tiles and an explicit start',()=>{
  const html=render(ActiveRoom,{interviewData:interview,user:{id:99,name:'Interviewer'},isInterviewer:true,localVideoRef:{current:null}});
  assert.match(html,/Start discussion/);assert.match(html,/30:00/);
  for(const id of [1,2,3])assert.match(html,new RegExp(`Candidate ${id} mobile camera`));
});
test('candidate sees their own monitoring tile and can leave without ending the group',()=>{
  const html=render(ActiveRoom,{interviewData:interview,user:{id:2,name:'Candidate 2'},isInterviewer:false,localVideoRef:{current:null},started:true,elapsed:60,aiStatus:{faceDetected:false}});
  assert.match(html,/29:00/);assert.match(html,/Leave discussion/);assert.match(html,/Candidate 2 mobile camera/);
  assert.doesNotMatch(html,/Candidate 1 mobile camera|End discussion|Start discussion/);assert.match(html,/face is not visible/);
});
test('normal interview retains its room and shows the candidate mobile feed',()=>{
  const html=render(ActiveRoom,{interviewData:{...interview,mode:'INTERVIEW'},user:{id:1,name:'Candidate 1'},isInterviewer:false,localVideoRef:{current:null},started:true,aiStatus:{faceDetected:false}});
  assert.match(html,/Candidate 1 mobile camera/);assert.match(html,/face is not visible/);assert.doesNotMatch(html,/Start discussion/);
});
test('fresh video with a missing laptop offers repositioning, while lost transport offers QR recovery',()=>{
  const props={name:'Candidate',onReconnect:()=>{},frame:{frame:'data:image/jpeg;base64,example',timestamp:Date.now()},evidence:{receivedAt:Date.now(),person_detected:true,laptop_detected:false}};
  const live=render(MobileFeed,props);assert.match(live,/Laptop not detected/);assert.match(live,/no QR scan/);assert.doesNotMatch(live,/Reconnect mobile camera<\/button>/);
  const lost=render(MobileFeed,{...props,frame:null});assert.match(lost,/Reconnect mobile camera/);
});
