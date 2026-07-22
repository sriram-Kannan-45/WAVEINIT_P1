export const INTERVIEW_TYPES = [
  { value: 'TECHNICAL', label: 'Technical', color: 'blue' },
  { value: 'HR', label: 'HR Interview', color: 'purple' },
  { value: 'BEHAVIORAL', label: 'Behavioral', color: 'amber' },
  { value: 'CODING', label: 'Coding', color: 'emerald' },
  { value: 'SYSTEM_DESIGN', label: 'System Design', color: 'rose' },
];

export const INTERVIEW_STATUS = {
  SCHEDULED: { label: 'Scheduled', color: 'blue', bg: '#EFF6FF', text: '#2563EB' },
  LIVE: { label: 'Live', color: 'emerald', bg: '#F0FDF4', text: '#16A34A' },
  COMPLETED: { label: 'Completed', color: 'slate', bg: '#F1F5F9', text: '#64748B' },
  CANCELLED: { label: 'Cancelled', color: 'red', bg: '#FEF2F2', text: '#DC2626' },
  RESCHEDULED: { label: 'Rescheduled', color: 'amber', bg: '#FFFBEB', text: '#D97706' },
};

export const CANDIDATE_STATUS = {
  ASSIGNED: { label: 'Assigned', color: 'slate' },
  INVITED: { label: 'Invited', color: 'blue' },
  ACCEPTED: { label: 'Accepted', color: 'green' },
  DECLINED: { label: 'Declined', color: 'red' },
  JOINED: { label: 'Joined', color: 'emerald' },
  COMPLETED: { label: 'Completed', color: 'slate' },
  NO_SHOW: { label: 'No Show', color: 'red' },
};

export const RECOMMENDATIONS = [
  { value: 'HIKE', label: 'Hire', color: 'green', icon: 'ThumbsUp' },
  { value: 'MAYBE', label: 'Maybe', color: 'amber', icon: 'Minus' },
  { value: 'REJECT', label: 'Reject', color: 'red', icon: 'ThumbsDown' },
];

export const ROOM_STATES = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  ENDED: 'ended',
};

export const VIOLATION_TYPES = {
  CAMERA_OFF: { label: 'Camera Off', severity: 'medium' },
  MIC_MUTED: { label: 'Microphone Muted', severity: 'low' },
  TAB_SWITCH: { label: 'Tab Switch', severity: 'high' },
  FULLSCREEN_EXIT: { label: 'Fullscreen Exit', severity: 'medium' },
  SCREEN_SHARE_STOPPED: { label: 'Screen Share Stopped', severity: 'low' },
  MOBILE_CAMERA_DISCONNECTED: { label: 'Mobile Camera Disconnected', severity: 'low' },
  NETWORK_WEAK: { label: 'Weak Network', severity: 'medium' },
  COPY_ATTEMPT: { label: 'Copy Attempt', severity: 'high' },
  FACE_ABSENT: { label: 'Face Not Visible', severity: 'high' },
};

export const FEATURES = [
  { key: 'recordingEnabled', label: 'Recording', icon: 'Circle' },
  { key: 'screenShareEnabled', label: 'Screen Share', icon: 'Monitor' },
  { key: 'whiteboardEnabled', label: 'Whiteboard', icon: 'PenTool' },
  { key: 'chatEnabled', label: 'Chat', icon: 'MessageSquare' },
  { key: 'resumeViewerEnabled', label: 'Resume Viewer', icon: 'FileText' },
  { key: 'notesEnabled', label: 'Notes', icon: 'StickyNote' },
  { key: 'mobileCameraEnabled', label: 'Mobile Camera', icon: 'Smartphone' },
  { key: 'qrVerificationEnabled', label: 'QR Verification', icon: 'QrCode' },
  { key: 'aiSummaryEnabled', label: 'AI Summary', icon: 'Brain' },
];
