const {
  Training,
  User,
  Course,
  Enrollment,
  AIQuiz,
  QuizAttempt,
  QuizResult,
  CodingAssessment,
  CodingAttempt,
  CodingResult,
  TrainingTrainerAssignment,
  CourseTrainerAssignment
} = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/trainings/:id/leaderboard
 * ─────────────────────────────────
 * Retrieves the complete leaderboard for a SPECIFIC training program.
 * Strictly scopes data to the specified trainingId (and its linked courses).
 * Participants from other trainings are never mixed.
 */
const getTrainingLeaderboard = async (req, res) => {
  try {
    const trainingId = req.params.id || req.params.trainingId;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!trainingId || isNaN(parseInt(trainingId, 10))) {
      return res.status(400).json({ error: 'Valid Training ID is required' });
    }

    const parsedTrainingId = parseInt(trainingId, 10);

    // 1. Fetch Training with trainer info
    const training = await Training.findByPk(parsedTrainingId, {
      include: [
        { model: User, as: 'trainer', attributes: ['id', 'name', 'email', 'profilePic'], required: false },
        {
          model: TrainingTrainerAssignment,
          as: 'trainerAssignments',
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email', 'profilePic'] }]
        }
      ]
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // 2. Fetch associated courses
    const courses = await Course.findAll({
      where: { trainingProgramId: parsedTrainingId },
      attributes: ['id', 'title', 'trainerId', 'status']
    });
    const courseIds = courses.map(c => c.id);

    // 3. RBAC authorization check
    if (userRole !== 'ADMIN') {
      if (userRole === 'TRAINER') {
        const assignedTrainerIds = [
          ...(training.trainerId ? [training.trainerId] : []),
          ...(training.trainerAssignments || []).map(ta => ta.trainerId)
        ];

        // Also check CourseTrainerAssignment
        const courseTrainerAssignments = courseIds.length > 0 ? await CourseTrainerAssignment.findAll({
          where: { courseId: { [Op.in]: courseIds }, trainerId: userId }
        }) : [];

        const isAssigned = assignedTrainerIds.includes(userId) ||
          courseTrainerAssignments.length > 0 ||
          courses.some(c => c.trainerId === userId);

        if (!isAssigned) {
          return res.status(403).json({ error: 'You are not authorized to view the leaderboard for this training' });
        }
      } else if (userRole === 'PARTICIPANT') {
        // Must be enrolled in this training or its courses
        const enrollmentConditions = [{ trainingId: parsedTrainingId }];
        if (courseIds.length > 0) enrollmentConditions.push({ courseId: { [Op.in]: courseIds } });

        const isEnrolled = await Enrollment.findOne({
          where: {
            participantId: userId,
            [Op.or]: enrollmentConditions,
            status: { [Op.in]: ['ENROLLED', 'COMPLETED'] }
          }
        });

        if (!isEnrolled) {
          return res.status(403).json({ error: 'You are not enrolled in this training program' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // 4. Fetch all quizzes in this training (both training-scoped and course-scoped)
    const quizConditions = [{ trainingId: parsedTrainingId }];
    if (courseIds.length > 0) quizConditions.push({ courseId: { [Op.in]: courseIds } });

    const quizzes = await AIQuiz.findAll({
      where: { [Op.or]: quizConditions },
      attributes: ['id', 'title', 'totalMarks', 'isMandatory', 'status', 'resultStatus']
    });
    const quizIds = quizzes.map(q => q.id);

    // 5. Fetch all coding assessments in this training
    const codingConditions = [{ trainingId: parsedTrainingId }];
    if (courseIds.length > 0) codingConditions.push({ courseId: { [Op.in]: courseIds } });

    const codingAssessments = await CodingAssessment.findAll({
      where: { [Op.or]: codingConditions },
      attributes: ['id', 'title', 'totalMarks', 'status', 'resultStatus']
    });
    const codingAssessmentIds = codingAssessments.map(ca => ca.id);

    const totalAssessmentsCount = quizzes.length + codingAssessments.length;

    // Total possible marks across all assessments
    const totalPossibleQuizMarks = quizzes.reduce((sum, q) => sum + (parseFloat(q.totalMarks) || 0), 0);
    const totalPossibleCodingMarks = codingAssessments.reduce((sum, ca) => sum + (parseFloat(ca.totalMarks) || 0), 0);
    const totalPossibleMarks = totalPossibleQuizMarks + totalPossibleCodingMarks;

    // 6. Fetch all enrolled participants
    const enrollmentWhere = {
      [Op.or]: [
        { trainingId: parsedTrainingId },
        ...(courseIds.length > 0 ? [{ courseId: { [Op.in]: courseIds } }] : [])
      ],
      status: { [Op.in]: ['ENROLLED', 'COMPLETED'] }
    };

    const enrollments = await Enrollment.findAll({
      where: enrollmentWhere,
      include: [
        {
          model: User,
          as: 'participant',
          attributes: ['id', 'name', 'email', 'employeeId', 'department', 'designation', 'profilePic', 'status', 'isDeleted']
        }
      ]
    });

    // De-duplicate participants
    const participantMap = new Map();
    for (const en of enrollments) {
      if (en.participant && !en.participant.isDeleted) {
        if (!participantMap.has(en.participant.id)) {
          participantMap.set(en.participant.id, {
            user: en.participant,
            enrollmentStatus: en.status,
            progressPercent: parseFloat(en.progressPercent) || 0,
            enrolledAt: en.createdAt
          });
        }
      }
    }

    const participantIds = Array.from(participantMap.keys());

    // 7. Fetch all Quiz Results & Coding Results for enrolled participants
    let quizResults = [];
    if (quizIds.length > 0 && participantIds.length > 0) {
      quizResults = await QuizResult.findAll({
        where: {
          quizId: { [Op.in]: quizIds },
          participantId: { [Op.in]: participantIds }
        },
        include: [
          { model: QuizAttempt, as: 'attempt', attributes: ['id', 'timeTaken', 'submittedAt', 'status'] }
        ]
      });
    }

    let codingResults = [];
    if (codingAssessmentIds.length > 0 && participantIds.length > 0) {
      codingResults = await CodingResult.findAll({
        where: {
          assessmentId: { [Op.in]: codingAssessmentIds },
          participantId: { [Op.in]: participantIds }
        },
        include: [
          { model: CodingAttempt, as: 'attempt', attributes: ['id', 'timeTaken', 'submittedAt', 'status'] }
        ]
      });
    }

    // In-progress / submitted quiz attempts without a result record yet
    let activeQuizAttempts = [];
    if (quizIds.length > 0 && participantIds.length > 0) {
      activeQuizAttempts = await QuizAttempt.findAll({
        where: {
          quizId: { [Op.in]: quizIds },
          participantId: { [Op.in]: participantIds }
        },
        attributes: ['id', 'quizId', 'participantId', 'status', 'startedAt', 'submittedAt', 'timeTaken']
      });
    }

    let activeCodingAttempts = [];
    if (codingAssessmentIds.length > 0 && participantIds.length > 0) {
      activeCodingAttempts = await CodingAttempt.findAll({
        where: {
          assessmentId: { [Op.in]: codingAssessmentIds },
          participantId: { [Op.in]: participantIds }
        },
        attributes: ['id', 'assessmentId', 'participantId', 'status', 'startedAt', 'submittedAt', 'timeTaken']
      });
    }

    // 8. Process scores and performance per participant
    const attemptedList = [];
    const unattemptedList = [];

    for (const [pId, pData] of participantMap.entries()) {
      const { user, enrollmentStatus, progressPercent } = pData;

      // Group quiz results by quizId taking the best attempt
      const userQuizResults = quizResults.filter(r => r.participantId === pId);
      const quizBestMap = new Map();
      for (const qr of userQuizResults) {
        const score = parseFloat(qr.totalScore) || 0;
        const max = parseFloat(qr.maxScore) || 0;
        const pct = parseFloat(qr.percentage) || (max > 0 ? (score / max) * 100 : 0);
        const timeTaken = qr.attempt?.timeTaken || null;
        const subAt = qr.attempt?.submittedAt || qr.evaluatedAt || qr.createdAt;

        const existing = quizBestMap.get(qr.quizId);
        if (!existing || pct > existing.percentage || (pct === existing.percentage && score > existing.score)) {
          quizBestMap.set(qr.quizId, { score, maxScore: max, percentage: pct, timeTaken, submittedAt: subAt });
        }
      }

      // Group coding results by assessmentId taking the best attempt
      const userCodingResults = codingResults.filter(r => r.participantId === pId);
      const codingBestMap = new Map();
      for (const cr of userCodingResults) {
        const score = parseFloat(cr.totalScore) || 0;
        const max = parseFloat(cr.maxScore) || 0;
        const pct = parseFloat(cr.percentage) || (max > 0 ? (score / max) * 100 : 0);
        const timeTaken = cr.attempt?.timeTaken || null;
        const subAt = cr.attempt?.submittedAt || cr.createdAt;

        const existing = codingBestMap.get(cr.assessmentId);
        if (!existing || pct > existing.percentage || (pct === existing.percentage && score > existing.score)) {
          codingBestMap.set(cr.assessmentId, { score, maxScore: max, percentage: pct, timeTaken, submittedAt: subAt });
        }
      }

      const completedQuizzesCount = quizBestMap.size;
      const completedCodingCount = codingBestMap.size;
      const totalCompletedAssessments = completedQuizzesCount + completedCodingCount;

      const userActiveQuizzes = activeQuizAttempts.filter(a => a.participantId === pId);
      const userActiveCoding = activeCodingAttempts.filter(a => a.participantId === pId);
      const hasAnyAttempts = totalCompletedAssessments > 0 || userActiveQuizzes.length > 0 || userActiveCoding.length > 0;

      if (!hasAnyAttempts && progressPercent === 0 && enrollmentStatus !== 'COMPLETED') {
        // Participant hasn't attempted anything yet
        unattemptedList.push({
          rank: null,
          participantId: user.id,
          name: user.name || user.email?.split('@')[0] || 'Participant',
          email: user.email,
          employeeId: user.employeeId || null,
          department: user.department || null,
          designation: user.designation || null,
          avatar: user.profilePic || null,
          score: null,
          maxScore: totalPossibleMarks > 0 ? totalPossibleMarks : null,
          percentage: null,
          completedAssessments: 0,
          totalAssessments: totalAssessmentsCount,
          status: 'NOT_ATTEMPTED',
          timeTaken: null,
          submittedAt: null,
          isCurrentUser: user.id === userId
        });
      } else {
        // Calculate cumulative score and percentage
        let obtainedSum = 0;
        let maxScoreSum = 0;
        let totalTimeTaken = 0;
        let latestSubmission = null;

        for (const q of quizBestMap.values()) {
          obtainedSum += q.score;
          maxScoreSum += q.maxScore;
          if (q.timeTaken) totalTimeTaken += q.timeTaken;
          if (q.submittedAt) {
            const dt = new Date(q.submittedAt);
            if (!latestSubmission || dt > latestSubmission) latestSubmission = dt;
          }
        }

        for (const c of codingBestMap.values()) {
          obtainedSum += c.score;
          maxScoreSum += c.maxScore;
          if (c.timeTaken) totalTimeTaken += c.timeTaken;
          if (c.submittedAt) {
            const dt = new Date(c.submittedAt);
            if (!latestSubmission || dt > latestSubmission) latestSubmission = dt;
          }
        }

        // Overall Percentage calculation:
        // Prefer: total marks obtained / total available marks in program (if totalPossibleMarks > 0)
        // Or if not defined, total marks obtained / total marks attempted
        let finalPercentage = 0;
        let finalMaxScore = totalPossibleMarks > 0 ? totalPossibleMarks : maxScoreSum;

        if (totalPossibleMarks > 0) {
          finalPercentage = (obtainedSum / totalPossibleMarks) * 100;
        } else if (maxScoreSum > 0) {
          finalPercentage = (obtainedSum / maxScoreSum) * 100;
        } else if (totalCompletedAssessments > 0) {
          // If all assessments have 0 maxScore, average the percentages
          const allPcts = [
            ...Array.from(quizBestMap.values()).map(q => q.percentage),
            ...Array.from(codingBestMap.values()).map(c => c.percentage)
          ];
          finalPercentage = allPcts.reduce((a, b) => a + b, 0) / (allPcts.length || 1);
        } else if (progressPercent > 0) {
          finalPercentage = progressPercent;
        }

        finalPercentage = Number(Math.min(100, Math.max(0, finalPercentage)).toFixed(2));
        const finalScore = Number(obtainedSum.toFixed(2));

        // Determine Status
        let status = 'IN_PROGRESS';
        if (
          (totalAssessmentsCount > 0 && totalCompletedAssessments >= totalAssessmentsCount) ||
          enrollmentStatus === 'COMPLETED' ||
          progressPercent >= 100
        ) {
          status = 'COMPLETED';
        } else if (totalCompletedAssessments === 0 && !hasAnyAttempts) {
          status = 'NOT_ATTEMPTED';
        }

        attemptedList.push({
          participantId: user.id,
          name: user.name || user.email?.split('@')[0] || 'Participant',
          email: user.email,
          employeeId: user.employeeId || null,
          department: user.department || null,
          designation: user.designation || null,
          avatar: user.profilePic || null,
          score: finalScore,
          maxScore: Number((finalMaxScore || 100).toFixed(2)),
          percentage: finalPercentage,
          completedAssessments: totalCompletedAssessments,
          totalAssessments: totalAssessmentsCount,
          status,
          timeTaken: totalTimeTaken || null,
          submittedAt: latestSubmission ? latestSubmission.toISOString() : null,
          isCurrentUser: user.id === userId
        });
      }
    }

    // 9. Deterministic Sorting of Attempted Participants
    attemptedList.sort((a, b) => {
      // 1. Highest percentage first
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      // 2. Highest absolute score obtained
      if (b.score !== a.score) return b.score - a.score;
      // 3. More completed assessments
      if (b.completedAssessments !== a.completedAssessments) return b.completedAssessments - a.completedAssessments;
      // 4. Shorter total time taken (if both non-null)
      if (a.timeTaken != null && b.timeTaken != null && a.timeTaken !== b.timeTaken) return a.timeTaken - b.timeTaken;
      if (a.timeTaken != null && b.timeTaken == null) return -1;
      if (a.timeTaken == null && b.timeTaken != null) return 1;
      // 5. Earlier submission date
      if (a.submittedAt && b.submittedAt) {
        return new Date(a.submittedAt) - new Date(b.submittedAt);
      }
      // 6. Alphabetical name tie-break
      return (a.name || '').localeCompare(b.name || '');
    });

    // 10. Assign Standard Competition Ranking with Tie Handling (1, 2, 2, 4...)
    for (let i = 0; i < attemptedList.length; i++) {
      if (i > 0) {
        const prev = attemptedList[i - 1];
        const curr = attemptedList[i];
        if (curr.percentage === prev.percentage && curr.score === prev.score) {
          curr.rank = prev.rank;
        } else {
          curr.rank = i + 1;
        }
      } else {
        attemptedList[0].rank = 1;
      }
    }

    // Sort unattempted alphabetically by name
    unattemptedList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const fullLeaderboard = [...attemptedList, ...unattemptedList];

    // 11. Compute Summary Analytics
    const totalParticipants = participantMap.size;
    const completedParticipants = attemptedList.filter(p => p.status === 'COMPLETED').length;
    const inProgressParticipants = attemptedList.filter(p => p.status === 'IN_PROGRESS').length;
    const notAttemptedParticipants = unattemptedList.length;

    const averageScore = attemptedList.length > 0
      ? Number((attemptedList.reduce((acc, p) => acc + p.percentage, 0) / attemptedList.length).toFixed(1))
      : 0;

    const highestScore = attemptedList.length > 0 ? attemptedList[0].percentage : 0;

    const assignedTrainers = (training.trainerAssignments || []).map(ta => ta.trainer).filter(Boolean);
    const trainerNames = assignedTrainers.length > 0
      ? assignedTrainers.map(tr => tr.name).join(', ')
      : (training.trainer ? training.trainer.name : 'Unassigned');

    res.json({
      success: true,
      training: {
        id: training.id,
        title: training.title,
        description: training.description,
        trainerName: trainerNames,
        startDate: training.startDate,
        endDate: training.endDate,
        capacity: training.capacity,
        totalAssessments: totalAssessmentsCount,
        totalQuizzes: quizzes.length,
        totalCodingAssessments: codingAssessments.length,
        totalPossibleMarks
      },
      summary: {
        totalParticipants,
        completedParticipants,
        inProgressParticipants,
        notAttemptedParticipants,
        averageScore,
        highestScore
      },
      leaderboard: fullLeaderboard
    });
  } catch (error) {
    console.error('Error fetching training leaderboard:', error.message, error.stack);
    res.status(500).json({ error: 'Server error fetching training leaderboard' });
  }
};

module.exports = { getTrainingLeaderboard };
