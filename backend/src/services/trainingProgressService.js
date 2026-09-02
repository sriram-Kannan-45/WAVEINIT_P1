/**
 * trainingProgressService.js
 * ──────────────────────────
 * Dynamic Training & Course Structure Completion Percentage Engine.
 *
 * Rules:
 *  - Completion Percentage = (completedStructureItems / totalStructureItems) * 100
 *  - Structure items are stored in `lessons` table (modules, sub-modules, topics, lessons).
 *  - If totalStructureItems === 0: completionPercentage = 0, hasStructure = false.
 *  - Pure dynamic calculations from latest database data — never hardcoded.
 */

const { Op } = require('sequelize');
const { Lesson, Course } = require('../models');

/**
 * Calculates dynamic completion metrics for a Training Program.
 * Uses batch status projection in 2 minimal queries.
 */
async function calculateTrainingCompletion(trainingId) {
  const tid = parseInt(trainingId, 10);
  if (isNaN(tid)) {
    return {
      trainingId,
      totalStructureItems: 0,
      completedStructureItems: 0,
      inProgressStructureItems: 0,
      pendingStructureItems: 0,
      completionPercentage: 0,
      hasStructure: false,
    };
  }

  // 1. Find all courses associated with this training
  const courses = await Course.findAll({
    where: { trainingProgramId: tid },
    attributes: ['id'],
    raw: true,
  });
  const courseIds = (courses || []).map((c) => c.id).filter(Boolean);

  // 2. Fetch lesson statuses in a single indexed query
  const whereCondition = courseIds.length > 0
    ? { [Op.or]: [{ courseId: { [Op.in]: courseIds } }, { trainingId: tid }] }
    : { trainingId: tid };

  const lessons = await Lesson.findAll({
    where: whereCondition,
    attributes: ['status'],
    raw: true,
  });

  const totalStructureItems = lessons.length;
  let completedStructureItems = 0;
  let inProgressStructureItems = 0;

  for (let i = 0; i < lessons.length; i++) {
    const s = lessons[i].status;
    if (s === 'COMPLETED') completedStructureItems++;
    else if (s === 'IN_PROGRESS') inProgressStructureItems++;
  }

  const pendingStructureItems = Math.max(
    0,
    totalStructureItems - completedStructureItems - inProgressStructureItems
  );

  const completionPercentage =
    totalStructureItems > 0
      ? Number(((completedStructureItems / totalStructureItems) * 100).toFixed(2))
      : 0;

  return {
    trainingId: tid,
    totalStructureItems,
    completedStructureItems,
    inProgressStructureItems,
    pendingStructureItems,
    completionPercentage,
    hasStructure: totalStructureItems > 0,
  };
}

/**
 * Calculates dynamic completion metrics for a single Course.
 * Optimized to a single fast indexed query.
 */
async function calculateCourseCompletion(courseId) {
  const cid = parseInt(courseId, 10);
  if (isNaN(cid)) {
    return {
      courseId,
      totalStructureItems: 0,
      completedStructureItems: 0,
      inProgressStructureItems: 0,
      pendingStructureItems: 0,
      completionPercentage: 0,
      hasStructure: false,
    };
  }

  const lessons = await Lesson.findAll({
    where: { courseId: cid },
    attributes: ['status'],
    raw: true,
  });

  const totalStructureItems = lessons.length;
  let completedStructureItems = 0;
  let inProgressStructureItems = 0;

  for (let i = 0; i < lessons.length; i++) {
    const s = lessons[i].status;
    if (s === 'COMPLETED') completedStructureItems++;
    else if (s === 'IN_PROGRESS') inProgressStructureItems++;
  }

  const pendingStructureItems = Math.max(
    0,
    totalStructureItems - completedStructureItems - inProgressStructureItems
  );

  const completionPercentage =
    totalStructureItems > 0
      ? Number(((completedStructureItems / totalStructureItems) * 100).toFixed(2))
      : 0;

  return {
    courseId: cid,
    totalStructureItems,
    completedStructureItems,
    inProgressStructureItems,
    pendingStructureItems,
    completionPercentage,
    hasStructure: totalStructureItems > 0,
  };
}

/**
 * Batch calculate completion metrics for multiple training IDs.
 */
async function batchCalculateTrainingsCompletion(trainingIds) {
  const map = new Map();
  const validIds = (trainingIds || [])
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));

  if (validIds.length === 0) return map;

  await Promise.all(
    validIds.map(async (tid) => {
      try {
        const metrics = await calculateTrainingCompletion(tid);
        map.set(Number(tid), metrics);
        map.set(String(tid), metrics);
      } catch (err) {
        const fallback = {
          trainingId: tid,
          totalStructureItems: 0,
          completedStructureItems: 0,
          inProgressStructureItems: 0,
          pendingStructureItems: 0,
          completionPercentage: 0,
          hasStructure: false,
        };
        map.set(Number(tid), fallback);
        map.set(String(tid), fallback);
      }
    })
  );

  return map;
}

module.exports = {
  calculateTrainingCompletion,
  calculateCourseCompletion,
  batchCalculateTrainingsCompletion,
};
