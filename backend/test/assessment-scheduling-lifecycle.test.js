process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345678901234567890';

const availabilityService = require('../src/services/assessmentAvailabilityService');
const proctoringReportService = require('../src/services/proctoringReportService');
const {
  finalizeQuiz,
  finalizeCodingAssessment,
  autoCloseExpiredAssessments,
} = require('../src/jobs/assessmentAutoCloseJob');
const {
  AIQuiz,
  CodingAssessment,
  QuizAttempt,
  CodingAttempt,
  QuizResult,
  CodingResult,
  CodingProblem,
  CodingSubmission,
  AIQuestion,
  QuizAnswer,
  Enrollment,
  QuizAssignment,
  Notification,
} = require('../src/models');

describe('Assessment Scheduling, Auto-Closing & Reporting System Lifecycle', () => {

  const createMockIo = () => ({
    emit: jest.fn(),
    of: jest.fn().mockReturnValue({
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    }),
  });

  describe('1. Availability Service Unit Tests', () => {
    test('Case 1 & 2: Active availability window allows start', () => {
      const now = new Date('2026-09-11T12:00:00Z');
      const assessment = {
        status: 'PUBLISHED',
        startTime: '2026-09-11T10:00:00Z',
        endTime: '2026-09-11T14:00:00Z',
        timezone: 'UTC',
        finalizedAt: null,
      };

      const result = availabilityService.checkAvailability(assessment, now);
      expect(result.status).toBe('ACTIVE');
      expect(result.canAttempt).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.remainingSeconds).toBe(7200);

      expect(() => availabilityService.assertAvailable(assessment, now)).not.toThrow();
    });

    test('Case 1 (Pre-start): Blocks attempt before start time', () => {
      const now = new Date('2026-09-11T09:00:00Z');
      const assessment = {
        status: 'PUBLISHED',
        startTime: '2026-09-11T10:00:00Z',
        endTime: '2026-09-11T14:00:00Z',
        timezone: 'UTC',
      };

      const result = availabilityService.checkAvailability(assessment, now);
      expect(result.status).toBe('NOT_STARTED_YET');
      expect(result.canAttempt).toBe(false);

      expect(() => availabilityService.assertAvailable(assessment, now)).toThrow('Assessment has not started yet');
    });

    test('Case 2 & 10: Blocks attempt after end time (server UTC enforcement)', () => {
      const now = new Date('2026-09-11T14:00:01Z');
      const assessment = {
        status: 'PUBLISHED',
        startTime: '2026-09-11T10:00:00Z',
        endTime: '2026-09-11T14:00:00Z',
        timezone: 'UTC',
      };

      const result = availabilityService.checkAvailability(assessment, now);
      expect(result.status).toBe('ENDED');
      expect(result.canAttempt).toBe(false);

      let thrownError = null;
      try {
        availabilityService.assertAvailable(assessment, now);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError.statusCode).toBe(403);
      expect(thrownError.message).toContain('scheduled end time');
    });

    test('Case 16: Backward compatibility for unscheduled assessments (endTime: null)', () => {
      const assessment = {
        status: 'PUBLISHED',
        startTime: null,
        endTime: null,
        finalizedAt: null,
      };

      const result = availabilityService.checkAvailability(assessment);
      expect(result.status).toBe('ACTIVE');
      expect(result.canAttempt).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.remainingSeconds).toBeNull();
      expect(() => availabilityService.assertAvailable(assessment)).not.toThrow();
    });

    test('Case 9: Server-side UTC check immune to client clock manipulation', () => {
      const serverNow = new Date('2026-09-11T15:00:00Z');
      const assessment = {
        status: 'PUBLISHED',
        endTime: '2026-09-11T14:00:00Z',
      };

      const result = availabilityService.checkAvailability(assessment, serverNow);
      expect(result.canAttempt).toBe(false);
      expect(result.status).toBe('ENDED');
    });
  });

  describe('2. 21-Column CSV Report Generation', () => {
    test('Case 14: Generates strict 21-column CSV including attendees and absentees', () => {
      const headers = availabilityService.CSV_REPORT_HEADERS;
      expect(headers).toHaveLength(21);
      expect(headers).toEqual([
        'Participant Name',
        'Email',
        'Participant ID',
        'Course',
        'Training/Assessment Name',
        'Assessment Type',
        'Attendance Status',
        'Attempt Status',
        'Attempt Number',
        'Start Time',
        'Submission Time',
        'End Time',
        'Score',
        'Maximum Marks',
        'Percentage',
        'Pass/Fail',
        'Malpractice Score',
        'Malpractice Violations',
        'Malpractice Status',
        'Submission Type',
        'Time Expired'
      ]);

      const mockParticipants = [
        {
          id: 101,
          name: 'Alice Learner',
          email: 'alice@example.com',
          courseTitle: 'Fullstack Dev',
          assessmentTitle: 'Node.js Mastery',
          assessmentType: 'Quiz',
          attendanceStatus: 'PRESENT',
          attemptStatus: 'COMPLETED',
          attemptNumber: 1,
          startTime: '2026-09-11T10:05:00Z',
          submissionTime: '2026-09-11T10:45:00Z',
          endTime: '2026-09-11T12:00:00Z',
          score: 85,
          maxMarks: 100,
          percentage: '85.0%',
          passFail: 'PASS',
          malpracticeScore: 10,
          malpracticeViolations: 1,
          malpracticeStatus: 'FLAGGED',
          submissionType: 'MANUAL',
          timeExpired: 'No',
        },
        {
          id: 102,
          name: 'Bob Absentee',
          email: 'bob@example.com',
          courseTitle: 'Fullstack Dev',
          assessmentTitle: 'Node.js Mastery',
          assessmentType: 'Quiz',
          attendanceStatus: 'ABSENT',
          attemptStatus: 'NOT_ATTEMPTED',
          attemptNumber: 0,
          startTime: 'N/A',
          submissionTime: 'N/A',
          endTime: '2026-09-11T12:00:00Z',
          score: 0,
          maxMarks: 100,
          percentage: '0.0%',
          passFail: 'FAIL',
          malpracticeScore: 0,
          malpracticeViolations: 0,
          malpracticeStatus: 'N/A',
          submissionType: 'N/A',
          timeExpired: 'No',
        }
      ];

      const csv = availabilityService.generateCsvReport(mockParticipants);
      const lines = csv.trim().split('\r\n');

      expect(lines.length).toBe(3); // Header + 2 data rows
      expect(lines[0]).toBe(headers.join(','));

      // Check row 1 (Attendee)
      expect(lines[1]).toContain('"Alice Learner"');
      expect(lines[1]).toContain('"PRESENT"');
      expect(lines[1]).toContain('"PASS"');

      // Check row 2 (Absentee)
      expect(lines[2]).toContain('"Bob Absentee"');
      expect(lines[2]).toContain('"ABSENT"');
      expect(lines[2]).toContain('"N/A"');
      expect(lines[2]).toContain('"0"');
      expect(lines[2]).toContain('"FAIL"');
    });
  });

  describe('3. Auto-Close Background Sweep & Idempotency', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('Case 3, 7, 8: Finalizes expired quiz, auto-submits active attempts, and marks absentees', async () => {
      const pastEndTime = new Date('2026-09-11T12:00:00Z');
      const now = new Date('2026-09-11T12:05:00Z');

      const fakeAttempt = {
        id: 501,
        participantId: 10,
        status: 'IN_PROGRESS',
        update: jest.fn().mockResolvedValue(true),
      };

      const fakeQuiz = {
        id: 201,
        title: 'Backend Architecture Quiz',
        courseId: 1,
        trainerId: 99,
        endTime: pastEndTime,
        finalizedAt: null,
        update: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(QuizAttempt, 'findAll').mockResolvedValue([fakeAttempt]);
      jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(null);
      jest.spyOn(QuizAttempt, 'create').mockResolvedValue({ id: 502 });
      jest.spyOn(AIQuestion, 'findAll').mockResolvedValue([
        { id: 1, marks: 5, correctAnswer: 'A', options: ['A', 'B'] }
      ]);
      jest.spyOn(QuizAnswer, 'findAll').mockResolvedValue([
        { questionId: 1, selectedOption: 0, save: jest.fn().mockResolvedValue(true) }
      ]);
      jest.spyOn(QuizResult, 'upsert').mockResolvedValue(true);
      jest.spyOn(QuizResult, 'findAll').mockResolvedValue([
        { score: 5, percentage: 100 }
      ]);
      jest.spyOn(Enrollment, 'findAll').mockResolvedValue([
        { participantId: 10 },
        { participantId: 20 },
      ]);
      jest.spyOn(QuizAssignment, 'findAll').mockResolvedValue([]);
      jest.spyOn(QuizAssignment, 'update').mockResolvedValue([1]);
      jest.spyOn(Notification, 'findOne').mockResolvedValue(null);
      jest.spyOn(Notification, 'create').mockResolvedValue({ id: 801 });
      jest.spyOn(proctoringReportService, 'generateFinalProctoringReport').mockResolvedValue(null);

      const mockIo = createMockIo();
      await finalizeQuiz(fakeQuiz, now, mockIo);

      expect(fakeAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'AUTO_SUBMITTED',
        timeExpired: true,
        autoSubmitted: true,
        submissionType: 'AUTO_SUBMITTED',
        attendanceStatus: 'PRESENT',
      }));

      expect(fakeQuiz.update).toHaveBeenCalledWith(expect.objectContaining({
        finalizedAt: expect.any(Date),
      }));

      expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 99,
        type: 'ASSESSMENT_ENDED',
        relatedEntityType: 'ai_quiz',
        relatedEntityId: String(fakeQuiz.id),
      }));

      QuizAttempt.findAll.mockRestore();
      QuizAttempt.findOne.mockRestore();
      QuizAttempt.create.mockRestore();
      AIQuestion.findAll.mockRestore();
      QuizAnswer.findAll.mockRestore();
      QuizResult.upsert.mockRestore();
      QuizResult.findAll.mockRestore();
      Enrollment.findAll.mockRestore();
      QuizAssignment.findAll.mockRestore();
      QuizAssignment.update.mockRestore();
      Notification.findOne.mockRestore();
      Notification.create.mockRestore();
      proctoringReportService.generateFinalProctoringReport.mockRestore();
    }, 15000);

    test('Case 4, 15: Parity for Coding Assessment auto-closing', async () => {
      const pastEndTime = new Date('2026-09-11T12:00:00Z');
      const now = new Date('2026-09-11T12:05:00Z');

      const fakeCodingAttempt = {
        id: 701,
        participantId: 10,
        status: 'IN_PROGRESS',
        update: jest.fn().mockResolvedValue(true),
      };

      const fakeCoding = {
        id: 301,
        title: 'Algorithms in JS',
        courseId: 1,
        trainerId: 99,
        endTime: pastEndTime,
        finalizedAt: null,
        update: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(CodingAttempt, 'findAll').mockResolvedValue([fakeCodingAttempt]);
      jest.spyOn(CodingProblem, 'findAll').mockResolvedValue([]);
      jest.spyOn(CodingSubmission, 'findAll').mockResolvedValue([]);
      jest.spyOn(CodingResult, 'upsert').mockResolvedValue(true);
      jest.spyOn(CodingResult, 'findAll').mockResolvedValue([
        { totalScore: 80, percentage: 80 }
      ]);
      jest.spyOn(Enrollment, 'findAll').mockResolvedValue([
        { participantId: 10 },
        { participantId: 30 },
      ]);
      jest.spyOn(Notification, 'findOne').mockResolvedValue(null);
      jest.spyOn(Notification, 'create').mockResolvedValue({ id: 802 });
      jest.spyOn(proctoringReportService, 'generateFinalProctoringReport').mockResolvedValue(null);

      const mockIo = createMockIo();
      await finalizeCodingAssessment(fakeCoding, now, mockIo);

      expect(fakeCodingAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'AUTO_SUBMITTED',
        timeExpired: true,
        autoSubmitted: true,
        submissionType: 'AUTO_SUBMITTED',
        attendanceStatus: 'PRESENT',
      }));

      expect(fakeCoding.update).toHaveBeenCalledWith(expect.objectContaining({
        finalizedAt: expect.any(Date),
      }));

      CodingAttempt.findAll.mockRestore();
      CodingProblem.findAll.mockRestore();
      CodingSubmission.findAll.mockRestore();
      CodingResult.upsert.mockRestore();
      CodingResult.findAll.mockRestore();
      Enrollment.findAll.mockRestore();
      Notification.findOne.mockRestore();
      Notification.create.mockRestore();
      proctoringReportService.generateFinalProctoringReport.mockRestore();
    });

    test('Case 11, 12, 13: Idempotent notification & background execution (no duplicate notices)', async () => {
      const pastEndTime = new Date('2026-09-11T12:00:00Z');
      const now = new Date('2026-09-11T12:05:00Z');

      const fakeQuiz = {
        id: 202,
        title: 'Idempotency Quiz',
        courseId: 1,
        trainerId: 99,
        endTime: pastEndTime,
        finalizedAt: null,
        update: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(QuizAttempt, 'findAll').mockResolvedValue([]);
      jest.spyOn(AIQuestion, 'findAll').mockResolvedValue([]);
      jest.spyOn(QuizResult, 'findAll').mockResolvedValue([]);
      jest.spyOn(Enrollment, 'findAll').mockResolvedValue([]);
      jest.spyOn(QuizAssignment, 'findAll').mockResolvedValue([]);
      // Simulate that notification ALREADY exists
      jest.spyOn(Notification, 'findOne').mockResolvedValue({ id: 999 });
      jest.spyOn(Notification, 'create').mockResolvedValue({ id: 1000 });

      await finalizeQuiz(fakeQuiz, now, null);

      expect(Notification.create).not.toHaveBeenCalled();

      QuizAttempt.findAll.mockRestore();
      AIQuestion.findAll.mockRestore();
      QuizResult.findAll.mockRestore();
      Enrollment.findAll.mockRestore();
      QuizAssignment.findAll.mockRestore();
      Notification.findOne.mockRestore();
      Notification.create.mockRestore();
    });
  });

  describe('4. Full Final Report Aggregation Tests', () => {
    test('Case 11 & 15: Builds 10-metric final report correctly aggregating absentees and attendees', async () => {
      const mockQuiz = {
        id: 400,
        title: 'Report Aggregation Quiz',
        status: 'PUBLISHED',
        startTime: '2026-09-11T10:00:00Z',
        endTime: '2026-09-11T12:00:00Z',
        timezone: 'UTC',
        course: { title: 'LMS Masterclass' },
        courseId: 1,
        finalizedAt: new Date('2026-09-11T12:05:00Z'),
      };

      const mockEnrollments = [
        { id: 1, name: 'Attendee One', email: 'att1@test.com' },
        { id: 2, name: 'Attendee Two', email: 'att2@test.com' },
        { id: 3, name: 'Absentee Three', email: 'abs3@test.com' },
      ];

      const mockAttempts = [
        {
          id: 11,
          participantId: 1,
          status: 'COMPLETED',
          attendanceStatus: 'PRESENT',
          attemptNumber: 1,
          score: 80,
          totalQuestions: 10,
          submissionType: 'MANUAL',
          timeExpired: false,
          createdAt: '2026-09-11T10:10:00Z',
          submittedAt: '2026-09-11T11:00:00Z',
        },
        {
          id: 12,
          participantId: 2,
          status: 'COMPLETED',
          attendanceStatus: 'PRESENT',
          attemptNumber: 1,
          score: 60,
          totalQuestions: 10,
          submissionType: 'AUTO_SUBMITTED',
          timeExpired: true,
          violationCount: 4,
          createdAt: '2026-09-11T10:15:00Z',
          submittedAt: '2026-09-11T12:00:00Z',
        }
      ];

      const mockResults = [
        { participantId: 1, totalScore: 80, percentage: 80 },
        { participantId: 2, totalScore: 60, percentage: 60 },
      ];

      const mockProctoringReports = [
        { userId: 1, integrityScore: 100, violationsCount: 0 },
        { userId: 2, integrityScore: 35, violationsCount: 4 },
      ];

      const report = await availabilityService.buildFinalReport({
        assessment: mockQuiz,
        assessmentType: 'Quiz',
        courseName: 'LMS Masterclass',
        enrolledUsers: mockEnrollments,
        attempts: mockAttempts,
        results: mockResults,
        proctoringReports: mockProctoringReports,
      });

      expect(report.summary.totalEnrolled).toBe(3);
      expect(report.summary.completed).toBe(2);
      expect(report.summary.absent).toBe(1);
      expect(report.summary.autoSubmitted).toBe(1);
      expect(report.summary.malpracticeCases).toBe(1); // User 2 has integrityScore 35 (malpracticeScore 65)
      expect(report.summary.averageScore).toBe(70); // (80 + 60) / 2

      expect(report.participants).toHaveLength(3);

      const absentParticipant = report.participants.find(p => p.id === 3 || p.userId === 3);
      expect(absentParticipant).toBeDefined();
      expect(absentParticipant.attendanceStatus).toBe('ABSENT');
      expect(absentParticipant.score).toBe(0);
      expect(absentParticipant.malpracticeStatus).toBe('N/A');
    });
  });
});
