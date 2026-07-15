export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',

  ADMIN_DASHBOARD: '/admin',
  ADMIN_TRAINER_PROFILE: '/admin/trainer/:userId',

  TRAINER_DASHBOARD: '/trainer',
  TRAINER_PROFILE: '/trainer/profile',
  TRAINER_RECORDINGS: '/trainer/recordings',
  TRAINER_RECORDING_DETAIL: '/trainer/recordings/:id',
  TRAINER_PROCTOR: '/trainer/proctor/:quizId',
  TRAINER_MONITORING: '/trainer/monitoring',
  TRAINER_MONITORING_REPORT: '/trainer/proctor/:quizId/report',
  TRAINER_QUIZ_DETAILS: '/trainer/quiz/:quizId',
  TRAINER_CODING_DETAILS: '/trainer/coding/:assessmentId',

  PARTICIPANT_DASHBOARD: '/participant',
  PARTICIPANT_QUIZ_ATTEMPT: '/trainings/:trainingId/quizzes/:quizId/attempt',
  PARTICIPANT_QUIZ_RESULT: '/trainings/:trainingId/quizzes/:quizId/result',
  PARTICIPANT_EXAM: '/participant/exam/:quizId',
  PARTICIPANT_CODING_ATTEMPT: '/trainings/:trainingId/coding/:assessmentId/attempt',
  PARTICIPANT_CODING_RESULT: '/trainings/:trainingId/coding/:assessmentId/result',

  EXAM: '/exam/:sessionId',
  EXAM_RESULT: '/exam/:sessionId/result',
  TEST: '/test/:testId',
  TEST_RESULT: '/test/:testId/result/:attemptId',
}
