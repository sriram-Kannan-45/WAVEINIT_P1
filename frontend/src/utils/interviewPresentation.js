/**
 * Shared interview presentation helpers — single source of truth for how
 * interview data is displayed across the LMS (dashboard, details, room,
 * evaluation).
 */
export const STATUS_COLORS = {
  SCHEDULED:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  IN_PROGRESS: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  COMPLETED:   { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  CANCELLED:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  RESCHEDULED: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  NO_SHOW:     { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
}

export const STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  NO_SHOW: 'No Show',
}

export const TYPE_BADGE = {
  TECHNICAL: { cls: 'reg-admin-type--technical', label: 'Technical' },
  HR:        { cls: 'reg-admin-type--hr', label: 'HR' },
  MANAGERIAL:{ cls: 'reg-admin-type--managerial', label: 'Managerial' },
  CUSTOM:    { cls: 'reg-admin-type--custom', label: 'Custom' },
}

export const MEETING_BADGE = {
  ONLINE:    { cls: 'reg-admin-meeting--online', label: 'Online' },
  IN_PERSON: { cls: 'reg-admin-meeting--in-person', label: 'In-Person' },
  HYBRID:    { cls: 'reg-admin-meeting--hybrid', label: 'Hybrid' },
  IN_PLATFORM: { cls: 'reg-admin-meeting--online', label: 'In-Platform' },
}

export const getStatusColor = (status) => STATUS_COLORS[status] || STATUS_COLORS.SCHEDULED
export const getTypeBadge = (type) => TYPE_BADGE[type] || TYPE_BADGE.TECHNICAL
export const getMeetingBadge = (meetingType) => MEETING_BADGE[meetingType] || MEETING_BADGE.ONLINE

/**
 * Normalize interview payloads from the backend into a consistent camelCase
 * shape. GET /api/interviews/:id returns snake_case (scheduled_at,
 * duration_minutes, meeting_type) while the join endpoint returns camelCase
 * (scheduledAt, durationMinutes, meetingType). Alias them so every screen can
 * rely on the camelCase fields.
 */
export function normalizeInterview(iv = {}) {
  return {
    ...iv,
    scheduledAt: iv.scheduledAt ?? iv.scheduled_at ?? null,
    durationMinutes: iv.durationMinutes ?? iv.duration_minutes ?? null,
    meetingType: iv.meetingType ?? iv.meeting_type ?? null,
    gracePeriodMinutes: iv.gracePeriodMinutes ?? iv.grace_period_minutes ?? null,
  }
}

export const formatDate = (dt) => (dt ? new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const formatTime = (dt) => (dt ? new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
export const formatDateTime = (dt) => (dt ? `${formatDate(dt)} at ${formatTime(dt)}` : '—')

/**
 * Build the room timeline from an interview. Stages appear once their
 * timestamp exists or the interview reaches the matching status.
 * Stages: Scheduled → In Progress → Completed/Cancelled/No Show.
 */
export function getTimeline(iv = {}) {
  const status = iv.status
  const now = new Date().toISOString()
  const terminalAt = status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW'
    ? (iv.result?.decided_at || iv.updated_at || now)
    : null
  const session = Array.isArray(iv.sessions) ? iv.sessions[0] : null

  const stages = [
    {
      key: 'scheduled',
      label: 'Scheduled',
      time: iv.scheduled_at || iv.scheduledAt || null,
      state: iv.scheduled_at || iv.scheduledAt ? 'done' : 'pending',
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      time: session?.started_at || (status === 'IN_PROGRESS' ? now : null),
      state: session?.started_at || status === 'IN_PROGRESS' ? 'done' : 'pending',
    },
    {
      key: 'completed',
      label: status === 'CANCELLED' ? 'Cancelled' : status === 'NO_SHOW' ? 'No Show' : 'Completed',
      time: terminalAt,
      state: terminalAt ? 'done' : 'pending',
    },
  ]
  return stages
}
