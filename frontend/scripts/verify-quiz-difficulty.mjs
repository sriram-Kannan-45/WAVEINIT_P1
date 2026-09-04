// Exercise the actual trainer generation modal; API persistence is verified by
// backend/scripts/verify-quiz-difficulty-database.js against PostgreSQL.
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
import {MemoryRouter} from 'react-router-dom';
import {AIQuizGeneratorModal} from '/src/components/trainer/CourseQuizzesTab.jsx';
import {ToastProvider} from '/src/components/Toast.jsx';
window.generated=0;window.fixtureCloseCount=0;
createRoot(document.getElementById('root')).render(<MemoryRouter><ToastProvider><AIQuizGeneratorModal user={{token:'fixture'}} courseId={2} onGenerated={()=>window.generated++} onClose={()=>window.fixtureCloseCount++}/></ToastProvider></MemoryRouter>);
`
const server = await createServer({ root, configFile:false, cacheDir:'node_modules/.vite-quiz-difficulty', server:{host:'127.0.0.1',port:5192,strictPort:true},plugins:[{
  name:'quiz-difficulty-fixture',enforce:'pre',
  resolveId(id) { if(id==='/difficulty-fixture.jsx') return '\0difficulty-fixture.jsx' },
  async load(id) { if(id==='\0difficulty-fixture.jsx') return (await transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx'})).code },
  transform(code,id) { if(id.replaceAll('\\','/').endsWith('/src/components/trainer/CourseQuizzesTab.jsx')) return `${code}\nexport {AIQuizGeneratorModal};` },
  configureServer(s) {s.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/difficulty-fixture')return next()
    res.setHeader('Content-Type','text/html')
    res.end(await s.transformIndexHtml('/difficulty-fixture','<html><body><div id="root"></div><script type="module" src="/difficulty-fixture.jsx"></script></body></html>'))
  })},
},react()] })
await server.listen()
let browser
try {
  browser=await chromium.launch({headless:true})
  const page=await browser.newPage({viewport:{width:1280,height:1000}})
  const errors=[],requests=[]
  let failNext=false
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
  page.on('console',message=>{if(message.type()==='error')console.error(message.text())})
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname
    if(!path.startsWith('/api/'))return route.continue()
    if(!path.includes('generate-from-'))return route.fulfill({json:{success:true}})
    const body=request.postData()
    const difficulty=path.endsWith('generate-from-prompt')?JSON.parse(body).difficulty:body.match(/name="difficulty"\r\n\r\n([^\r]+)/)?.[1]
    requests.push({path,difficulty})
    const failed=failNext;failNext=false
    return route.fulfill({status:failed?500:201,json:failed?{error:'Injected save failure'}:{success:true,quiz:{id:77,difficulty}}})
  })
  for(const mode of ['prompt','document'])for(const [label,value] of [['Easy','EASY'],['Medium','MEDIUM'],['Hard','HARD']]){
    await page.goto('http://127.0.0.1:5192/difficulty-fixture')
    if(mode==='document'){
      await page.getByRole('button',{name:'Document / File Upload'}).click()
      await page.locator('input[type=file]').setInputFiles({name:'react.txt',mimeType:'text/plain',buffer:Buffer.from('React state and hooks')})
    }else await page.locator('textarea').fill('React state and hooks')
    await page.getByRole('combobox').selectOption({label})
    assert.equal(await page.getByRole('combobox').inputValue(),value)
    await page.locator('button[type=submit]').click()
    await page.waitForFunction(()=>window.generated===1&&window.fixtureCloseCount===1)
    assert.equal(requests.at(-1).difficulty,value)
    console.log(`PASS browser ${mode}: ${label} label sends ${value} and completes successfully`)
  }
  await page.goto('http://127.0.0.1:5192/difficulty-fixture')
  await page.locator('textarea').fill('React state and hooks')
  failNext=true
  await page.locator('button[type=submit]').click()
  await page.getByText('Injected save failure',{exact:true}).waitFor()
  assert.equal(await page.locator('textarea').inputValue(),'React state and hooks')
  await page.getByRole('combobox').selectOption('HARD')
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(()=>window.generated===1)
  assert.equal(requests.at(-1).difficulty,'HARD')
  assert.deepEqual(errors,[])
  console.log('PASS browser: server error restores the form and a retry succeeds without reload')
} finally {await browser?.close();await server.close()}
