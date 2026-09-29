// Full route registry extracted from frontend/src/App.jsx.
// `guard: true`  -> unauthenticated visit must land on /login
// `guard: false` -> public route, must render without redirect
// Dynamic segments use placeholder ids; these only need to render/redirect,
// never to resolve real data.

const PUBLIC_ROUTES = [
  { path: '/', name: 'landing login' },
  { path: '/login', name: 'login' },
  { path: '/admin/login', name: 'admin login' },
  { path: '/trainer/login', name: 'trainer login' },
  { path: '/participant/login', name: 'participant login' },
  { path: '/register', name: 'register' },
  { path: '/apply', name: 'registration apply' },
  { path: '/forgot-password', name: 'forgot password' },
  { path: '/verify-certificate', name: 'certificate verify' },
  { path: '/verify-certificate/TEST-CODE-123', name: 'certificate verify by code' },
  { path: '/certificates/verify/TEST-CODE-123', name: 'certificate verify alias' },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/mobile-join/INVALID-TOKEN', name: 'interview mobile join' },
  { path: '/interview/mobile/INVALID-TOKEN', name: 'interview mobile join alias' },
  { path: '/assessment/mobile-join/INVALID-TOKEN', name: 'assessment mobile join' },
];

const ADMIN_ROUTES = [
  { path: '/admin', name: 'admin dashboard' },
  { path: '/admin/trainer/1', name: 'admin trainer profile' },
  { path: '/admin/trainings/1/leaderboard', name: 'admin training leaderboard' },
  { path: '/trainings', name: 'trainings list' },
  { path: '/trainings/1', name: 'training detail' },
  { path: '/trainings/1/leaderboard', name: 'training leaderboard' },
];

const TRAINER_ROUTES = [
  { path: '/trainer', name: 'trainer dashboard' },
  { path: '/trainer/profile', name: 'trainer profile' },
  { path: '/trainer/recordings', name: 'trainer recordings' },
  { path: '/trainer/recordings/1', name: 'trainer recording detail' },
  { path: '/trainer/monitoring', name: 'trainer monitoring dashboard' },
  { path: '/trainer/proctor/1', name: 'trainer proctoring page' },
  { path: '/trainer/proctor/1/report', name: 'trainer proctoring report' },
  { path: '/trainer/quiz/1', name: 'trainer quiz details' },
  { path: '/trainer/coding/1', name: 'trainer coding assessment details' },
  { path: '/trainer/trainings/1/leaderboard', name: 'trainer leaderboard' },
  { path: '/interview/schedule', name: 'schedule interview' },
];

const PARTICIPANT_ROUTES = [
  { path: '/participant', name: 'participant dashboard' },
  { path: '/participant/quizzes', name: 'participant quizzes' },
  { path: '/participant/exam/1', name: 'participant exam' },
  { path: '/quizzes', name: 'quizzes list' },
  { path: '/quizzes/1/verification', name: 'quiz verification' },
  { path: '/quizzes/1/result', name: 'quiz result' },
  { path: '/trainings/1/quizzes/1/verification', name: 'training quiz verification' },
  { path: '/trainings/1/quizzes/1/attempt/1/verification', name: 'attempt verification' },
  { path: '/trainings/1/quizzes/1/attempt', name: 'quiz attempt' },
  { path: '/trainings/1/quizzes/1/result', name: 'training quiz result' },
  { path: '/coding/1/verification', name: 'coding verification' },
  { path: '/trainings/1/coding/1/verification', name: 'training coding verification' },
  { path: '/trainings/1/coding/1/attempt', name: 'coding attempt' },
  { path: '/trainings/1/coding/1/result', name: 'coding result' },
  { path: '/exam/1', name: 'exam page' },
  { path: '/exam/1/result', name: 'exam result' },
  { path: '/test/1', name: 'test page' },
  { path: '/test/1/result/1', name: 'test result' },
  { path: '/my-profile', name: 'my profile' },
  { path: '/interviews', name: 'interview dashboard' },
  { path: '/interview/1', name: 'interview evaluation' },
  { path: '/interview/1/room', name: 'interview room' },
  { path: '/interview/1/join', name: 'interview join' },
];

// Every route that must be gated when the visitor has no session.
const GUARDED_ROUTES = [
  ...ADMIN_ROUTES,
  ...TRAINER_ROUTES,
  ...PARTICIPANT_ROUTES,
].filter((r) => r.path !== '/trainings' && r.path !== '/trainings/1' && r.path !== '/trainings/1/leaderboard');

// Extra routes that are reachable but shared/ambiguous across roles.
const SHARED_ROUTES = [
  { path: '/trainings', name: 'trainings list (shared)' },
  { path: '/trainings/1', name: 'training detail (shared)' },
  { path: '/trainings/1/leaderboard', name: 'training leaderboard (shared)' },
];

const ALL_ROUTES = [...PUBLIC_ROUTES, ...GUARDED_ROUTES, ...SHARED_ROUTES];

module.exports = { PUBLIC_ROUTES, ADMIN_ROUTES, TRAINER_ROUTES, PARTICIPANT_ROUTES, GUARDED_ROUTES, SHARED_ROUTES, ALL_ROUTES };