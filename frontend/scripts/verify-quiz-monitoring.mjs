import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer, transformWithEsbuild } from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = fileURLToPath(new URL('..', import.meta.url))
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import Page from '/src/pages/ParticipantQuizAttemptPage.jsx';
import {ToastProvider} from '/src/components/Toast.jsx';
createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter initialEntries={['/quiz/10?attemptId=17&sessionToken=test&monitoringSessionId=quiz-camera-test']}><ToastProvider><Routes><Route path="/quiz/:quizId" element={<Page user={{id:7,token:'test-token'}}/>}/></Routes></ToastProvider></MemoryRouter></React.StrictMode>);
`
const server = await createServer({ root, configFile:false, cacheDir:'node_modules/.vite-quiz-monitoring', server:{host:'127.0.0.1',port:5190,strictPort:true},plugins:[{
  name:'quiz-camera-fixture',enforce:'pre',
  resolveId(id) {
    if(id.endsWith('/AssessmentConsentGate')) return '\0consent'
    if(id==='/quiz-camera.jsx') return '\0quiz-camera.jsx'
  },
  async load(id) {
    if(id==='\0consent') return `import React from 'react'; export default function Consent({onConsented,attemptId,quiz}) { return React.createElement('button',{onClick:()=>onConsented(attemptId,quiz)},'Start fixture'); }`
    if(id==='\0quiz-camera.jsx') return (await transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx'})).code
  },
  configureServer(s) {s.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/quiz-camera')return next()
    res.setHeader('Content-Type','text/html')
    res.end(await s.transformIndexHtml('/quiz-camera','<html><body><div id="root"></div><script type="module" src="/quiz-camera.jsx"></script></body></html>'))
  })},
},react()] })
await server.listen()
let browser
try {
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
  const page=await browser.newPage({viewport:{width:1440,height:1100}})
  const errors=[],events=new Map(),requests=[]
  let failNext=false
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
  await page.addInitScript(()=>{
    let fs=true,hidden=false,focused=true
    Object.defineProperty(document,'fullscreenElement',{get:()=>fs?document.documentElement:null})
    Object.defineProperty(document,'hidden',{get:()=>hidden})
    Object.defineProperty(document,'visibilityState',{get:()=>hidden?'hidden':'visible'})
    document.hasFocus=()=>focused
    window.depart=()=>{focused=false;window.dispatchEvent(new Event('blur'));hidden=true;document.dispatchEvent(new Event('visibilitychange'));fs=false;document.dispatchEvent(new Event('fullscreenchange'));document.dispatchEvent(new Event('webkitfullscreenchange'))}
    window.returnToExam=()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));focused=true;window.dispatchEvent(new Event('focus'))}
    Element.prototype.requestFullscreen=async()=>{fs=true;document.dispatchEvent(new Event('fullscreenchange'))}
    Document.prototype.exitFullscreen=async()=>{fs=false;document.dispatchEvent(new Event('fullscreenchange'))}
    localStorage.setItem('user',JSON.stringify({id:7,name:'Camera Test',token:'test-token'}))
  })
  await page.route('**/socket.io/**',route=>route.abort())
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(!path.startsWith('/api/'))return route.continue()
    requests.push(path)
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
    if(path.endsWith('/questions'))return reply({quiz:{id:10,title:'Camera regression',timeLimit:60,copyProtectionEnabled:false},attempt:{status:'IN_PROGRESS'},questions:[1,2].map(id=>({id,question:`Question ${id}`,type:'MCQ',options:['First','Second']}))})
    if(path.endsWith('/events')){
      const body=route.request().postDataJSON()
      if(!body.metadata?.browserIncidentId)return reply({success:true,data:{success:true,event:body}})
      if(failNext){failNext=false;return reply({success:false},500)}
      events.set(body.idempotencyKey,body)
      return reply({success:true,data:{success:true,event:body,browserSwitchCount:events.size,isGraceWarning:events.size<=3}})
    }
    if(path.endsWith('/submit'))return reply({success:true,score:0,percentage:0,correctAnswers:0,totalQuestions:2})
    return reply({success:true,enabled:false,data:{ready:true,session:{sessionId:'quiz-camera-test'}},status:'IN_PROGRESS'})
  })
  await page.goto('http://127.0.0.1:5190/quiz-camera')
  await page.getByRole('button',{name:'Start fixture'}).click()
  const camera=page.locator('.dual-proctor-video').first()
  const assertCamera=async()=>{
    await page.waitForFunction(()=>{const v=document.querySelector('.dual-proctor-video');return v?.srcObject?.getVideoTracks().some(t=>t.readyState==='live')&&v.readyState>=2&&v.videoWidth>0})
    await camera.scrollIntoViewIfNeeded()
    assert.equal(await camera.evaluate(v=>{const r=v.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===v||v.contains(hit)}),true,'Camera must be visible above the quiz surface')
  }
  await assertCamera()
  const streamId=await camera.evaluate(v=>v.srcObject.id)
  await page.getByRole('button',{name:'Question 2',exact:true}).click()
  await assertCamera()
  assert.equal(await camera.evaluate(v=>v.srcObject.id),streamId,'Question navigation must not reacquire/stop the camera')
  // One switch yields four DOM events. Confirm four switches at intervals
  // shorter than the old 12-second per-type cooldown.
  for(let i=1;i<=4;i++){
    if(i===2)failNext=true
    await page.evaluate(()=>window.depart())
    await page.waitForTimeout(2150)
    await page.evaluate(()=>window.returnToExam())
    await page.getByRole('heading',{name:`Security Warning (${i})`,exact:true}).waitFor()
    await page.getByRole('button',{name:'Return to fullscreen'}).click()
    await page.getByRole('heading',{name:`Security Warning (${i})`,exact:true}).waitFor({state:'detached'})
  }
  await page.waitForFunction(async()=>{const{default:c}=await import('/src/proctoring/engine/MonitoringEngineClient.js');return !c.browserOutbox?.length})
  assert.equal(events.size,4)
  assert.ok([...events.values()].every(e=>e.eventType==='TAB_SWITCH'))
  assert.equal(requests.filter(p=>p.includes('/violation')).length,0)
  await assertCamera()
  // A stopped stream must recover, and minimizing must not stop monitoring.
  await camera.evaluate(v=>v.srcObject.getTracks().forEach(t=>t.stop()))
  await page.waitForFunction(old=>document.querySelector('.dual-proctor-video')?.srcObject?.id!==old,streamId)
  await assertCamera()
  await page.getByTitle('Minimize Widget',{exact:true}).click()
  await page.getByTitle('Click to expand monitoring widget',{exact:true}).click()
  await assertCamera()
  const finalization=page.waitForRequest(req=>new URL(req.url()).pathname.endsWith('/quiz-camera-test/end'))
  await page.getByRole('button',{name:'Submit quiz',exact:true}).click()
  await page.getByRole('button',{name:'Submit now',exact:true}).click()
  const finalBody=(await finalization).postDataJSON()
  assert.ok(finalBody.actualTestDurationSeconds>0)
  assert.equal(events.size,4)
  assert.deepEqual(errors,[])
  console.log('PASS: actual Quiz page under StrictMode, visible live camera, stable question navigation, four deduplicated switches, failed event retry, camera recovery, minimize/expand and final audit submission.')
} finally {await browser?.close();await server.close()}
