const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const {
  User,
  Training,
  Enrollment,
  Feedback,
  AIQuiz,
  CodingAssessment,
  Interview,
  ActivityLog
} = require('../models');
const logger = require('../utils/logger');

// Production-safe short in-memory cache (10 seconds TTL)
let summaryCache = null;
let summaryCacheExpiry = 0;
const CACHE_TTL_MS = 10 * 1000;

/**
 * Invalidate summary cache upon mutating admin actions (approvals, creations, deletes)
 */
const invalidateSummaryCache = () => {
  summaryCache = null;
  summaryCacheExpiry = 0;
};

/**
 * GET /api/admin/dashboard/summary
 * Returns real aggregated statistics, top training programs, pending participants preview,
 * and recent platform activities in a single fast, indexed query.
 */
const getDashboardSummary = async (req, res) => {
  const startTime = Date.now();
  try {
    const bypassCache = req.query.fresh === 'true' || req.query.refresh === 'true';
    const nowMs = Date.now();

    if (!bypassCache && summaryCache && nowMs < summaryCacheExpiry) {
      return res.json({
        success: true,
        cached: true,
        data: summaryCache,
        executionTimeMs: Date.now() - startTime
      });
    }

    const now = new Date();

    // Execute parallel aggregated queries
    const [
      totalParticipants,
      activeParticipants,
      pendingParticipants,
      rejectedParticipants,
      totalTrainers,
      totalTrainings,
      completedTrainings,
      totalEnrollments,
      totalQuizzes,
      totalCoding,
      totalInterviews,
      pendingList,
      topTrainingsList,
      recentLogs,
      feedbackAgg
    ] = await Promise.all([
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false } }),
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false, status: 'APPROVED' } }),
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false, status: 'PENDING' } }),
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false, status: 'REJECTED' } }),
      User.count({ where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' } }),
      Training.count(),
      Training.count({ where: { endDate: { [Op.lt]: now } } }),
      Enrollment.count({ where: { status: 'ENROLLED' } }),
      AIQuiz ? AIQuiz.count().catch(() => 0) : Promise.resolve(0),
      CodingAssessment ? CodingAssessment.count().catch(() => 0) : Promise.resolve(0),
      Interview ? Interview.count().catch(() => 0) : Promise.resolve(0),
      User.findAll({
        where: { role: 'PARTICIPANT', status: 'PENDING', isDeleted: false },
        attributes: ['id', 'name', 'email', 'phone', 'username', 'created_at'],
        order: [['id', 'DESC']],
        limit: 5
      }),
      Training.findAll({
        attributes: ['id', 'title', 'startDate', 'endDate', 'capacity', 'trainerId', 'created_at'],
        include: [
          { model: User, as: 'trainer', attributes: ['id', 'name'], required: false }
        ],
        order: [['id', 'DESC']],
        limit: 5
      }),
      ActivityLog ? ActivityLog.findAll({
        attributes: ['id', 'userName', 'action', 'entityType', 'created_at'],
        order: [['created_at', 'DESC']],
        limit: 5
      }).catch(() => []) : Promise.resolve([]),
      Feedback.findAll({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('trainerRating')), 'avgTrainerRating'],
          [sequelize.fn('AVG', sequelize.col('subjectRating')), 'avgSubjectRating'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalFeedbacks']
        ],
        raw: true
      }).catch(() => ([{}]))
    ]);

    // Single grouped query to get enrolled counts for the top trainings (no N+1 query)
    const topTrainingIds = topTrainingsList.map(t => t.id);
    let enrollmentCountMap = {};
    if (topTrainingIds.length > 0) {
      const counts = await Enrollment.findAll({
        where: { trainingId: { [Op.in]: topTrainingIds }, status: 'ENROLLED' },
        attributes: ['trainingId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['trainingId'],
        raw: true
      });
      counts.forEach(c => {
        enrollmentCountMap[c.trainingId] = parseInt(c.count, 10) || 0;
      });
    }

    const topTrainings = topTrainingsList.map(t => ({
      id: t.id,
      title: t.title,
      trainerName: t.trainer?.name || 'Unassigned',
      startDate: t.startDate,
      endDate: t.endDate,
      createdAt: t.created_at,
      capacity: t.capacity,
      enrolledCount: enrollmentCountMap[t.id] || 0
    }));

    const activeTrainings = Math.max(0, totalTrainings - completedTrainings);
    const totalAssessments = (totalQuizzes || 0) + (totalCoding || 0);

    const fStat = (feedbackAgg && feedbackAgg[0]) || {};
    const avgTrainerRating = fStat.avgTrainerRating ? parseFloat(fStat.avgTrainerRating).toFixed(1) : '0.0';
    const avgSubjectRating = fStat.avgSubjectRating ? parseFloat(fStat.avgSubjectRating).toFixed(1) : '0.0';
    const satisfactionScore = (((parseFloat(avgTrainerRating) + parseFloat(avgSubjectRating)) / 2) || 0).toFixed(1);
    const totalFeedbacks = parseInt(fStat.totalFeedbacks, 10) || 0;

    const payload = {
      // Metric counters
      totalParticipants,
      activeParticipants,
      pendingParticipants,
      rejectedParticipants,
      pendingApprovals: pendingParticipants,
      totalTrainers,
      totalTrainings,
      totalPrograms: totalTrainings,
      activeTrainings,
      activePrograms: activeTrainings,
      completedTrainings,
      completedPrograms: completedTrainings,
      totalEnrollments,
      totalAssessments,
      totalInterviews,
      totalFeedbacks,
      avgTrainerRating,
      avgSubjectRating,
      satisfactionScore,

      // Donut slice breakdowns
      participantStatusBreakdown: {
        active: activeParticipants,
        pending: pendingParticipants,
        inactive: rejectedParticipants,
        total: totalParticipants
      },
      trainingStatusBreakdown: {
        published: totalTrainings,
        active: activeTrainings,
        completed: completedTrainings,
        total: totalTrainings
      },

      // Widgets
      topTrainings,
      pendingList: pendingList.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        username: p.username,
        created_at: p.created_at || p.createdAt,
        appliedAt: p.created_at || p.createdAt
      })),
      recentActivities: (recentLogs || []).map(l => ({
        id: l.id,
        userName: l.userName || 'System',
        action: l.action,
        entityType: l.entityType,
        created_at: l.created_at || l.createdAt
      }))
    };

    // Store in short TTL cache
    summaryCache = payload;
    summaryCacheExpiry = Date.now() + CACHE_TTL_MS;

    res.json({
      success: true,
      cached: false,
      data: payload,
      executionTimeMs: Date.now() - startTime
    });
  } catch (error) {
    logger.error('Get dashboard summary error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Server error retrieving dashboard summary',
      details: error.message
    });
  }
};

module.exports = {
  getDashboardSummary,
  invalidateSummaryCache
};
