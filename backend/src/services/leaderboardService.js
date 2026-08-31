const {
  User,
  Enrollment,
  Course,
  Training,
  AIQuiz,
  QuizResult,
  CodingAssessment,
  CodingResult,
  LessonProgress,
  AttendanceRecord,
  UserBadge
} = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// Simple in-memory LRU cache for leaderboard snapshots (TTL 30 seconds)
const leaderboardCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

class LeaderboardService {
  /**
   * Get leaderboard rankings with configurable scope and timeframe
   * @param {Object} params - { scope: 'overall'|'course'|'training', id: number|string, timeframe: 'all_time'|'monthly'|'weekly' }
   */
  static async getLeaderboard({ scope = 'overall', id = null, timeframe = 'all_time' }) {
    const cacheKey = `${scope}_${id || 'none'}_${timeframe}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    try {
      // 1. Timeframe boundary
      let timeBoundary = null;
      if (timeframe === 'weekly') {
        timeBoundary = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeframe === 'monthly') {
        timeBoundary = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      // 2. Fetch eligible participants
      let participantFilter = { role: 'PARTICIPANT', isDeleted: false, status: { [Op.ne]: 'INACTIVE' } };
      let courseIds = [];
      let trainingId = null;

      if (scope === 'course' && id) {
        courseIds = [parseInt(id, 10)];
      } else if (scope === 'training' && id) {
        trainingId = parseInt(id, 10);
        const linkedCourses = await Course.findAll({
          where: { trainingProgramId: trainingId },
          attributes: ['id']
        });
        courseIds = linkedCourses.map(c => c.id);
      }

      // Get enrolled users for this scope
      let enrolledUserIds = null;
      if (scope !== 'overall') {
        const enrollmentConditions = [];
        if (courseIds.length > 0) enrollmentConditions.push({ courseId: { [Op.in]: courseIds } });
        if (trainingId) enrollmentConditions.push({ trainingId });

        const enrollments = await Enrollment.findAll({
          where: {
            [Op.or]: enrollmentConditions,
            status: { [Op.in]: ['ENROLLED', 'COMPLETED'] }
          },
          attributes: ['participantId'],
          raw: true
        });
        enrolledUserIds = Array.from(new Set(enrollments.map(e => e.participantId)));
        if (enrolledUserIds.length === 0) {
          return { scope, timeframe, id, leaderboard: [], summary: { totalParticipants: 0, highestPoints: 0 } };
        }
        participantFilter.id = { [Op.in]: enrolledUserIds };
      }

      // 3. Fetch participants
      const participants = await User.findAll({
        where: participantFilter,
        attributes: ['id', 'name', 'email', 'employeeId', 'department', 'designation', 'profilePic'],
        raw: true
      });

      if (participants.length === 0) {
        return { scope, timeframe, id, leaderboard: [], summary: { totalParticipants: 0, highestPoints: 0 } };
      }

      const pIds = participants.map(p => p.id);

      // 4. Fetch Quiz Results
      const quizWhere = { participantId: { [Op.in]: pIds }, resultPublished: true };
      if (timeBoundary) quizWhere.evaluated_at = { [Op.gte]: timeBoundary };
      if (courseIds.length > 0) {
        const quizzesInScope = await AIQuiz.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'] });
        quizWhere.quizId = { [Op.in]: quizzesInScope.map(q => q.id) };
      }
      const quizResults = await QuizResult.findAll({
        where: quizWhere,
        attributes: ['participantId', 'totalScore', 'percentage'],
        raw: true
      });

      // 5. Fetch Coding Assessment Results
      const codingWhere = { participantId: { [Op.in]: pIds } };
      if (timeBoundary) codingWhere.created_at = { [Op.gte]: timeBoundary };
      if (courseIds.length > 0) {
        const codingInScope = await CodingAssessment.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'] });
        codingWhere.assessmentId = { [Op.in]: codingInScope.map(c => c.id) };
      }
      const codingResults = await CodingResult.findAll({
        where: codingWhere,
        attributes: ['participantId', 'totalScore', 'percentage'],
        raw: true
      });

      // 6. Fetch Completed Lessons
      const lessonProgressWhere = { participantId: { [Op.in]: pIds }, status: 'COMPLETED' };
      if (timeBoundary) lessonProgressWhere.completed_at = { [Op.gte]: timeBoundary };
      const lessonProgresses = await LessonProgress.findAll({
        where: lessonProgressWhere,
        attributes: ['participantId'],
        raw: true
      });

      // 7. Fetch Attendance Records
      const attendanceWhere = { studentId: { [Op.in]: pIds }, status: 'PRESENT' };
      if (timeBoundary) attendanceWhere.marked_at = { [Op.gte]: timeBoundary };
      if (courseIds.length > 0) attendanceWhere.courseId = { [Op.in]: courseIds };
      const attendanceRecords = await AttendanceRecord.findAll({
        where: attendanceWhere,
        attributes: ['studentId'],
        raw: true
      });

      // 8. Fetch Completed Enrollments / Courses
      const completedEnrollments = await Enrollment.findAll({
        where: {
          participantId: { [Op.in]: pIds },
          [Op.or]: [
            { status: 'COMPLETED' },
            { progressPercent: { [Op.gte]: 100 } }
          ]
        },
        attributes: ['participantId'],
        raw: true
      });

      // 9. Fetch Badges
      const badges = await UserBadge.findAll({
        where: { userId: { [Op.in]: pIds } },
        attributes: ['userId', 'title', 'icon'],
        raw: true
      });

      // 10. Aggregate points per participant
      const statsMap = new Map();
      participants.forEach(p => {
        statsMap.set(p.id, {
          userId: p.id,
          participantId: p.id,
          name: p.name || 'Student',
          email: p.email,
          employeeId: p.employeeId,
          department: p.department,
          profilePic: p.profilePic,
          avatar: p.profilePic,
          profileImage: p.profilePic,
          quizScoreTotal: 0,
          codingScoreTotal: 0,
          lessonsCompleted: 0,
          attendancePresentCount: 0,
          coursesCompletedCount: 0,
          badges: [],
          totalPoints: 0,
        });
      });

      quizResults.forEach(qr => {
        const s = statsMap.get(qr.participantId);
        if (s) {
          const sc = parseFloat(qr.totalScore) || parseFloat(qr.percentage) || 0;
          s.quizScoreTotal += Math.round(sc);
        }
      });

      codingResults.forEach(cr => {
        const s = statsMap.get(cr.participantId);
        if (s) {
          const sc = parseFloat(cr.totalScore) || parseFloat(cr.percentage) || 0;
          s.codingScoreTotal += Math.round(sc);
        }
      });

      lessonProgresses.forEach(lp => {
        const s = statsMap.get(lp.participantId);
        if (s) s.lessonsCompleted++;
      });

      attendanceRecords.forEach(ar => {
        const s = statsMap.get(ar.studentId);
        if (s) s.attendancePresentCount++;
      });

      completedEnrollments.forEach(ce => {
        const s = statsMap.get(ce.participantId);
        if (s) s.coursesCompletedCount++;
      });

      badges.forEach(b => {
        const s = statsMap.get(b.userId);
        if (s) s.badges.push({ title: b.title, icon: b.icon });
      });

      // Formula: (Quiz Marks) + (Coding Marks) + (Lessons * 20) + (Attendance * 10) + (Courses Completed * 100)
      const list = Array.from(statsMap.values()).map(item => {
        const totalPoints =
          item.quizScoreTotal +
          item.codingScoreTotal +
          (item.lessonsCompleted * 20) +
          (item.attendancePresentCount * 10) +
          (item.coursesCompletedCount * 100);

        return {
          ...item,
          totalPoints,
        };
      });

      // Sort by points descending
      list.sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));

      // Compute rank with tie handling
      let currentRank = 1;
      for (let i = 0; i < list.length; i++) {
        if (i > 0 && list[i].totalPoints < list[i - 1].totalPoints) {
          currentRank = i + 1;
        }
        list[i].rank = currentRank;
      }

      const result = {
        scope,
        timeframe,
        id,
        summary: {
          totalParticipants: list.length,
          highestPoints: list.length > 0 ? list[0].totalPoints : 0,
        },
        leaderboard: list,
      };

      leaderboardCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    } catch (error) {
      logger.error('Error computing leaderboard', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

module.exports = LeaderboardService;
