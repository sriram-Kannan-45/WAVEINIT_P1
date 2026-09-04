import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createServer,transformWithEsbuild} from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
const {chromium}=createRequire(import.meta.url)('playwright')
const root=fileURLToPath(new URL('..',import.meta.url))
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Mentor from '/src/components/ai-mentor/AssessmentAIMentor.jsx';
function Fixture(){const[id,setId]=useState(1);const type=new URLSearchParams(location.search).get('type')||'QUIZ';return <><button onClick={()=>setId(id===1?2:1)}>Switch question</button><div style={{width:440,height:760}}><Mentor assessmentType={type} user={{id:7,token:'fixture-token'}} attemptId={9} sessionToken="fixture-session" question={{id,questionText:'Travel question '+id}} problem={{id,title:'Problem '+id}} questionState={{code:'current code '+id,language:'python',output:'current error '+id}}/></div></>};createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
const server=await createServer({root,configFile:false,cacheDir:'node_modules/.vite-assessment-mentor',server:{host:'127.0.0.1',port:5193,strictPort:true},plugins:[{
 name:'mentor-fixture',resolveId(id){if(id==='/mentor-fixture.jsx')return '\0mentor-fixture.jsx'},
 async load(id){if(id==='\0mentor-fixture.jsx')return(await transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx'})).code},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/mentor-fixture?'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/mentor-fixture','<html><body><div id="root"></div><script type="module" src="/mentor-fixture.jsx"></script></body></html>'))})}
},react()]})
await server.listen();let browser
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(10000)
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.addInitScript(()=>localStorage.setItem('ai_mentor_acknowledged_9','true'))
 for(const type of ['QUIZ','CODING']){
   let held,mode='hold',used=0;const requests=[]
   await page.unrouteAll();await page.route('**/api/**',async route=>{
    const req=route.request(),pathname=new URL(req.url()).pathname;if(!pathname.startsWith('/api/'))return route.continue()
    if(req.method()==='GET')return route.fulfill({json:{enabled:true,limit:-1,unlimited:true,remaining:-1,used}})
    const body=req.postDataJSON();requests.push(body);assert.equal(req.headers()['x-assessment-session'],'fixture-session')
    if(mode==='hold'){held=route;return}
    if(mode==='fail'){mode='ok';return route.fulfill({status:500,json:{error:'Temporary mentor failure'}})}
    if(mode==='malformed'){mode='ok';return route.fulfill({status:200,json:{success:true}})}
    used++;return route.fulfill({json:{response:'Safe reply for question '+(body.questionId||body.problemId),used,usageUsed:used,unlimited:true,limit:-1}})
   })
   await page.goto('http://127.0.0.1:5193/mentor-fixture?type='+type)
   const input=page.locator('textarea');const send=page.getByRole('button',{name:'Send question to AI Mentor'})
   await input.fill('Help with question one');await send.click();await page.waitForFunction(()=>document.querySelector('textarea').value==='')
   await page.getByRole('button',{name:'Switch question'}).click();assert.equal(await page.getByText('Help with question one',{exact:true}).count(),0)
   assert.equal(await input.isEnabled(),true)
   while(!held)await new Promise(r=>setTimeout(r,20))
   await held.fulfill({json:{response:'Delayed reply for question one',used:1,usageUsed:1,unlimited:true,limit:-1}});mode='ok'
   await input.fill('Help with question two');await send.click();await page.getByText('Safe reply for question 2',{exact:true}).waitFor()
   assert.equal(await page.getByText('Delayed reply for question one',{exact:true}).count(),0)
   await page.getByRole('button',{name:'Switch question'}).click();await page.getByText('Delayed reply for question one',{exact:true}).waitFor()
   assert.equal(await page.getByText('Safe reply for question 2',{exact:true}).count(),0)
   for(const failure of ['fail','malformed']){
    mode=failure;await input.fill('Retry question');await send.click();await page.getByText(failure==='fail'?'Temporary mentor failure':'The mentor returned an empty reply. Please retry.',{exact:true}).waitFor()
    assert.equal(await input.isEnabled(),true);await input.fill('Try again');await send.click();await page.getByText('Safe reply for question 1',{exact:true}).first().waitFor()
   }
   assert.equal(requests[0].questionId||requests[0].problemId,1);assert.equal(requests[1].questionId||requests[1].problemId,2)
   if(type==='CODING'){assert.equal(requests[1].code,'current code 2');assert.equal(requests[1].errorContext,'current error 2')}
   console.log(`PASS ${type}: current context, session header, delayed-reply isolation, preserved question history, server/empty-response recovery and retry`)
 }
 assert.deepEqual(errors,[])
}catch(error){console.error(error);process.exitCode=1}finally{await browser?.close();server.httpServer?.closeAllConnections();await server.close()}
