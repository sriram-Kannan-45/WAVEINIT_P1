/**
 * Assessment Availability Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Central source of truth for scheduling windows, availability checks,
 * timezone formatting, and server-side end-time enforcement across both
 * Quizzes and Coding Assessments.
 */

class AssessmentAvailabilityService {
  constructor() {
    this.checkAvailability = this.checkAvailability.bind(this);
    this.assertAvailable = this.assertAvailable.bind(this);
    this.buildFinalReport = this.buildFinalReport.bind(this);
    this.generateCsvReport = this.generateCsvReport.bind(this);
  }

  /**
   * Evaluates the availability of a Quiz or Coding Assessment at a given time.
   *
   * @param {Object} assessment - AIQuiz or CodingAssessment instance or plain object
   * @param {Date} [now] - Current timestamp (defaults to server current time)
   * @returns {Object} Availability state
   */
  checkAvailability(assessment, now = new Date()) {
    if (!assessment) {
      return {
        allowed: false,
        status: 'NOT_FOUND',
        reason: 'NOT_FOUND',
        message: 'Assessment not found.',
        startTime: null,
        endTime: null,
        timezone: 'Asia/Kolkata',
        remainingSeconds: null,
        isEndingSoon: false,
      };
    }

    const isPublished = !assessment.status || assessment.status === 'PUBLISHED' || assessment.isPublished || assessment.published;
    const timezone = assessment.timezone || 'Asia/Kolkata';
    const startTime = assessment.startTime ? new Date(assessment.startTime) : null;
    const endTime = assessment.endTime ? new Date(assessment.endTime) : null;
    const currentTime = now instanceof Date ? now : new Date(now);

    if (!isPublished) {
      return {
        allowed: false,
        status: 'NOT_PUBLISHED',
        reason: 'NOT_PUBLISHED',
        message: 'Assessment is not published.',
        startTime,
        endTime,
        timezone,
        remainingSeconds: null,
        isEndingSoon: false,
      };
    }

    // 1. Check Before Start Time
    if (startTime && currentTime.getTime() < startTime.getTime()) {
      return {
        allowed: false,
        canAttempt: false,
        isAvailable: false,
        status: 'NOT_STARTED_YET',
        reason: 'NOT_STARTED_YET',
        message: 'Assessment has not started yet.',
        startTime,
        endTime,
        timezone,
        remainingSeconds: null,
        isEndingSoon: false,
      };
    }

    // 2. Check After End Time (Server-side Enforcement)
    if (endTime && currentTime.getTime() >= endTime.getTime()) {
      return {
        allowed: false,
        canAttempt: false,
        isAvailable: false,
        status: 'ENDED',
        reason: 'ENDED',
        message: 'This assessment has reached its scheduled end time.',
        startTime,
        endTime,
        timezone,
        remainingSeconds: 0,
        isEndingSoon: false,
      };
    }

    // 3. Active Window
    let remainingSeconds = null;
    let isEndingSoon = false;
    if (endTime) {
      remainingSeconds = Math.max(0, Math.floor((endTime.getTime() - currentTime.getTime()) / 1000));
      isEndingSoon = remainingSeconds <= 600; // 10 minutes or less
    }

    return {
      allowed: true,
      canAttempt: true,
      isAvailable: true,
      status: isEndingSoon ? 'ENDING_SOON' : 'ACTIVE',
      reason: null,
      message: isEndingSoon ? 'Assessment ends soon.' : 'Assessment is active.',
      startTime,
      endTime,
      timezone,
      remainingSeconds,
      isEndingSoon,
    };
  }

  /**
   * Assert availability and respond with 403 if disallowed (or throws if res not provided).
   */
  assertAvailable(assessment, resOrNow, maybeNow) {
    let res = null;
    let now = new Date();
    if (resOrNow && typeof resOrNow.status === 'function') {
      res = resOrNow;
      now = maybeNow || new Date();
    } else if (resOrNow) {
      now = resOrNow;
    }

    const availability = this.checkAvailability(assessment, now);
    if (!availability.allowed) {
      if (res) {
        res.status(403).json({
          success: false,
          error: availability.message,
          code: availability.reason,
          availability,
        });
        return false;
      }
      const err = new Error(availability.message);
      err.statusCode = 403;
      err.status = 403;
      err.code = availability.reason;
      err.availability = availability;
      throw err;
    }
    return true;
  }

  /**
   * Format date/time with the assessment's configured timezone.
   */
  formatDateTime(date, timezone = 'Asia/Kolkata') {
    if (!date) return '—';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return new Date(date).toLocaleString();
    }
  }

  /**
   * Format time only (e.g. "12:00 PM").
   */
  formatTimeOnly(date, timezone = 'Asia/Kolkata') {
    if (!date) return '—';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return new Date(date).toLocaleTimeString();
    }
  }

  /**
   * Build complete assessment final report data with summary metrics and participant breakdown.
   * Enforces ABSENT status for unattempted learners once assessment has ended.
   */
  buildFinalReport({
    assessment,
    assessmentType = 'Quiz',
    courseName = '',
    enrolledUsers = [],
    attempts = [],
    results = [],
    proctoringReports = [],
    monitoringSessions = [],
  }) {
    const timezone = assessment.timezone || 'Asia/Kolkata';
    const availability = this.checkAvailability(assessment);
    const hasEnded = availability.status === 'ENDED' || assessment.status === 'CLOSED' || assessment.finalizedAt != null;

    const attemptMap = new Map();
    attempts.forEach(a => attemptMap.set(String(a.participantId), a));

    const resultMap = new Map();
    results.forEach(r => resultMap.set(String(r.participantId), r));

    const proctoringMap = new Map();
    proctoringReports.forEach(p => proctoringMap.set(String(p.userId || p.participantId), p));

    const monitoringMap = new Map();
    monitoringSessions.forEach(m => monitoringMap.set(String(m.userId), m));

    // Consolidate participant map: ensure all enrolled learners are present
    const participantMap = new Map();
    enrolledUsers.forEach(u => participantMap.set(String(u.id), u));
    attempts.forEach(a => {
      if (a.participant && !participantMap.has(String(a.participantId))) {
        participantMap.set(String(a.participantId), a.participant);
      }
    });

    const maxMarks = parseFloat(assessment.totalMarks || 100) || 100;
    const passingPercentage = 50;

    let presentCount = 0;
    let absentCount = 0;
    let completedCount = 0;
    let autoSubmittedCount = 0;
    let malpracticeCount = 0;
    let passCount = 0;
    let failCount = 0;
    const scores = [];

    const participantRows = [];

    for (const [userId, user] of participantMap.entries()) {
      const attempt = attemptMap.get(userId);
      const result = resultMap.get(userId);
      const proctorReport = proctoringMap.get(userId);
      const monSession = monitoringMap.get(userId);

      const hasAttempt = !!attempt;
      const isCompleted = hasAttempt && (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED' || attempt.status === 'COMPLETED');
      const isAutoSubmitted = hasAttempt && (attempt.status === 'AUTO_SUBMITTED' || attempt.submissionType === 'AUTO_SUBMITTED' || attempt.autoSubmitted === true || attempt.timeExpired === true);
      const isStarted = hasAttempt && attempt.status === 'IN_PROGRESS';

      // Attendance Status
      let attendanceStatus = 'ABSENT';
      if (hasAttempt) {
        attendanceStatus = 'PRESENT';
      } else if (!hasEnded) {
        attendanceStatus = 'NOT_STARTED';
      }

      // Attempt Status
      let attemptStatus = 'NOT_STARTED';
      if (isCompleted) attemptStatus = 'COMPLETED';
      else if (isAutoSubmitted) attemptStatus = 'AUTO_SUBMITTED';
      else if (isStarted) attemptStatus = hasEnded ? 'TIME_EXPIRED' : 'IN_PROGRESS';

      // Scores
      const score = result ? parseFloat(result.totalScore || 0) : 0;
      const percentage = result ? parseFloat(result.percentage || 0) : 0;
      const isPass = percentage >= passingPercentage;

      if (hasAttempt) {
        presentCount++;
        scores.push(percentage);
        if (isCompleted) completedCount++;
        if (isAutoSubmitted) autoSubmittedCount++;
        if (isPass) passCount++;
        else failCount++;
      } else {
        if (hasEnded) {
          absentCount++;
          failCount++;
        }
      }

      // Malpractice Calculation
      let malpracticeScore = 0;
      let malpracticeViolations = attempt?.violationCount || 0;
      let malpracticeStatus = 'N/A';

      if (hasAttempt) {
        if (proctorReport?.riskScore != null) {
          malpracticeScore = parseFloat(proctorReport.riskScore) || 0;
        } else if (proctorReport?.integrityScore != null) {
          malpracticeScore = Math.max(0, 100 - (parseFloat(proctorReport.integrityScore) || 0));
        } else if (monSession?.score != null) {
          malpracticeScore = parseFloat(monSession.score) || 0;
        }

        if (malpracticeViolations > 0 && malpracticeScore === 0) {
          malpracticeScore = Math.min(100, malpracticeViolations * 15);
        }

        if (malpracticeScore >= 70 || malpracticeViolations >= 5) {
          malpracticeStatus = 'FLAGGED';
        } else if (malpracticeScore >= 35 || malpracticeViolations >= 2) {
          malpracticeStatus = 'SUSPICIOUS';
        } else {
          malpracticeStatus = 'CLEAR';
        }

        if (malpracticeStatus === 'FLAGGED' || malpracticeStatus === 'SUSPICIOUS') {
          malpracticeCount++;
        }
      }

      const submissionType = isAutoSubmitted ? 'AUTO' : (isCompleted ? (attempt.submissionType || 'MANUAL') : '-');
      const timeExpired = (isAutoSubmitted || attempt?.timeExpired) ? 'YES' : 'NO';

      const startTimeFormatted = attempt?.startedAt ? this.formatTimeOnly(attempt.startedAt, timezone) : '-';
      const submitTimeFormatted = (attempt?.submittedAt || result?.evaluatedAt)
        ? this.formatTimeOnly(attempt?.submittedAt || result?.evaluatedAt, timezone)
        : '-';
      const endTimeFormatted = assessment.endTime ? this.formatTimeOnly(assessment.endTime, timezone) : '—';

      participantRows.push({
        id: user.id,
        userId: user.id,
        participantId: user.studentId || user.employeeId || `STU${String(user.id).padStart(3, '0')}`,
        participantName: user.name || 'Unknown',
        email: user.email || '',
        course: courseName || 'General',
        assessmentName: assessment.title || 'Assessment',
        assessmentType,
        attendanceStatus,
        attemptStatus,
        attemptNumber: hasAttempt ? (attempt.attemptNumber || 1) : 0,
        startTime: startTimeFormatted,
        submissionTime: submitTimeFormatted,
        endTime: endTimeFormatted,
        score: hasAttempt ? score : 0,
        maximumMarks: maxMarks,
        percentage: `${percentage.toFixed(0)}%`,
        percentageNumber: percentage,
        passFail: (!hasAttempt && !hasEnded) ? '-' : (isPass ? 'PASS' : 'FAIL'),
        malpracticeScore: hasAttempt ? Math.round(malpracticeScore) : 0,
        malpracticeViolations: hasAttempt ? malpracticeViolations : 0,
        malpracticeStatus,
        submissionType,
        timeExpired,
        rawUser: user,
      });
    }

    const totalParticipants = participantRows.length;
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores).toFixed(1) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores).toFixed(1) : 0;

    return {
      summary: {
        totalParticipants,
        totalEnrolled: totalParticipants,
        present: presentCount,
        absent: hasEnded ? absentCount : 0,
        totalAbsent: hasEnded ? absentCount : 0,
        pending: hasEnded ? 0 : (totalParticipants - presentCount),
        completed: completedCount,
        totalCompleted: completedCount,
        autoSubmitted: autoSubmittedCount,
        totalAutoSubmitted: autoSubmittedCount,
        averageScore: Number(avgScore),
        highestScore: Number(highestScore),
        lowestScore: Number(lowestScore),
        malpracticeCases: malpracticeCount,
        malpracticeFlags: malpracticeCount,
        passCount,
        failCount,
        hasEnded,
        finalizedAt: assessment.finalizedAt,
        endTime: assessment.endTime ? this.formatDateTime(assessment.endTime, timezone) : null,
      },
      participants: participantRows,
    };
  }

  /**
   * Generates a 21-column CSV string adhering strictly to LMS requirements.
   * Includes headers and handles quoting safely.
   */
  generateCsvReport(finalReportData) {
    const headers = [
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
      'Time Expired',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines = [headers.join(',')];
    const rows = Array.isArray(finalReportData) ? finalReportData : (finalReportData?.participants || []);

    for (const row of rows) {
      lines.push([
        escapeCsv(row.participantName || row.name),
        escapeCsv(row.email),
        escapeCsv(row.participantId || row.id),
        escapeCsv(row.course || row.courseTitle),
        escapeCsv(row.assessmentName || row.assessmentTitle),
        escapeCsv(row.assessmentType || row.type),
        escapeCsv(row.attendanceStatus),
        escapeCsv(row.attemptStatus),
        escapeCsv(row.attemptNumber),
        escapeCsv(row.startTime),
        escapeCsv(row.submissionTime),
        escapeCsv(row.endTime),
        escapeCsv(row.score),
        escapeCsv(row.maximumMarks ?? row.maxMarks ?? 100),
        escapeCsv(row.percentage),
        escapeCsv(row.passFail),
        escapeCsv(row.malpracticeScore),
        escapeCsv(row.malpracticeViolations),
        escapeCsv(row.malpracticeStatus),
        escapeCsv(row.submissionType),
        escapeCsv(row.timeExpired),
      ].join(','));
    }

    return lines.join('\r\n');
  }
}

const CSV_REPORT_HEADERS = [
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
  'Time Expired',
];

const serviceInstance = new AssessmentAvailabilityService();
serviceInstance.CSV_REPORT_HEADERS = CSV_REPORT_HEADERS;

module.exports = serviceInstance;

