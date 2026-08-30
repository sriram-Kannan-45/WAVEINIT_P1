/**
 * AnalyticsService
 * Handles analytics calculations and metrics generation
 * Provides enrollment trends, trainer performance, user metrics, and student/trainer analytics
 */

const {
  Enrollment,
  Training,
  Course,
  Feedback,
  User,
  ActivityLog,
  AIQuiz,
  QuizResult,
  CodingAssessment,
  CodingResult,
  Lesson,
  LessonProgress,
  AttendanceRecord,
  Certificate,
  UserBadge,
} = require('../models');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class AnalyticsService {
  /**
   * Get student-specific learning & performance analytics
   * @param {number} userId - Student user ID
   */
  static async getStudentAnalytics(userId) {
    try {
      const [
        enrollments,
        quizResults,
        codingResults,
        attendanceRecords,
        certificates,
        badges,
      ] = await Promise.all([
        Enrollment.findAll({
          where: { participantId: userId, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } },
          include: [
            { model: Course, as: 'course', attributes: ['id', 'title'] },
            { model: Training, as: 'training', attributes: ['id', 'title'] },
          ],
        }),
        QuizResult.findAll({
          where: { participantId: userId, resultPublished: true },
          include: [{ model: AIQuiz, as: 'quiz', attributes: ['id', 'title'] }],
          order: [['evaluated_at', 'ASC']],
        }),
        CodingResult.findAll({
          where: { participantId: userId },
          include: [{ model: CodingAssessment, as: 'assessment', attributes: ['id', 'title'] }],
          order: [['created_at', 'ASC']],
        }),
        AttendanceRecord.findAll({
          where: { studentId: userId },
          attributes: ['id', 'status', 'markedAt'],
        }),
        Certificate.findAll({
          where: { userId },
          attributes: ['id', 'certificateCode', 'issuedAt'],
        }),
        UserBadge.findAll({
          where: { userId },
          attributes: ['id', 'badgeKey', 'title', 'icon', 'earnedAt'],
        }),
      ]);

      // 1. Scores Calculation
      const quizPercentages = quizResults.map(r => parseFloat(r.percentage) || 0);
      const codingPercentages = codingResults.map(r => parseFloat(r.percentage) || (r.score != null ? parseFloat(r.score) : 0));
      const allPercentages = [...quizPercentages, ...codingPercentages];

      const averageScore = allPercentages.length > 0
        ? Number((allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length).toFixed(1))
        : 0;

      const bestScore = allPercentages.length > 0
        ? Number(Math.max(...allPercentages).toFixed(1))
        : 0;

      // 2. Weak Areas (Topics or quizzes where score < 60%)
      const weakAreas = [];
      quizResults.forEach(qr => {
        const pct = parseFloat(qr.percentage) || 0;
        if (pct < 60) {
          weakAreas.push({
            type: 'Quiz',
            title: qr.quiz?.title || 'Quiz',
            topic: qr.quiz?.title || 'General',
            score: Number(pct.toFixed(1)),
          });
        }
      });
      codingResults.forEach(cr => {
        const pct = parseFloat(cr.percentage) || 0;
        if (pct < 60) {
          weakAreas.push({
            type: 'Coding',
            title: cr.assessment?.title || 'Coding Assessment',
            topic: 'Programming',
            score: Number(pct.toFixed(1)),
          });
        }
      });

      // 3. Score Progression Trend
      const testHistory = [
        ...quizResults.map(qr => ({
          title: qr.quiz?.title || 'Quiz',
          score: Number((parseFloat(qr.percentage) || 0).toFixed(1)),
          date: qr.evaluatedAt ? new Date(qr.evaluatedAt).toLocaleDateString() : null,
          type: 'Quiz',
        })),
        ...codingResults.map(cr => ({
          title: cr.assessment?.title || 'Coding Assessment',
          score: Number((parseFloat(cr.percentage) || 0).toFixed(1)),
          date: cr.created_at ? new Date(cr.created_at).toLocaleDateString() : null,
          type: 'Coding',
        })),
      ].filter(t => t.date);

      // 4. Course Progress Breakdown
      let totalEnrolled = enrollments.length;
      let completedCount = 0;
      let inProgressCount = 0;
      const courseProgressList = enrollments.map(e => {
        const p = Number(e.progressPercent || 0);
        if (p >= 100 || e.status === 'COMPLETED') completedCount++;
        else inProgressCount++;
        return {
          id: e.courseId || e.trainingId,
          title: e.course?.title || e.training?.title || 'Course',
          progress: p,
          status: p >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
        };
      });

      // 5. Attendance Percentage
      const totalAttendance = attendanceRecords.length;
      const presentAttendance = attendanceRecords.filter(r => r.status === 'PRESENT').length;
      const attendanceRate = totalAttendance > 0
        ? Number(((presentAttendance / totalAttendance) * 100).toFixed(1))
        : 100;

      return {
        averageScore,
        bestScore,
        totalTestsTaken: allPercentages.length,
        totalEnrolled,
        completedCourses: completedCount,
        inProgressCourses: inProgressCount,
        attendanceRate,
        totalSessionsAttended: presentAttendance,
        totalSessionsConducted: totalAttendance,
        certificatesCount: certificates.length,
        badgesCount: badges.length,
        weakAreas,
        testHistory,
        courseProgress: courseProgressList,
        badges,
      };
    } catch (error) {
      logger.error('Error fetching student analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get trainer-specific analytics
   * @param {number} trainerId - Trainer user ID
   */
  static async getTrainerAnalytics(trainerId) {
    try {
      const courses = await Course.findAll({
        where: { trainerId },
        attributes: ['id', 'title', 'status', 'created_at'],
      });
      const courseIds = courses.map(c => c.id);

      const [enrollments, quizzes, codingAssessments, feedbacks, attendanceRecords] = await Promise.all([
        Enrollment.findAll({
          where: { courseId: { [Op.in]: courseIds }, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } },
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        }),
        AIQuiz.findAll({
          where: { courseId: { [Op.in]: courseIds } },
          include: [{ model: QuizResult, as: 'results', attributes: ['percentage', 'totalScore'] }],
        }),
        CodingAssessment.findAll({
          where: { courseId: { [Op.in]: courseIds } },
          include: [{ model: CodingResult, as: 'results', attributes: ['totalScore', 'percentage'] }],
        }),
        Feedback.findAll({
          where: { courseId: { [Op.in]: courseIds } },
          attributes: ['courseRating', 'trainerRating', 'comments', 'submitted_at', 'anonymous'],
        }),
        AttendanceRecord.findAll({
          where: { courseId: { [Op.in]: courseIds } },
          attributes: ['studentId', 'status'],
        }),
      ]);

      const totalStudents = new Set(enrollments.map(e => e.participantId)).size;
      const completedEnrollments = enrollments.filter(e => Number(e.progressPercent || 0) >= 100 || e.status === 'COMPLETED').length;
      const avgCompletionRate = enrollments.length > 0
        ? Number(((completedEnrollments / enrollments.length) * 100).toFixed(1))
        : 0;

      // Feedback stats
      const totalFeedbacks = feedbacks.length;
      const avgRating = totalFeedbacks > 0
        ? Number((feedbacks.reduce((s, f) => s + (f.courseRating || f.trainerRating || 5), 0) / totalFeedbacks).toFixed(1))
        : 5.0;

      // Attendance stats
      const totalAtt = attendanceRecords.length;
      const presentAtt = attendanceRecords.filter(a => a.status === 'PRESENT').length;
      const attendanceRate = totalAtt > 0
        ? Number(((presentAtt / totalAtt) * 100).toFixed(1))
        : 0;

      // Per course performance breakdown
      const courseBreakdown = courses.map(c => {
        const cEnr = enrollments.filter(e => e.courseId === c.id);
        const cComp = cEnr.filter(e => Number(e.progressPercent || 0) >= 100 || e.status === 'COMPLETED').length;
        return {
          courseId: c.id,
          title: c.title,
          status: c.status,
          enrolledCount: cEnr.length,
          completedCount: cComp,
          completionRate: cEnr.length > 0 ? Number(((cComp / cEnr.length) * 100).toFixed(1)) : 0,
        };
      });

      return {
        totalCourses: courses.length,
        totalStudents,
        totalAssessments: quizzes.length + codingAssessments.length,
        averageCompletionRate: avgCompletionRate,
        averageFeedbackRating: avgRating,
        totalFeedbacks,
        attendanceRate,
        courseBreakdown,
      };
    } catch (error) {
      logger.error('Error fetching trainer analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get comprehensive dashboard analytics for Admins
   */
  static async getDashboardAnalytics(options = {}) {
    try {
      const [
        enrollmentTrend,
        trainerPerformance,
        userMetrics,
        enrollmentMetrics,
        recentActivities,
      ] = await Promise.all([
        this.getEnrollmentTrend(options),
        this.getTrainerPerformance(options),
        this.getUserMetrics(options),
        this.getEnrollmentMetrics(options),
        this.getRecentActivities(),
      ]);

      const [totalCourses, totalTrainings, totalAttendanceRecords, presentAttendanceRecords, avgFeedback] = await Promise.all([
        Course.count(),
        Training.count(),
        AttendanceRecord.count(),
        AttendanceRecord.count({ where: { status: 'PRESENT' } }),
        Feedback.aggregate('courseRating', 'AVG'),
      ]);

      const orgAttendanceRate = totalAttendanceRecords > 0
        ? Number(((presentAttendanceRecords / totalAttendanceRecords) * 100).toFixed(1))
        : 0;

      return {
        enrollmentTrend,
        trainerPerformance,
        userMetrics,
        enrollmentMetrics,
        recentActivities,
        totalCourses,
        totalTrainings,
        orgAttendanceRate,
        avgFeedbackRating: Number(Number(avgFeedback || 5.0).toFixed(1)),
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error fetching dashboard analytics', { error: error.message });
      throw error;
    }
  }

  static async getEnrollmentTrend(options = {}) {
    try {
      const period = options.period || 'daily';
      const dateRange = options.dateRange || this.getDefaultDateRange(30);

      const trend = await Enrollment.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        where: {
          enrolled_at: { [Op.between]: [dateRange.start, dateRange.end] },
        },
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
        raw: true,
      });

      return trend.map((item) => ({
        date: item.date,
        count: parseInt(item.count, 10),
      }));
    } catch (error) {
      logger.error('Error fetching enrollment trend', { error: error.message });
      return [];
    }
  }

  static async getTrainerPerformance(options = {}) {
    try {
      const trainers = await User.findAll({
        where: { role: 'TRAINER', isDeleted: false },
        attributes: ['id', 'name', 'email'],
        include: [
          { model: Course, as: 'courses', attributes: ['id'] },
        ],
      });

      const list = await Promise.all(trainers.map(async t => {
        const cIds = (t.courses || []).map(c => c.id);
        const [enrCount, feedbacks] = await Promise.all([
          cIds.length > 0 ? Enrollment.count({ where: { courseId: { [Op.in]: cIds } } }) : 0,
          cIds.length > 0 ? Feedback.findAll({ where: { courseId: { [Op.in]: cIds } }, attributes: ['courseRating', 'trainerRating'] }) : [],
        ]);

        const avgRating = feedbacks.length > 0
          ? Number((feedbacks.reduce((s, f) => s + (f.courseRating || f.trainerRating || 5), 0) / feedbacks.length).toFixed(1))
          : 5.0;

        return {
          id: t.id,
          trainerName: t.name || 'Trainer',
          email: t.email,
          totalCourses: cIds.length,
          totalEnrollments: enrCount,
          feedbackCount: feedbacks.length,
          avgRating,
        };
      }));

      return list.sort((a, b) => b.totalEnrollments - a.totalEnrollments);
    } catch (error) {
      logger.error('Error fetching trainer performance', { error: error.message });
      return [];
    }
  }

  static async getUserMetrics(options = {}) {
    try {
      const totalUsers = await User.count({ where: { isDeleted: false } });
      const activeUsers = await this.getActiveUserCount(7);

      const usersByRole = await User.findAll({
        where: { isDeleted: false },
        attributes: ['role', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['role'],
        raw: true,
      });

      return {
        totalUsers,
        activeUsers,
        inactiveUsers: Math.max(0, totalUsers - activeUsers),
        usersByRole: usersByRole.map((item) => ({
          role: item.role,
          count: parseInt(item.count, 10),
        })),
      };
    } catch (error) {
      logger.error('Error fetching user metrics', { error: error.message });
      return { totalUsers: 0, activeUsers: 0, inactiveUsers: 0, usersByRole: [] };
    }
  }

  static async getEnrollmentMetrics(options = {}) {
    try {
      const totalEnrollments = await Enrollment.count();
      const completedEnrollments = await Enrollment.count({
        where: { [Op.or]: [{ status: 'COMPLETED' }, { progressPercent: { [Op.gte]: 100 } }] },
      });
      const activeEnrollments = await Enrollment.count({
        where: { status: 'ENROLLED' },
      });

      const completionRate = totalEnrollments > 0
        ? Number(((completedEnrollments / totalEnrollments) * 100).toFixed(1))
        : 0;

      return {
        totalEnrollments,
        activeEnrollments,
        completedEnrollments,
        completionRate,
      };
    } catch (error) {
      logger.error('Error fetching enrollment metrics', { error: error.message });
      return { totalEnrollments: 0, activeEnrollments: 0, completedEnrollments: 0, completionRate: 0 };
    }
  }

  static async getActiveUserCount(inactiveThresholdDays = 7) {
    try {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - inactiveThresholdDays);

      const count = await User.count({
        where: {
          isDeleted: false,
          updated_at: { [Op.gte]: threshold },
        }
      });
      return count || 1;
    } catch (error) {
      return 1;
    }
  }

  static async getRecentActivities(limit = 10) {
    try {
      const activities = await ActivityLog.findAll({
        order: [['created_at', 'DESC']],
        limit,
        raw: true,
      });
      return activities;
    } catch (error) {
      return [];
    }
  }

  static getDefaultDateRange(days = 30) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }
}

module.exports = AnalyticsService;
