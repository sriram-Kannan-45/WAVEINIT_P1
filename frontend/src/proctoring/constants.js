/**
 * Centralized constants for the proctoring module.
 * Mirrors backend service ENUMs.
 */

export const VIOLATION_TYPES = {
  FULLSCREEN_EXIT:      'FULLSCREEN_EXIT',
  TAB_SWITCH:           'TAB_SWITCH',
  WINDOW_BLUR:          'WINDOW_BLUR',
  BROWSER_MINIMIZE:     'BROWSER_MINIMIZE',
  SCREEN_SHARE_STOPPED: 'SCREEN_SHARE_STOPPED',
  SCREEN_SHARE_DENIED:  'SCREEN_SHARE_DENIED',
  COPY_ATTEMPT:         'COPY_ATTEMPT',
  PASTE_ATTEMPT:        'PASTE_ATTEMPT',
  RIGHT_CLICK:          'RIGHT_CLICK',
  BLOCKED_SHORTCUT:     'BLOCKED_SHORTCUT',
  DEVTOOLS_OPENED:      'DEVTOOLS_OPENED',
  REFRESH_ATTEMPT:      'REFRESH_ATTEMPT',
  NAVIGATION_ATTEMPT:   'NAVIGATION_ATTEMPT',
  MULTIPLE_LOGIN:       'MULTIPLE_LOGIN',
  NETWORK_LOST:         'NETWORK_LOST',
  SCREENSHOT_ATTEMPT:   'SCREENSHOT_ATTEMPT',
  MOUSE_LEAVE:          'MOUSE_LEAVE',
  CLIPBOARD_ATTEMPT:    'CLIPBOARD_ATTEMPT',
  NETWORK_TIMEOUT:      'NETWORK_TIMEOUT',
  FACE_ABSENT:          'FACE_ABSENT',
  FACE_MULTIPLE:        'FACE_MULTIPLE',
  LOOKING_AWAY:         'LOOKING_AWAY',
  MOBILE_DETECTED:      'MOBILE_DETECTED',
  TRAINER_WARNING:      'TRAINER_WARNING',
  MIC_MUTED:            'MIC_MUTED',
  CAMERA_OFF:           'CAMERA_OFF',
  FACE_NOT_VISIBLE:     'FACE_NOT_VISIBLE',
};

export const VIOLATION_LABELS = {
  FULLSCREEN_EXIT:      'You exited fullscreen mode',
  TAB_SWITCH:           'You switched tabs',
  WINDOW_BLUR:          'Window lost focus',
  BROWSER_MINIMIZE:     'Browser was minimized',
  SCREEN_SHARE_STOPPED: 'Screen sharing stopped',
  SCREEN_SHARE_DENIED:  'Screen sharing was denied',
  COPY_ATTEMPT:         'Copy is disabled',
  PASTE_ATTEMPT:        'Paste is disabled',
  RIGHT_CLICK:          'Right-click is disabled',
  BLOCKED_SHORTCUT:     'This shortcut is blocked',
  DEVTOOLS_OPENED:      'Developer tools detected',
  REFRESH_ATTEMPT:      'Refresh is disabled',
  NAVIGATION_ATTEMPT:   'Navigation away is disabled',
  MULTIPLE_LOGIN:       'Multiple login detected',
  NETWORK_LOST:         'Internet connection lost',
  SCREENSHOT_ATTEMPT:   'Screenshot capture attempted',
  MOUSE_LEAVE:          'Cursor exited the exam screen',
  CLIPBOARD_ATTEMPT:    'Clipboard action blocked',
  NETWORK_TIMEOUT:      'Network connection timeout exceeded',
  FACE_ABSENT:          'No face detected in frame',
  FACE_MULTIPLE:        'Multiple faces detected in frame',
  LOOKING_AWAY:         'Looking away from screen detected',
  MOBILE_DETECTED:      'Mobile device detected in frame',
  TRAINER_WARNING:      'Warning from trainer',
  MIC_MUTED:            'Microphone was muted during the assessment',
  CAMERA_OFF:           'Camera was turned off during the assessment',
  FACE_NOT_VISIBLE:     'Face not visible in camera frame',
};

export const MAX_FULLSCREEN_EXITS = 3;
export const MAX_WARNINGS = 5;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const ANSWER_AUTOSAVE_MS = 8_000;
export const GRACE_PERIOD_DEFAULT_MINUTES = 2;

export const PROCTORING_LEVELS = {
  LOW:    { label: 'Low',    maxWarnings: 8, maxFullscreenExits: 5, requiresWebcam: false },
  MEDIUM: { label: 'Medium', maxWarnings: 5, maxFullscreenExits: 3, requiresWebcam: false },
  HIGH:   { label: 'High',   maxWarnings: 3, maxFullscreenExits: 2, requiresWebcam: true },
};

export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
