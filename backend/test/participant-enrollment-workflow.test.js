process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345678901234567890';

const {
  User,
  Course,
  Training,
  Enrollment,
  Lesson,
  TrainingTrainerAssignment,
  CourseTrainerAssignment
} = require('../src/models');

const participantCourseController = require('../src/controllers/participantCourseController');
const trainerCourseController = require('../src/controllers/trainerCourseController');
const enrollmentController = require('../src/controllers/enrollmentController');
const lessonController = require('../src/controllers/lessonController');

describe('LMS Participant Enrollment Lifecycle Workflow Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Participant Registration & Admin Approval Gating
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Participant Status Gating for Enrollment', () => {
    test('Unapproved participant (status: PENDING) cannot enroll in courses', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 101, role: 'PARTICIPANT', status: 'PENDING' });
      jest.spyOn(Course, 'findByPk').mockResolvedValue({ id: 5, status: 'PUBLISHED', isPublished: true });

      const req = {
        user: { id: 101, role: 'PARTICIPANT' },
        body: { courseId: 5 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await participantCourseController.enroll(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringMatching(/administrator|pending Admin approval/i)
      }));
    });

    test('Approved participant (status: APPROVED) successfully submits enrollment request with PENDING_TRAINER_APPROVAL', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 102, role: 'PARTICIPANT', status: 'APPROVED' });
      jest.spyOn(Course, 'findByPk').mockResolvedValue({
        id: 5,
        title: 'Full Stack Web Dev',
        status: 'PUBLISHED',
        isPublished: true,
        trainerId: 10
      });
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue(null);
      const fakeCreatedEnrollment = {
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'PENDING_TRAINER_APPROVAL',
        enrolled_at: new Date()
      };
      jest.spyOn(Enrollment, 'create').mockResolvedValue(fakeCreatedEnrollment);
      jest.spyOn(CourseTrainerAssignment, 'findAll').mockResolvedValue([]);

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        body: { courseId: 5 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await participantCourseController.enroll(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Pending trainer approval'),
        enrollment: expect.objectContaining({
          status: 'PENDING_TRAINER_APPROVAL'
        })
      }));
    });

    test('Prevent duplicate enrollment requests for same course and participant', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 102, role: 'PARTICIPANT', status: 'APPROVED' });
      jest.spyOn(Course, 'findByPk').mockResolvedValue({ id: 5, status: 'PUBLISHED', isPublished: true });
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue({
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'PENDING_TRAINER_APPROVAL'
      });

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        body: { courseId: 5 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await participantCourseController.enroll(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringMatching(/already pending trainer approval|already requested enrollment/i)
      }));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Course Access Rules (Pending vs Approved vs Rejected)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Course Content Access Verification', () => {
    test('Participant with PENDING_TRAINER_APPROVAL cannot access course lessons/content (returns 403 with code)', async () => {
      jest.spyOn(Course, 'findByPk').mockResolvedValue({ id: 5, title: 'Test Course', status: 'PUBLISHED' });
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue({
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'PENDING_TRAINER_APPROVAL'
      });

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        params: { courseId: 5 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = await participantCourseController.loadEnrolledCourse(req, res, 5);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PENDING_TRAINER_APPROVAL',
        error: expect.stringContaining('pending trainer approval')
      }));
    });

    test('Participant with REJECTED status cannot access course content', async () => {
      jest.spyOn(Course, 'findByPk').mockResolvedValue({ id: 5, title: 'Test Course', status: 'PUBLISHED' });
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue({
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'REJECTED'
      });

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        params: { courseId: 5 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = await participantCourseController.loadEnrolledCourse(req, res, 5);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'ENROLLMENT_REJECTED'
      }));
    });

    test('Participant with APPROVED status gets full course access', async () => {
      const fakeCourse = { id: 5, title: 'Test Course', status: 'PUBLISHED' };
      jest.spyOn(Course, 'findByPk').mockResolvedValue(fakeCourse);
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue({
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'APPROVED'
      });

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        params: { courseId: 5 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = await participantCourseController.loadEnrolledCourse(req, res, 5);

      expect(result.course).toEqual(fakeCourse);
      expect(result.enrollment).toBeDefined();
      expect(result.enrollment.status).toBe('APPROVED');
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    test('Existing enrollments with legacy ENROLLED status continue working with full course access', async () => {
      const fakeCourse = { id: 5, title: 'Test Course', status: 'PUBLISHED' };
      jest.spyOn(Course, 'findByPk').mockResolvedValue(fakeCourse);
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue({
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'ENROLLED'
      });

      const req = {
        user: { id: 102, role: 'PARTICIPANT' },
        params: { courseId: 5 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = await participantCourseController.loadEnrolledCourse(req, res, 5);

      expect(result.course).toEqual(fakeCourse);
      expect(result.enrollment).toBeDefined();
      expect(result.enrollment.status).toBe('ENROLLED');
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Trainer Approval & Rejection Flow
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Trainer Review Actions', () => {
    test('Trainer approves pending participant -> status becomes APPROVED', async () => {
      const fakeCourse = { id: 5, title: 'Node.js Mastery', trainerId: 10 };
      jest.spyOn(Course, 'findByPk').mockResolvedValue(fakeCourse);

      const fakeEnrollment = {
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'PENDING_TRAINER_APPROVAL',
        update: jest.fn().mockImplementation(async (vals) => {
          Object.assign(fakeEnrollment, vals);
          return fakeEnrollment;
        })
      };
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue(fakeEnrollment);

      const req = {
        user: { id: 10, role: 'TRAINER' },
        params: { courseId: 5, participantId: 102 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await trainerCourseController.approveParticipant(req, res);

      expect(fakeEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'APPROVED'
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('approved')
      }));
    });

    test('Trainer rejects pending participant -> status becomes REJECTED', async () => {
      const fakeCourse = { id: 5, title: 'Node.js Mastery', trainerId: 10 };
      jest.spyOn(Course, 'findByPk').mockResolvedValue(fakeCourse);

      const fakeEnrollment = {
        id: 777,
        courseId: 5,
        participantId: 102,
        status: 'PENDING_TRAINER_APPROVAL',
        update: jest.fn().mockImplementation(async (vals) => {
          Object.assign(fakeEnrollment, vals);
          return fakeEnrollment;
        })
      };
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue(fakeEnrollment);

      const req = {
        user: { id: 10, role: 'TRAINER' },
        params: { courseId: 5, participantId: 102 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await trainerCourseController.rejectParticipant(req, res);

      expect(fakeEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'REJECTED'
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('rejected')
      }));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Legacy Training Enrollment Workflow
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Legacy Training Enrollment Controller Flow', () => {
    test('enrollInTraining creates PENDING_TRAINER_APPROVAL for approved participant', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 105, role: 'PARTICIPANT', status: 'APPROVED' });
      jest.spyOn(Training, 'findByPk').mockResolvedValue({
        id: 20,
        title: 'Python Essentials',
        capacity: 50,
        trainerId: 10
      });
      jest.spyOn(Enrollment, 'count').mockResolvedValue(5);
      jest.spyOn(Enrollment, 'findOne').mockResolvedValue(null);
      jest.spyOn(Course, 'findOne').mockResolvedValue({ id: 50, title: 'Python Course' });
      const fakeCreated = {
        id: 888,
        trainingId: 20,
        courseId: 50,
        participantId: 105,
        status: 'PENDING_TRAINER_APPROVAL'
      };
      jest.spyOn(Enrollment, 'create').mockResolvedValue(fakeCreated);
      jest.spyOn(TrainingTrainerAssignment, 'findAll').mockResolvedValue([]);
      jest.spyOn(CourseTrainerAssignment, 'findAll').mockResolvedValue([]);

      const req = {
        user: { id: 105, role: 'PARTICIPANT' },
        body: { trainingId: 20 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await enrollmentController.enrollInTraining(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Pending trainer approval'),
        enrollment: expect.objectContaining({
          status: 'PENDING_TRAINER_APPROVAL'
        })
      }));
    });

    test('enrollInTraining prevents enrollment if participant is not Admin-approved', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 106, role: 'PARTICIPANT', status: 'PENDING' });
      jest.spyOn(Training, 'findByPk').mockResolvedValue({ id: 20, title: 'Python Essentials' });

      const req = {
        user: { id: 106, role: 'PARTICIPANT' },
        body: { trainingId: 20 },
        app: { get: () => null }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await enrollmentController.enrollInTraining(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringMatching(/administrator|pending Admin approval/i)
      }));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Lessons Access Parity
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Lessons Access Parity', () => {
    test('getParticipantLessons grants lessons only to APPROVED or ENROLLED participants', async () => {
      jest.spyOn(Enrollment, 'findAll').mockImplementation(async ({ where }) => {
        // Only return if status matches
        const statusClause = where.status;
        if (statusClause && statusClause[require('sequelize').Op.in]) {
          const allowed = statusClause[require('sequelize').Op.in];
          if (allowed.includes('APPROVED')) {
            return [{ courseId: 5, trainingId: 20, status: 'APPROVED' }];
          }
        }
        return [];
      });

      jest.spyOn(Lesson, 'findAll').mockResolvedValue([
        { id: 1, title: 'Lesson 1: Introduction' },
        { id: 2, title: 'Lesson 2: Core Concepts' }
      ]);

      const req = {
        user: { id: 102, role: 'PARTICIPANT' }
      };
      const res = {
        json: jest.fn()
      };

      await lessonController.getParticipantLessons(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        lessons: expect.arrayContaining([
          expect.objectContaining({ title: 'Lesson 1: Introduction' })
        ])
      }));
    });
  });
});
