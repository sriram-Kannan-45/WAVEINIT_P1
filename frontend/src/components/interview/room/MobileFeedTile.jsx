import { useState, useEffect, useRef } from 'react'
import { Smartphone } from 'lucide-react'
import { mobileCameraStatus } from '../../../utils/mobileCameraStatus.mjs'

export default function MobileFeedTile({ stream, name='Participant', onStatusChange, frame=null, evidence=null, onReconnect }) {
  const videoRef=useRef(null), lastVideoAt=useRef(0), decoded=useRef(0), reported=useRef(null)
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{
    const video=videoRef.current
    if(video) { video.srcObject=stream||null; if(stream) video.play().catch(()=>{}) }
    lastVideoAt.current=0;decoded.current=0
  },[stream])
  useEffect(()=>{
    const timer=setInterval(()=>{
      const video=videoRef.current, frames=video?.getVideoPlaybackQuality?.().totalVideoFrames||0
      if(video && !video.paused && frames>decoded.current) lastVideoAt.current=Date.now()
      decoded.current=frames;setNow(Date.now())
    },500)
    return ()=>clearInterval(timer)
  },[])
  const videoLive=now-lastVideoAt.current<8000
  const frameLive=!!frame?.frame && now-Number(frame.timestamp)<8000
  const live=videoLive||frameLive
  const state=mobileCameraStatus({connected:live,evidence,now})
  const health=live?'live':stream?'unavailable':'not-paired'
  useEffect(()=>{ if(reported.current!==health) {reported.current=health;onStatusChange?.(health)} },[health,onStatusChange])
  return <div className="reg-admin-table-wrap" style={{padding:12,background:'#fff'}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:8}}><strong><Smartphone size={13}/> {name} · Mobile</strong><span>{live?'Live':'Disconnected'}</span></div>
    <div style={{position:'relative',aspectRatio:'4/3',background:'#0f172a',borderRadius:8,overflow:'hidden'}}>
      <video ref={videoRef} autoPlay playsInline muted aria-label={`${name} mobile camera`} style={{width:'100%',height:'100%',objectFit:'contain',display:videoLive?'block':'none'}} />
      {!videoLive && frameLive && <img src={frame.frame} alt={`${name} mobile camera`} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
      {!live && <p style={{padding:16,color:'#cbd5e1'}}>Waiting for mobile video</p>}
    </div>
    <div role="status" style={{marginTop:8,padding:8,borderRadius:8,background:state.kind==='ready'?'#f0fdf4':'#fffbeb',fontSize:12}}>
      <strong>{state.title}</strong><p style={{margin:'4px 0'}}>{state.message.replace('Your test continues.','Your session stays open.')}</p>
      {!live && onReconnect && <button type="button" className="reg-admin-btn" onClick={onReconnect}>Reconnect mobile camera</button>}
    </div>
  </div>
}
