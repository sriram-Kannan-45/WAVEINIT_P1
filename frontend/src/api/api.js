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
const getBackendOrigin = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/api$/, '');
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3001';
};

const BACKEND_ORIGIN = getBackendOrigin();

/** Base for all REST API calls: http://<server_ip>:3001/api */
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
    DASHBOARD_SUMMARY:       `${API_BASE}/admin/dashboard/summary`,
    CREATE_TRAINER:          `${API_BASE}/admin/create-trainer`,
    TRAININGS:               `${API_BASE}/admin/trainings`,
    TRAINERS:                `${API_BASE}/admin/trainers`,
    PARTICIPANTS:            `${API_BASE}/admin/participants`,
    DELETE_PARTICIPANT:      (id) => `${API_BASE}/admin/participants/${id}`,
    PENDING_PARTICIPANTS:    `${API_BASE}/admin/pending-participants`,
    APPROVE_PARTICIPANT:     (id) => `${API_BASE}/admin/participants/${id}/approve`,
    REJECT_PARTICIPANT:      (id) => `${API_BASE}/admin/participants/${id}/reject`,
    DELETE_TRAINER:          (id) => `${API_BASE}/admin/trainers/${id}`,
    DELETE_TRAINING:         (id) => `${API_BASE}/admin/trainings/${id}`,
    BULK_DELETE_PARTICIPANTS:`${API_BASE}/admin/participants/bulk-delete`,
    BULK_DELETE_TRAINERS:    `${API_BASE}/admin/trainers/bulk-delete`,
    BULK_DELETE_TRAININGS:   `${API_BASE}/admin/trainings/bulk-delete`,
    NOTES:                   `${API_BASE}/notes/admin/notes`,
    BULK_TEMPLATE:           `${API_BASE}/admin/participants/bulk-template`,
    BULK_VALIDATE:           `${API_BASE}/admin/participants/bulk-validate`,
    BULK_IMPORT:             `${API_BASE}/admin/participants/bulk-import`,
  },

  REGISTRATION: {
    APPLY:                `${API_BASE}/registration/apply`,
    APPLICATIONS:         `${API_BASE}/registration/applications`,
    APPLICATION:          (id) => `${API_BASE}/registration/applications/${id}`,
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
    LIST: `${API_BASE}/trainer/trainings`,
    PROGRESS: (trainingId) => `${API_BASE}/trainings/${trainingId}/progress`,
    LEADERBOARD: (trainingId) => `${API_BASE}/trainings/${trainingId}/leaderboard`,
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
    BULK_DELETE_PROGRAMS:   `${API_BASE}/admin/training-programs/bulk-delete`,
    BULK_DELETE_COURSES:    `${API_BASE}/admin/courses/bulk-delete`,
  },

  TRAINER_COURSES: {
    LIST:                                 `${API_BASE}/trainer/courses`,
    DETAIL:        (courseId)          => `${API_BASE}/trainer/courses/${courseId}`,
    PROGRESS:      (courseId)          => `${API_BASE}/trainer/courses/${courseId}/progress`,

    LESSONS:       (courseId)          => `${API_BASE}/trainer/courses/${courseId}/lessons`,
    LESSON:        (courseId, lessonId)=> `${API_BASE}/trainer/courses/${courseId}/lessons/${lessonId}`,
    UPDATE_LESSON_STATUS: (courseId, lessonId) => `${API_BASE}/trainer/courses/${courseId}/lessons/${lessonId}/status`,
    REORDER_LESSONS:(courseId)         => `${API_BASE}/trainer/courses/${courseId}/lessons/reorder`,

    STRUCTURE:     (courseId)          => `${API_BASE}/trainer/courses/${courseId}/structure`,
    SAVE_STRUCTURE:(courseId)          => `${API_BASE}/trainer/courses/${courseId}/structure`,
    UPDATE_STRUCTURE_STATUS:(courseId) => `${API_BASE}/trainer/courses/${courseId}/structure/status`,
    CLEAR_STRUCTURE:(courseId)         => `${API_BASE}/trainer/courses/${courseId}/structure`,
    DELETE_MODULE: (courseId, modId)   => `${API_BASE}/trainer/courses/${courseId}/structure/module/${modId}`,
    DELETE_SUBMODULE:(courseId, subId) => `${API_BASE}/trainer/courses/${courseId}/structure/submodule/${subId}`,
    DELETE_TOPIC:  (courseId, topId)   => `${API_BASE}/trainer/courses/${courseId}/structure/topic/${topId}`,
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
    QUIZ_BULK_DELETE: (courseId)         => `${API_BASE}/trainer/courses/${courseId}/quizzes/bulk-delete`,
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
    ADD_TEST_CASE:   (problemId) => `${API_BASE}/coding/problems/${problemId}/test-cases`,
    UPDATE_TEST_CASE:(id) => `${API_BASE}/coding/test-cases/${id}`,
    DELETE_TEST_CASE:(id) => `${API_BASE}/coding/test-cases/${id}`,
    REORDER_TEST_CASES:(problemId) => `${API_BASE}/coding/problems/${problemId}/reorder-test-cases`,
    VALIDATE_PROBLEM:(problemId) => `${API_BASE}/coding/problems/${problemId}/validate`,
    VALIDATE_ALL:    (id) => `${API_BASE}/coding/assessments/${id}/validate-all`,
    GENERATE:              `${API_BASE}/coding/generate-from-prompt`,
    GENERATE_LANGUAGE_CODE: `${API_BASE}/coding/generate-language-code`,
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
    // AI assistant
    ASSIST:                `${API_BASE}/coding/participant/assist`,
    ASSIST_STATUS: (attemptId, problemId) => `${API_BASE}/coding/participant/assist/status/${attemptId}/${problemId}`,
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

  USER_PROFILE: {
    GET:                  `${API_BASE}/user-profile`,
    GET_BY_ID:    (id) => `${API_BASE}/user-profile/${id}`,
    UPDATE:               `${API_BASE}/user-profile`,
    BANNER:               `${API_BASE}/user-profile/banner`,
    AVATAR:               `${API_BASE}/user-profile/avatar`,
    RESUME:               `${API_BASE}/user-profile/resume`,
    SKILLS:               `${API_BASE}/user-profile/skills`,
    DELETE_SKILL:  (id) => `${API_BASE}/user-profile/skills/${id}`,
    EXPERIENCE:           `${API_BASE}/user-profile/experience`,
    UPDATE_EXP:   (id) => `${API_BASE}/user-profile/experience/${id}`,
    DELETE_EXP:   (id) => `${API_BASE}/user-profile/experience/${id}`,
    EDUCATION:            `${API_BASE}/user-profile/education`,
    UPDATE_EDU:   (id) => `${API_BASE}/user-profile/education/${id}`,
    DELETE_EDU:   (id) => `${API_BASE}/user-profile/education/${id}`,
    CERTIFICATES:         `${API_BASE}/user-profile/certificates`,
    UPDATE_CERT:  (id) => `${API_BASE}/user-profile/certificates/${id}`,
    DELETE_CERT:  (id) => `${API_BASE}/user-profile/certificates/${id}`,
    PROJECTS:             `${API_BASE}/user-profile/projects`,
    UPDATE_PROJECT:(id) => `${API_BASE}/user-profile/projects/${id}`,
    DELETE_PROJECT:(id) => `${API_BASE}/user-profile/projects/${id}`,
    CONTACT_LINKS:        `${API_BASE}/user-profile/contact-links`,
  },

  PARTICIPANT: {
    CHATBOT_ASK:          `${API_BASE}/participant/chatbot/ask`,
    ACTIVITY_HEATMAP:     `${API_BASE}/participant/activity/heatmap`,
  },

  ATTENDANCE: {
    STUDENT_SUMMARY:      `${API_BASE}/attendance/student/summary`,
    SESSIONS:             `${API_BASE}/attendance/sessions`,
    SESSION_DETAIL: (id) => `${API_BASE}/attendance/sessions/${id}`,
    CREATE_SESSION:       `${API_BASE}/attendance/sessions`,
    MARK:           (id) => `${API_BASE}/attendance/sessions/${id}/mark`,
    UPDATE_RECORD: (sId, rId) => `${API_BASE}/attendance/sessions/${sId}/records/${rId}`,
    TRAINER_SUMMARY:      `${API_BASE}/attendance/trainer/summary`,
    ADMIN_ANALYTICS:      `${API_BASE}/attendance/admin/analytics`,
  },

  LEADERBOARD: {
    OVERALL:              `${API_BASE}/leaderboard/overall`,
    COURSE:   (courseId) => `${API_BASE}/leaderboard/course/${courseId}`,
    TRAINING: (tId)      => `${API_BASE}/leaderboard/training/${tId}`,
  },

  FEEDBACK_SYSTEM: {
    SUBMIT:               `${API_BASE}/feedback`,
    MY_FEEDBACKS:         `${API_BASE}/feedback/my-feedbacks`,
    TRAINER_FEEDBACKS:    `${API_BASE}/feedback/trainer-feedbacks`,
    ADMIN_FEEDBACKS:      `${API_BASE}/feedback/admin-feedbacks`,
    REPLY:          (id) => `${API_BASE}/feedback/${id}/reply`,
  },

  ANALYTICS: {
    STUDENT:              `${API_BASE}/analytics/student`,
    TRAINER:              `${API_BASE}/analytics/trainer`,
    ADMIN:                `${API_BASE}/analytics/admin`,
  },

  CERTIFICATES: {
    VERIFY:       (code) => `${API_BASE}/certificates/verify/${code}`,
  },

};

export { API_BASE, BACKEND_ORIGIN };


