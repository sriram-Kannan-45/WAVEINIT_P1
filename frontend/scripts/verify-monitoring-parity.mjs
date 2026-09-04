// Browser integration: real QuizTaking, Coding's ExamProctorShell, monitoring
// engine and trainer report. Only browser state and HTTP services are fixtures.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer, transformWithEsbuild } from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = fileURLToPath(new URL('..', import.meta.url))
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import QuizTaking from '/src/components/QuizTaking.jsx';
import ExamProctorShell from '/src/proctoring/components/ExamProctorShell.jsx';
import { SingleAttemptProctoringModal } from '/src/proctoring/components/TrainerMonitoringReport.jsx';
import { ToastProvider } from '/src/components/Toast.jsx';
import monitoringClient from '/src/proctoring/engine/MonitoringEngineClient';
const kind = new URLSearchParams(location.search).get('kind');
window.submitCalls = 0;
monitoringClient.contextType = kind;
monitoringClient.sessionId = 'fixture-' + kind;
monitoringClient.attemptId = 17;
monitoringClient.isMonitoringActive = true;
monitoringClient.isTestActive = true;
monitoringClient.setupBrowserEventListeners();
window.monitoringClient = monitoringClient;
function Fixture() {
  const [inactive, setInactive] = React.useState(false);
  window.endFixture = () => { setInactive(true); monitoringClient.isMonitoringActive = false; };
  return kind === 'REPORT' ? <SingleAttemptProctoringModal attemptId={17} contextType="CODING" onClose={() => {}}/> :
    kind === 'QUIZ' ? <QuizTaking quizId={10} attemptId={17} quizData={{ id:10, title:'Parity Quiz', timeLimit:60, questions:[{id:1,question:'Choose one',type:'MCQ',options:['A','B']}], copyProtectionEnabled:true }} onSubmit={() => { window.submitCalls++; }}/> :
      <ExamProctorShell inactive={inactive} onSubmit={() => { window.submitCalls++; return Promise.resolve(); }}><textarea aria-label="Coding editor" defaultValue="Keep my answer"/></ExamProctorShell>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><ToastProvider><Fixture/></ToastProvider></MemoryRouter>);
`
const server = await createServer({
  root, configFile:false, server:{host:'127.0.0.1',port:5189,strictPort:true},
  plugins:[{
    name:'monitoring-parity-fixture',
    resolveId(id) { if (id === '/monitoring-fixture.jsx') return '\0monitoring-fixture.jsx' },
    async load(id) { if (id === '\0monitoring-fixture.jsx') return (await transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx'})).code },
    configureServer(s) {
      s.middlewares.use(async (req,res,next) => {
        if (!req.url.startsWith('/monitoring-fixture?')) return next()
        res.setHeader('Content-Type','text/html')
        res.end(await s.transformIndexHtml('/monitoring-fixture','<html><body><div id="root"></div><script type="module" src="/monitoring-fixture.jsx"></script></body></html>'))
      })
    },
  },react()],
})
await server.listen()
let browser
try {
  browser = await chromium.launch({headless:true})
  const results = []
  for (const kind of ['QUIZ','CODING']) {
    const page = await browser.newPage({viewport:{width:1440,height:1000}})
    const errors=[], calls=[], violationRoutes=[]
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
    page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()) })
    page.on('response', res => { if (res.status() >= 400) console.error(res.status(),res.url()) })
    await page.addInitScript(() => {
      let fullscreen = true, hidden = false, focused = true
      Object.defineProperty(document,'fullscreenElement',{get:()=>fullscreen ? document.documentElement : null})
      Object.defineProperty(document,'hidden',{get:()=>hidden})
      Object.defineProperty(document,'visibilityState',{get:()=>hidden ? 'hidden' : 'visible'})
      document.hasFocus = () => focused
      window.setFullscreen = value => { fullscreen=value; document.dispatchEvent(new Event('fullscreenchange')) }
      window.setHidden = value => { hidden=value; document.dispatchEvent(new Event('visibilitychange')) }
      window.setFocus = value => { focused=value; window.dispatchEvent(new Event(value ? 'focus':'blur')) }
      Element.prototype.requestFullscreen = async () => window.setFullscreen(true)
      Document.prototype.exitFullscreen = async () => window.setFullscreen(false)
      localStorage.setItem('user',JSON.stringify({id:7,name:'Test Participant',token:'fixture-token'}))
    })
    await page.route('**/api/**', async route => {
      if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
      if (route.request().method()==='POST' && route.request().url().endsWith('/events')) calls.push(route.request().postDataJSON())
      if (route.request().url().includes('/violation')) violationRoutes.push(route.request().url())
      await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{},status:'IN_PROGRESS'})})
    })
    await page.goto(`http://127.0.0.1:5189/monitoring-fixture?kind=${kind}`)
    await page.waitForFunction(()=>!!window.monitoringClient)
    await page.clock.install()
    await page.clock.runFor(100)
    // A short exit is ignored, including warning UI.
    await page.evaluate(()=>window.setFullscreen(false))
    await page.clock.runFor(900)
    await page.evaluate(()=>window.setFullscreen(true))
    await page.clock.runFor(2200)
    assert.equal(calls.length,0)
    assert.equal(await page.getByRole('alertdialog').count(),0)
    for (let i=1;i<=5;i++) {
      await page.clock.runFor(16000)
      await page.evaluate(()=>{window.setFullscreen(false); document.dispatchEvent(new Event('webkitfullscreenchange'))})
      await page.clock.runFor(2200)
      await page.getByRole('heading',{name:`Security Warning (${i})`,exact:true}).waitFor()
      assert.equal(await page.evaluate(()=>window.submitCalls),0)
      await page.getByRole('button',{name:'Return to fullscreen'}).click()
      await page.clock.runFor(300)
    }
    // The same shared engine handles transient/confirmed tabs and window focus.
    await page.evaluate(()=>window.setHidden(true))
    await page.clock.runFor(900)
    await page.evaluate(()=>window.setHidden(false))
    await page.clock.runFor(2200)
    await page.evaluate(()=>window.setHidden(true))
    await page.clock.runFor(2200)
    await page.evaluate(()=>window.setHidden(false))
    await page.clock.runFor(16000)
    await page.evaluate(()=>window.setFocus(false))
    await page.clock.runFor(2200)
    await page.evaluate(()=>window.setFocus(true))
    assert.equal(await page.evaluate(()=>window.submitCalls),0)
    assert.deepEqual(violationRoutes,[], 'browser events must not enter the separate copy-disqualification path')
    const normalized = calls.map(c=>({type:c.eventType,severity:c.severity,durationMs:c.durationMs}))
    assert.equal(normalized.filter(c=>c.type==='FULLSCREEN_EXIT').length,5)
    assert.equal(normalized.filter(c=>c.type==='TAB_SWITCH').length,1)
    assert.equal(normalized.filter(c=>c.type==='WINDOW_BLUR').length,1)
    results.push(normalized)
    if (kind==='CODING') {
      assert.equal(await page.getByRole('textbox',{name:'Coding editor'}).inputValue(),'Keep my answer')
      await page.evaluate(()=>window.endFixture())
      await page.clock.runFor(100)
      await page.evaluate(()=>window.setFullscreen(false))
      await page.clock.runFor(2200)
      assert.equal(await page.getByRole('heading',{name:'Security Warning (6)',exact:true}).count(),0)
      assert.equal(calls.length,normalized.length)
    }
    assert.deepEqual(errors,[])
    await page.close()
  }
  assert.deepEqual(results[1],results[0])
  console.log('PASS: Quiz/Coding repeated exits, transient exits, duplicate browser events, tab switches, focus loss, submission guards, and answer preservation.')
  const reportPage = await browser.newPage()
  const reportRequests = []
  await reportPage.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    reportRequests.push(url)
    await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{
      sessionId:'coding-report', contextType:'CODING', participant:{name:'Parity Participant'},
      tabSwitchCount:8, tabSwitchScore:0, multiFaceScore:0, mobileScore:0, noPersonScore:0,
      eyeHeadScore:0, finalScore:0, riskLevel:'LOW', categoryBreakdown:{persons:2,objects:2},
      actualTestDurationSeconds:600, events:[], timeline:[],
    }})})
  })
  await reportPage.goto('http://127.0.0.1:5189/monitoring-fixture?kind=REPORT')
  const tabCard = reportPage.getByText('Tab Switches',{exact:true}).locator('..')
  await tabCard.waitFor()
  assert.match(await tabCard.innerText(), /0\.0 \/ 10/)
  assert.match(await reportPage.getByText('Multi Persons',{exact:true}).locator('..').innerText(), /0\.0 \/ 10/)
  assert.match(await reportPage.getByText('Mobile Phone',{exact:true}).locator('..').innerText(), /0\.0 \/ 10/)
  assert.equal(reportRequests[0].searchParams.get('contextType'),'CODING')
  console.log('PASS: trainer report requests Coding context and displays authoritative zero penalties despite nonzero raw counts.')
} finally {
  await browser?.close()
  await server.close()
}
