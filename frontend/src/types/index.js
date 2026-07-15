/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {'ADMIN'|'TRAINER'|'PARTICIPANT'} role
 * @property {string} [token]
 * @property {string} [accessToken]
 */

/**
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {'DRAFT'|'PUBLISHED'|'ARCHIVED'} status
 * @property {number} [enrolledCount]
 * @property {number} [lessonCount]
 * @property {number} [quizCount]
 * @property {string} [programTitle]
 * @property {string} [trainingProgramId]
 * @property {string} [thumbnailUrl]
 */

/**
 * @typedef {Object} Training
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {string} [status]
 */

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {string} [content]
 * @property {Object<string, number>} [materialCounts]
 */

/**
 * @typedef {Object} Quiz
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {'EASY'|'MEDIUM'|'HARD'} [difficulty]
 * @property {number} [timeLimit]
 * @property {number} [questionCount]
 */

/**
 * @typedef {Object} ToastFunction
 * @property {(message: string) => void} success
 * @property {(message: string) => void} error
 * @property {(message: string) => void} info
 * @property {(message: string) => void} warning
 */
