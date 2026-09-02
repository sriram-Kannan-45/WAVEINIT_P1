/**
 * Attendance Automation Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically manages daily attendance sessions based on Training start and
 * end dates in the `Asia/Kolkata` (IST) timezone.
 *
 * Core Capabilities:
 *   1. Generates 2 separate sessions per training day:
 *        - Morning Session  (09:00 AM - 01:00 PM)
 *        - Evening Session  (02:00 PM - 06:00 PM)
 *   2. Dynamically evaluates and enforces daily locking rules:
 *        - Past training dates   → LOCKED (Read-only)
 *        - Current training date → OPEN (Markable/Editable)
 *        - Future training dates → LOCKED (Upcoming)
 *        - Outside training range → LOCKED
 *   3. Enforces date integrity on the server side independent of client clock.
 *   4. Safe and idempotent (never overwrites or duplicates existing data).
 */

const { Op } = require('sequelize');
const { AttendanceSession, Training, Course, User } = require('../models');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

const TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current date string in Asia/Kolkata timezone: "YYYY-MM-DD"
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "2026-08-31"
 */
function getKolkataDate(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch (err) {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Normalizes any Date / String representation to "YYYY-MM-DD" in IST
 * @param {Date|string} dateInput
 * @returns {string}
 */
function normalizeDateStr(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  return getKolkataDate(dateInput);
}

/**
 * Evaluates whether an attendance session is open or locked on the current day.
 *
 * @param {string} sessionDateStr - "YYYY-MM-DD"
 * @param {string} [startDateStr] - Training start date "YYYY-MM-DD"
 * @param {string} [endDateStr]   - Training end date "YYYY-MM-DD"
 * @param {string} [customTodayIST] - Optional override for testing
 * @returns {{ isOpen: boolean, isLocked: boolean, lockReason: string, lockMessage: string|null, todayDate: string }}
 */
function calculateSessionStatus(sessionDateStr, startDateStr, endDateStr, customTodayIST = null) {
  const todayIST = customTodayIST || getKolkataDate();
  const sessionDate = normalizeDateStr(sessionDateStr);
  const startDate = normalizeDateStr(startDateStr);
  const endDate = normalizeDateStr(endDateStr);

  if (!sessionDate) {
    return {
      isOpen: false,
      isLocked: true,
      lockReason: 'INVALID_DATE',
      lockMessage: 'Invalid session date',
      todayDate: todayIST,
    };
  }

  // If outside overall training boundaries
  if (startDate && sessionDate < startDate) {
    return {
      isOpen: false,
      isLocked: true,
      lockReason: 'BEFORE_TRAINING_START',
      lockMessage: `Session date is prior to training start date (${startDate}).`,
      todayDate: todayIST,
    };
  }

  if (endDate && sessionDate > endDate) {
    return {
      isOpen: false,
      isLocked: true,
      lockReason: 'AFTER_TRAINING_END',
      lockMessage: `Session date is after training end date (${endDate}).`,
      todayDate: todayIST,
    };
  }

  // Daily Locking Rules:
  // 1. Past dates -> LOCKED
  if (sessionDate < todayIST) {
    return {
      isOpen: false,
      isLocked: true,
      lockReason: 'PAST_DATE',
      lockMessage: 'Past attendance is locked and cannot be modified.',
      todayDate: todayIST,
    };
  }

  // 2. Future dates -> LOCKED
  if (sessionDate > todayIST) {
    return {
      isOpen: false,
      isLocked: true,
      lockReason: 'FUTURE_DATE',
      lockMessage: 'Future attendance is locked until that training day.',
      todayDate: todayIST,
    };
  }

  // 3. Current training date -> OPEN (if within training duration)
  if (sessionDate === todayIST) {
    if (startDate && todayIST < startDate) {
      return {
        isOpen: false,
        isLocked: true,
        lockReason: 'TRAINING_NOT_STARTED',
        lockMessage: `Training program starts on ${startDate}. Attendance is not yet open.`,
        todayDate: todayIST,
      };
    }
    if (endDate && todayIST > endDate) {
      return {
        isOpen: false,
        isLocked: true,
        lockReason: 'TRAINING_ENDED',
        lockMessage: `Training program concluded on ${endDate}. Attendance is closed.`,
        todayDate: todayIST,
      };
    }

    return {
      isOpen: true,
      isLocked: false,
      lockReason: 'NONE',
      lockMessage: null,
      todayDate: todayIST,
    };
  }

  return {
    isOpen: false,
    isLocked: true,
    lockReason: 'LOCKED',
    lockMessage: 'Attendance is currently locked.',
    todayDate: todayIST,
  };
}

/**
 * Returns an array of calendar days between startDate and endDate (inclusive)
 * @param {string|Date} startDateInput
 * @param {string|Date} endDateInput
 * @returns {Array<{ dateStr: string, dayNumber: number }>}
 */
function getTrainingDaysList(startDateInput, endDateInput) {
  const startStr = normalizeDateStr(startDateInput);
  const endStr = normalizeDateStr(endDateInput);
  if (!startStr || !endStr) return [];

  const days = [];
  const startParts = startStr.split('-').map(Number);
  const endParts = endStr.split('-').map(Number);

  const cur = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

  if (cur > end) return [];

  let dayNum = 1;
  while (cur <= end && dayNum <= 365) {
    const year = cur.getUTCFullYear();
    const month = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cur.getUTCDate()).padStart(2, '0');
    days.push({
      dateStr: `${year}-${month}-${day}`,
      dayNumber: dayNum,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
    dayNum++;
  }

  return days;
}

/**
 * Automatically prepares Morning and Evening attendance sessions for a Training Program.
 * Idempotent: safe to run multiple times without duplicating or overwriting data.
 *
 * @param {number|string} trainingId
 * @returns {Promise<{ success: boolean, count: number, sessions: Array }>}
 */
async function ensureTrainingAttendanceSessions(trainingId) {
  if (!trainingId) return { success: false, count: 0, sessions: [] };

  const cacheKey = `attendance:ensured:${trainingId}`;
  const isEnsured = cacheService.get(cacheKey);
  if (isEnsured) {
    return { success: true, count: 0, sessions: [] };
  }

  try {
    const training = await Training.findByPk(trainingId);
    if (!training) return { success: false, count: 0, sessions: [] };

    const startDate = training.startDate;
    const endDate = training.endDate;
    if (!startDate || !endDate) {
      return { success: false, count: 0, sessions: [] };
    }

    // Resolve primary course and trainer
    let course = await Course.findOne({ where: { trainingProgramId: training.id } });
    const trainerId = training.trainerId || course?.trainerId || training.createdBy;

    const days = getTrainingDaysList(startDate, endDate);
    if (days.length === 0) return { success: true, count: 0, sessions: [] };

    // Fetch existing sessions for this training
    const existingSessions = await AttendanceSession.findAll({
      where: { trainingId: training.id },
    });

    const existingMap = new Map();
    existingSessions.forEach((s) => {
      const key = `${s.sessionDate}_${s.sessionType || 'MORNING'}`;
      existingMap.set(key, s);
    });

    const sessionsToCreate = [];

    for (const d of days) {
      const morningKey = `${d.dateStr}_MORNING`;
      if (!existingMap.has(morningKey)) {
        sessionsToCreate.push({
          trainingId: training.id,
          courseId: course?.id || null,
          trainerId: trainerId,
          title: `${training.title} - Day ${d.dayNumber} (Morning)`,
          sessionDate: d.dateStr,
          startTime: '09:00 AM',
          endTime: '01:00 PM',
          sessionType: 'MORNING',
          dayNumber: d.dayNumber,
          batchName: null,
          topic: `Day ${d.dayNumber} Morning Session`,
          status: 'COMPLETED',
          isLocked: false,
        });
      }

      const eveningKey = `${d.dateStr}_EVENING`;
      if (!existingMap.has(eveningKey)) {
        sessionsToCreate.push({
          trainingId: training.id,
          courseId: course?.id || null,
          trainerId: trainerId,
          title: `${training.title} - Day ${d.dayNumber} (Evening)`,
          sessionDate: d.dateStr,
          startTime: '02:00 PM',
          endTime: '06:00 PM',
          sessionType: 'EVENING',
          dayNumber: d.dayNumber,
          batchName: null,
          topic: `Day ${d.dayNumber} Evening Session`,
          status: 'COMPLETED',
          isLocked: false,
        });
      }
    }

    if (sessionsToCreate.length > 0) {
      await AttendanceSession.bulkCreate(sessionsToCreate, { ignoreDuplicates: true });
      logger.info(`[AttendanceAutomation] Created ${sessionsToCreate.length} automated attendance sessions for Training #${training.id}`);
    }

    // Cache verification for 5 minutes so subsequent read queries don't hit the DB loop
    cacheService.set(cacheKey, true, 300);

    return { success: true, count: existingSessions.length + sessionsToCreate.length, sessions: [] };
  } catch (err) {
    logger.error('[AttendanceAutomation] Error ensuring attendance sessions', { trainingId, error: err.message });
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Sweeps all active training programs and ensures all daily Morning and Evening
 * attendance sessions exist across the entire training duration.
 */
async function ensureAllActiveTrainingsAttendance() {
  try {
    const todayIST = getKolkataDate();
    const activeTrainings = await Training.findAll({
      where: {
        startDate: { [Op.ne]: null },
        endDate: { [Op.ne]: null },
      },
    });

    let totalCreated = 0;
    for (const t of activeTrainings) {
      const res = await ensureTrainingAttendanceSessions(t.id);
      if (res.success) totalCreated += (res.count || 0);
    }

    logger.info(`[AttendanceAutomation] Daily sweep verified ${activeTrainings.length} trainings against IST date ${todayIST}`);
    return { success: true, totalTrainings: activeTrainings.length };
  } catch (err) {
    logger.error('[AttendanceAutomation] Error during daily attendance sweep', { error: err.message });
    return { success: false, error: err.message };
  }
}

module.exports = {
  TIMEZONE,
  getKolkataDate,
  normalizeDateStr,
  calculateSessionStatus,
  getTrainingDaysList,
  ensureTrainingAttendanceSessions,
  ensureAllActiveTrainingsAttendance,
};
