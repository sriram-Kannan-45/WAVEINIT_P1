const { sequelize } = require('../config/db');
const User = require('./user');
const Training = require('./training');
const TrainerProfile = require('./trainerProfile');
const TrainerExperience = require('./trainerExperience');
const TrainerEducation = require('./trainerEducation');
const Enrollment = require('./enrollment');
const Feedback = require('./feedback');

const Notification = require('./notification');
const SurveyQuestion = require('./surveyQuestion');
const SurveyAnswer = require('./surveyAnswer');
const Note = require('./note');
const ActivityLog = require('./activityLog');
const LiveSession = require('./liveSession');
const Attendance = require('./attendance');
const ChatMessage = require('./chatMessage');
const ParticipantProfile = require('./participantProfile');

const AIDocument = require('./aiDocument');
const AIQuiz = require('./aiQuiz');
const AIQuestion = require('./aiQuestion');
const AIQuestionOption = require('./aiQuestionOption');
const QuizAttempt = require('./quizAttempt');
const QuizAnswer = require('./quizAnswer');
const QuizResult = require('./quizResult');

const PasswordResetOtp = require('./PasswordResetOtp');
const AssessmentSession = require('./AssessmentSession');

// Lesson workflow module (lessons + quiz/assessment gating + progress)
const Lesson = require('./lesson');
const LessonQuiz = require('./lessonQuiz');
const LessonAssessment = require('./lessonAssessment');
const AssessmentSubmission = require('./assessmentSubmission');
const QuizProgress = require('./quizProgress');
const LessonProgress = require('./lessonProgress');
// Course-centric architecture (new — see Section 1 of the course-restructure spec)
const Course = require('./course');
const LessonMaterial = require('./lessonMaterial');
const CourseTrainerAssignment = require('./courseTrainerAssignment');

// Proctoring module
const ExamSession = require('./examSession');
const Violation = require('./violation');
const DeviceFingerprint = require('./deviceFingerprint');
const ProctorActivity = require('./proctorActivity');
const Screenshot = require('./screenshot');

// Parallel monitor system (prompt-spec, does not touch proctoring tables)
const MonitorAttempt = require('./monitorAttempt');
const MonitorViolation = require('./monitorViolation');
const MonitorScreenshot = require('./monitorScreenshot');

// New Enhancements
const TrainingTrainerAssignment = require('./trainingTrainerAssignment');
const QuizAssignment = require('./quizAssignment');
const QuizCopyViolation = require('./quizCopyViolation');
const DiscussionPost = require('./discussionPost');
const Certificate = require('./certificate');
const ParticipantTracking = require('./participantTracking');
const QuizResultsAudit = require('./quizResultsAudit');

// Quiz Recordings module
const QuizRecording = require('./quizRecording');

// Coding Assessment module
const CodingAssessment = require('./codingAssessment');
const CodingProblem = require('./codingProblem');
const CodingTestCase = require('./codingTestCase');
const CodingAttempt = require('./codingAttempt');
const CodingSubmission = require('./codingSubmission');
const CodingResult = require('./codingResult');

// --- Core LMS Associations ---

// User <-> TrainerProfile
User.hasOne(TrainerProfile, { foreignKey: 'userId', as: 'profile' });
TrainerProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> TrainerExperience (1:M)
User.hasMany(TrainerExperience, { foreignKey: 'userId', as: 'experiences' });
TrainerExperience.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> TrainerEducation (1:M)
User.hasMany(TrainerEducation, { foreignKey: 'userId', as: 'educations' });
TrainerEducation.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Training (now: TrainingProgram) <-> Trainer (User) — legacy
// Kept so the older trainingController/trainingRoutes continue to function.
// New course-centric flows use Course.trainer_id instead.
Training.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
User.hasMany(Training, { foreignKey: 'trainerId', as: 'trainings' });

// TrainingProgram (Training) ←→ Course
Training.hasMany(Course, { foreignKey: 'trainingProgramId', as: 'courses' });
Course.belongsTo(Training, { foreignKey: 'trainingProgramId', as: 'program' });

// Course ←→ Trainer (primary trainer)
Course.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
User.hasMany(Course, { foreignKey: 'trainerId', as: 'courses' });

// Course ←→ CourseTrainerAssignment (M:N future multi-trainer)
Course.hasMany(CourseTrainerAssignment, { foreignKey: 'courseId', as: 'trainerAssignments' });
CourseTrainerAssignment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
CourseTrainerAssignment.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
User.hasMany(CourseTrainerAssignment, { foreignKey: 'trainerId', as: 'courseAssignments' });

// Training ←→ TrainingTrainerAssignment
Training.hasMany(TrainingTrainerAssignment, { foreignKey: 'trainingId', as: 'trainerAssignments' });
TrainingTrainerAssignment.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
TrainingTrainerAssignment.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
User.hasMany(TrainingTrainerAssignment, { foreignKey: 'trainerId', as: 'trainingAssignments' });

// DiscussionPost associations
DiscussionPost.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Training.hasMany(DiscussionPost, { foreignKey: 'trainingId', as: 'discussionPosts' });
DiscussionPost.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(DiscussionPost, { foreignKey: 'userId', as: 'discussionPosts' });
DiscussionPost.belongsTo(DiscussionPost, { foreignKey: 'parentId', as: 'parent' });
DiscussionPost.hasMany(DiscussionPost, { foreignKey: 'parentId', as: 'replies' });

// Certificate associations
Certificate.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Certificate, { foreignKey: 'userId', as: 'certificates' });
Certificate.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Training.hasMany(Certificate, { foreignKey: 'trainingId', as: 'certificates' });
Certificate.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Course.hasMany(Certificate, { foreignKey: 'courseId', as: 'certificates' });

// ParticipantTracking associations
ParticipantTracking.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(ParticipantTracking, { foreignKey: 'userId', as: 'trackingRecords' });
ParticipantTracking.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });
Lesson.hasMany(ParticipantTracking, { foreignKey: 'lessonId', as: 'trackingRecords' });
ParticipantTracking.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Training.hasMany(ParticipantTracking, { foreignKey: 'trainingId', as: 'trackingRecords' });

// Enrollment associations — both legacy (Training) and new (Course)
Enrollment.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
Enrollment.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
User.hasMany(Enrollment, { foreignKey: 'participantId', as: 'enrollments' });
Training.hasMany(Enrollment, { foreignKey: 'trainingId', as: 'enrollments' });
Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments' });

// Feedback associations (legacy training-scoped)
Feedback.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Feedback.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
Training.hasMany(Feedback, { foreignKey: 'trainingId', as: 'feedbacks' });
User.hasMany(Feedback, { foreignKey: 'participantId', as: 'feedbacks' });

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

// Note associations (standalone trainer notes/resources — separate from lesson_materials)
Note.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
Note.belongsTo(Training, { foreignKey: 'trainingId', as: 'training', required: false });

// ParticipantProfile (1-1 with User)
User.hasOne(ParticipantProfile, { foreignKey: 'userId', as: 'participantProfile' });
ParticipantProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// --- AI Quiz System ---
AIDocument.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
AIDocument.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });

AIQuiz.belongsTo(AIDocument, { foreignKey: 'documentId', as: 'document' });
AIQuiz.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
AIQuiz.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' }); // legacy
AIQuiz.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
AIQuiz.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });
AIQuiz.hasMany(AIQuestion, { foreignKey: 'quizId', as: 'questions' });
AIQuiz.hasMany(QuizAssignment, { foreignKey: 'quizId', as: 'quizAssignments' });

Course.hasMany(AIQuiz, { foreignKey: 'courseId', as: 'quizzes' });
Lesson.hasMany(AIQuiz, { foreignKey: 'lessonId', as: 'directQuizzes' });

// QuizAssignment associations (per-participant assignment with PENDING/COMPLETED status)
QuizAssignment.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizAssignment.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
User.hasMany(QuizAssignment, { foreignKey: 'participantId', as: 'quizAssignments' });

AIQuestion.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
AIQuestion.hasMany(AIQuestionOption, { foreignKey: 'questionId', as: 'optionRows' });
AIQuestionOption.belongsTo(AIQuestion, { foreignKey: 'questionId', as: 'question' });

QuizAttempt.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizAttempt.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
QuizAttempt.hasMany(QuizAnswer, { foreignKey: 'attemptId', as: 'answers' });
QuizAttempt.hasOne(QuizResult, { foreignKey: 'attemptId', as: 'result' });

QuizAnswer.belongsTo(QuizAttempt, { foreignKey: 'attemptId', as: 'attempt' });
QuizAnswer.belongsTo(AIQuestion, { foreignKey: 'questionId', as: 'question' });

QuizResult.belongsTo(QuizAttempt, { foreignKey: 'attemptId', as: 'attempt' });
QuizResult.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizResult.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

QuizAttempt.hasMany(QuizCopyViolation, { foreignKey: 'attemptId', as: 'copyViolations' });
QuizCopyViolation.belongsTo(QuizAttempt, { foreignKey: 'attemptId', as: 'attempt' });
QuizCopyViolation.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizCopyViolation.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

// --- Proctoring Associations ---
ExamSession.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
ExamSession.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz', constraints: false });
ExamSession.belongsTo(CodingAssessment, { foreignKey: 'assessmentId', as: 'codingAssessment', constraints: false });
ExamSession.belongsTo(QuizAttempt, { foreignKey: 'attemptId', as: 'attempt', constraints: false });
ExamSession.belongsTo(CodingAttempt, { foreignKey: 'codingAttemptId', as: 'codingAttempt', constraints: false });
ExamSession.belongsTo(DeviceFingerprint, { foreignKey: 'deviceFingerprintId', as: 'device' });
ExamSession.hasMany(Violation, { foreignKey: 'sessionId', as: 'violations' });
ExamSession.hasMany(ProctorActivity, { foreignKey: 'sessionId', as: 'activities' });
ExamSession.hasMany(Screenshot, { foreignKey: 'sessionId', as: 'screenshots' });

Violation.belongsTo(ExamSession, { foreignKey: 'sessionId', as: 'session' });
Violation.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

Screenshot.belongsTo(ExamSession, { foreignKey: 'sessionId', as: 'session' });
Screenshot.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

ProctorActivity.belongsTo(ExamSession, { foreignKey: 'sessionId', as: 'session' });

// --- Parallel Monitor System Associations ---
MonitorAttempt.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
MonitorAttempt.belongsTo(AIQuiz, { foreignKey: 'testId', as: 'test' });
MonitorAttempt.hasMany(MonitorViolation, { foreignKey: 'attemptId', as: 'violations' });
MonitorAttempt.hasMany(MonitorScreenshot, { foreignKey: 'attemptId', as: 'screenshots' });

MonitorViolation.belongsTo(MonitorAttempt, { foreignKey: 'attemptId', as: 'attempt' });
MonitorViolation.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

MonitorScreenshot.belongsTo(MonitorAttempt, { foreignKey: 'attemptId', as: 'attempt' });
MonitorScreenshot.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

User.hasMany(MonitorAttempt, { foreignKey: 'participantId', as: 'monitorAttempts' });
AIQuiz.hasMany(MonitorAttempt, { foreignKey: 'testId', as: 'monitorAttempts' });

DeviceFingerprint.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(DeviceFingerprint, { foreignKey: 'userId', as: 'devices' });
User.hasMany(ExamSession, { foreignKey: 'participantId', as: 'examSessions' });

// --- Secure Assessment Session lock (separate from proctoring module) ---
AssessmentSession.belongsTo(QuizAttempt, { foreignKey: 'attemptId', as: 'attempt', constraints: false });
AssessmentSession.belongsTo(CodingAttempt, { foreignKey: 'codingAttemptId', as: 'codingAttempt', constraints: false });
AssessmentSession.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz', constraints: false });
AssessmentSession.belongsTo(CodingAssessment, { foreignKey: 'assessmentId', as: 'codingAssessment' });
AssessmentSession.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
AssessmentSession.belongsTo(User, { foreignKey: 'resetByAdmin', as: 'resetAdmin' });
QuizAttempt.hasOne(AssessmentSession, { foreignKey: 'attemptId', as: 'assessmentSession' });
CodingAttempt.hasOne(AssessmentSession, { foreignKey: 'codingAttemptId', as: 'assessmentSession' });
CodingAttempt.hasOne(ExamSession, { foreignKey: 'codingAttemptId', as: 'examSession' });
User.hasMany(AssessmentSession, { foreignKey: 'participantId', as: 'assessmentSessions' });

// --- Lesson Workflow Associations ---
// Legacy training-scoped lesson link (kept for back-compat)
Lesson.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
Training.hasMany(Lesson, { foreignKey: 'trainingId', as: 'lessons' });
Lesson.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });

// New course-scoped lesson link
Lesson.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Course.hasMany(Lesson, { foreignKey: 'courseId', as: 'lessons' });

// LessonMaterial — 1:M from Lesson
Lesson.hasMany(LessonMaterial, { foreignKey: 'lessonId', as: 'materials' });
LessonMaterial.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });

Lesson.hasMany(LessonQuiz, { foreignKey: 'lessonId', as: 'quizzes' });
LessonQuiz.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });
LessonQuiz.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });

Lesson.hasMany(LessonAssessment, { foreignKey: 'lessonId', as: 'assessments' });
LessonAssessment.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });

LessonAssessment.hasMany(AssessmentSubmission, { foreignKey: 'assessmentId', as: 'submissions' });
AssessmentSubmission.belongsTo(LessonAssessment, { foreignKey: 'assessmentId', as: 'assessment' });
AssessmentSubmission.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

LessonQuiz.hasMany(QuizProgress, { foreignKey: 'lessonQuizId', as: 'progress' });
QuizProgress.belongsTo(LessonQuiz, { foreignKey: 'lessonQuizId', as: 'lessonQuiz' });
QuizProgress.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

Lesson.hasMany(LessonProgress, { foreignKey: 'lessonId', as: 'progress' });
LessonProgress.belongsTo(Lesson, { foreignKey: 'lessonId', as: 'lesson' });
LessonProgress.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

// --- Quiz Results Audit associations ---
QuizResultsAudit.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizResultsAudit.belongsTo(User, { foreignKey: 'performedBy', as: 'performer' });
AIQuiz.hasMany(QuizResultsAudit, { foreignKey: 'quizId', as: 'auditLogs' });

// --- Quiz Recording Associations ---
QuizRecording.belongsTo(AIQuiz, { foreignKey: 'quizId', as: 'quiz' });
QuizRecording.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
QuizRecording.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
AIQuiz.hasMany(QuizRecording, { foreignKey: 'quizId', as: 'recordings' });
User.hasMany(QuizRecording, { foreignKey: 'participantId', as: 'participantRecordings' });
User.hasMany(QuizRecording, { foreignKey: 'trainerId', as: 'trainerRecordings' });

// ── Coding Assessment Module Associations ──
CodingAssessment.belongsTo(User, { foreignKey: 'trainerId', as: 'trainer' });
CodingAssessment.belongsTo(Training, { foreignKey: 'trainingId', as: 'training' });
CodingAssessment.hasMany(CodingProblem, { foreignKey: 'assessmentId', as: 'problems' });
CodingAssessment.hasMany(CodingAttempt, { foreignKey: 'assessmentId', as: 'attempts' });

CodingProblem.belongsTo(CodingAssessment, { foreignKey: 'assessmentId', as: 'assessment' });
CodingProblem.hasMany(CodingTestCase, { foreignKey: 'problemId', as: 'testCases' });
CodingProblem.hasMany(CodingSubmission, { foreignKey: 'problemId', as: 'submissions' });

CodingTestCase.belongsTo(CodingProblem, { foreignKey: 'problemId', as: 'problem' });

CodingAttempt.belongsTo(CodingAssessment, { foreignKey: 'assessmentId', as: 'assessment' });
CodingAttempt.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });
CodingAttempt.hasMany(CodingSubmission, { foreignKey: 'attemptId', as: 'submissions' });
CodingAttempt.hasOne(CodingResult, { foreignKey: 'attemptId', as: 'result' });

CodingSubmission.belongsTo(CodingAttempt, { foreignKey: 'attemptId', as: 'attempt' });
CodingSubmission.belongsTo(CodingProblem, { foreignKey: 'problemId', as: 'problem' });

CodingResult.belongsTo(CodingAttempt, { foreignKey: 'attemptId', as: 'attempt' });
CodingResult.belongsTo(CodingAssessment, { foreignKey: 'assessmentId', as: 'assessment' });
CodingResult.belongsTo(User, { foreignKey: 'participantId', as: 'participant' });

User.hasMany(CodingAssessment, { foreignKey: 'trainerId', as: 'codingAssessments' });
Training.hasMany(CodingAssessment, { foreignKey: 'trainingId', as: 'codingAssessments' });

module.exports = {
  sequelize,
  User,
  Training,
  TrainerProfile,
  TrainerExperience,
  TrainerEducation,
  Enrollment,
  Feedback,
  Notification,
  SurveyQuestion,
  SurveyAnswer,
  Note,
  ActivityLog,
  LiveSession,
  Attendance,
  ChatMessage,
  ParticipantProfile,
  AIDocument,
  AIQuiz,
  AIQuestion,
  AIQuestionOption,
  QuizAttempt,
  QuizAnswer,
  QuizResult,
  // Proctoring
  ExamSession,
  Violation,
  DeviceFingerprint,
  ProctorActivity,
  Screenshot,
  // Parallel monitor system
  MonitorAttempt,
  MonitorViolation,
  MonitorScreenshot,
  PasswordResetOtp,
  // Secure Assessment session lock
  AssessmentSession,
  // Lesson workflow module
  Lesson,
  LessonQuiz,
  LessonAssessment,
  AssessmentSubmission,
  QuizProgress,
  LessonProgress,
  // Course-centric module
  Course,
  LessonMaterial,
  CourseTrainerAssignment,
  TrainingTrainerAssignment,
  QuizAssignment,
  DiscussionPost,
  Certificate,
  ParticipantTracking,
  QuizResultsAudit,
  QuizCopyViolation,
  QuizRecording,
  // Coding Assessment module
  CodingAssessment,
  CodingProblem,
  CodingTestCase,
  CodingAttempt,
  CodingSubmission,
  CodingResult,
};
