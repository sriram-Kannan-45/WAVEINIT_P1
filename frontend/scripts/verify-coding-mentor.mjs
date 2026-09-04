// Real assessment page + real mentor/editor/monitoring components. API, camera,
// fullscreen, and the pre-assessment consent gate are deterministic test doubles.
// Run: node scripts/verify-coding-mentor.mjs (requires Playwright on NODE_PATH).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer, transformWithEsbuild } from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = fileURLToPath(new URL('..', import.meta.url))
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import {loader} from '@monaco-editor/react';
import Page from '/src/pages/ParticipantCodingAttemptPage.jsx';
import UnifiedMonitoringWidget from '/src/components/monitoring/UnifiedMonitoringWidget.jsx';
import {ToastProvider} from '/src/components/Toast.jsx';
import {AlertModalProvider} from '/src/components/ui/AlertModal.jsx';
loader.config({paths:{vs:'/node_modules/monaco-editor/min/vs'}});
const widgetFixture = new URLSearchParams(window.location.search).get('widget');
createRoot(document.getElementById('root')).render(
  widgetFixture ? <UnifiedMonitoringWidget contextType="CODING" sessionId="test-monitoring" userToken="test-token" externalWebcamStream={widgetFixture === 'number' ? 1 : {attemptId:1}}/> :
  <React.StrictMode><MemoryRouter initialEntries={['/coding/2?attemptId=1&sessionToken=test-session&monitoringSessionId=test-monitoring']}>
    <ToastProvider><AlertModalProvider>
      <Routes><Route path='/coding/:assessmentId' element={<Page user={{id:7,token:'test-token'}}/>}/></Routes>
    </AlertModalProvider></ToastProvider>
  </MemoryRouter></React.StrictMode>);
`
const server = await createServer({
  root, configFile: false, cacheDir:'node_modules/.vite-coding-mentor', server: { host: '127.0.0.1', port: 5188, strictPort: true },
  plugins: [{
    name: 'mentor-regression-fixture', enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('/AssessmentConsentGate')) return '\0test-consent'
      if (id === '/mentor-test.jsx') return '\0mentor-test.jsx'
    },
    async load(id) {
      if (id === '\0test-consent') return `import React from 'react'; export default function Consent({onConsented,attemptId,quiz}) { return React.createElement('button',{onClick:()=>onConsented(attemptId,quiz)},'Start test fixture'); }`
      if (id === '\0mentor-test.jsx') return (await transformWithEsbuild(entry, 'mentor-test.jsx', { loader: 'jsx' })).code
    },
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        // Serve Monaco's classic workers unchanged by Vite's module transforms.
        if (req.url.startsWith('/node_modules/monaco-editor/min/')) {
          const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]))
          const base = path.resolve(root, 'node_modules/monaco-editor/min')
          if (!file.startsWith(base + path.sep)) return next()
          try {
            const data = await readFile(file)
            res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream')
            res.end(data)
          } catch { next() }
          return
        }
        if (req.url.split('?')[0] !== '/mentor-test') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(await s.transformIndexHtml('/mentor-test', '<html><body style="margin:0"><div id="root"></div><script type="module" src="/mentor-test.jsx"></script></body></html>'))
      })
    },
  }, react()],
})
await server.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    let fullscreen = true
    Object.defineProperty(document, 'fullscreenElement', { get: () => fullscreen ? document.documentElement : null })
    window.setFixtureFullscreen = value => { fullscreen = value; document.dispatchEvent(new Event('fullscreenchange')) }
    Element.prototype.requestFullscreen = async () => window.setFixtureFullscreen(true)
    Document.prototype.exitFullscreen = async () => window.setFixtureFullscreen(false)
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('console', msg => { if (msg.type() === 'error') console.error('Browser console:', msg.text()) })
  page.on('requestfailed', req => { if (!req.url().includes('socket.io')) console.error('Request failed:',req.url(),req.failure()?.errorText) })
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message) })
  const usage = {}, calls = [], runs = [], submissions = [], browserEvents = new Map()
  let mode = 'success', pending = null
  await page.route('**/socket.io/**', route => route.abort())
  const problems = [11,12].map((id, i) => ({ id, title: `Problem ${i+1}`, description: 'Read an integer and determine whether it is even or odd.', programmingLanguage: 'javascript', starterCode: '// Write your code here', sampleInput: '4', sampleOutput: 'Even', testCases: [{ input: '4', expectedOutput: 'Even', isHidden: false }] }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/events')) {
      const body = route.request().postDataJSON()
      if (body.metadata?.browserIncidentId) browserEvents.set(body.idempotencyKey, body)
      return reply({success:true,data:{success:true,event:body,browserSwitchCount:browserEvents.size}})
    }
    if (path.includes('/coding/assessments/')) return reply({ assessment: { id:2, title:'Mentor regression', timeLimit:60, problems } })
    if (path.includes('/assist/status/')) {
      const id = path.split('/').at(-1)
      // Deliberately emulate the old quota payload: it must be reporting only.
      return reply({ enabled:true, used:usage[id] || 0, limit:1, remaining:0, unlimited:false })
    }
    if (path.endsWith('/participant/assist')) {
      const body = route.request().postDataJSON()
      calls.push(body)
      assert.equal(route.request().headers()['x-assessment-session'], 'test-session')
      const finish = () => {
        usage[body.problemId] = (usage[body.problemId] || 0) + 1
        return reply({ response:`Guidance ${body.problemId}/${usage[body.problemId]}: Think about the rule that connects the input to the requested result.`, usageUsed:usage[body.problemId], usageLimit:1, unlimited:false, remaining:0 })
      }
      if (mode === 'failure') return reply({ error:'Simulated API failure' }, 500)
      if (mode === 'database') return reply({ error:'column "possible_leak_detected" of relation "coding_ai_help" does not exist' }, 500)
      if (mode === 'malformed') return route.fulfill({ contentType:'text/plain', body:'bad json' })
      if (mode === 'network') return route.abort('failed')
      if (mode === 'held') { pending = finish; return }
      return finish()
    }
    if (path.endsWith('/participant/run')) {
      runs.push(route.request().postDataJSON())
      return reply({ run:{status:'ACCEPTED',sampleResults:[{input:'4',expectedOutput:'Even',actualOutput:'Even',passed:true}]} })
    }
    if (path.endsWith('/participant/submit-code')) {
      submissions.push(route.request().postDataJSON())
      return reply({ submission:{id:99,status:'ACCEPTED',passedTestCases:1,totalTestCases:1,score:100,results:[]} })
    }
    return reply({success:true,data:{},events:[]})
  })
  await page.goto('http://127.0.0.1:5188/mentor-test')
  await page.getByRole('button',{name:'Start test fixture'}).click()
  const input = page.getByRole('textbox',{name:'Ask a doubt... (Mentor only gives hints)'})
  const timer = page.getByText(/^\d\d:\d\d$/).first()
  const initialTime = await timer.textContent()
  const send = page.getByRole('button',{name:'Send question to AI Mentor'})
  const waitIdle = () => page.waitForFunction(() => !document.body.textContent.includes('Thinking it through with you...'))
  const checkInput = async () => {
    await input.scrollIntoViewIfNeeded()
    const state = await input.evaluate(el => {
      const r = el.getBoundingClientRect()
      return {disabled:el.disabled,readOnly:el.readOnly,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === el}
    })
    assert.deepEqual(state,{disabled:false,readOnly:false,hit:true})
  }
  const prompts = ['Can you explain what this problem is asking?', 'Can you give me a hint?', 'I wrote this code but it gives an error.', 'Can you explain the error?', ...Array.from({length:6},(_,i)=>`Follow-up question ${i+5}`)]
  await page.waitForFunction(async () => {
    const { default: client } = await import('/src/proctoring/engine/MonitoringEngineClient.js')
    return client.isMonitoringActive && client.isTestActive && client.sessionId === 'test-monitoring'
  })
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => window.setFixtureFullscreen(false))
    await page.getByRole('heading', { name: `Security Warning (${i})`, exact: true }).waitFor()
    await page.getByRole('button', { name: 'Return to fullscreen' }).click()
    await page.getByRole('heading', { name: `Security Warning (${i})`, exact: true }).waitFor({ state: 'detached' })
    await checkInput()
  }
  const pausedOnBlur = await page.evaluate(async () => {
    const { default: client } = await import('/src/proctoring/engine/MonitoringEngineClient.js')
    window.dispatchEvent(new Event('blur'))
    const paused = client.isPaused
    window.dispatchEvent(new Event('focus'))
    return paused
  })
  assert.equal(pausedOnBlur, false)
  assert.equal(await page.getByRole('button', { name: 'Submit Assessment', exact: true }).isEnabled(), true)
  console.log('PASS: real Coding page survives four fullscreen exits and keeps monitoring active on blur')
  for (let i=0;i<10;i++) {
    await checkInput()
    await input.fill(prompts[i]); await send.click()
    if (i===0) await page.getByRole('button',{name:'Continue with AI Mentor',exact:true}).click()
    await page.getByText(`Guidance 11/${i+1}:`,{exact:false}).waitFor()
    await waitIdle()
    assert.equal(await input.evaluate(el=>document.activeElement===el),true)
  }
  assert.equal(calls.length,10)
  assert.equal(await page.getByLabel('Copy mentor reply').count(),10)
  console.log('PASS: ten consecutive sends, exact prompt sequence, enabled/writable/focused input, one request and reply per send')

  for (const failure of ['failure','database','malformed','network']) {
    mode=failure; await input.fill(`Test ${failure}`); await send.click(); await waitIdle(); await checkInput()
    mode='success'; await input.fill(`Recover ${failure}`); await send.click(); await waitIdle(); await checkInput()
  }
  console.log('PASS: HTTP 500, missing PostgreSQL column, malformed JSON, and network failure recover')

  mode='held'; await input.fill('Delayed question on first problem'); await send.click()
  await page.waitForFunction(()=>document.body.textContent.includes('Thinking it through with you...'))
  const before=calls.length
  await input.fill('Draft during sending'); await input.press('Enter')
  assert.equal(calls.length,before)
  // The actual question navigation buttons include their question number.
  await page.getByRole('button',{name:/^Q2/}).click()
  await checkInput(); await input.fill('Question two draft')
  await pending(); pending=null; mode='success'
  assert.equal(await input.inputValue(),'Question two draft')
  assert.equal(await page.getByText('Delayed question on first problem',{exact:true}).count(),0)
  await send.click(); await waitIdle()
  assert.equal(calls.at(-1).problemId,12)
  await page.getByRole('button',{name:/^Q1/}).click()
  assert.equal(await input.inputValue(),'Draft during sending')
  await checkInput()
  console.log('PASS: in-flight duplicate prevention, writable draft, question-scoped replies, usage and drafts')

  await page.getByRole('button',{name:'Give me a hint',exact:true}).click(); await waitIdle(); await checkInput()
  await page.getByRole('button',{name:'Close AI Mentor',exact:true}).click()
  await page.getByRole('button',{name:'Open AI Mentor',exact:true}).click()
  assert.equal(await input.inputValue(),'Draft during sending')
  await page.getByTitle('Minimize Widget',{exact:true}).click()
  await checkInput()
  await page.getByTitle('Click to expand monitoring widget',{exact:true}).click()
  await checkInput()
  console.log('PASS: quick action, close/reopen persistence, minimize/expand monitoring and input hit-testing')

  // Use the real 20-second request timeout rather than modifying production timers.
  mode='held'; await input.fill('Timeout test'); await send.click()
  await page.getByText('The mentor took too long to respond. Please try your question again.',{exact:true}).waitFor({timeout:25000})
  await checkInput(); pending=null; mode='success'
  await input.fill('After timeout'); await send.click(); await waitIdle()
  console.log('PASS: real request timeout clears sending and permits retry')
  assert.notEqual(await timer.textContent(),initialTime)
  await page.waitForFunction(() => document.querySelector('.dual-proctor-video')?.readyState >= 2)
  console.log('PASS: assessment timer advances and simulated webcam renders in the real monitoring widget')

  // Genuine editor focus must survive completion of an outstanding mentor request.
  mode='held'; await input.fill('While I edit'); await send.click()
  const editor = page.locator('.monaco-editor').first()
  await editor.locator('.view-lines').click({position:{x:100,y:10}})
  await page.keyboard.type('// editor still accepts typing')
  await pending(); pending=null; mode='success'; await waitIdle()
  assert.equal(await editor.evaluate(el=>el.contains(document.activeElement)),true)
  await page.getByRole('button',{name:'Custom Input',exact:true}).click()
  const custom = page.getByPlaceholder(/custom input|Enter input/i)
  await custom.fill('8')
  await page.getByRole('button',{name:'Run Code',exact:true}).click(); await page.waitForFunction(()=>!document.body.textContent.includes('Running sample tests...'))
  assert.equal(runs.at(-1).input,'8')
  assert.match(runs.at(-1).code,/editor still accepts typing/)
  await page.getByRole('button',{name:'Test Cases',exact:true}).click()
  await page.getByRole('button',{name:'Submit Code',exact:true}).click()
  await page.waitForFunction(()=>!document.body.textContent.includes('Evaluating...'))
  assert.equal(submissions.length,1)
  assert.equal(await page.getByRole('button',{name:/Submit Assessment/}).isEnabled(),true)
  console.log('PASS: Monaco typing/focus, Custom Input, Test Cases, Run Code, Submit Code, Submit Assessment availability')

  await page.reload(); await page.getByRole('button',{name:'Start test fixture'}).click(); await checkInput()
  await input.fill('After refresh'); await send.click(); await waitIdle(); await checkInput()
  assert.equal(await page.getByRole('button',{name:'Continue with AI Mentor',exact:true}).count(),0)
  console.log('PASS: refresh reloads API usage, keeps acknowledgement; visible chat resets as designed')
  for (const width of [1280,1024,600]) {
    await page.setViewportSize({width,height:1000}); await checkInput()
  }
  assert.deepEqual(errors,[])
  console.log('PASS: desktop/narrow viewport hit-testing; no uncaught browser errors')
  await page.setViewportSize({width:1440,height:1000})
  await checkInput()
  if (process.env.MENTOR_TEST_ARTIFACT_DIR) {
    await mkdir(process.env.MENTOR_TEST_ARTIFACT_DIR,{recursive:true})
    await page.screenshot({path:path.join(process.env.MENTOR_TEST_ARTIFACT_DIR,'coding-mentor.png'),fullPage:true})
  }
  await page.getByRole('button',{name:'Submit Assessment',exact:true}).click()
  const submissionRequest = page.waitForRequest(req => new URL(req.url()).pathname === '/api/coding/participant/submit/1')
  const finalAuditRequest = page.waitForRequest(req => new URL(req.url()).pathname === '/api/monitoring/sessions/test-monitoring/end')
  await page.getByRole('button',{name:'Yes, Submit Assessment',exact:true}).click()
  const submitted = (await submissionRequest).postDataJSON()
  assert.equal(submitted.submissions.length,2)
  assert.ok((await finalAuditRequest).postDataJSON().actualTestDurationSeconds > 0)
  assert.equal(browserEvents.size,4,'The four Coding switches must reach the shared API exactly once')
  console.log('PASS: Submit Assessment confirms and sends both questions to the API')
  for (const invalid of ['number','object']) {
    await page.goto(`http://127.0.0.1:5188/mentor-test?widget=${invalid}`)
    await page.waitForFunction(() => {
      const video = document.querySelector('.dual-proctor-video')
      return video?.srcObject instanceof MediaStream && video.readyState >= 2
    })
  }
  assert.deepEqual(errors,[])
  console.log('PASS: invalid numeric/object stream props fall back to a real webcam MediaStream without crashing')
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0]
  if (page) console.error((await page.locator('body').innerText()).slice(0, 2500))
  throw error
} finally {
  await browser?.close()
  await server.close()
}
