import { useState } from 'react'
import InterviewShell from './InterviewShell'
import VideoTile from '../VideoTile'
import MobileFeedTile from './MobileFeedTile'
import QRPairing from '../QRPairing'

export default function GroupDiscussionRoom({interviewData,user,isInterviewer,localStream,peers,remoteStreams,socket,
  mobileFrames,mobileEvidence,qrPayload,onRefreshQr,onStart,started,elapsed,formatTime,
  handleEndInterview,handleLeaveInterview,isMuted,onToggleMute,isCameraOff,onToggleCamera,chatMessages,onSendMessage,notice,aiStatus,candidateMonitoring={},isRecording,onToggleRecording}) {
  const [showQr,setShowQr]=useState(false),[message,setMessage]=useState('')
  const members=interviewData.participants||[]
  const monitorMembers=isInterviewer?members:members.filter(p=>String(p.user_id)===String(user.id))
  const [reconnectError,setReconnectError]=useState('')
  const reconnect=async()=>{try{await onRefreshQr();setShowQr(true);setReconnectError('')}catch(e){setReconnectError(e.message)}}
  return <InterviewShell title={interviewData.title||'Group Discussion'} subtitle="Group Discussion" statusBadge={started?'IN_PROGRESS':'WAITING'}
    headerRight={<button className="reg-admin-btn reg-admin-btn--danger" onClick={isInterviewer?handleEndInterview:handleLeaveInterview}>{isInterviewer?'End discussion':'Leave discussion'}</button>}>
    <div className="reg-admin-table-wrap" style={{padding:16,marginBottom:16}}>
      <strong>{formatTime(Math.max(0,(interviewData.durationMinutes||60)*60-elapsed))}</strong> · {members.length} invited candidates
      <button className="reg-admin-btn" onClick={onToggleMute}>{isMuted?'Unmute':'Mute'}</button>
      <button className="reg-admin-btn" onClick={onToggleCamera}>{isCameraOff?'Enable camera':'Disable camera'}</button>
      {isInterviewer&&interviewData.record_interview&&<button className="reg-admin-btn" onClick={onToggleRecording}>{isRecording?'Stop recording':'Record interviewer camera'}</button>}
      {isInterviewer&&!started&&<button className="reg-admin-btn reg-admin-btn--primary" onClick={onStart}>Start discussion</button>}
      {!started&&<p>The interviewer starts when at least two candidates have connected their required cameras. Others may join later.</p>}
      {notice&&<p role="status">{notice}</p>}{reconnectError&&<p role="alert">{reconnectError}</p>}
    </div>
    {!isInterviewer&&started&&aiStatus?.faceDetected===false&&<p role="alert" style={{padding:12,background:'#fffbeb'}}>Your face is not visible in the laptop camera. Adjust your position; the discussion continues.</p>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
      <div style={{minHeight:220}}><VideoTile stream={localStream} label={`${user.name||'You'} (you)`} isLocal /></div>
      {peers.filter(p=>p.deviceType!=='MOBILE'&&p.socketId!==socket?.id).map(p=><div key={p.socketId} style={{minHeight:220}}>
        <VideoTile stream={remoteStreams[p.socketId]} label={p.userName||'Participant'} />
      </div>)}
    </div>
    <div className="reg-admin-table-wrap" style={{padding:16,margin:'16px 0'}}>
      <h3>Candidates</h3>
      {members.map(p=>{const monitoring=candidateMonitoring[p.user_id];return <p key={p.user_id}>{p.user?.name||`Candidate ${p.user_id}`} · {String(p.user_id)===String(user.id)||peers.some(peer=>String(peer.userId)===String(p.user_id)&&peer.deviceType!=='MOBILE')?'Connected':'Not connected'}{isInterviewer&&started&&<span> · {monitoring&&Date.now()-monitoring.receivedAt<10000?(monitoring.cameraActive?(monitoring.faceDetected?'Face visible':'Face not detected — adjust camera position'):'Laptop camera unavailable'):'Waiting for laptop monitoring'}</span>}</p>})}
    </div>
    {interviewData.require_mobile_pairing!==false&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
      {monitorMembers.map(p=>{const mobile=peers.find(peer=>peer.deviceType==='MOBILE'&&String(peer.userId)===String(p.user_id));return <MobileFeedTile key={p.user_id} name={p.user?.name||'Candidate'} stream={mobile&&remoteStreams[mobile.socketId]}
        frame={mobileFrames[p.user_id]} evidence={mobileEvidence[p.user_id]} onReconnect={!isInterviewer?reconnect:null}/>})}
    </div>}
    {showQr&&!isInterviewer&&<div className="reg-admin-table-wrap" style={{padding:16,marginTop:16,maxWidth:360}}><p>Reconnect to this discussion. The session continues.</p><QRPairing qrPayload={qrPayload} onRefresh={onRefreshQr}/><button className="reg-admin-btn" onClick={()=>setShowQr(false)}>Close QR</button></div>}
    <div className="reg-admin-table-wrap" style={{padding:16,marginTop:16}}><h3>Discussion chat</h3>
      <div style={{maxHeight:200,overflow:'auto'}}>{chatMessages.map((m,i)=><p key={m.id||i}><strong>{m.fromUserName}: </strong>{m.message}</p>)}</div>
      <form onSubmit={event=>{event.preventDefault();if(message.trim()){onSendMessage(message.trim());setMessage('')}}}>
        <input aria-label="Discussion message" value={message} maxLength={500} onChange={event=>setMessage(event.target.value)} className="reg-admin-search-input"/>
        <button className="reg-admin-btn" type="submit">Send</button>
      </form>
    </div>
  </InterviewShell>
}
