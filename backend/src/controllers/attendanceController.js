const {
  AttendanceSession,
  AttendanceRecord,
  Course,
  Training,
  User,
  Enrollment,
  Notification
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const logger = require('../utils/logger');
const {
  getKolkataDate,
  calculateSessionStatus,
  ensureTrainingAttendanceSessions,
} = require('../services/attendanceAutomationService');

/**
 * Helper to check course ownership / trainer authorization
 */
async function verifyCourseAccess(courseId, user) {
  if (user.role === 'ADMIN') return true;
  if (!courseId) return false;
  const course = await Course.findByPk(courseId);
  if (!course) return false;
  return course.trainerId === user.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/attendance/trainings/:trainingId/generate
 * Explicitly generate/refresh Morning and Evening sessions for a training
 */
const generateTrainingSessions = async (req, res) => {
  try {
    const { trainingId } = req.params;
    const result = await ensureTrainingAttendanceSessions(trainingId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Failed to generate attendance sessions' });
    }
    res.json({ success: true, message: `Prepared ${result.count} attendance sessions`, count: result.count });
  } catch (error) {
    logger.error('Error generating training attendance sessions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate attendance sessions' });
  }
};

/**
 * POST /api/attendance/sessions
 * Trainer creates a new class / session (legacy / ad-hoc)
 */
const createSession = async (req, res) => {
  try {
    const { courseId, trainingId, title, sessionDate, startTime, endTime, batchName, topic, sessionType } = req.body;
    const trainerId = req.user.id;

    if (!title || !sessionDate) {
      return res.status(400).json({ success: false, error: 'Session title and date are required' });
    }

    if (courseId) {
      const hasAccess = await verifyCourseAccess(courseId, req.user);
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: 'Not authorized to manage attendance for this course' });
      }
    }

    const session = await AttendanceSession.create({
      courseId: courseId || null,
      trainingId: trainingId || null,
      trainerId,
      title: title.trim(),
      sessionDate,
      startTime: startTime || null,
      endTime: endTime || null,
      sessionType: sessionType || 'MORNING',
      batchName: batchName || null,
      topic: topic || null,
      status: 'COMPLETED',
      isLocked: false,
    });

    res.status(201).json({ success: true, message: 'Class session created', session });
  } catch (error) {
    logger.error('Error creating attendance session', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create attendance session' });
  }
};

/**
 * GET /api/attendance/sessions
 * List sessions with optional filters (courseId, date, search, trainerId)
 * Automatically ensures Morning and Evening sessions exist for the training
 */
const getSessions = async (req, res) => {
  try {
    const { courseId, trainingId, date, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const user = req.user;
    const todayIST = getKolkataDate();

    // Auto-generate missing daily sessions for the selected training or course
    if (trainingId) {
      await ensureTrainingAttendanceSessions(trainingId).catch(() => {});
    } else if (courseId) {
      const courseObj = await Course.findByPk(courseId);
      if (courseObj?.trainingProgramId) {
        await ensureTrainingAttendanceSessions(courseObj.trainingProgramId).catch(() => {});
      }
    }

    const where = {};
    if (courseId) where.courseId = courseId;
    if (trainingId) where.trainingId = trainingId;
    if (date) where.sessionDate = date;
    if (startDate && endDate) {
      where.sessionDate = { [Op.between]: [startDate, endDate] };
    }
    if (search && search.trim()) {
      where.title = { [Op.like]: `%${search.trim()}%` };
    }

    // Role scoping: Trainer sees sessions they conducted or for their courses
    if (user.role === 'TRAINER') {
      where[Op.or] = [
        { trainerId: user.id },
        ...(courseId ? [{ courseId }] : [])
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const { count, rows: sessions } = await AttendanceSession.findAndCountAll({
      where,
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title', 'startDate', 'endDate'] },
        { model: User, as: 'trainer', attributes: ['id', 'name', 'email'] },
        {
          model: AttendanceRecord,
          as: 'records',
          attributes: ['id', 'studentId', 'status'],
        }
      ],
      order: [['sessionDate', 'DESC'], ['sessionType', 'ASC'], ['created_at', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
      distinct: true,
    });

    // Add quick summary stats & dynamic lock status to each session
    const formatted = sessions.map(s => {
      const records = s.records || [];
      const presentCount = records.filter(r => r.status === 'PRESENT').length;
      const absentCount = records.filter(r => r.status === 'ABSENT').length;
      const lateCount = records.filter(r => r.status === 'LATE').length;
      const excusedCount = records.filter(r => r.status === 'EXCUSED').length;

      const tStart = s.training?.startDate || null;
      const tEnd = s.training?.endDate || null;
      const lockStatus = calculateSessionStatus(s.sessionDate, tStart, tEnd, todayIST);

      return {
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        sessionType: s.sessionType || 'MORNING',
        dayNumber: s.dayNumber || null,
        batchName: s.batchName,
        topic: s.topic,
        status: s.status,
        courseId: s.courseId,
        trainingId: s.trainingId,
        courseTitle: s.course?.title || s.training?.title || 'General',
        trainerName: s.trainer?.name || 'Trainer',
        totalMarked: records.length,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendanceRate: records.length > 0 ? Number(((presentCount / records.length) * 100).toFixed(1)) : 0,
        isOpen: lockStatus.isOpen,
        isLocked: lockStatus.isLocked,
        lockReason: lockStatus.lockReason,
        lockMessage: lockStatus.lockMessage,
        todayDate: todayIST,
        createdAt: s.created_at,
      };
    });

    res.json({
      success: true,
      sessions: formatted,
      todayDate: todayIST,
      total: count,
      page: parseInt(page, 10),
      totalPages: Math.ceil(count / parseInt(limit, 10)) || 1,
    });
  } catch (error) {
    logger.error('Error fetching attendance sessions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch attendance sessions' });
  }
};

/**
 * GET /api/attendance/sessions/:sessionId
 * Fetch full session details with enrolled students & their attendance status
 */
const getSessionDetail = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const todayIST = getKolkataDate();

    const session = await AttendanceSession.findByPk(sessionId, {
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title', 'startDate', 'endDate'] },
        { model: User, as: 'trainer', attributes: ['id', 'name', 'email'] },
        {
          model: AttendanceRecord,
          as: 'records',
          include: [{ model: User, as: 'student', attributes: ['id', 'name', 'email', 'employeeId', 'department', 'profilePic'] }],
        }
      ]
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const tStart = session.training?.startDate || null;
    const tEnd = session.training?.endDate || null;
    const lockStatus = calculateSessionStatus(session.sessionDate, tStart, tEnd, todayIST);

    // Fetch all enrolled students in this course or training program
    let enrolledStudents = [];
    if (session.courseId) {
      const enrollments = await Enrollment.findAll({
        where: { courseId: session.courseId, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } },
        include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email', 'employeeId', 'department', 'profilePic'] }]
      });
      enrolledStudents = enrollments.map(e => e.participant).filter(Boolean);
    } else if (session.trainingId) {
      const enrollments = await Enrollment.findAll({
        where: { trainingId: session.trainingId, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } },
        include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email', 'employeeId', 'department', 'profilePic'] }]
      });
      enrolledStudents = enrollments.map(e => e.participant).filter(Boolean);
    }

    // Map existing attendance records
    const recordMap = new Map();
    (session.records || []).forEach(r => {
      recordMap.set(String(r.studentId), r);
    });

    // Merge enrolled students with attendance records
    const studentsWithAttendance = enrolledStudents.map(student => {
      const record = recordMap.get(String(student.id));
      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        employeeId: student.employeeId,
        department: student.department,
        profilePic: student.profilePic,
        recordId: record?.id || null,
        status: record?.status || null, // null means not yet marked
        remarks: record?.remarks || '',
        markedAt: record?.markedAt || null,
      };
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        sessionType: session.sessionType || 'MORNING',
        dayNumber: session.dayNumber || null,
        batchName: session.batchName,
        topic: session.topic,
        courseId: session.courseId,
        trainingId: session.trainingId,
        courseTitle: session.course?.title || session.training?.title || 'General',
        trainerId: session.trainerId,
        trainerName: session.trainer?.name,
        isOpen: lockStatus.isOpen,
        isLocked: lockStatus.isLocked,
        lockReason: lockStatus.lockReason,
        lockMessage: lockStatus.lockMessage,
        todayDate: todayIST,
      },
      students: studentsWithAttendance,
      isLocked: lockStatus.isLocked,
      isOpen: lockStatus.isOpen,
      lockReason: lockStatus.lockReason,
      lockMessage: lockStatus.lockMessage,
    });
  } catch (error) {
    logger.error('Error fetching session details', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch session details' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE MARKING (SINGLE & BULK)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/attendance/sessions/:sessionId/mark
 * Bulk / single attendance marking with automatic duplicate prevention & locking rule enforcement
 * Body: { records: [ { studentId, status, remarks } ] }
 */
const markAttendance = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { sessionId } = req.params;
    const { records = [] } = req.body;
    const markedBy = req.user.id;
    const todayIST = getKolkataDate();

    if (!Array.isArray(records) || records.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'At least one student record is required' });
    }

    const session = await AttendanceSession.findByPk(sessionId, {
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title', 'startDate', 'endDate'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] },
      ],
      transaction: t,
    });

    if (!session) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Role check
    if (req.user.role === 'TRAINER') {
      const hasAccess = session.trainerId === req.user.id || (await verifyCourseAccess(session.courseId, req.user));
      if (!hasAccess) {
        await t.rollback();
        return res.status(403).json({ success: false, error: 'Not authorized to mark attendance for this session' });
      }
    }

    // ── Server-Side Locking Validation ──
    const tStart = session.training?.startDate || null;
    const tEnd = session.training?.endDate || null;
    const lockStatus = calculateSessionStatus(session.sessionDate, tStart, tEnd, todayIST);

    if (lockStatus.isLocked) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: lockStatus.lockMessage || `Attendance is locked. Only the current training day (${todayIST}) can be marked.`,
        lockReason: lockStatus.lockReason,
      });
    }

    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    const absentStudentIds = [];

    for (const rec of records) {
      const studentId = rec.studentId;
      const status = validStatuses.includes(rec.status) ? rec.status : 'PRESENT';
      const remarks = rec.remarks || null;

      if (!studentId) continue;

      // Upsert to ensure no duplicate records for same student & session
      const existing = await AttendanceRecord.findOne({
        where: { sessionId, studentId },
        transaction: t,
      });

      if (existing) {
        await existing.update({
          status,
          remarks,
          markedBy,
          markedAt: new Date(),
        }, { transaction: t });
      } else {
        await AttendanceRecord.create({
          sessionId,
          studentId,
          courseId: session.courseId,
          status,
          remarks,
          markedBy,
          markedAt: new Date(),
        }, { transaction: t });
      }

      if (status === 'ABSENT') {
        absentStudentIds.push(studentId);
      }
    }

    await t.commit();

    // Trigger absent notifications in background (non-blocking)
    try {
      const io = req.app.get('io');
      const NotificationService = require('../services/notificationService');
      for (const studentId of absentStudentIds) {
        await NotificationService.createNotification({
          userId: studentId,
          message: `You were marked ABSENT for session "${session.title}" (${session.sessionType || 'Session'}) on ${session.sessionDate}.`,
          type: 'OTHER',
          actionUrl: '/participant?tab=attendance',
        }, io).catch(() => {});
      }
    } catch (_) {}

    res.json({ success: true, message: `Attendance updated for ${records.length} students` });
  } catch (error) {
    await t.rollback();
    logger.error('Error marking attendance', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to mark attendance' });
  }
};

/**
 * PUT /api/attendance/sessions/:sessionId/records/:recordId
 * Edit single student attendance record (enforces locking rule)
 */
const updateRecord = async (req, res) => {
  try {
    const { recordId, sessionId } = req.params;
    const { status, remarks } = req.body;
    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    const todayIST = getKolkataDate();

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const record = await AttendanceRecord.findByPk(recordId, {
      include: [
        {
          model: AttendanceSession,
          as: 'session',
          include: [{ model: Training, as: 'training', attributes: ['id', 'startDate', 'endDate'] }],
        },
      ],
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Server-side lock check
    const s = record.session;
    if (s) {
      const lockStatus = calculateSessionStatus(s.sessionDate, s.training?.startDate, s.training?.endDate, todayIST);
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          error: lockStatus.lockMessage || `Attendance is locked for past or future dates.`,
          lockReason: lockStatus.lockReason,
        });
      }
    }

    await record.update({
      status,
      remarks: remarks !== undefined ? remarks : record.remarks,
      markedBy: req.user.id,
      markedAt: new Date(),
    });

    res.json({ success: true, message: 'Attendance record updated', record });
  } catch (error) {
    logger.error('Error updating attendance record', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update attendance record' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ATTENDANCE REPORT & PERCENTAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/student/summary
 * Student's comprehensive attendance overview
 */
const getStudentSummary = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { courseId } = req.query;

    const where = { studentId };
    if (courseId) where.courseId = courseId;

    const records = await AttendanceRecord.findAll({
      where,
      include: [
        {
          model: AttendanceSession,
          as: 'session',
          attributes: ['id', 'title', 'sessionDate', 'startTime', 'endTime', 'sessionType', 'dayNumber', 'batchName', 'topic'],
          include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }]
        }
      ],
      order: [['markedAt', 'DESC']],
    });

    const totalSessions = records.length;
    const presentSessions = records.filter(r => r.status === 'PRESENT').length;
    const lateSessions = records.filter(r => r.status === 'LATE').length;
    const absentSessions = records.filter(r => r.status === 'ABSENT').length;
    const excusedSessions = records.filter(r => r.status === 'EXCUSED').length;

    // Formula: (Present Sessions / Total Sessions) * 100
    const attendancePercentage = totalSessions > 0
      ? Number(((presentSessions / totalSessions) * 100).toFixed(1))
      : 100.0;

    const history = records.map(r => ({
      id: r.id,
      sessionId: r.sessionId,
      sessionTitle: r.session?.title || 'Session',
      courseTitle: r.session?.course?.title || 'General',
      sessionDate: r.session?.sessionDate,
      startTime: r.session?.startTime,
      sessionType: r.session?.sessionType || 'MORNING',
      dayNumber: r.session?.dayNumber || null,
      status: r.status,
      remarks: r.remarks,
      markedAt: r.markedAt,
    }));

    res.json({
      success: true,
      summary: {
        totalSessions,
        presentSessions,
        lateSessions,
        absentSessions,
        excusedSessions,
        attendancePercentage,
      },
      history,
    });
  } catch (error) {
    logger.error('Error fetching student attendance summary', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch attendance summary' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TRAINER COURSE ATTENDANCE SUMMARY & LOW ATTENDANCE ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/trainer/summary
 * Course-wide attendance metrics, student breakdown, and low attendance alerts (< 75%)
 */
const getTrainerSummary = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { courseId } = req.query;

    // Resolve courses taught by trainer
    let courses = [];
    if (courseId) {
      courses = await Course.findAll({ where: { id: courseId } });
    } else {
      courses = await Course.findAll({ where: { trainerId } });
    }
    const courseIds = courses.map(c => c.id);

    // Total sessions conducted
    const totalSessions = await AttendanceSession.count({
      where: {
        [Op.or]: [
          { trainerId },
          ...(courseIds.length > 0 ? [{ courseId: { [Op.in]: courseIds } }] : [])
        ]
      }
    });

    // Student breakdown
    const records = await AttendanceRecord.findAll({
      where: {
        courseId: { [Op.in]: courseIds }
      },
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email', 'department', 'profilePic'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] }
      ]
    });

    // Group by student
    const studentMap = new Map();
    records.forEach(r => {
      if (!r.student) return;
      const sId = r.studentId;
      if (!studentMap.has(sId)) {
        studentMap.set(sId, {
          studentId: sId,
          name: r.student.name,
          email: r.student.email,
          department: r.student.department,
          profilePic: r.student.profilePic,
          courseTitle: r.course?.title,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        });
      }
      const s = studentMap.get(sId);
      s.total++;
      if (r.status === 'PRESENT') s.present++;
      else if (r.status === 'ABSENT') s.absent++;
      else if (r.status === 'LATE') s.late++;
      else if (r.status === 'EXCUSED') s.excused++;
    });

    const studentList = Array.from(studentMap.values()).map(s => {
      const pct = s.total > 0 ? Number(((s.present / s.total) * 100).toFixed(1)) : 100;
      return {
        ...s,
        percentage: pct,
        isLowAttendance: pct < 75,
      };
    });

    const lowAttendanceStudents = studentList.filter(s => s.isLowAttendance);
    const overallPresent = records.filter(r => r.status === 'PRESENT').length;
    const overallRate = records.length > 0 ? Number(((overallPresent / records.length) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      summary: {
        totalSessions,
        totalRecords: records.length,
        overallAttendanceRate: overallRate,
        totalStudentsTracked: studentList.length,
        lowAttendanceCount: lowAttendanceStudents.length,
      },
      students: studentList,
      lowAttendanceStudents,
    });
  } catch (error) {
    logger.error('Error fetching trainer attendance summary', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch trainer attendance summary' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ATTENDANCE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/admin/analytics
 * Platform-wide attendance analytics across all courses, trainers, and students
 */
const getAdminAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const sessionWhere = {};
    if (startDate && endDate) {
      sessionWhere.sessionDate = { [Op.between]: [startDate, endDate] };
    }

    const [totalSessions, totalRecords, presentRecords, absentRecords, courseBreakdown] = await Promise.all([
      AttendanceSession.count({ where: sessionWhere }),
      AttendanceRecord.count(),
      AttendanceRecord.count({ where: { status: 'PRESENT' } }),
      AttendanceRecord.count({ where: { status: 'ABSENT' } }),
      AttendanceSession.findAll({
        attributes: [
          'courseId',
          [sequelize.fn('COUNT', sequelize.col('AttendanceSession.id')), 'sessionCount'],
        ],
        include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }],
        group: ['courseId', 'course.id', 'course.title'],
      })
    ]);

    const orgAttendanceRate = totalRecords > 0
      ? Number(((presentRecords / totalRecords) * 100).toFixed(1))
      : 0;

    // Recent 10 sessions with stats
    const recentSessions = await AttendanceSession.findAll({
      limit: 10,
      order: [['sessionDate', 'DESC'], ['created_at', 'DESC']],
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: User, as: 'trainer', attributes: ['id', 'name'] },
        { model: AttendanceRecord, as: 'records', attributes: ['status'] }
      ]
    });

    const formattedRecent = recentSessions.map(s => {
      const recs = s.records || [];
      const present = recs.filter(r => r.status === 'PRESENT').length;
      return {
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        courseTitle: s.course?.title || 'General',
        trainerName: s.trainer?.name || 'Trainer',
        totalMarked: recs.length,
        presentCount: present,
        rate: recs.length > 0 ? Number(((present / recs.length) * 100).toFixed(1)) : 0,
      };
    });

    res.json({
      success: true,
      analytics: {
        totalSessions,
        totalRecords,
        presentRecords,
        absentRecords,
        orgAttendanceRate,
        recentSessions: formattedRecent,
      }
    });
  } catch (error) {
    logger.error('Error fetching admin attendance analytics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch admin attendance analytics' });
  }
};

module.exports = {
  createSession,
  generateTrainingSessions,
  getSessions,
  getSessionDetail,
  markAttendance,
  updateRecord,
  getStudentSummary,
  getTrainerSummary,
  getAdminAnalytics,
};
