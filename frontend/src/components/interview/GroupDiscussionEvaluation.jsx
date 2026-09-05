import { useEffect, useState } from 'react'
import interviewService from '../../services/interviewService'
import { API_BASE, getAuthHeaders } from '../../api/api'
import { Button, Card, CardBody, Spinner } from '../ui'
import PageHeader from '../ui/PageHeader'

function CandidateEvaluation({ participant, criteria, editable, onSave }) {
  const [form,setForm]=useState(participant.evaluation||{scores:{},decision:'ON_HOLD',comments:'',summary:'',isPublished:false})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const save=async event=>{event.preventDefault();setBusy(true);setError('');try{await onSave(participant.userId,form)}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <Card><CardBody><h3>{participant.name}</h3><p>{participant.email} · {Math.round(participant.participationSeconds/60)} minutes present · {participant.status}</p>
    {participant.monitoring&&<p>Monitoring risk: {participant.monitoring.riskLevel} · Score: {participant.monitoring.score} · Events: {participant.monitoring.totalEvents}</p>}
    {participant.monitoring?.scoringBreakdown&&<details><summary>Monitoring summary</summary>{Object.entries(participant.monitoring.scoringBreakdown).filter(([,value])=>typeof value==='object').map(([name,item])=><p key={name}>{name}: {item.score}/{item.max}{item.count!=null?` · ${item.count} events`:''}</p>)}</details>}
    {!editable&&!participant.evaluation?<p>Evaluation pending publication.</p>:<form onSubmit={save} style={{display:'grid',gap:12}}>
      {criteria.map(c=><label key={c.id} style={{display:'flex',justifyContent:'space-between',gap:12}}>{c.name} (maximum {c.maxScore}, weight {c.weight})
        <input aria-label={`${participant.name}: ${c.name}`} type="number" min="0" max={c.maxScore} step="0.1" required disabled={!editable} value={form.scores[c.id]??''} onChange={e=>setForm(f=>({...f,scores:{...f.scores,[c.id]:e.target.value===''?'':Number(e.target.value)}}))} style={{width:90}}/>
      </label>)}
      <label>Final result <select disabled={!editable} value={form.decision} onChange={e=>setForm(f=>({...f,decision:e.target.value}))}><option value="SELECTED">Selected</option><option value="REJECTED">Rejected</option><option value="ON_HOLD">On hold</option></select></label>
      <label>Participation and performance summary<textarea rows={3} maxLength={5000} style={{display:'block',width:'100%'}} disabled={!editable} value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))}/></label>
      <label>Interviewer comments<textarea rows={3} maxLength={5000} style={{display:'block',width:'100%'}} disabled={!editable} value={form.comments} onChange={e=>setForm(f=>({...f,comments:e.target.value}))}/></label>
      {participant.evaluation&&<strong>Overall score: {participant.evaluation.overallScore}% · {participant.evaluation.isPublished?'Published':'Draft'}</strong>}
      {editable&&<><label><input type="checkbox" checked={form.isPublished} onChange={e=>setForm(f=>({...f,isPublished:e.target.checked}))}/> Publish this candidate’s result</label><Button type="submit" variant="primary" disabled={busy}>{busy?'Saving…':'Save evaluation'}</Button></>}
      {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    </form>}
  </CardBody></Card>
}

export default function GroupDiscussionEvaluation({interviewId}) {
  const [report,setReport]=useState(null),[error,setError]=useState('')
  useEffect(()=>{let active=true;interviewService.report(interviewId).then(data=>{if(active)setReport(data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[interviewId])
  const save=async(userId,form)=>{await interviewService.evaluateParticipant(interviewId,userId,form);setReport(await interviewService.report(interviewId))}
  const download=async()=>{try{const response=await fetch(`${API_BASE}/interviews/${interviewId}/report.xlsx`,{headers:getAuthHeaders()});if(!response.ok)throw new Error('Could not download the report.');const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`discussion-${interviewId}-report.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e.message)}}
  return <div><PageHeader title="Group Discussion results" subtitle={report?.interview.title} backLink="/interviews"/>
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {!report&&!error?<Spinner text="Loading results…"/>:report&&<div style={{display:'grid',gap:20,maxWidth:1000}}>
      <Card><CardBody><p>{report.interview.status} · Session duration: {Math.round((report.session?.durationSeconds||0)/60)} minutes · {report.participants.length} candidate results</p><p>{report.interview.description}</p><Button onClick={download}>Download Excel report</Button>{report.canEvaluate&&report.interview.status!=='COMPLETED'&&<p>End the discussion to evaluate and publish individual results.</p>}</CardBody></Card>
      {report.participants.map(p=><CandidateEvaluation key={`${p.userId}:${p.evaluation?.decidedAt||'pending'}`} participant={p} criteria={report.criteria} editable={report.canEvaluate&&report.interview.status==='COMPLETED'} onSave={save}/>)}
    </div>}
  </div>
}
