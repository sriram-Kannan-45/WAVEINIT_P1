/**
 * PairMobileStep Component (Step 2: Pair Mobile Device)
 * Dedicated, centered mobile QR pairing screen.
 * For Participant: Pairing is MANDATORY (no skip). Continue enables only once paired.
 */
import { ArrowRight, CheckCircle2, ArrowLeft, Smartphone, AlertTriangle } from 'lucide-react'
import InterviewShell from './InterviewShell'
import QRPairing from '../QRPairing'
import { useState } from 'react'
import MobileFeedTile from './MobileFeedTile'

export default function PairMobileStep({
  interviewId,
  interviewData,
  isInterviewer,
  qrPayload,
  onRefreshQr,
  isMobileConnected,
  onContinue,
  onBack,
  isBusy,
  mobileStream, mobileFrame, mobileEvidence,
}) {
  const [videoLive,setVideoLive]=useState(false)
  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'Scheduled'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Mobile Camera Pairing`}
      step={isInterviewer ? 'Step 2 of 2' : 'Step 2 of 4'}
      headerRight={
        onBack && (
          <button onClick={onBack} className="reg-admin-btn reg-admin-btn--secondary">
            Back
          </button>
        )
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 560, margin: '0 auto', background: '#fff' }}>
        {/* Card Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', width: 36, height: 36 }}>
            <Smartphone size={18} color="#16A34A" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Step 2: Pair Mobile Camera
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
              Scan the QR code with your smartphone camera to enable required secondary monitoring.
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: '24px 20px' }}>
          {isInterviewer ? (
            /* Trainer / Interviewer View */
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: isMobileConnected ? '#dcfce7' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                {isMobileConnected ? <CheckCircle2 size={32} color="#16A34A" /> : <Smartphone size={32} color="#64748b" />}
              </div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
                {isMobileConnected ? 'Participant Mobile Camera Connected' : 'Participant Mobile Pairing'}
              </h4>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 auto 20px', maxWidth: 380 }}>
                {isMobileConnected
                  ? "The participant's mobile companion camera is live and streaming."
                  : "The candidate will scan their QR code to pair their phone as a secondary camera."}
              </p>
            </div>
          ) : (
            /* Candidate View */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {isMobileConnected ? (
                <div style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  background: '#f0fdf4',
                  borderRadius: 12,
                  border: '1px solid #bbf7d0',
                  width: '100%',
                  marginBottom: 16,
                }}>
                  <CheckCircle2 size={40} color="#16A34A" style={{ margin: '0 auto 10px' }} />
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#15803D', margin: '0 0 4px' }}>
                    Mobile Camera Paired Successfully!
                  </h4>
                  <p style={{ fontSize: 12, color: '#166534', margin: 0 }}>
                    Your phone is connected as a secondary proctoring camera.
                  </p>
                </div>
              ) : (
                <div style={{ width: '100%', maxWidth: 360, margin: '0 auto 16px' }}>
                  <QRPairing
                    qrPayload={qrPayload}
                    onRefresh={onRefreshQr}
                    expiresAt={qrPayload?.expiresAt}
                    tokenStatus="○ Waiting for mobile scan..."
                  />
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: '#fef3c7',
                    border: '1px solid #fcd34d',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#92400e',
                    marginTop: 10,
                  }}>
                    <AlertTriangle size={14} className="flex-shrink-0" />
                    <span>Mobile camera pairing is mandatory before entering the interview.</span>
                  </div>
                </div>
              )}

              <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: '0 0 12px' }}>
                Position your phone so both you and your laptop are visible.
              </p>
              {isMobileConnected&&<div style={{width:'100%'}}><MobileFeedTile stream={mobileStream} frame={mobileFrame} evidence={mobileEvidence} name="Your camera" onStatusChange={status=>setVideoLive(status==='live')}/></div>}
            </div>
          )}

          {/* Action Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={onBack}
              className="reg-admin-btn reg-admin-btn--secondary"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={15} /> Back
            </button>

            <button
              onClick={onContinue}
              disabled={isBusy || (!isInterviewer && (!isMobileConnected || !videoLive))}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{
                padding: '10px 24px',
                fontSize: 13,
                fontWeight: 600,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: (!isInterviewer && !isMobileConnected) ? 0.5 : 1,
                cursor: (!isInterviewer && !isMobileConnected) ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{isMobileConnected ? 'Continue' : isInterviewer ? 'Next' : 'Waiting for Mobile Scan...'}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
