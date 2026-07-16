import { getAuthHeaders } from './request';

export { getAuthHeaders };

/**
 * Centralized API configuration.
 *
 * ALL frontend code MUST use these constants — never hardcode
 * 'http://localhost:3001' anywhere else. This allows the backend
 * URL to be changed via the VITE_API_URL environment variable.
 *
 * Architecture:
 *   Frontend (5173) → Node Backend (3001) → Python AI Service (8000)
 *
 * The frontend NEVER calls the Python AI service directly.
 */

/** Base origin of the Node backend — no trailing slash, no /api */
const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')   // strip /api if accidentally included
  : 'http://localhost:3001';

/** Base for all REST API calls: http://localhost:3001/api */
const API_BASE = `${BACKEND_ORIGIN}/api`;

/**
 * Resolve a server-relative asset path (e.g. /uploads/trainer/photo.jpg)
 * to an absolute URL that the browser can load.
 *
 * Usage:  <img src={assetUrl(trainer.profile.imagePath)} />
 */
export const assetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${BACKEND_ORIGIN}${path}`;
};

export const API = {
  LOGIN:           `${API_BASE}/auth/login`,
  REGISTER:        `${API_BASE}/auth/register`,
  CHANGE_PASSWORD: `${API_BASE}/auth/change-password`,

  FORGOT_PASSWORD: {
    SEND_OTP:   `${API_BASE}/auth/forgot-password/send-otp`,
    VERIFY_OTP: `${API_BASE}/auth/forgot-password/verify-otp`,
    RESET:      `${API_BASE}/auth/forgot-password/reset`
  },

  ADMIN: {
    CREATE_TRAINER:  `${API_BASE}/admin/create-trainer`,
    TRAININGS:       `${API_BASE}/admin/trainings`,
    TRAINERS:        `${API_BASE}/admin/trainers`,
    PARTICIPANTS:    `${API_BASE}/admin/participants`,
    DELETE_TRAINING: (id) => `${API_BASE}/admin/trainings/${id}`,
    NOTES:           `${API_BASE}/notes/admin/notes`,
    BULK_TEMPLATE:   `${API_BASE}/admin/participants/bulk-template`,
    BULK_VALIDATE:   `${API_BASE}/admin/participants/bulk-validate`,
    BULK_IMPORT:     `${API_BASE}/admin/participants/bulk-import`,
  },

  REGISTRATION: {
    APPLY:                `${API_BASE}/registration/apply`,
    APPLICATIONS:         `${API_BASE}/registration/applications`,
    STATS:                `${API_BASE}/registration/applications/stats`,
    EXPORT:               `${API_BASE}/registration/applications/export`,
    TRAINERS:             `${API_BASE}/registration/trainers`,
    APPROVE:       (id)  => `${API_BASE}/registration/applications/${id}/approve`,
    REJECT:        (id)  => `${API_BASE}/registration/applications/${id}/reject`,
    ASSIGN_TRAINER:(id)  => `${API_BASE}/registration/applications/${id}/assign-trainer`,
    SEND_CREDENTIALS:(id) => `${API_BASE}/registration/applications/${id}/send-credentials`,
  },

  PARTICIPANT: {
    TRAININGS:     `${API_BASE}/trainings`,
    ENROLL:        `${API_BASE}/participant/enroll`,
    MY_ENROLLMENTS:`${API_BASE}/participant/enrollments`
  },

  FEEDBACK: {
    SUBMIT: `${API_BASE}/feedback`
  },

  NOTES: {
    ADMIN: `${API_BASE}/notes/admin/notes`
  },

  TRAININGS: {
    LIST: `${API_BASE}/trainer/trainings`
  },

  TRAINER_CREDENTIALS: {
    LIST:   `${API_BASE}/registration/credentials`,
    SEND: (id) => `${API_BASE}/registration/credentials/${id}/send`,
  },

  /** Backend health-check proxy for the AI microservice */
  AI_HEALTH: `${API_BASE}/ai/health`,

  AI_QUIZ: {
    GENERATE_FROM_PROMPT:   `${API_BASE}/ai-quiz/generate-from-prompt`,
    GENERATE_FROM_DOCUMENT: `${API_BASE}/ai-quiz/generate-from-document`,
  },

  /** Lesson workflow: lessons + quiz/assessment gating, results & dashboards */
  LESSONS: {
    // Trainer authoring
    CREATE:             `${API_BASE}/lessons`,
    TRAINER_LIST:       `${API_BASE}/lessons/trainer`,
    ATTACH_QUIZ:        (lessonId) => `${API_BASE}/lessons/${lessonId}/quizzes`,
    CREATE_ASSESSMENT:  (lessonId) => `${API_BASE}/lessons/${lessonId}/assessments`,
    // Trainer dashboard + publishing
    DASHBOARD:          (lessonId) => `${API_BASE}/lessons/${lessonId}/dashboard`,
    PUBLISH_QUIZ:       (lessonQuizId) => `${API_BASE}/lessons/quizzes/${lessonQuizId}/publish`,
    // Trainer assessment review
    SUBMISSIONS:        (assessmentId) => `${API_BASE}/lessons/assessments/${assessmentId}/submissions`,
    GRADE:              (submissionId) => `${API_BASE}/lessons/submissions/${submissionId}/grade`,
    PUBLISH_ASSESSMENT: (submissionId) => `${API_BASE}/lessons/submissions/${submissionId}/publish`,
    // Participant
    PARTICIPANT_LIST:   `${API_BASE}/lessons/participant`,
    VIEW_CONTENT:       (lessonId) => `${API_BASE}/lessons/${lessonId}/view`,
    COMPLETE_QUIZ:      (lessonQuizId) => `${API_BASE}/lessons/quizzes/${lessonQuizId}/complete`,
    SUBMIT_ASSESSMENT:  (assessmentId) => `${API_BASE}/lessons/assessments/${assessmentId}/submit`,
    QUIZ_RESULT:        (lessonQuizId) => `${API_BASE}/lessons/quizzes/${lessonQuizId}/result`,
    ASSESSMENT_RESULT:  (assessmentId) => `${API_BASE}/lessons/assessments/${assessmentId}/result`,

  },

  /**
   * Course-centric endpoints (Steps 2–4 of the course restructure).
   * Admin owns programs+courses. Trainer manages lessons/materials/quizzes
   * for assigned courses. Participant browses enrolled courses.
   */
  ADMIN_COURSES: {
    PROGRAMS:               `${API_BASE}/admin/training-programs`,
    PROGRAM:        (id) => `${API_BASE}/admin/training-programs/${id}`,
    PROGRAM_COURSES:(id) => `${API_BASE}/admin/training-programs/${id}/courses`,
    COURSES:                `${API_BASE}/admin/courses`,
    COURSE:         (id) => `${API_BASE}/admin/courses/${id}`,
  },

  TRAINER_COURSES: {
    LIST:                                 `${API_BASE}/trainer/courses`,
    DETAIL:        (courseId)          => `${API_BASE}/trainer/courses/${courseId}`,

    LESSONS:       (courseId)          => `${API_BASE}/trainer/courses/${courseId}/lessons`,
    LESSON:        (courseId, lessonId)=> `${API_BASE}/trainer/courses/${courseId}/lessons/${lessonId}`,
    REORDER_LESSONS:(courseId)         => `${API_BASE}/trainer/courses/${courseId}/lessons/reorder`,

    GENERATE_STRUCTURE:(courseId)     => `${API_BASE}/trainer/courses/${courseId}/generate-structure`,

    MATERIALS:     (lessonId)          => `${API_BASE}/trainer/lessons/${lessonId}/materials`,
    MATERIAL:      (lessonId, id)      => `${API_BASE}/trainer/lessons/${lessonId}/materials/${id}`,
    REORDER_MATERIALS:(lessonId)       => `${API_BASE}/trainer/lessons/${lessonId}/materials/reorder`,

    QUIZ_MANUAL:   (courseId)          => `${API_BASE}/trainer/courses/${courseId}/quiz/manual`,
    QUIZZES:       (courseId)          => `${API_BASE}/trainer/courses/${courseId}/quizzes`,
    QUIZ:          (courseId, quizId)  => `${API_BASE}/trainer/courses/${courseId}/quizzes/${quizId}`,
    SEND_QUIZ:     (quizId)            => `${API_BASE}/quizzes/${quizId}/send`,
    PUBLISH_QUIZ:  (courseId, quizId)  => `${API_BASE}/trainer/courses/${courseId}/quizzes/${quizId}/publish`,
    QUIZ_DASHBOARD:(courseId, quizId)  => `${API_BASE}/trainer/courses/${courseId}/quizzes/${quizId}/dashboard`,
    QUIZ_LEADERBOARD:(quizId)          => `${API_BASE}/ai-quiz/leaderboard/${quizId}`,
    QUIZ_RESULTS:    (quizId)          => `${API_BASE}/quizzes/${quizId}/results`,
    PUBLISH_RESULT:  (quizId, pId)     => `${API_BASE}/quizzes/${quizId}/publish-participant/${pId}`,
    PUBLISH_ALL_RESULTS: (quizId)      => `${API_BASE}/quizzes/${quizId}/publish-result`,
    QUIZ_DETAIL:         (quizId)      => `${API_BASE}/quizzes/${quizId}`,
    QUIZ_QUESTIONS:      (quizId)      => `${API_BASE}/quizzes/${quizId}/questions`,
    QUIZ_QUESTION:       (qId)         => `${API_BASE}/questions/${qId}`,
    QUIZ_REORDER:        (quizId)      => `${API_BASE}/quizzes/${quizId}/questions/reorder`,
    QUIZ_PARTICIPANTS:   (quizId)      => `${API_BASE}/quizzes/${quizId}/participants`,
    PUBLISH_QUIZ_NOW:    (quizId)      => `${API_BASE}/quizzes/${quizId}/publish`,
    RESULTS_SUMMARY:     (quizId)      => `${API_BASE}/quizzes/${quizId}/results-summary`,

    PARTICIPANTS:  (courseId)          => `${API_BASE}/trainer/courses/${courseId}/participants`,
    PARTICIPANT:   (courseId, userId)  => `${API_BASE}/trainer/courses/${courseId}/participants/${userId}`,
    AVAILABLE_PARTICIPANTS: (courseId) => `${API_BASE}/trainer/courses/${courseId}/available-participants`,

    ANALYTICS:     (courseId)          => `${API_BASE}/trainer/courses/${courseId}/analytics`,

    ASSESSMENTS:   (courseId, lessonId)=> `${API_BASE}/trainer/courses/${courseId}/lessons/${lessonId}/assessments`,
    ASSESSMENT:    (assessmentId)      => `${API_BASE}/trainer/assessments/${assessmentId}`,
    SUBMISSIONS:   (assessmentId)      => `${API_BASE}/trainer/assessments/${assessmentId}/submissions`,
    GRADE:         (submissionId)      => `${API_BASE}/trainer/submissions/${submissionId}/grade`,
    PUBLISH_SUB:   (submissionId)      => `${API_BASE}/trainer/submissions/${submissionId}/publish`,
  },

  PARTICIPANT_COURSES: {
    ENROLL:                   `${API_BASE}/participant/enroll`,
    UNENROLL:    (courseId)=> `${API_BASE}/participant/enroll/${courseId}`,

    LIST:                     `${API_BASE}/participant/courses`,
    EXPLORE:                  `${API_BASE}/participant/courses/explore`,
    OVERVIEW:    (courseId)=> `${API_BASE}/participant/courses/${courseId}`,
    LESSONS:     (courseId)=> `${API_BASE}/participant/courses/${courseId}/lessons`,
    RESOURCES:   (courseId)=> `${API_BASE}/participant/courses/${courseId}/resources`,
    QUIZZES:     (courseId)=> `${API_BASE}/participant/courses/${courseId}/quizzes`,

    LESSON:      (lessonId)=> `${API_BASE}/participant/lessons/${lessonId}`,
    VIEW_LESSON: (lessonId)=> `${API_BASE}/participant/lessons/${lessonId}/view`,

    QUIZ_START:  (quizId)  => `${API_BASE}/participant/quizzes/${quizId}/start`,
    QUIZ_SUBMIT: (quizId)  => `${API_BASE}/participant/quizzes/${quizId}/submit`,
    QUIZ_RESULT: (quizId)  => `${API_BASE}/participant/quizzes/${quizId}/result`,

    ASSESSMENT_SUBMIT: (assessmentId) => `${API_BASE}/participant/assessments/${assessmentId}/submit`,
    ASSESSMENT_RESULT: (assessmentId) => `${API_BASE}/participant/assessments/${assessmentId}/result`,
    CODING_ASSESSMENTS: (courseId) => `${API_BASE}/participant/courses/${courseId}/coding-assessments`,
  },

  /** Coding Assessment module */
  CODING: {
    // Trainer
    LIST:                  `${API_BASE}/coding/assessments`,
    DETAIL:        (id) => `${API_BASE}/coding/assessments/${id}`,
    CREATE:                `${API_BASE}/coding/assessments`,
    UPDATE:        (id) => `${API_BASE}/coding/assessments/${id}`,
    DELETE:        (id) => `${API_BASE}/coding/assessments/${id}`,
    CREATE_PROBLEM:(id) => `${API_BASE}/coding/assessments/${id}/problems`,
    UPDATE_PROBLEM:(id) => `${API_BASE}/coding/problems/${id}`,
    DELETE_PROBLEM:(id) => `${API_BASE}/coding/problems/${id}`,
    GENERATE:              `${API_BASE}/coding/generate-from-prompt`,
    PUBLISH:       (id) => `${API_BASE}/coding/assessments/${id}/publish`,
    CLOSE:         (id) => `${API_BASE}/coding/assessments/${id}/close`,
    PUBLISH_RESULT:(id) => `${API_BASE}/coding/assessments/${id}/publish-result`,
    HIDE_RESULT:   (id) => `${API_BASE}/coding/assessments/${id}/hide-result`,
    RESULTS:       (id) => `${API_BASE}/coding/assessments/${id}/results`,
    PARTICIPANTS:  (id) => `${API_BASE}/coding/assessments/${id}/participants`,
    RESULTS_SUMMARY:(id) => `${API_BASE}/coding/assessments/${id}/results-summary`,
    ANALYTICS:     (id) => `${API_BASE}/coding/assessments/${id}/analytics`,
    LEADERBOARD:   (id) => `${API_BASE}/coding/assessments/${id}/leaderboard`,
    RECORDINGS:    (id) => `${API_BASE}/coding/assessments/${id}/recordings`,
    // Participant
    START:         (id) => `${API_BASE}/coding/participant/start/${id}`,
    RUN:                  `${API_BASE}/coding/participant/run`,
    SUBMIT_CODE:          `${API_BASE}/coding/participant/submit-code`,
    SUBMISSION:    (id) => `${API_BASE}/coding/participant/submission/${id}`,
    SUBMIT:        (id) => `${API_BASE}/coding/participant/submit/${id}`,
    PARTICIPANT_RESULT: (id) => `${API_BASE}/coding/participant/assessments/${id}/result`,
  },

  /** Coding Assessment module (Judge0 sandbox + AI gen/review + plagiarism) */
  RECORDINGS: {
    LIST:        `${API_BASE}/recordings`,
    DETAIL:      (id) => `${API_BASE}/recordings/${id}`,
    STREAM:      (id) => `${API_BASE}/recordings/${id}/stream`,
    UPLOAD:      `${API_BASE}/recordings/upload`,
    DELETE:      (id) => `${API_BASE}/recordings/${id}`,
  },

  PROFILE: {
    GET:                  `${API_BASE}/profile/trainer/profile`,
    UPDATE:               `${API_BASE}/profile/trainer/profile`,
    PUBLIC:      (userId)=> `${API_BASE}/profile/public/${userId}`,
    ADD_EXPERIENCE:       `${API_BASE}/profile/trainer/experience`,
    UPDATE_EXPERIENCE:(id)=> `${API_BASE}/profile/trainer/experience/${id}`,
    DELETE_EXPERIENCE:(id)=> `${API_BASE}/profile/trainer/experience/${id}`,
    ADD_EDUCATION:        `${API_BASE}/profile/trainer/education`,
    UPDATE_EDUCATION:(id) => `${API_BASE}/profile/trainer/education/${id}`,
    DELETE_EDUCATION:(id) => `${API_BASE}/profile/trainer/education/${id}`,
  },

};

export { API_BASE, BACKEND_ORIGIN };