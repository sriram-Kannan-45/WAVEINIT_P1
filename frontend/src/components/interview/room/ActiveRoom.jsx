/**
 * ActiveRoom Component (Stage 5: Main Interview Room)
 * Redesigned to match the reference SaaS structure using LMS design system components.
 */
import { useState, useEffect } from 'react'
import InterviewShell from './InterviewShell'
import VideoTile from '../VideoTile'
import QRPairing from '../QRPairing'
import interviewService from '../../../services/interviewService'
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  LogOut,
  Smartphone,
  CheckCircle2,
  Clock,
  User,
  FileText,
  Send,
  AlertCircle,
  QrCode,
} from 'lucide-react'

const defaultFormatTime = (seconds = 0) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0
    ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function ActiveRoom({
  interviewData,
  isInterviewer,
  user,
  localVideoRef,
  mediaState,
  remoteStreams = {},
  peers = [],
  devices = {},
  qrPayload,
  onRefreshQr,
  isMuted,
  onToggleMute,
  isCameraOff,
  onToggleCamera,
  isScreenSharing,
  onToggleScreenShare,
  isRecording,
  onToggleRecording,
  handleEndInterview,
  handleLeaveInterview,
  socket,
  interviewId,
  elapsed = 0,
  formatTime = defaultFormatTime,
  peerConnected,
  connectionStatus,
}) {
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // Fetch initial notes
  useEffect(() => {
    if (interviewId) {
      interviewService.getNotes(interviewId)
        .then(res => {
          if (res?.notes?.length > 0) {
            setNotes(res.notes.map(n => n.note_text).join('\n\n'))
          } else if (res?.note) {
            setNotes(res.note)
          }
        })
        .catch(() => {})
    }
  }, [interviewId])

  const handleSaveNotes = async () => {
    if (!interviewId || !notes.trim()) return
    try {
      setSavingNotes(true)
      await interviewService.createNote(interviewId, { note_text: notes })
    } catch (e) {
      console.error('Failed to save notes:', e)
    } finally {
      setSavingNotes(false)
    }
  }

  const candidateName = interviewData?.candidate?.name || 'Candidate'
  const candidateEmail = interviewData?.candidate?.email || ''
  const interviewerName = interviewData?.interviewer?.name || 'Interviewer'
  const interviewerEmail = interviewData?.interviewer?.email || ''
  const scheduledDate = interviewData?.scheduledAt || interviewData?.scheduled_at
    ? new Date(interviewData.scheduledAt || interviewData.scheduled_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const scheduledTime = interviewData?.scheduledAt || interviewData?.scheduled_at
    ? new Date(interviewData.scheduledAt || interviewData.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'
  const durationMinutes = interviewData?.durationMinutes || interviewData?.duration_minutes || 60

  // Differentiate streams by role and deviceType
  const remoteEntries = Object.entries(remoteStreams || {})

  // Mobile peer & stream (from participant's phone)
  const mobilePeer = peers.find(p => p.deviceType === 'MOBILE')
  const mobileStream = mobilePeer
    ? remoteStreams[mobilePeer.socketId]
    : (remoteEntries.find(([id]) => peers.find(p => p.socketId === id)?.deviceType === 'MOBILE')?.[1] || null)

  // Participant laptop peer & stream (for Trainer view)
  const participantLaptopPeer = peers.find(p => (p.role === 'PARTICIPANT' || p.role === 'CANDIDATE') && p.deviceType !== 'MOBILE')
  const participantLaptopStream = participantLaptopPeer
    ? remoteStreams[participantLaptopPeer.socketId]
    : (isInterviewer ? (remoteEntries.find(([id]) => id !== mobilePeer?.socketId)?.[1] || null) : null)

  // Trainer laptop peer & stream (for Participant view)
  const trainerLaptopPeer = peers.find(p => (p.role === 'TRAINER' || p.role === 'ADMIN') && p.deviceType !== 'MOBILE')
  const trainerLaptopStream = trainerLaptopPeer
    ? remoteStreams[trainerLaptopPeer.socketId]
    : (!isInterviewer ? (remoteEntries.find(([id]) => id !== mobilePeer?.socketId)?.[1] || null) : null)

  // Primary video stage stream:
  // - Trainer sees Participant Laptop Stream
  // - Participant sees Trainer Laptop Stream
  const mainStageStream = isInterviewer
    ? (participantLaptopStream || (remoteEntries.find(([id]) => id !== mobilePeer?.socketId)?.[1] || null))
    : (trainerLaptopStream || (remoteEntries.find(([id]) => id !== mobilePeer?.socketId)?.[1] || null))

  const mainStagePeer = isInterviewer ? participantLaptopPeer : trainerLaptopPeer
  const mainStageLabel = isInterviewer
    ? `${candidateName}'s Laptop Video`
    : `${interviewerName}'s Camera`

  // Screen share detection
  const participantScreenStream = participantLaptopPeer
    ? remoteStreams[`${participantLaptopPeer.socketId}_screen`]
    : null

  const isMobileConnected = !!mobileStream || !!mobilePeer || devices?.mobile
  const isParticipantLaptopConnected = !!participantLaptopStream || !!participantLaptopPeer
  const isTrainerConnected = !!trainerLaptopStream || !!trainerLaptopPeer

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'IN_PROGRESS'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Interview #${interviewId}`}
      status={peerConnected ? 'Live' : 'Waiting status'}
      headerRight={
        <button
          onClick={isInterviewer ? handleEndInterview : handleLeaveInterview}
          className="reg-admin-btn reg-admin-btn--danger"
        >
          <LogOut size={14} />
          {isInterviewer ? 'End Interview' : 'Leave Room'}
        </button>
      }
    >
      {/* 3-Column SaaS Grid */}
      <div className="interview-room-grid">

        {/* LEFT COLUMN: Interview Details & Connection Status */}
        <div className="interview-col-details" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Interview Details Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: '#0f172a', borderBottom: '1px solid #f1f5f9', pb: 8 }}>
              Interview Details
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Candidate</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{candidateName}</div>
                {candidateEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{candidateEmail}</div>}
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Interviewer</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{interviewerName}</div>
                {interviewerEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{interviewerEmail}</div>}
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Type</span>
                <span className="reg-admin-type" style={{ fontSize: 11, fontWeight: 600, display: 'inline-block', marginTop: 2 }}>
                  {interviewData?.type || 'HR'} Interview
                </span>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Date & Time</span>
                <div style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{scheduledDate} at {scheduledTime}</div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Duration</span>
                <div style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{durationMinutes} minutes</div>
              </div>
            </div>
          </div>

          {/* Connection Status Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#0f172a', borderBottom: '1px solid #f1f5f9', pb: 8 }}>
              Connection Status
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>
                  {isInterviewer ? 'Participant Laptop' : 'Interviewer Laptop'}
                </span>
                <span className="reg-admin-status" style={{
                  background: (isInterviewer ? isParticipantLaptopConnected : isTrainerConnected) ? '#dcfce7' : '#f8fafc',
                  color: (isInterviewer ? isParticipantLaptopConnected : isTrainerConnected) ? '#15803D' : '#64748b',
                  borderColor: (isInterviewer ? isParticipantLaptopConnected : isTrainerConnected) ? '#bbf7d0' : '#e2e8f0',
                  fontSize: 10, padding: '2px 8px'
                }}>
                  {(isInterviewer ? isParticipantLaptopConnected : isTrainerConnected) ? '● Connected' : '○ Waiting'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Mobile Camera</span>
                <span className="reg-admin-status" style={{
                  background: isMobileConnected ? '#dcfce7' : '#f1f5f9',
                  color: isMobileConnected ? '#15803D' : '#64748b',
                  borderColor: isMobileConnected ? '#bbf7d0' : '#e2e8f0',
                  fontSize: 10, padding: '2px 8px'
                }}>
                  {isMobileConnected ? '● Connected' : '○ Not Paired'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Microphone</span>
                <span className="reg-admin-status" style={{
                  background: !isMuted ? '#dcfce7' : '#fee2e2',
                  color: !isMuted ? '#15803D' : '#dc2626',
                  borderColor: !isMuted ? '#bbf7d0' : '#fca5a5',
                  fontSize: 10, padding: '2px 8px'
                }}>
                  {!isMuted ? '● Active' : '○ Muted'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Network</span>
                <span className="reg-admin-status" style={{ background: '#dcfce7', color: '#15803D', borderColor: '#bbf7d0', fontSize: 10, padding: '2px 8px' }}>
                  ● Good
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Large Video Container & Video Controls */}
        <div className="interview-col-video" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Main Video Viewport */}
          <div style={{
            background: '#0F172A',
            borderRadius: 14,
            border: '1px solid #1E293B',
            aspectRatio: '16/10',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {/* If participant or trainer stream exists */}
            {mainStageStream ? (
              <VideoTile
                stream={mainStageStream}
                label={mainStageLabel}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              /* Waiting state */
              <div style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}>
                  <VideoIcon size={32} color="#CBD5E1" />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#F8FAFC', margin: '0 0 6px' }}>
                  {isInterviewer
                    ? (isParticipantLaptopConnected ? 'Live Video Session' : 'Waiting for participant to join...')
                    : (isTrainerConnected ? 'Live Video Session' : 'Waiting for interviewer...')}
                </h3>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                  {isInterviewer
                    ? 'The participant video feed will appear automatically once they join.'
                    : 'The interviewer video feed will appear automatically once they join.'}
                </p>
              </div>
            )}

            {/* Local Video Picture-in-Picture Badge */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: 140,
              height: 90,
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.2)',
              background: '#000',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              <span style={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 4,
              }}>
                You ({isInterviewer ? 'Trainer' : 'Participant'})
              </span>
            </div>

            {/* Elapsed Timer Overlay */}
            <div style={{
              position: 'absolute',
              top: 12,
              left: 12,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              padding: '6px 12px',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <Clock size={14} color="#16A34A" />
              <span>{formatTime(elapsed || 0)}</span>
            </div>
          </div>

          {/* Video Controls Bar */}
          <div className="reg-admin-table-wrap interview-video-controls">
            <button
              onClick={onToggleMute}
              className={`reg-admin-btn ${isMuted ? 'reg-admin-btn--danger' : 'reg-admin-btn--secondary'}`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              onClick={onToggleCamera}
              className={`reg-admin-btn ${isCameraOff ? 'reg-admin-btn--danger' : 'reg-admin-btn--secondary'}`}
              title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
            >
              {isCameraOff ? <VideoOff size={16} /> : <VideoIcon size={16} />}
              <span>{isCameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>

            {!isInterviewer && qrPayload && (
              <button
                onClick={() => setShowQrModal(!showQrModal)}
                className="reg-admin-btn reg-admin-btn--secondary"
                title="Pair Mobile Camera"
              >
                <QrCode size={16} />
                <span>Pair Mobile</span>
              </button>
            )}

            {/* Screen Share: Participant only */}
            {!isInterviewer && (
              <button
                onClick={onToggleScreenShare}
                className={`reg-admin-btn ${isScreenSharing ? 'reg-admin-btn--primary' : 'reg-admin-btn--secondary'}`}
                title="Share Screen"
              >
                <Monitor size={16} />
                <span>{isScreenSharing ? 'Sharing Screen' : 'Share Screen'}</span>
              </button>
            )}

            <button
              onClick={isInterviewer ? handleEndInterview : handleLeaveInterview}
              className="reg-admin-btn reg-admin-btn--danger"
            >
              <LogOut size={16} />
              <span>{isInterviewer ? 'End Interview' : 'Leave Room'}</span>
            </button>
          </div>

          {/* QR Modal if toggled */}
          {showQrModal && qrPayload && (
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
            }}>
              <QRPairing qrPayload={qrPayload} onRefresh={onRefreshQr} expiresAt={qrPayload?.expiresAt} />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Participant Mobile Feed (Trainer View) OR Connect Mobile Camera QR Card (Participant View) & Notes */}
        <div className="interview-col-notes" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isInterviewer ? (
            /* Trainer View: Participant Screen Share & Mobile Camera Feed Tiles */
            <>
              {/* Participant Screen Share Feed Tile (if screen share active) */}
              {participantScreenStream && (
                <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                      Participant Screen Share
                    </h4>
                    <span className="reg-admin-status" style={{ background: '#dcfce7', color: '#15803D', borderColor: '#bbf7d0', fontSize: 10, padding: '2px 8px' }}>
                      ● Live Sharing
                    </span>
                  </div>
                  <div style={{ width: '100%', aspectRatio: '16/10', background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
                    <VideoTile
                      stream={participantScreenStream}
                      label={`${candidateName}'s Screen`}
                      isScreenShare
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </div>
              )}

              {/* Participant Mobile Camera Feed Tile */}
              <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Participant Mobile Feed
                  </h4>
                  <span className="reg-admin-status" style={{
                    background: isMobileConnected ? '#dcfce7' : '#f1f5f9',
                    color: isMobileConnected ? '#15803D' : '#64748b',
                    borderColor: isMobileConnected ? '#bbf7d0' : '#e2e8f0',
                    fontSize: 10,
                    padding: '2px 8px'
                  }}>
                    {isMobileConnected ? '● Connected' : '○ Not Paired'}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  aspectRatio: '4/3',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  overflow: 'hidden'
                }}>
                  {mobileStream ? (
                    <VideoTile stream={mobileStream} label={`${candidateName} (Mobile Camera)`} style={{ width: '100%', height: '100%', borderRadius: 6 }} />
                  ) : (
                    <div style={{ padding: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: '#64748b' }}>
                        <Smartphone size={22} />
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                        {isMobileConnected ? 'Mobile camera connected' : 'Waiting for participant to scan QR code on their laptop screen...'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Participant View: Connect Mobile Camera QR Code Card */
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <QRPairing
                qrPayload={qrPayload}
                onRefresh={onRefreshQr}
                expiresAt={qrPayload?.expiresAt}
                tokenStatus={isMobileConnected ? '● Mobile camera connected' : '○ Waiting for mobile scan'}
              />
            </div>
          )}

          {/* Interview Notes Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', marginBottom: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Interview Notes
              </h4>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="reg-admin-btn reg-admin-btn--secondary"
                style={{ padding: '4px 10px', fontSize: 11, marginLeft: 'auto' }}
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            <textarea
              rows={6}
              placeholder="Add notes during the interview..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 13,
                fontFamily: 'Inter, system-ui, sans-serif',
                outline: 'none',
                resize: 'vertical',
                minHeight: 120,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

      </div>

      {/* BOTTOM SECTION: Interview Timeline Card */}
      <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
          Interview Timeline
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {/* Stage 1 */}
          <div style={{
            padding: 14,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', marginBottom: 4 }}>
              Stage 1
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Interview Scheduled</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{scheduledDate}</div>
          </div>

          {/* Stage 2 */}
          <div style={{
            padding: 14,
            background: peerConnected ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${peerConnected ? '#bbf7d0' : '#e2e8f0'}`,
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: peerConnected ? '#16A34A' : '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              Stage 2
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Participant Joining</div>
            <div style={{ fontSize: 12, color: peerConnected ? '#15803D' : '#64748b', marginTop: 2 }}>
              {peerConnected ? 'Joined' : 'Waiting...'}
            </div>
          </div>

          {/* Stage 3 */}
          <div style={{
            padding: 14,
            background: interviewData?.status === 'IN_PROGRESS' || peerConnected ? '#fef3c7' : '#f8fafc',
            border: `1px solid ${interviewData?.status === 'IN_PROGRESS' || peerConnected ? '#fcd34d' : '#e2e8f0'}`,
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', textTransform: 'uppercase', marginBottom: 4 }}>
              Stage 3
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Interview In Progress</div>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
              {interviewData?.status === 'IN_PROGRESS' || peerConnected ? `Active (${formatTime(elapsed || 0)})` : 'Not started'}
            </div>
          </div>

          {/* Stage 4 */}
          <div style={{
            padding: 14,
            background: interviewData?.status === 'COMPLETED' ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${interviewData?.status === 'COMPLETED' ? '#bbf7d0' : '#e2e8f0'}`,
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: interviewData?.status === 'COMPLETED' ? '#16A34A' : '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              Stage 4
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Interview Completed</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {interviewData?.status === 'COMPLETED' ? 'Completed' : 'Not started'}
            </div>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
