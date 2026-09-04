const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const {
  CodingAssessment, CodingProblem, CodingProblemLanguage, CodingTestCase, CodingAttempt, CodingSubmission, CodingResult, CodingAiHelp,
  AssessmentSession, ExamSession, Violation, ProctorActivity, Screenshot,
  ProctoringSession, ProctoringEvent, ProctoringReport, MonitoringSession,
  Training, Course, CourseTrainerAssignment, TrainingTrainerAssignment, User, QuizRecording
} = require('../models');
const logger = require('../utils/logger');
const { parsePagination, formatPaginationMeta, formatPaginatedResponse } = require('../utils/paginationHelper');
const { LANGUAGES: JUDGE_LANGUAGES } = require('../judge/languageConfig');
const { getDefaultStarterCode } = require('../utils/languageTemplates');
const { sanitiseServedProblem, auditSavedCode } = require('../services/starterCodeIntegrity');

// ── Helpers ──
// Follow the same response format as aiQuizRoutes / trainerRoutes:
//   success: { success: true, ...data }
//   error:   { error: 'message' }
function ok(res, data) { return res.json({ success: true, ...data }); }
function fail(res, status, err) { return res.status(status).json({ error: typeof err === 'string' ? err : err.message || 'Unknown error' }); }

async function canManageAssessment(user, assessment) {
  if (!user || !assessment) return false;
  if (user.role === 'ADMIN') return true;
  if (Number(assessment.trainerId) === Number(user.id) || String(assessment.trainerId) === String(user.id)) return true;
  if (assessment.courseId) {
    const course = await Course.findByPk(assessment.courseId);
    if (course && (Number(course.trainerId) === Number(user.id) || String(course.trainerId) === String(user.id))) return true;
    if (CourseTrainerAssignment) {
      const assigned = await CourseTrainerAssignment.findOne({
        where: { courseId: assessment.courseId, trainerId: user.id }
      });
      if (assigned) return true;
    }
  }
  if (assessment.trainingId) {
    const training = await Training.findByPk(assessment.trainingId);
    if (training && (Number(training.trainerId) === Number(user.id) || String(training.trainerId) === String(user.id))) return true;
    if (TrainingTrainerAssignment) {
      const assigned = await TrainingTrainerAssignment.findOne({
        where: { trainingId: assessment.trainingId, trainerId: user.id }
      });
      if (assigned) return true;
    }
  }
  return false;
}

const normalizeAssessmentDifficulty = (d) => {
  if (!d) return 'MEDIUM';
  const u = String(d).trim().toUpperCase();
  if (['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(u)) return u;
  return 'MEDIUM';
};

const normalizeProblemDifficulty = (d) => {
  if (!d) return 'MEDIUM';
  const u = String(d).trim().toUpperCase();
  if (['EASY', 'MEDIUM', 'HARD'].includes(u)) return u;
  return 'MEDIUM';
};

// ── Multi-language problem helpers ──
// The list of runtimes supported by the judge engine (single source of truth).
const SUPPORTED_LANGUAGE_IDS = new Set((JUDGE_LANGUAGES || []).map(l => String(l.id).toLowerCase()));

/**
 * Validate + normalize a languages[] payload.
 * Each entry may carry: language, starterCode, referenceSolution, timeLimit, memoryLimit.
 * Also accepts legacy single-language shape: { programmingLanguage, starterCode, expectedSolution }.
 * Throws {status, message} on validation failure.
 */
function normalizeProblemLanguages(input, legacy, problemContext = {}) {
  let source = null;

  if (Array.isArray(input) && input.length > 0) {
    source = input;
  } else if (input && typeof input === 'object' && input.languageSolutions) {
    source = Object.entries(input.languageSolutions).map(([lang, s]) => ({
      language: lang,
      starterCode: s?.starterCode,
      referenceSolution: s?.referenceSolution,
    }));
  } else if (legacy && (legacy.languages || legacy.languageSolutions)) {
    if (Array.isArray(legacy.languages) && legacy.languages.length > 0) {
      source = legacy.languages;
    } else if (typeof legacy.languageSolutions === 'object') {
      source = Object.entries(legacy.languageSolutions).map(([lang, s]) => ({
        language: lang,
        starterCode: s?.starterCode,
        referenceSolution: s?.referenceSolution,
      }));
    }
  } else if (legacy && legacy.programmingLanguage) {
    source = [{
      language: legacy.programmingLanguage,
      starterCode: legacy.starterCode ?? legacy.starter_code ?? null,
      referenceSolution: legacy.expectedSolution ?? legacy.referenceSolution ?? null,
    }];
  }

  if (!source || source.length === 0) {
    source = [{ language: 'javascript' }];
  }

  const seen = new Set();
  const ctx = { ...legacy, ...problemContext };
  return source.map((entry, index) => {
    const raw = entry?.language || entry?.id || (entry?.programmingLanguage) || (entry?.programming_language);
    const language = String(raw || '').trim().toLowerCase();
    if (!language) {
      const err = new Error('Each language configuration requires a language.');
      err.status = 400;
      throw err;
    }
    if (!SUPPORTED_LANGUAGE_IDS.has(language)) {
      const err = new Error(`Unsupported programming language: "${language}". Supported: ${Array.from(SUPPORTED_LANGUAGE_IDS).sort().join(', ')}`);
      err.status = 400;
      throw err;
    }
    if (seen.has(language)) {
      const err = new Error(`Duplicate programming language: "${language}". Each language can be configured only once.`);
      err.status = 400;
      throw err;
    }
    seen.add(language);

    const starter = (entry?.starterCode != null && String(entry.starterCode).trim())
      ? String(entry.starterCode)
      : (entry?.starter_code != null && String(entry.starter_code).trim())
        ? String(entry.starter_code)
        : getDefaultStarterCode(language, ctx);

    const ref = (entry?.referenceSolution != null && String(entry.referenceSolution).trim())
      ? String(entry.referenceSolution)
      : (entry?.expectedSolution != null && String(entry.expectedSolution).trim())
        ? String(entry.expectedSolution)
        : (entry?.solution != null && String(entry.solution).trim())
          ? String(entry.solution)
          : null;

    return {
      language,
      starterCode: starter,
      referenceSolution: ref,
      starterCodeSource: entry?.starterCodeSource === 'generated' ? 'generated' : 'manual',
      referenceSolutionSource: entry?.referenceSolutionSource === 'generated' ? 'generated' : 'manual',
      generationStatus: ['pending', 'generating', 'completed'].includes(entry?.generationStatus)
        ? entry.generationStatus
        : (ref ? 'completed' : 'pending'),
      timeLimit: entry?.timeLimit != null ? parseInt(entry.timeLimit, 10) : null,
      memoryLimit: entry?.memoryLimit != null ? parseInt(entry.memoryLimit, 10) : null,
      order: index,
    };
  });
}

/**
 * Build a trainer-safe language list from a problem (including reference solutions).
 * Falls back to the legacy single-language scalar columns when no per-language
 * rows exist yet (old problems), so nothing breaks for pre-existing questions.
 */
function getProblemLanguages(problem, { includeReference = true, legacyOnly = false } = {}) {
  let rows = (!legacyOnly && Array.isArray(problem.languages) && problem.languages.length > 0)
    ? problem.languages
    : [];

  const ctx = {
    title: problem.title,
    description: problem.description,
    sampleOutput: problem.sampleOutput,
    testCases: problem.testCases,
  };

  if (rows.length === 0 && problem.languageSolutions && typeof problem.languageSolutions === 'object') {
    rows = Object.entries(problem.languageSolutions).map(([lang, sol]) => ({
      language: lang,
      starterCode: sol?.starterCode,
      referenceSolution: sol?.referenceSolution,
      starterCodeSource: sol?.starterCodeSource || 'manual',
      referenceSolutionSource: sol?.referenceSolutionSource || 'manual',
      generationStatus: sol?.referenceSolution ? 'completed' : 'pending',
    }));
  }

  if (rows.length === 0 && problem.programmingLanguage) {
    const lang = String(problem.programmingLanguage).toLowerCase();
    const starter = (problem.starterCode != null && String(problem.starterCode).trim())
      ? problem.starterCode
      : getDefaultStarterCode(lang, ctx);
    const ref = (problem.expectedSolution != null && String(problem.expectedSolution).trim())
      ? problem.expectedSolution
      : null;

    return [{
      language: lang,
      starterCode: starter,
      ...(includeReference ? { referenceSolution: ref } : {}),
      ...(includeReference ? {
        starterCodeSource: 'manual',
        referenceSolutionSource: 'manual',
        generationStatus: ref ? 'completed' : 'pending',
      } : {}),
      timeLimit: null,
      memoryLimit: null,
    }];
  }

  return rows.map(l => {
    const lang = String(l.language).toLowerCase();
    const starter = (l.starterCode != null && String(l.starterCode).trim())
      ? l.starterCode
      : getDefaultStarterCode(lang, ctx);
    const ref = (l.referenceSolution != null && String(l.referenceSolution).trim())
      ? l.referenceSolution
      : null;

    return {
      language: lang,
      starterCode: starter,
      ...(includeReference ? { referenceSolution: ref } : {}),
      ...(includeReference ? {
        starterCodeSource: l.starterCodeSource || 'manual',
        referenceSolutionSource: l.referenceSolutionSource || 'manual',
        generationStatus: l.generationStatus || (ref ? 'completed' : 'pending'),
      } : {}),
      timeLimit: l.timeLimit || null,
      memoryLimit: l.memoryLimit || null,
    };
  });
}


// ── TRAINER: CRUD Assessments ──

exports.list = async (req, res) => {
  try {
    const { trainingId, courseId, search = '' } = req.query;
    const resolvedCourseId = courseId || req.query.course_id;
    const resolvedTrainingId = trainingId || req.query.training_id;
    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const where = {};
    if (resolvedCourseId) {
      where.courseId = resolvedCourseId;
    } else if (resolvedTrainingId) {
      where.trainingId = resolvedTrainingId;
    } else if (req.user.role !== 'ADMIN') {
      where.trainerId = req.user.id;
    }

    if (search && search.trim()) {
      where.title = { [Op.like]: `%${search.trim()}%` };
    }

    const total = await CodingAssessment.count({ where });

    let findOptions = {
      where,
      include: [
        { model: CodingProblem, as: 'problems', attributes: ['id', 'title', 'difficulty', 'programmingLanguage', 'marks'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] }
      ],
      order: [['created_at', 'DESC']]
    };

    if (isPaginated) {
      findOptions.limit = limit;
      findOptions.offset = offset;
    }

    const assessments = await CodingAssessment.findAll(findOptions);
    const paginationMeta = formatPaginationMeta(total, page, limit);

    ok(res, {
      assessments,
      data: assessments,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (err) { fail(res, 500, err.message); }
};

exports.getOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return fail(res, 400, 'Invalid assessment ID');
    const isParticipant = req.user.role === 'PARTICIPANT';
    const assessment = await CodingAssessment.findByPk(id, {
      include: [
        {
          model: CodingProblem,
          as: 'problems',
          include: [
            { model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] },
            {
              model: CodingTestCase,
              as: 'testCases',
              order: [['order', 'ASC']],
              ...(isParticipant ? { where: { isHidden: false }, required: false } : {})
            }
          ]
        },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] }
      ]
    });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const allowed = await canManageAssessment(req.user, assessment);
    if (!isParticipant && !allowed) return fail(res, 403, 'Unauthorized');

    if (isParticipant) {
      if (assessment.status !== 'PUBLISHED') return fail(res, 403, 'Assessment is not available');
      // For participants: do NOT expose reference solutions or hidden test cases.
      // Load user's saved/submitted code for a SINGLE attempt only (strict isolation).
      // NEVER merge submissions across attempts: code/answers from one attempt must not
      // bleed into a participant's view of another attempt.
      let currentAttemptId = null;
      if (req.query.attemptId) {
        const parsed = parseInt(req.query.attemptId, 10);
        // Resolve the requested attempt and confirm it belongs to this participant.
        const requested = await CodingAttempt.findOne({
          where: { id: parsed, assessmentId: assessment.id, participantId: req.user.id },
          attributes: ['id']
        }).catch(() => null);
        currentAttemptId = requested ? requested.id : null;
      } else {
        // No attemptId supplied: resolve the participant's single current attempt.
        // Prefer the most recent IN_PROGRESS attempt, else the most recent attempt overall.
        const inProgress = await CodingAttempt.findOne({
          where: { assessmentId: assessment.id, participantId: req.user.id, status: 'IN_PROGRESS' },
          attributes: ['id'],
          order: [['id', 'DESC']]
        }).catch(() => null);
        const latest = inProgress || (await CodingAttempt.findOne({
          where: { assessmentId: assessment.id, participantId: req.user.id },
          attributes: ['id'],
          order: [['id', 'DESC']]
        }).catch(() => null));
        currentAttemptId = latest ? latest.id : null;
      }

      // Load submissions for that single attempt only.
      let allSubmissions = [];
      if (currentAttemptId) {
        allSubmissions = await CodingSubmission.findAll({
          where: { attemptId: currentAttemptId },
          order: [['id', 'DESC']]
        });
      }

      const submissionsByProblem = new Map();
      for (const sub of allSubmissions) {
        if (!submissionsByProblem.has(sub.problemId)) {
          submissionsByProblem.set(sub.problemId, sub);
        }
      }

      const problemsJson = [];
      for (const p of assessment.problems || []) {
        const pJson = p.toJSON();

        // Resolve languages WITH references first, so the integrity guard can
        // compare each served starter against the answer key. The guard returns
        // participant-safe rows (references and trainer-only fields stripped),
        // so the shape here is identical to the old includeReference:false call.
        const withReference = getProblemLanguages(pJson, { includeReference: true });
        const guarded = sanitiseServedProblem({
          problem: pJson,
          languages: withReference,
          context: {
            surface: 'codingAssessment.getOne',
            participantId: req.user.id,
            assessmentId: assessment.id,
            attemptId: currentAttemptId,
          },
        });

        delete pJson.referenceSolution;
        delete pJson.expectedSolution;
        delete pJson.solution;
        pJson.starterCode = guarded.starterCode;
        pJson.languages = guarded.languages;
        pJson.allowedLanguages = pJson.languages.map(l => l.language);
        pJson.testCases = (pJson.testCases || []).filter(tc => !tc.isHidden);

        const latestSub = submissionsByProblem.get(p.id) || null;

        if (latestSub) {
          pJson.lastLanguage = latestSub.language;
          pJson.lastSavedCode = latestSub.code;
          // The participant's own code is served untouched even when it matches
          // the answer key — a correct solution can legitimately converge on the
          // reference text. Record it for review instead of rewriting their work.
          // (`p` still carries the reference fields; `pJson` has had them deleted.)
          auditSavedCode({
            problem: p,
            code: latestSub.code,
            context: {
              surface: 'codingAssessment.getOne',
              participantId: req.user.id,
              assessmentId: assessment.id,
              attemptId: currentAttemptId,
              submissionId: latestSub.id,
            },
          });
          pJson.latestSubmission = {
            id: latestSub.id,
            status: latestSub.status,
            language: latestSub.language,
            code: latestSub.code,
            submittedCode: latestSub.code,
            totalTestCases: latestSub.totalTestCases,
            passedTestCases: latestSub.passedTestCases,
            executionTime: latestSub.executionTime,
            memoryUsed: latestSub.memoryUsed,
            compilerOutput: latestSub.compilerOutput,
            errorMessage: latestSub.errorMessage,
            results: Array.isArray(latestSub.output) ? latestSub.output.filter(r => !r.isHidden) : [],
          };
        } else {
          pJson.lastLanguage = pJson.programmingLanguage;
          pJson.latestSubmission = null;
        }
        problemsJson.push(pJson);
      }

      const assessmentJson = assessment.toJSON();
      assessmentJson.problems = problemsJson;
      return ok(res, { assessment: assessmentJson });
    }

    // Trainer / admin: expose full per-language config (including reference solutions).
    const assessmentJson = assessment.toJSON();
    for (const p of assessmentJson.problems || []) {
      p.languages = getProblemLanguages(p);
      p.languageSolutions = {};
      for (const l of p.languages) {
        p.languageSolutions[l.language] = {
          starterCode: l.starterCode,
          referenceSolution: l.referenceSolution,
        };
      }
      p.allowedLanguages = p.languages.map(l => l.language);
      p.programmingLanguage = p.languages[0]?.language || p.programmingLanguage || 'javascript';
      p.starterCode = p.languages[0]?.starterCode || p.starterCode || null;
    }
    ok(res, { assessment: assessmentJson });
  } catch (err) { fail(res, 500, err.message); }
};

exports.create = async (req, res) => {
  try {
    const { title, description, timeLimit, difficulty, courseId, trainingId, languages } = req.body;
    const resolvedCourseId = courseId && courseId !== 'undefined' ? courseId : null;
    const resolvedTrainingId = trainingId && trainingId !== 'undefined' && trainingId !== 'null' ? trainingId : null;
    const assessment = await CodingAssessment.create({
      title: title || 'Untitled Coding Assessment', description, timeLimit,
      difficulty: normalizeAssessmentDifficulty(difficulty), courseId: resolvedCourseId, trainingId: resolvedTrainingId,
      languages: Array.isArray(languages) ? languages : ['javascript'],
      trainerId: req.user.id, status: 'DRAFT'
    });
    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return fail(res, 400, 'Invalid assessment ID');
    const assessment = await CodingAssessment.findByPk(id);
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const allowed = await canManageAssessment(req.user, assessment);
    if (!allowed) return fail(res, 403, 'Permission denied');

    // NOTE: 'status' is intentionally excluded — status transitions must go through /publish, /close endpoints
    const allowedFields = ['title', 'description', 'timeLimit', 'difficulty', 'startTime', 'endTime', 'showResultImmediately', 'allowMultipleAttempts', 'maxAttempts', 'proctoringEnabled', 'proctoringLevel', 'gracePeriodMinutes', 'maxCopyWarnings', 'aiAssistantEnabled'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        if (key === 'difficulty') {
          updates[key] = normalizeAssessmentDifficulty(req.body[key]);
        } else {
          updates[key] = req.body[key];
        }
      }
    }
    await assessment.update(updates);
    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

async function deleteAssessmentsCascade(assessmentIds, transaction) {
  const ids = Array.isArray(assessmentIds) ? assessmentIds : [assessmentIds];
  if (ids.length === 0) return;

  // 1. Find attempts
  const attempts = await CodingAttempt.findAll({
    where: { assessmentId: { [Op.in]: ids } },
    attributes: ['id'],
    transaction
  });
  const attemptIds = attempts.map(a => a.id);

  // 2. Find problems
  const problems = await CodingProblem.findAll({
    where: { assessmentId: { [Op.in]: ids } },
    attributes: ['id'],
    transaction
  });
  const problemIds = problems.map(p => p.id);

  // 3. Find exam sessions
  const examSessionConditions = [
    { assessmentId: { [Op.in]: ids } }
  ];
  if (attemptIds.length > 0) {
    examSessionConditions.push({ codingAttemptId: { [Op.in]: attemptIds } });
  }

  const examSessions = await ExamSession.findAll({
    where: { [Op.or]: examSessionConditions },
    attributes: ['id'],
    transaction
  });
  const sessionIds = examSessions.map(s => s.id);

  // 4. Delete exam session children
  if (sessionIds.length > 0) {
    if (Violation) await Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction }).catch(() => {});
    if (ProctorActivity) await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction }).catch(() => {});
    if (Screenshot) await Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction }).catch(() => {});
    await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } }, transaction });
  }

  // 5. Delete assessment sessions
  const assessmentSessionConditions = [
    { assessmentId: { [Op.in]: ids } }
  ];
  if (attemptIds.length > 0) {
    assessmentSessionConditions.push({ codingAttemptId: { [Op.in]: attemptIds } });
  }
  if (AssessmentSession) {
    await AssessmentSession.destroy({
      where: { [Op.or]: assessmentSessionConditions },
      transaction
    }).catch(() => {});
  }

  // 6. Delete proctoring & monitoring records for attempts
  if (attemptIds.length > 0) {
    if (ProctoringSession) await ProctoringSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction }).catch(() => {});
    if (ProctoringEvent) await ProctoringEvent.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction }).catch(() => {});
    if (ProctoringReport) await ProctoringReport.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction }).catch(() => {});
    if (MonitoringSession) await MonitoringSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction }).catch(() => {});
  }

  // 7. Delete problem languages & test cases & AI helps & submissions
  if (problemIds.length > 0) {
    await CodingProblemLanguage.destroy({ where: { problemId: { [Op.in]: problemIds } }, transaction });
    await CodingTestCase.destroy({ where: { problemId: { [Op.in]: problemIds } }, transaction });
    if (CodingAiHelp) await CodingAiHelp.destroy({ where: { problemId: { [Op.in]: problemIds } }, transaction }).catch(() => {});
    await CodingSubmission.destroy({ where: { problemId: { [Op.in]: problemIds } }, transaction });
    await CodingProblem.destroy({ where: { id: { [Op.in]: problemIds } }, transaction });
  }

  // 8. Delete attempts AI help & submissions & results
  if (attemptIds.length > 0) {
    if (CodingAiHelp) await CodingAiHelp.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction }).catch(() => {});
    await CodingSubmission.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction });
  }

  // 9. Delete results & attempts
  await CodingResult.destroy({ where: { assessmentId: { [Op.in]: ids } }, transaction });
  await CodingAttempt.destroy({ where: { assessmentId: { [Op.in]: ids } }, transaction });

  // 10. Delete assessments
  await CodingAssessment.destroy({ where: { id: { [Op.in]: ids } }, transaction });
}

exports.destroy = async (req, res) => {
  try {
    if (req.params.id === 'bulk' || req.params.id === 'bulk-delete') {
      return exports.bulkDestroy(req, res);
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return fail(res, 400, 'Invalid assessment ID');
    const assessment = await CodingAssessment.findByPk(id);
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const allowed = await canManageAssessment(req.user, assessment);
    if (!allowed) return fail(res, 403, 'Permission denied');

    await sequelize.transaction(async (t) => {
      await deleteAssessmentsCascade([assessment.id], t);
    });

    ok(res, { success: true, message: 'Assessment deleted' });
  } catch (err) { fail(res, 500, err.message); }
};

exports.bulkDestroy = async (req, res) => {
  try {
    const rawIds = req.body.ids || req.body.assessmentIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return fail(res, 400, 'Please provide an array of assessment IDs to delete');
    }
    const ids = rawIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
    if (ids.length === 0) {
      return fail(res, 400, 'No valid assessment IDs provided');
    }

    const assessments = await CodingAssessment.findAll({ where: { id: { [Op.in]: ids } } });
    if (assessments.length === 0) {
      return fail(res, 404, 'No matching assessments found');
    }

    const allowedAssessments = [];
    for (const a of assessments) {
      if (await canManageAssessment(req.user, a)) {
        allowedAssessments.push(a);
      }
    }

    if (allowedAssessments.length === 0) {
      return fail(res, 403, 'Permission denied for selected assessments');
    }

    const foundIds = allowedAssessments.map(a => a.id);

    await sequelize.transaction(async (t) => {
      await deleteAssessmentsCascade(foundIds, t);
    });

    ok(res, {
      success: true,
      count: foundIds.length,
      deletedIds: foundIds,
      message: `${foundIds.length} assessment${foundIds.length === 1 ? '' : 's'} deleted successfully`,
    });
  } catch (err) { fail(res, 500, err.message); }
};

const normalizeTestCase = (tc, problemId, index = 0) => {
  const input = tc?.input != null
    ? String(tc.input)
    : (tc?.sampleInput != null ? String(tc.sampleInput) : '');
  const expectedOutput = tc?.expectedOutput != null
    ? String(tc.expectedOutput)
    : (tc?.output != null
      ? String(tc.output)
      : (tc?.expected_output != null
        ? String(tc.expected_output)
        : (tc?.expected != null
          ? String(tc.expected)
          : (tc?.sampleOutput != null ? String(tc.sampleOutput) : ''))));
  return {
    problemId,
    input,
    expectedOutput,
    isHidden: Boolean(tc?.isHidden ?? tc?.is_hidden ?? false),
    description: tc?.description || null,
    order: tc?.order != null ? Number(tc.order) : index,
  };
};

// ── TRAINER: Problems CRUD ──

async function replaceProblemLanguages(problemId, langs, transaction) {
  await CodingProblemLanguage.destroy({ where: { problemId }, transaction });
  for (const l of langs) {
    await CodingProblemLanguage.create({ problemId, ...l }, { transaction });
  }
}

// Load a problem and reshape it into the trainer API shape (includes reference
// solutions + all test cases + per-language configuration).
async function loadProblemForResponse(problemId) {
  const dbProblem = await CodingProblem.findByPk(problemId, {
    include: [
      { model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] },
      { model: CodingTestCase, as: 'testCases', order: [['order', 'ASC']] },
    ],
  });
  if (!dbProblem) return null;
  const json = dbProblem.toJSON();
  json.languages = getProblemLanguages(dbProblem);
  json.languageSolutions = {};
  for (const l of json.languages) {
    json.languageSolutions[l.language] = {
      starterCode: l.starterCode,
      referenceSolution: l.referenceSolution,
    };
  }
  return json;
}

// Validate test-cases payload: at least one test case, all required fields valid.
function validateTestCasesPayload(testCases) {
  if (Array.isArray(testCases)) {
    if (testCases.length === 0) {
      const err = new Error('At least one test case is required.');
      err.status = 400;
      throw err;
    }
    testCases.forEach((tc, i) => {
      const hasOutput = tc && (
        tc.expectedOutput !== undefined ||
        tc.output !== undefined ||
        tc.expected_output !== undefined ||
        tc.expected !== undefined ||
        tc.sampleOutput !== undefined
      );
      if (!hasOutput) {
        const err = new Error(`Test case ${i + 1} is missing Expected Output.`);
        err.status = 400;
        throw err;
      }
    });
    return true;
  }
  return false;
}

exports.createProblem = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const { title, description, constraints, inputFormat, outputFormat, sampleInput, sampleOutput, explanation, difficulty, timeLimit, memoryLimit, marks, tags, testCases, requiredConcepts } = req.body;

    const languages = normalizeProblemLanguages(req.body.languages, req.body);
    const firstLang = languages[0];

    const problem = await CodingProblem.create({
      assessmentId: assessment.id, title, description, constraints, inputFormat, outputFormat, sampleInput, sampleOutput, explanation, difficulty,
      programmingLanguage: firstLang.language,
      starterCode: firstLang.starterCode,
      expectedSolution: firstLang.referenceSolution,
      timeLimit, memoryLimit, marks, tags,
      requiredConcepts: Array.isArray(requiredConcepts) ? requiredConcepts : [],
    });

    const hasTests = Array.isArray(testCases) && testCases.length > 0;
    await replaceProblemLanguages(problem.id, languages, null);
    if (hasTests) {
      for (let i = 0; i < testCases.length; i++) {
        await CodingTestCase.create(normalizeTestCase(testCases[i], problem.id, i));
      }
    } else if (sampleInput != null || sampleOutput != null) {
      await CodingTestCase.create({
        problemId: problem.id,
        input: sampleInput != null ? String(sampleInput) : '',
        expectedOutput: sampleOutput != null ? String(sampleOutput) : '',
        isHidden: false,
        description: 'Sample Test Case',
        order: 0,
      });
    }

    const full = await loadProblemForResponse(problem.id);
    ok(res, { problem: full });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    fail(res, 500, err.message);
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }]
    });
    if (!problem) return fail(res, 404, 'Problem not found');

    const allowed = ['title', 'description', 'constraints', 'inputFormat', 'outputFormat', 'sampleInput', 'sampleOutput', 'explanation', 'difficulty', 'timeLimit', 'memoryLimit', 'marks', 'tags', 'requiredConcepts'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const result = await sequelize.transaction(async (t) => {
      await problem.update(updates, { transaction: t });

      // Multi-language configuration (replaces prior languages for the problem).
      if (req.body.languages !== undefined) {
        const languages = normalizeProblemLanguages(req.body.languages, req.body);
        const firstLang = languages[0];
        // Keep the legacy scalar columns in sync with the first language so old
        // code paths reading programmingLanguage/starterCode/expectedSolution still work.
        await problem.update({
          programmingLanguage: firstLang.language,
          starterCode: firstLang.starterCode,
          expectedSolution: firstLang.referenceSolution,
        }, { transaction: t });
        await replaceProblemLanguages(problem.id, languages, t);
      }

      if (req.body.testCases !== undefined && Array.isArray(req.body.testCases)) {
        validateTestCasesPayload(req.body.testCases);
        await CodingTestCase.destroy({ where: { problemId: problem.id }, transaction: t });
        for (let i = 0; i < req.body.testCases.length; i++) {
          await CodingTestCase.create(normalizeTestCase(req.body.testCases[i], problem.id, i), { transaction: t });
        }
      }
    });

    const full = await loadProblemForResponse(problem.id);
    ok(res, { problem: full });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    fail(res, 500, err.message);
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const whereAssessment = req.user.role === 'ADMIN' ? {} : { trainerId: req.user.id };
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: whereAssessment }]
    });
    if (!problem) return fail(res, 404, 'Problem not found');
    await CodingProblemLanguage.destroy({ where: { problemId: problem.id } });
    await CodingTestCase.destroy({ where: { problemId: problem.id } });
    if (CodingAiHelp) await CodingAiHelp.destroy({ where: { problemId: problem.id } }).catch(() => {});
    await CodingSubmission.destroy({ where: { problemId: problem.id } });
    await problem.destroy();
    ok(res, { message: 'Problem deleted' });
  } catch (err) { fail(res, 500, err.message); }
};

// ── AI GENERATION ──

exports.generateFromPrompt = async (req, res) => {
  try {
    const { prompt, difficulty = 'MEDIUM', problemCount, courseId, trainingId, languages } = req.body;
    if (!prompt || !prompt.trim()) return fail(res, 400, 'Prompt is required');
    const cleanPrompt = prompt.trim();
    const normDiff = normalizeAssessmentDifficulty(difficulty);
    const aiService = require('../services/aiService');
    const { extractRequestedProblemCount, analyzePromptIntent } = require('../services/codingIntentAnalyzer');
    const { validateGeneratedProblem } = require('../services/codingProblemValidator');
    const GENERATION_VERSION = 'langgraph-workflow-v1';

    const requestedCount = Math.max(1, Math.min(parseInt(problemCount, 10) || extractRequestedProblemCount(cleanPrompt) || 1, 10));
    const analyzedIntent = analyzePromptIntent(cleanPrompt, normDiff, requestedCount);

    console.log('[codingAssessmentController] [generateFromPrompt] Request:', {
      prompt: cleanPrompt,
      difficulty: normDiff,
      requestedCount,
      languages,
      courseId,
    });

    // Prefer structured array; also accept legacy comma-separated string.
    const rawLangs = Array.isArray(languages)
      ? languages
      : (typeof languages === 'string' ? languages.split(',').map((s) => s.trim()).filter(Boolean) : []);
    const aiLangs = [...new Set(
      rawLangs
        .map((l) => String(l).trim().toLowerCase())
        .filter((l) => SUPPORTED_LANGUAGE_IDS.has(l))
    )];
    if (aiLangs.length === 0) aiLangs.push('javascript');

    const result = await aiService.generateCodingProblemsFromPrompt(cleanPrompt, requestedCount, normDiff, aiLangs);
    if (!result.problems || result.problems.length === 0) {
      return fail(res, 502, 'AI returned no coding problems. Please try again.');
    }

    // STEP 3: Enforce strict problem count & STEP 4: Unique questions
    const seenTitles = new Set();
    const uniqueProblems = [];
    for (const p of result.problems) {
      const normTitle = (p.title || '').trim().toLowerCase();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        uniqueProblems.push(p);
      }
    }

    if (uniqueProblems.length < requestedCount) {
      return fail(res, 422, `AI returned only ${uniqueProblems.length} unique problems, but ${requestedCount} were requested. Please retry.`);
    }

    const selectedProblems = uniqueProblems.slice(0, requestedCount);
    const resolvedCourseId = courseId && courseId !== 'undefined' && courseId !== 'null' ? courseId : null;
    const resolvedTrainingId = trainingId && trainingId !== 'undefined' && trainingId !== 'null' ? trainingId : null;
    const langs = aiLangs;
    const assessmentTimeLimit = parseInt(req.body.timeLimit || req.body.time_limit, 10) || 60;

    // STEP 7, 8, 9: Validate all problems & execute reference solutions
    const prepared = [];
    for (let i = 0; i < selectedProblems.length; i++) {
      const p = selectedProblems[i];
      const langConfigs = [];
      for (const L of langs) {
        let starterCode = '';
        let referenceSolution = '';
        const fromAI = (p.languageSolutions && p.languageSolutions[L]) || null;
        if (fromAI) {
          starterCode = String(fromAI.starterCode || '').trim();
          referenceSolution = String(fromAI.referenceSolution || '').trim();
        }
        if (!starterCode || !referenceSolution) {
          const filled = await aiService.generateLanguageCode(L, {
            title: p.title, description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints
          });
          if (filled) {
            if (!starterCode && filled.starterCode) starterCode = String(filled.starterCode).trim();
            if (!referenceSolution && filled.referenceSolution) referenceSolution = String(filled.referenceSolution).trim();
          }
        }
        if (!starterCode || !referenceSolution) {
          return fail(res, 422, `Missing required code configuration for language "${L}" in problem "${p.title}".`);
        }
        langConfigs.push({ language: L, starterCode, referenceSolution });
      }

      const langSolutionsMap = {};
      for (const lc of langConfigs) {
        langSolutionsMap[lc.language] = {
          starterCode: lc.starterCode,
          referenceSolution: lc.referenceSolution,
        };
      }

      const valReport = await validateGeneratedProblem(
        {
          title: p.title,
          description: p.description,
          testCases: p.testCases,
          timeLimit: p.timeLimit || 5,
          memoryLimit: p.memoryLimit || 256,
          languages: langConfigs,
          languageSolutions: langSolutionsMap,
        },
        null,
        langs,
        { execute: true }
      );

      const validationStatus = valReport.isValid ? 'VALIDATED' : 'NEEDS_TRAINER_REVIEW';
      const validationMessage = valReport.isValid ? null : valReport.issues.join('; ');
      if (!valReport.isValid) {
        console.warn(`[codingAssessmentController] Problem "${p.title}" flagged for trainer review:`, valReport.issues);
      }

      prepared.push({
        raw: p,
        langConfigs,
        validationStatus,
        validationMessage,
      });
    }

    // STEP 10: Atomic Transactional Database Save
    const assessment = await sequelize.transaction(async (t) => {
      const newAssessment = await CodingAssessment.create({
        trainerId: req.user.id,
        trainingId: resolvedTrainingId,
        courseId: resolvedCourseId,
        title: result.title || `Coding: ${cleanPrompt.substring(0, 60)}`,
        timeLimit: assessmentTimeLimit,
        numProblems: prepared.length,
        difficulty: normDiff,
        status: 'DRAFT',
        languages: langs,
        originalPrompt: cleanPrompt,
        analyzedIntent,
        generationVersion: GENERATION_VERSION,
        validationResult: prepared.map(({ raw: p, validationStatus, validationMessage }) => ({
          title: p.title,
          validationStatus,
          validationMessage,
        })),
      }, { transaction: t });

      for (let i = 0; i < prepared.length; i++) {
        const { raw: p, langConfigs, validationStatus, validationMessage } = prepared[i];
        const first = langConfigs[0];
        const problem = await CodingProblem.create({
          assessmentId: newAssessment.id,
          title: p.title,
          description: p.description,
          constraints: p.constraints,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          sampleInput: p.sampleInput,
          sampleOutput: p.sampleOutput,
          explanation: p.explanation,
          difficulty: normalizeProblemDifficulty(p.difficulty || normDiff),
          programmingLanguage: first.language,
          starterCode: first.starterCode,
          expectedSolution: first.referenceSolution,
          timeLimit: p.timeLimit || 5,
          memoryLimit: p.memoryLimit || 256,
          marks: p.marks || (normDiff === 'EASY' ? 10 : normDiff === 'HARD' ? 30 : 20),
          tags: p.tags || [],
          order: i,
          requiredConcepts: Array.isArray(p.requiredConcepts) ? p.requiredConcepts : [],
          source: 'AI',
          aiValidationStatus: validationStatus,
          aiValidationMessage: validationMessage,
        }, { transaction: t });

        await replaceProblemLanguages(problem.id, langConfigs.map((lc, idx) => ({
          language: lc.language,
          starterCode: lc.starterCode,
          referenceSolution: lc.referenceSolution,
          starterCodeSource: 'generated',
          referenceSolutionSource: 'generated',
          generationStatus: 'completed',
          timeLimit: null,
          memoryLimit: null,
          order: idx,
        })), t);

        const rawTestCases = Array.isArray(p.testCases) ? p.testCases : [];
        if (rawTestCases.length > 0) {
          for (let j = 0; j < rawTestCases.length; j++) {
            await CodingTestCase.create(normalizeTestCase(rawTestCases[j], problem.id, j), { transaction: t });
          }
        }
      }

      return newAssessment;
    });

    const full = await CodingAssessment.findByPk(assessment.id, {
      include: [
        {
          model: CodingProblem, as: 'problems',
          include: [
            { model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] },
            { model: CodingTestCase, as: 'testCases', order: [['order', 'ASC']] }
          ]
        }
      ]
    });

    console.log(`[DATABASE_SAVED] assessmentId=${assessment.id} problemsCount=${(full?.problems || []).length} titles=[${(full?.problems || []).map(p => `"${p.title}"`).join(', ')}]`);
    console.log(`[API_RESPONSE] status=200 assessmentId=${full?.id} problemsCount=${(full?.problems || []).length}`);

    // Centralized Notification: Notify trainer that AI generation is ready
    const NotificationService = require('../services/notificationService');
    const io = req.app?.get('io');
    NotificationService.createNotification({
      userId: req.user.id,
      actorUserId: req.user.id,
      recipientRole: req.user.role || 'TRAINER',
      type: NotificationService.TYPES.AI_GENERATION_COMPLETED,
      title: 'AI Assessment Ready',
      message: `Your AI-generated assessment "${full?.title || cleanPrompt}" with ${(full?.problems || []).length} problem(s) is ready.`,
      category: NotificationService.CATEGORIES.AI,
      relatedEntityType: 'coding_assessment',
      relatedEntityId: assessment.id,
      actionUrl: `/trainer/coding/${assessment.id}`,
      priority: 'NORMAL',
    }, io).catch(() => {});

    ok(res, { assessment: full });
  } catch (err) {
    console.error('[codingAssessmentController] generateFromPrompt error:', err);
    const NotificationService = require('../services/notificationService');
    NotificationService.createNotification({
      userId: req.user.id,
      recipientRole: req.user.role || 'TRAINER',
      type: NotificationService.TYPES.AI_GENERATION_FAILED,
      title: 'AI Generation Failed',
      message: `We could not generate the coding assessment. Please try again.`,
      category: NotificationService.CATEGORIES.AI,
      actionUrl: '/trainer?tab=courses',
      priority: 'HIGH',
    }, req.app?.get('io')).catch(() => {});
    fail(res, 500, err.message);
  }
};

// TRAINER: Generate and add AI problems directly into an existing assessment
exports.generateProblemsForAssessment = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const { prompt, difficulty = 'MEDIUM', problemCount, languages } = req.body;
    if (!prompt || !prompt.trim()) return fail(res, 400, 'Prompt is required');
    const cleanPrompt = prompt.trim();
    const normDiff = normalizeAssessmentDifficulty(difficulty);
    const aiService = require('../services/aiService');
    const { extractRequestedProblemCount, analyzePromptIntent } = require('../services/codingIntentAnalyzer');
    const { validateGeneratedProblem } = require('../services/codingProblemValidator');

    const requestedCount = Math.max(1, Math.min(parseInt(problemCount, 10) || extractRequestedProblemCount(cleanPrompt) || 1, 10));
    const analyzedIntent = analyzePromptIntent(cleanPrompt, normDiff, requestedCount);

    console.log('[codingAssessmentController] [generateProblemsForAssessment] Request:', {
      assessmentId: req.params.id,
      prompt: cleanPrompt,
      difficulty: normDiff,
      requestedCount,
      languages,
    });

    const requestedLangs = Array.isArray(languages) && languages.length > 0
      ? languages
      : (Array.isArray(assessment.languages) && assessment.languages.length > 0 ? assessment.languages : ['javascript']);
    const langs = [...new Set(
      requestedLangs
        .map((l) => String(l).trim().toLowerCase())
        .filter((l) => SUPPORTED_LANGUAGE_IDS.has(l))
    )];
    if (langs.length === 0) langs.push('javascript');

    const result = await aiService.generateCodingProblemsFromPrompt(cleanPrompt, requestedCount, normDiff, langs);
    if (!result.problems || result.problems.length === 0) {
      return fail(res, 502, 'AI returned no coding problems. Please try again.');
    }

    // STEP 3 & 4: Deduplicate and enforce count
    const seenTitles = new Set();
    const uniqueProblems = [];
    for (const p of result.problems) {
      const normTitle = (p.title || '').trim().toLowerCase();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        uniqueProblems.push(p);
      }
    }

    if (uniqueProblems.length < requestedCount) {
      return fail(res, 422, `AI returned only ${uniqueProblems.length} unique problems, but ${requestedCount} were requested. Please retry.`);
    }

    const selectedProblems = uniqueProblems.slice(0, requestedCount);
    const currentCount = await CodingProblem.count({ where: { assessmentId: assessment.id } });

    // STEP 7, 8, 9: Validate every problem
    const prepared = [];
    for (let i = 0; i < selectedProblems.length; i++) {
      const p = selectedProblems[i];
      const langConfigs = [];
      for (const L of langs) {
        let starterCode = '';
        let referenceSolution = '';
        const fromAI = (p.languageSolutions && p.languageSolutions[L]) || null;
        if (fromAI) {
          starterCode = String(fromAI.starterCode || '').trim();
          referenceSolution = String(fromAI.referenceSolution || '').trim();
        }
        if (!starterCode || !referenceSolution) {
          const filled = await aiService.generateLanguageCode(L, {
            title: p.title, description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints
          });
          if (filled) {
            if (!starterCode && filled.starterCode) starterCode = String(filled.starterCode).trim();
            if (!referenceSolution && filled.referenceSolution) referenceSolution = String(filled.referenceSolution).trim();
          }
        }
        if (!starterCode || !referenceSolution) {
          return fail(res, 422, `Missing required code configuration for language "${L}" in problem "${p.title}".`);
        }
        langConfigs.push({ language: L, starterCode, referenceSolution });
      }

      const langSolutionsMap = {};
      for (const lc of langConfigs) {
        langSolutionsMap[lc.language] = {
          starterCode: lc.starterCode,
          referenceSolution: lc.referenceSolution,
        };
      }

      const valReport = await validateGeneratedProblem(
        {
          title: p.title,
          description: p.description,
          testCases: p.testCases,
          timeLimit: p.timeLimit || 5,
          memoryLimit: p.memoryLimit || 256,
          languages: langConfigs,
          languageSolutions: langSolutionsMap,
        },
        null,
        langs,
        { execute: true }
      );

      const validationStatus = valReport.isValid ? 'VALIDATED' : 'NEEDS_TRAINER_REVIEW';
      const validationMessage = valReport.isValid ? null : valReport.issues.join('; ');
      if (!valReport.isValid) {
        console.warn(`[codingAssessmentController] Problem "${p.title}" flagged for trainer review:`, valReport.issues);
      }

      prepared.push({
        raw: p,
        langConfigs,
        validationStatus,
        validationMessage,
      });
    }

    // STEP 10: Atomic Transactional Save
    const createdProblems = await sequelize.transaction(async (t) => {
      const saved = [];
      for (let i = 0; i < prepared.length; i++) {
        const { raw: p, langConfigs, validationStatus, validationMessage } = prepared[i];
        const first = langConfigs[0];
        const problem = await CodingProblem.create({
          assessmentId: assessment.id,
          title: p.title,
          description: p.description,
          constraints: p.constraints,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          sampleInput: p.sampleInput,
          sampleOutput: p.sampleOutput,
          explanation: p.explanation,
          difficulty: normalizeProblemDifficulty(p.difficulty || normDiff),
          programmingLanguage: first.language,
          starterCode: first.starterCode,
          expectedSolution: first.referenceSolution,
          timeLimit: p.timeLimit || 5,
          memoryLimit: p.memoryLimit || 256,
          marks: p.marks || (normDiff === 'EASY' ? 10 : normDiff === 'HARD' ? 30 : 20),
          tags: p.tags || [],
          order: currentCount + i,
          requiredConcepts: Array.isArray(p.requiredConcepts) ? p.requiredConcepts : [],
          source: 'AI',
          aiValidationStatus: validationStatus,
          aiValidationMessage: validationMessage,
          validationResult: {
            status: validationStatus,
            message: validationMessage,
            testCasesValidated: Array.isArray(p.testCases) ? p.testCases.length : 0,
          },
        }, { transaction: t });

        await replaceProblemLanguages(problem.id, langConfigs.map((lc, idx) => ({
          language: lc.language,
          starterCode: lc.starterCode,
          referenceSolution: lc.referenceSolution,
          starterCodeSource: 'generated',
          referenceSolutionSource: 'generated',
          generationStatus: 'completed',
          timeLimit: null,
          memoryLimit: null,
          order: idx,
        })), t);

        const rawTestCases = Array.isArray(p.testCases) ? p.testCases : [];
        if (rawTestCases.length > 0) {
          for (let j = 0; j < rawTestCases.length; j++) {
            await CodingTestCase.create(normalizeTestCase(rawTestCases[j], problem.id, j), { transaction: t });
          }
        }
        saved.push(problem);
      }

      await assessment.update({
        numProblems: currentCount + saved.length,
        originalPrompt: cleanPrompt,
        analyzedIntent,
        generationVersion: 'langgraph-workflow-v1',
      }, { transaction: t });
      return saved;
    });

    const updatedAssessment = await CodingAssessment.findByPk(assessment.id, {
      include: [
        {
          model: CodingProblem, as: 'problems',
          include: [
            { model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] },
            { model: CodingTestCase, as: 'testCases', order: [['order', 'ASC']] }
          ]
        }
      ]
    });

    console.log(`[DATABASE_SAVED] assessmentId=${assessment.id} addedProblemsCount=${createdProblems.length} totalProblemsCount=${(updatedAssessment?.problems || []).length}`);
    console.log(`[API_RESPONSE] status=200 assessmentId=${updatedAssessment?.id} problemsCount=${(updatedAssessment?.problems || []).length}`);

    ok(res, { assessment: updatedAssessment, createdProblems });
  } catch (err) {
    console.error('[codingAssessmentController] generateProblemsForAssessment error:', err);
    fail(res, 500, err.message);
  }
};

// TRAINER: generate language-specific starter code + reference solution for a coding problem
exports.generateLanguageCode = async (req, res) => {
  try {
    const { language, problem } = req.body;
    if (!language) return fail(res, 400, 'language is required');
    if (!SUPPORTED_LANGUAGE_IDS.has(String(language).toLowerCase())) {
      return fail(res, 400, `Unsupported language: "${language}"`);
    }
    const details = {
      title: problem?.title,
      description: problem?.description,
      inputFormat: problem?.inputFormat,
      outputFormat: problem?.outputFormat,
      constraints: problem?.constraints,
    };
    const aiService = require('../services/aiService');
    const result = await aiService.generateLanguageCode(language, details);
    ok(res, { language: String(language).toLowerCase(), ...result });
  } catch (err) { fail(res, 500, err.message); }
};

exports.publish = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    if (assessment.status !== 'DRAFT') return fail(res, 400, 'Assessment is not in DRAFT status');
    const problems = await CodingProblem.findAll({
      where: { assessmentId: assessment.id },
      include: [
        { model: CodingProblemLanguage, as: 'languages' },
        { model: CodingTestCase, as: 'testCases' }
      ]
    });
    if (problems.length === 0) return fail(res, 400, 'Cannot publish: no problems defined');

    // Structural check: Ensure every problem has at least 1 test case
    for (const p of problems) {
      if (!p.testCases || p.testCases.length === 0) {
        return fail(res, 400, `Cannot publish: Problem "${p.title}" has no test cases.`);
      }
    }

    // Only validate unvalidated problems concurrently in parallel
    const needValidation = problems.filter(p => p.aiValidationStatus !== 'VALIDATED');
    if (needValidation.length > 0 && req.body.skipValidation !== true && req.body.force !== true) {
      const { validateProblem: runValidation } = require('../services/codingValidationService');
      const validationReports = await Promise.all(
        needValidation.map(async (p) => {
          try {
            const report = await runValidation(p);
            return { problem: p, report };
          } catch (e) {
            return { problem: p, report: { recommendedStatus: 'VALIDATION_FAILED', issues: [e.message] } };
          }
        })
      );

      const validationErrors = [];
      for (const { problem, report } of validationReports) {
        if (report.recommendedStatus === 'VALIDATION_FAILED' || (report.issues && report.issues.length > 0)) {
          const failureDetails = report.issues.join('; ');
          validationErrors.push(`• Problem "${problem.title}": ${failureDetails}`);
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Cannot publish: Reference solution(s) failed test case verification. Please fix them before publishing.',
          details: validationErrors,
        });
      }
    }

    const totalMarks = problems.reduce((s, p) => s + (p.marks || 10), 0);
    await assessment.update({ status: 'PUBLISHED', publishedAt: new Date(), totalMarks });
    await CodingProblem.update(
      { aiValidationStatus: 'VALIDATED' },
      { where: { assessmentId: assessment.id } }
    );

    // Asynchronously dispatch notifications to enrolled participants
    (async () => {
      try {
        const { Enrollment } = require('../models');
        const NotificationService = require('../services/notificationService');
        const io = req.app?.get('io');

        let enrollments = [];
        if (assessment.courseId) {
          enrollments = await Enrollment.findAll({ where: { courseId: assessment.courseId, status: 'ENROLLED' }, attributes: ['participantId'] });
        } else if (assessment.trainingId) {
          enrollments = await Enrollment.findAll({ where: { trainingId: assessment.trainingId, status: 'ENROLLED' }, attributes: ['participantId'] });
        }

        const participantIds = [...new Set(enrollments.map(e => e.participantId))];
        if (participantIds.length > 0) {
          await Promise.all(
            participantIds.map(pId =>
              NotificationService.createNotification({
                userId: pId,
                recipientRole: 'PARTICIPANT',
                type: 'CODING_ASSESSMENT_PUBLISHED',
                title: 'New Coding Assessment Available',
                message: `"${assessment.title}" has been published by your trainer.`,
                category: NotificationService.CATEGORIES.ACADEMIC || 'ACADEMIC',
                relatedEntityType: 'coding_assessment',
                relatedEntityId: assessment.id,
                actionUrl: `/participant/coding/${assessment.id}`,
                priority: 'HIGH',
              }, io).catch(() => {})
            )
          );
        }
        if (io) {
          io.emit('assessment:published', { assessmentId: assessment.id, courseId: assessment.courseId });
        }
      } catch (notifyErr) {
        console.warn('[codingAssessmentController] Notification error on publish:', notifyErr.message);
      }
    })();

    ok(res, { assessment, message: 'Assessment published successfully' });
  } catch (err) { fail(res, 500, err.message); }
};

exports.close = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    await CodingAttempt.update({ status: 'AUTO_SUBMITTED', submittedAt: new Date() }, {
      where: { assessmentId: assessment.id, status: 'IN_PROGRESS' }
    });
    await assessment.update({ status: 'CLOSED', closedAt: new Date() });
    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

exports.publishResults = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const { Enrollment } = require('../models');
    const trainerId = req.user.id;
    if (req.user.role !== 'ADMIN' && assessment.trainerId !== trainerId) {
      return fail(res, 403, 'You are not authorized to manage this assessment');
    }

    const override = req.body.override === true || req.body.force === true;

    const enrollmentWhere = [];
    if (assessment.courseId)   enrollmentWhere.push({ courseId: assessment.courseId });
    if (assessment.trainingId) enrollmentWhere.push({ trainingId: assessment.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({ where: { [Op.or]: enrollmentWhere, status: 'ENROLLED' }, attributes: ['participantId'] })
      : [];
    const participantIds = [...new Set(enrollments.map(e => String(e.participantId)))];
    const enrolled = participantIds.length;

    const completedCount = enrolled === 0 ? 0 : await CodingResult.count({
      where: { assessmentId: assessment.id, participantId: participantIds },
    });
    const pending = enrolled - completedCount;

    if (pending > 0 && !override) {
      return res.status(400).json({
        error: 'PENDING_PARTICIPANTS',
        message: `${pending} participant(s) haven't completed the assessment yet.`,
        pending_count: pending,
        enrolled,
        completed: completedCount,
      });
    }

    const results = await CodingResult.findAll({
      where: { assessmentId: assessment.id },
      order: [['percentage', 'DESC']]
    });
    const now = new Date();
    for (let i = 0; i < results.length; i++) {
      await results[i].update({
        rank: i + 1,
        resultPublished: true,
        publishedAt: now,
        publishedBy: trainerId,
      });
    }

    await assessment.update({
      resultStatus: 'PUBLISHED',
      resultPublishedAt: now,
      ...(assessment.status === 'CLOSED' ? { status: 'RESULTS_PUBLISHED' } : {}),
    });

    ok(res, { success: true, message: 'Results published successfully', enrolled, completed: completedCount });
  } catch (err) { fail(res, 500, err.message); }
};

exports.hideResults = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    if (req.user.role !== 'ADMIN' && assessment.trainerId !== req.user.id) {
      return fail(res, 403, 'You are not authorized to manage this assessment');
    }

    await CodingResult.update({ resultPublished: false }, {
      where: { assessmentId: assessment.id }
    });

    await assessment.update({
      resultStatus: 'HIDDEN',
      resultPublishedAt: null,
      ...(assessment.status === 'RESULTS_PUBLISHED' ? { status: 'CLOSED' } : {}),
    });

    ok(res, { success: true, message: 'Results hidden successfully' });
  } catch (err) { fail(res, 500, err.message); }
};

exports.getParticipantResult = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const result = await CodingResult.findOne({
      where: { assessmentId: assessment.id, participantId: req.user.id },
      include: [
        {
          model: CodingAttempt,
          as: 'attempt',
          attributes: ['id', 'status', 'timeTaken', 'startedAt', 'submittedAt'],
          include: [{
            model: CodingSubmission,
            as: 'submissions',
            attributes: ['id', 'problemId', 'status', 'totalTestCases', 'passedTestCases', 'score', 'language'],
            include: [{ model: CodingProblem, as: 'problem', attributes: ['id', 'title'] }]
          }]
        }
      ]
    });
    if (!result) return fail(res, 404, 'Result not found');

    ok(res, {
      title: assessment.title,
      resultStatus: assessment.resultStatus,
      percentage: result.percentage,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      rank: result.rank,
      timeTaken: result.attempt?.timeTaken,
      submissions: (result.attempt?.submissions || []).map(sub => ({
        title: sub.problem?.title,
        language: sub.language,
        passedTestCases: sub.passedTestCases,
        totalTestCases: sub.totalTestCases
      }))
    });
  } catch (err) { fail(res, 500, err.message); }
};

// ── PARTICIPANT: Start ──

exports.start = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const participantId = req.user.id;
    const { Enrollment, AssessmentSession } = require('../models');

    const assessment = await CodingAssessment.findByPk(assessmentId);
    if (!assessment || assessment.status !== 'PUBLISHED') {
      return fail(res, 404, 'Assessment not available');
    }

    // ── Log incoming request ──
    console.log('=== Coding Assessment Start ===');
    console.log('Assessment ID:', assessmentId);
    console.log('Participant ID:', participantId);

    const trainingId = req.body?.training_id || assessment.trainingId || null;
    const lessonId = req.body?.lesson_id || null;

    console.log('coding_assessment_id:', assessmentId);
    console.log('training_id:', trainingId);
    console.log('lesson_id:', lessonId);

    // 1. Verify access via enrollment (both courseId and trainingId)
    const enrollmentCheck = await Enrollment.findOne({
      where: {
        participantId,
        status: 'ENROLLED',
        [Op.or]: [
          ...(assessment.courseId ? [{ courseId: assessment.courseId }] : []),
          ...(assessment.trainingId ? [{ trainingId: assessment.trainingId }] : []),
        ]
      }
    });
    if (!enrollmentCheck) return fail(res, 403, 'Participant not enrolled');

    // 2. Check for duplicate attempts (respect allowMultipleAttempts)
    if (!assessment.allowMultipleAttempts) {
      const completedAttempt = await CodingAttempt.findOne({
        where: { assessmentId, participantId, status: { [Op.in]: ['SUBMITTED', 'EVALUATED'] } }
      });
      if (completedAttempt) return fail(res, 400, 'You have already attempted this assessment. Multiple attempts are not allowed.');
    } else {
      // Check max attempts limit
      const attemptCount = await CodingAttempt.count({
        where: { assessmentId, participantId, status: { [Op.in]: ['SUBMITTED', 'EVALUATED'] } }
      });
      if (attemptCount >= assessment.maxAttempts) {
        return fail(res, 400, `Maximum attempt limit (${assessment.maxAttempts}) reached.`);
      }
    }

    // 3. Find or create IN_PROGRESS attempt
    let attempt = await CodingAttempt.findOne({ where: { assessmentId, participantId, status: 'IN_PROGRESS' } });
    if (!attempt) {
      attempt = await CodingAttempt.create({ assessmentId, participantId, status: 'IN_PROGRESS', startedAt: new Date() });
      console.log('Created CodingAttempt:', JSON.stringify({ id: attempt.id, assessmentId, participantId, status: 'IN_PROGRESS' }));
    } else {
      console.log('Reusing existing IN_PROGRESS CodingAttempt:', attempt.id);
    }

    // 4. Handle AssessmentSession lock
    const crypto = require('crypto');
    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const userAgent = (req.headers['user-agent'] || '').slice(0, 1024);
    const deviceFingerprint = (req.body?.deviceFingerprint || '').toString().slice(0, 512) || null;

    const minutes = Number.isFinite(assessment.timeLimit) && assessment.timeLimit > 0 ? assessment.timeLimit : 0;
    const ttlMs = minutes > 0 ? (minutes + 15) * 60_000 : 3 * 60 * 60_000;
    const expiresAt = new Date(Date.now() + ttlMs);

    let session = await AssessmentSession.findOne({ where: { codingAttemptId: attempt.id } });
    const sessionToken = crypto.randomBytes(32).toString('hex');

    const sessionData = {
      assessmentId: parseInt(assessmentId),
      assessmentType: 'coding',
      participantId,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      deviceFingerprint,
      sessionToken,
      status: 'ACTIVE',
      lockedAt: new Date(),
      expiresAt
    };
    console.log('AssessmentSession insert/update values:', JSON.stringify(sessionData, null, 2));

    if (session) {
      await session.update(sessionData);
    } else {
      sessionData.codingAttemptId = attempt.id;
      session = await AssessmentSession.create(sessionData);
    }

    let monitoringSessionId = attempt.monitoringSessionId || null;
    try {
      const monitoringService = require('../services/monitoringService');
      const { session: monSession } = await monitoringService.startSession({
        participantId,
        contextType: 'CODING',
        contextId: Number(assessmentId),
        attemptId: attempt.id,
        mobileEnabled: true,
      });
      if (monSession?.sessionId) {
        monitoringSessionId = monSession.sessionId;
        await attempt.update({ monitoringSessionId });
      }
    } catch (monErr) {
      console.warn('Failed to initialize monitoring session for coding attempt:', monErr.message);
    }

    console.log('Attempt created successfully. Attempt ID:', attempt.id, 'Session Token:', session.sessionToken, 'Monitoring Session ID:', monitoringSessionId);

    ok(res, {
      success: true,
      attemptId: attempt.id,
      sessionToken: session.sessionToken,
      monitoringSessionId,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        timeLimit: assessment.timeLimit,
        proctoringEnabled: assessment.proctoringEnabled !== false,
        proctoringLevel: assessment.proctoringLevel || 'MEDIUM',
        gracePeriodMinutes: assessment.gracePeriodMinutes || 2,
      }
    });
  } catch (err) {
    console.error('Error starting coding assessment:', err);
    const msg = err.message || '';
    if (msg.includes('cannot be null') || msg.includes('Column') || msg.includes('SQL') || msg.includes('ER_PARSE_ERROR') || msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('ER_NO_REFERENCED_ROW')) {
      fail(res, 500, 'Failed to start assessment due to a database constraint. Please contact support.');
    } else {
      fail(res, 500, err.message);
    }
  }
};

// ── PARTICIPANT: Run Code (SAMPLE TESTS ONLY — LeetCode-style) ──

exports.runCode = async (req, res) => {
  try {
    const { attemptId, problemId, code, language = 'javascript', timeLimit, memoryLimit, input: customInput } = req.body;
    const { JudgeEngine } = require('../judge/engine');
    const engine = new JudgeEngine();
    let problem = null;
    let execTimeLimit = 5;
    let execMemoryLimit = 256;

    if (problemId) {
      problem = await CodingProblem.findByPk(problemId, {
        include: [{ model: CodingTestCase, as: 'testCases', where: { isHidden: false }, required: false }]
      });
      if (problem) {
        if (problem.aiValidationStatus === 'VALIDATION_FAILED') {
          console.warn(`[codingAssessmentController] [WARNING] runCode invoked on problem with VALIDATION_FAILED status (ID: ${problem.id}, Title: "${problem.title}")`);
        }
        execTimeLimit = problem.timeLimit || timeLimit || 5;
        execMemoryLimit = problem.memoryLimit || memoryLimit || 256;
      }
    }
    execTimeLimit = timeLimit || execTimeLimit || 5;
    execMemoryLimit = memoryLimit || execMemoryLimit || 256;

    let sampleTestCases = (problem?.testCases || []).map(tc => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      timeout: execTimeLimit,
      memoryLimit: execMemoryLimit,
      isHidden: false,
    }));

    if (customInput != null && customInput !== '') {
      sampleTestCases = [{
        id: null,
        input: customInput,
        expectedOutput: null,
        timeout: execTimeLimit,
        memoryLimit: execMemoryLimit,
        isHidden: false,
      }];
    }

    const results = await engine.runSampleTests({
      code, language, sampleTestCases,
      timeLimit: execTimeLimit, memoryLimit: execMemoryLimit,
    });

    const sampleResults = results.map((r, i) => {
      const tc = sampleTestCases[i];
      return {
        input: tc?.input || '',
        expectedOutput: tc?.expectedOutput || '',
        actualOutput: r.actualOutput || '',
        verdict: r.verdict,
        passed: r.verdict === 'ACCEPTED',
        executionTime: r.executionTime || 0,
        memoryUsed: r.memoryUsed || 0,
        compileOutput: r.compileOutput || null,
        error: r.error || null,
      };
    });

    const allPassed = sampleResults.every(r => r.passed);
    const compileOutput = sampleResults.find(r => r.compileOutput)?.compileOutput || '';
    const stderr = sampleResults.find(r => r.error && !r.compileOutput)?.error || '';

    if (attemptId && problemId) {
      // Fire-and-forget auto-save so it never delays the run response.
      (async () => {
        try {
          const attempt = await CodingAttempt.findOne({
            where: { id: attemptId, participantId: req.user.id, status: 'IN_PROGRESS' }
          });
          if (attempt) {
            let submission = await CodingSubmission.findOne({ where: { attemptId, problemId } });
            if (submission) {
              await submission.update({ code, language });
            } else {
              await CodingSubmission.create({ attemptId, problemId, code, language, status: 'PENDING' });
            }
          }
        } catch (saveErr) {
          logger.warn('Failed to auto-save during run', { error: saveErr.message });
        }
      })().catch(() => {});
    }

    const { checkRequiredConcepts } = require('../services/requiredConceptValidator');
    const conceptValidation = checkRequiredConcepts(code, language, problem?.requiredConcepts || []);

    const hasCompileError = sampleResults.some(r => r.verdict === 'COMPILATION_ERROR');
    if (hasCompileError) {
      return ok(res, {
        run: {
          status: 'COMPILATION_ERROR',
          compileOutput,
          sampleResults,
          allPassed: false,
          conceptValidation,
        }
      });
    }

    let runStatus = allPassed ? 'ACCEPTED' : 'WRONG_ANSWER';
    if (allPassed && !conceptValidation.ok) {
      runStatus = 'FAILED_REQUIREMENTS';
    }

    ok(res, {
      run: {
        status: runStatus,
        compileOutput,
        stderr,
        executionTime: Math.max(...sampleResults.map(r => r.executionTime || 0)),
        memoryUsed: Math.max(...sampleResults.map(r => r.memoryUsed || 0)),
        sampleResults,
        allPassed: allPassed && conceptValidation.ok,
        conceptValidation,
      }
    });
  } catch (err) {
    logger.error('Run code error', { error: err.message });
    fail(res, 500, err.message || 'Code execution failed');
  }
};

// ── PARTICIPANT: Save Code (auto-save) ──

exports.saveCode = async (req, res) => {
  try {
    const { attemptId, problemId, code, language = 'javascript' } = req.body;
    if (!attemptId || !problemId) return fail(res, 400, 'attemptId and problemId are required');

    const attempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId: req.user.id, status: 'IN_PROGRESS' }
    });
    if (!attempt) return fail(res, 404, 'Attempt not found or already submitted');

    let submission = await CodingSubmission.findOne({
      where: { attemptId, problemId }
    });

    if (submission) {
      submission.code = code;
      submission.language = language;
      await submission.save();
    } else {
      submission = await CodingSubmission.create({
        attemptId, problemId, code, language,
        status: 'PENDING',
      });
    }

    ok(res, { saved: true, submissionId: submission.id });
  } catch (err) { fail(res, 500, err.message); }
};

// ── PARTICIPANT: Save Code Batch (single roundtrip) ──

exports.saveCodeBatch = async (req, res) => {
  try {
    const { attemptId, saves } = req.body;
    if (!attemptId || !Array.isArray(saves)) return fail(res, 400, 'attemptId and saves array are required');

    const attempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId: req.user.id, status: 'IN_PROGRESS' }
    });
    if (!attempt) return fail(res, 404, 'Attempt not found or already submitted');

    const uniqueSaves = new Map();
    for (const item of saves) {
      if (!item.problemId) continue;
      uniqueSaves.set(item.problemId, item);
    }

    const items = [...uniqueSaves.values()];
    if (items.length === 0) return ok(res, { saved: true, count: 0 });

    // First, fetch all existing submissions in one query.
    const existingSubs = await CodingSubmission.findAll({
      where: { attemptId, problemId: { [Op.in]: items.map(i => i.problemId) } }
    });
    const existingMap = new Map(existingSubs.map(s => [s.problemId, s]));

    // Parallelize creates and saves.
    const ops = items.map(async (item) => {
      const sub = existingMap.get(item.problemId);
      if (sub) {
        sub.code = item.code || '';
        if (item.language) sub.language = item.language;
        await sub.save();
      } else {
        await CodingSubmission.create({
          attemptId,
          problemId: item.problemId,
          code: item.code || '',
          language: item.language || 'javascript',
          status: 'PENDING',
        });
      }
    });

    await Promise.all(ops);

    ok(res, { saved: true, count: items.length });
  } catch (err) { fail(res, 500, err.message); }
};

// ── PARTICIPANT: Submit Code (ALL TESTS — enterprise queue-based) ──

exports.submitCode = async (req, res) => {
  try {
    const { attemptId, problemId, code, language = 'javascript' } = req.body;
    const attempt = await CodingAttempt.findOne({ where: { id: attemptId, participantId: req.user.id, status: 'IN_PROGRESS' } });
    if (!attempt) return fail(res, 404, 'Attempt not found or already submitted');
    const problem = await CodingProblem.findByPk(problemId, {
      include: [{ model: CodingTestCase, as: 'testCases' }]
    });
    if (!problem) return fail(res, 404, 'Problem not found');

    const testCases = problem.testCases || [];
    if (problem.aiValidationStatus === 'VALIDATION_FAILED') {
      console.warn(`[codingAssessmentController] [WARNING] submitProblem invoked on problem with VALIDATION_FAILED status (ID: ${problem.id}, Title: "${problem.title}")`);
    }
    if (testCases.length === 0) {
      return fail(res, 400, 'This problem has no test cases configured. Please contact your trainer.');
    }

    const allowedLangs = (await getProblemLanguages(problem, { includeReference: false })).map(l => l.language);
    const normLang = String(language || '').trim().toLowerCase();
    if (!allowedLangs.includes(normLang)) {
      return fail(res, 400, `Language "${language}" is not allowed for this problem. Allowed: ${allowedLangs.join(', ')}`);
    }

    const tcData = testCases.map(tc => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isHidden: tc.isHidden,
      weight: tc.weight || 1,
      timeout: tc.timeout || problem.timeLimit || 5,
      memoryLimit: tc.memoryLimit || problem.memoryLimit || 256,
    }));

    // Duplicate submission prevention: reuse the single submission row for this
    // attempt+problem. If a request for the same code is already PENDING/evaluated,
    // only re-enqueue when the code actually changed. This keeps the DB as the
    // source of truth and prevents redundant/duplicate jobs.
    let submission = await CodingSubmission.findOne({ where: { attemptId, problemId, language: normLang } });
    const isSameCode = submission && submission.code === code && (submission.language || 'javascript') === normLang;

    if (!submission) {
      submission = await CodingSubmission.create({
        attemptId, problemId, code, language: normLang, status: 'PENDING',
        totalTestCases: tcData.length, passedTestCases: 0,
        executionTime: 0, memoryUsed: 0, score: 0,
      });
    } else if (!isSameCode) {
      await submission.update({
        code, language: normLang, status: 'PENDING',
        totalTestCases: tcData.length, passedTestCases: 0,
        executionTime: 0, memoryUsed: 0, score: 0, output: null,
      });
    } else {
      // Same code already persisted. If it has already been evaluated, return the
      // stored result without enqueuing a duplicate job.
      if (submission.status !== 'PENDING') {
        return ok(res, {
          submission: {
            id: submission.id,
            status: submission.status,
            score: submission.score != null ? Number(submission.score) : 0,
            passedTestCases: submission.passedTestCases || 0,
            totalTestCases: submission.totalTestCases || tcData.length,
            executionTime: submission.executionTime || 0,
            memoryUsed: submission.memoryUsed || 0,
            compilerOutput: submission.compilerOutput || null,
            errorMessage: submission.errorMessage || null,
            results: Array.isArray(submission.output) ? submission.output.filter(r => !r.isHidden) : [],
            message: 'Submission already evaluated',
            hiddenCount: tcData.filter(tc => tc.isHidden).length,
            duplicate: true,
          }
        });
      }
    }

    const io = req.app.get('io');

    const { enqueueSubmission } = require('../queues/submissionQueue');
    await enqueueSubmission({
      submissionId: submission.id,
      attemptId,
      problemId,
      code,
      language,
      timeLimit: problem.timeLimit || 5,
      memoryLimit: problem.memoryLimit || 256,
      testCases: tcData,
      participantId: req.user.id,
      assessmentId: attempt.assessmentId,
      io,
    });

    // Return immediately. The submission is PENDING and will be evaluated
    // asynchronously by the queue worker / websocket. No need to re-read the
    // DB row (it will still be PENDING at this point since the job is queued).
    const visibleResults = Array.isArray(submission.output)
      ? submission.output.filter(r => !r.isHidden)
      : [];

    ok(res, {
      submission: {
        id: submission.id,
        status: submission.status || 'PENDING',
        score: submission.score != null ? Number(submission.score) : 0,
        passedTestCases: submission.passedTestCases || 0,
        totalTestCases: submission.totalTestCases || tcData.length,
        executionTime: submission.executionTime || 0,
        memoryUsed: submission.memoryUsed || 0,
        compilerOutput: submission.compilerOutput || null,
        errorMessage: submission.errorMessage || null,
        results: visibleResults,
        message: 'Submission queued for evaluation',
        hiddenCount: tcData.filter(tc => tc.isHidden).length,
      }
    });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Data truncated') || msg.includes('execution_time')) {
      logger.error('execution_time storage error', { error: msg, body: req.body });
      return fail(res, 500, 'Failed to save execution result. Please try again.');
    }
    if (msg.includes('ER_DATA_TRUNCATED') || msg.includes('Truncated')) {
      return fail(res, 500, 'A database value was invalid. Please contact support.');
    }
    fail(res, 500, err.message);
  }
};

// ── PARTICIPANT: Get Submission (with live result) ──

exports.getSubmission = async (req, res) => {
  try {
    const submission = await CodingSubmission.findByPk(req.params.id, {
      include: [{ model: CodingProblem, as: 'problem', attributes: ['id', 'title'] }]
    });
    if (!submission) return fail(res, 404, 'Submission not found');

    const attempt = await CodingAttempt.findByPk(submission.attemptId);
    if (attempt && attempt.participantId !== req.user.id && req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Access denied');
    }

    const output = submission.output || [];
    const visibleResults = output.filter(r => !r.isHidden);
    const totalHidden = output.filter(r => r.isHidden).length;
    const passedHidden = output.filter(r => r.isHidden && r.passed).length;

    ok(res, {
      submission: {
        id: submission.id,
        status: submission.status,
        score: submission.score,
        totalTestCases: submission.totalTestCases,
        passedTestCases: submission.passedTestCases,
        executionTime: submission.executionTime,
        memoryUsed: submission.memoryUsed,
        compilerOutput: submission.compilerOutput,
        errorMessage: submission.errorMessage,
        failedTestCase: submission.failedTestCase,
        language: submission.language,
        createdAt: submission.created_at || submission.createdAt,
        results: visibleResults.map(r => ({
          input: r.input,
          expectedOutput: r.expectedOutput,
          actualOutput: r.actualOutput,
          passed: r.passed,
          verdict: r.verdict || r.status,
          executionTime: r.executionTime,
          memoryUsed: r.memoryUsed,
        })),
        hiddenSummary: totalHidden > 0 ? { totalHidden, passedHidden } : null,
      }
    });
  } catch (err) { fail(res, 500, err.message); }
};

// ── PARTICIPANT: AI Assistant (Beginner-Friendly Socratic coaching) ──

exports.aiAssist = async (req, res) => {
  try {
    const { attemptId, problemId, code, language, question, level, action, errorContext } = req.body;
    if (!attemptId || !problemId) return fail(res, 400, 'attemptId and problemId are required');
    for (const [name, value, max] of [['question', question, 4000], ['code', code, 32000], ['errorContext', errorContext, 8000], ['language', language, 50], ['action', action, 80]]) {
      if (value != null && (typeof value !== 'string' || value.length > max)) return fail(res, 422, `${name} must be text up to ${max} characters`);
    }

    const service = require('../services/codingAiAssistantService');
    const result = await service.grantAssist({
      attemptId: Number(attemptId),
      problemId: Number(problemId),
      participantId: req.user.id,
      code: code || '',
      language: language || 'javascript',
      question: question || "I'm stuck. Can you guide me?",
      level: Number(level) || 1,
      action: action || 'hint',
      errorContext: errorContext || '',
    });
    ok(res, result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({error:err.message,code:err.code});
    logger.error('AI assist error', { error: err.message });
    fail(res, 500, err.message);
  }
};

exports.aiAssistStatus = async (req, res) => {
  try {
    const { attemptId, problemId } = req.params;
    const service = require('../services/codingAiAssistantService');

    const status = await service.getStatus({
      attemptId: Number(attemptId),
      problemId: Number(problemId),
      participantId: req.user.id,
    });

    ok(res, status);
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// ── TRAINER: AI problem validation pipeline ──

exports.validateProblem = async (req, res) => {
  try {
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [
        { model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } },
        { model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] },
      ],
    });
    if (!problem) return fail(res, 404, 'Problem not found');

    await problem.update({ aiValidationStatus: 'VALIDATING', aiValidationMessage: null });

    const { validateProblem: runValidation } = require('../services/codingValidationService');
    const report = await runValidation(problem);

    await problem.update({
      aiValidationStatus: report.recommendedStatus,
      aiValidationMessage: report.issues.length > 0 ? report.issues.join(' ') : null,
      source: problem.source === 'AI' ? 'AI' : problem.source,
    });

    const updated = await CodingProblem.findByPk(problem.id, {
      include: [{ model: CodingTestCase, as: 'testCases', order: [['order', 'ASC']] }],
    });

    ok(res, { problem: updated, validation: report });
  } catch (err) {
    logger.error('Validate problem error', { error: err.message });
    fail(res, 500, err.message);
  }
};

exports.validateAllProblems = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const problems = await CodingProblem.findAll({
      where: { assessmentId: assessment.id },
      include: [{ model: CodingProblemLanguage, as: 'languages', order: [['order', 'ASC']] }],
    });
    const { validateProblem: runValidation } = require('../services/codingValidationService');
    const results = [];
    for (const problem of problems) {
      await problem.update({ aiValidationStatus: 'VALIDATING', aiValidationMessage: null });
      const report = await runValidation(problem);
      await problem.update({
        aiValidationStatus: report.recommendedStatus,
        aiValidationMessage: report.issues.length > 0 ? report.issues.join(' ') : null,
      });
      results.push({ problemId: problem.id, title: problem.title, ...report });
    }
    ok(res, { results });
  } catch (err) {
    logger.error('Validate all problems error', { error: err.message });
    fail(res, 500, err.message);
  }
};

// ── TRAINER: Test case management (per problem) ──

exports.addTestCase = async (req, res) => {
  try {
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }],
    });
    if (!problem) return fail(res, 404, 'Problem not found');
    const count = await CodingTestCase.count({ where: { problemId: problem.id } });
    const tc = await CodingTestCase.create(normalizeTestCase(req.body, problem.id, count));
    ok(res, { testCase: tc });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

exports.updateTestCase = async (req, res) => {
  try {
    const tc = await CodingTestCase.findByPk(req.params.testCaseId, {
      include: [{
        model: CodingProblem, as: 'problem',
        include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }],
      }],
    });
    if (!tc) return fail(res, 404, 'Test case not found');
    const allowed = ['input', 'expectedOutput', 'isHidden', 'description', 'order', 'timeout', 'memoryLimit', 'weight'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'isHidden') updates[key] = Boolean(req.body[key]);
        else if (key === 'input' || key === 'expectedOutput') updates[key] = String(req.body[key]);
        else if (key === 'order') updates[key] = parseInt(req.body[key], 10) || 0;
        else updates[key] = req.body[key];
      }
    }
    await tc.update(updates);
    ok(res, { testCase: tc });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

exports.deleteTestCase = async (req, res) => {
  try {
    const tc = await CodingTestCase.findByPk(req.params.testCaseId, {
      include: [{
        model: CodingProblem, as: 'problem',
        include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }],
      }],
    });
    if (!tc) return fail(res, 404, 'Test case not found');
    await tc.destroy();
    ok(res, { message: 'Test case deleted' });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

exports.reorderTestCases = async (req, res) => {
  try {
    const { problemId } = req.params;
    const problem = await CodingProblem.findByPk(problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }],
    });
    if (!problem) return fail(res, 404, 'Problem not found');
    const order = Array.isArray(req.body.order) ? req.body.order : [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      if (!id) continue;
      await CodingTestCase.update({ order: i }, { where: { id, problemId: problem.id } });
    }
    const testCases = await CodingTestCase.findAll({ where: { problemId: problem.id }, order: [['order', 'ASC']] });
    ok(res, { testCases });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// ── PARTICIPANT: Submit entire assessment ──

exports.submitAssessment = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const executionService = require('../services/codeExecutionService');

    // STEP 1: Quick re-verification and load (NO transaction / row lock)
    // We first read the attempt outside any transaction to check status and load data.
    const attempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId: req.user.id }
    });
    if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });
    if (attempt.status !== 'IN_PROGRESS') throw Object.assign(new Error('Attempt already submitted'), { status: 409 });

    const assessment = await CodingAssessment.findByPk(attempt.assessmentId, {
      include: [{ model: CodingProblem, as: 'problems', include: [{ model: CodingTestCase, as: 'testCases' }] }]
    });
    const problems = assessment?.problems || [];
    const existingSubs = await CodingSubmission.findAll({
      where: { attemptId: attempt.id }
    });
    const problemData = req.body.submissions || [];

    // Determine which problems need evaluation:
    // Skip problems that already have an evaluated submission with identical code and language.
    const toEvaluate = [];
    for (const pd of problemData) {
      const problem = problems.find(p => p.id === pd.problemId);
      if (!problem) continue;
      const testCases = problem.testCases || [];
      if (testCases.length === 0) continue;

      const existingSub = existingSubs.find(s => s.problemId === pd.problemId);
      const isAlreadyEvaluated = existingSub &&
        existingSub.status !== 'PENDING' &&
        existingSub.totalTestCases > 0 &&
        existingSub.code === pd.code &&
        (existingSub.language || 'javascript') === (pd.language || 'javascript');

      if (!isAlreadyEvaluated) {
        toEvaluate.push({ pd, problem, testCases, existingSub });
      }
    }

    // STEP 2: Evaluate remaining/modified problems in parallel --- OUTSIDE any transaction.
    // This is the critical fix: Docker container execution no longer holds a DB row lock.
    const evalResultsMap = new Map(); // problemId -> { status, score, outputData, totalTC, passedTC, maxExecTime, maxMem }
    if (toEvaluate.length > 0) {
      const evalPromises = toEvaluate.map(async ({ pd, problem, testCases, existingSub }) => {
        const evalStart = Date.now();
        try {
          const results = await executionService.runTests(pd.code, pd.language || 'javascript', testCases, problem.timeLimit, problem.memoryLimit);
          const { checkRequiredConcepts } = require('../services/requiredConceptValidator');
          const conceptValidation = checkRequiredConcepts(pd.code, pd.language || 'javascript', problem.requiredConcepts || []);
          const totalTC = results.length;
          const passedTC = results.filter(r => r.passed).length;
          const maxExecTime = Math.max(...results.map(r => r.executionTime || 0), 0);
          const maxMem = Math.max(...results.map(r => r.memoryUsed || 0), 0);
          const problemMarks = problem.marks || 10;
          logger.info(`[SubmitAssessment] Evaluated problem ${problem.id} in ${Date.now() - evalStart}ms (Passed ${passedTC}/${totalTC})`);
          let score = totalTC > 0 ? Math.min((passedTC / totalTC) * problemMarks, problemMarks) : 0;
          const isAccepted = totalTC > 0 && passedTC === totalTC;
          let status = 'FAILED';
          if (isAccepted) {
            if (conceptValidation.ok) {
              status = 'ACCEPTED';
            } else {
              status = 'FAILED_REQUIREMENTS';
              score = 0;
            }
          }
          else if (results.some(r => r.status === 'TIME_LIMIT_EXCEEDED')) status = 'TIME_LIMIT_EXCEEDED';
          else if (results.some(r => r.status === 'RUNTIME_ERROR')) status = 'RUNTIME_ERROR';
          else if (results.some(r => r.status === 'COMPILATION_ERROR')) status = 'COMPILATION_ERROR';
          else if (passedTC > 0) status = 'WRONG_ANSWER';

          const outputData = results.map(r => ({
            testCaseId: r.testCaseId,
            input: r.input,
            expectedOutput: r.expectedOutput,
            actualOutput: r.actualOutput,
            passed: r.passed,
            status: r.status,
            executionTime: r.executionTime,
            memoryUsed: r.memoryUsed,
            isHidden: r.isHidden
          }));

          evalResultsMap.set(problem.id, {
            status, score: Math.round(score * 100) / 100,
            totalTC, passedTC, maxExecTime, maxMem, outputData,
            code: pd.code, language: pd.language || 'javascript',
            existingSub: existingSub || null
          });
        } catch (evalErr) {
          logger.error('Error evaluating problem during submission', { problemId: pd.problemId, error: evalErr.message });
        }
      });

      await Promise.allSettled(evalPromises);
    }

    // STEP 3: Short transaction ONLY for writing results.
    // Row lock is held only for the fast DB writes, not for Docker execution.
    const result = await sequelize.transaction(async (t) => {
      // Re-check attempt status inside transaction to prevent duplicate submissions atomically
      const lockedAttempt = await CodingAttempt.findOne({
        where: { id: attemptId, participantId: req.user.id },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!lockedAttempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });
      if (lockedAttempt.status !== 'IN_PROGRESS') throw Object.assign(new Error('Attempt already submitted'), { status: 409 });

      // Write all evaluated submissions in parallel (fast DB ops only)
      const writePromises = [];
      for (const [problemIdVal, ev] of evalResultsMap) {
        if (ev.existingSub) {
          writePromises.push(ev.existingSub.update({
            code: ev.code,
            language: ev.language,
            status: ev.status,
            totalTestCases: ev.totalTC,
            passedTestCases: ev.passedTC,
            executionTime: ev.maxExecTime,
            memoryUsed: ev.maxMem,
            score: ev.score,
            output: ev.outputData
          }, { transaction: t }));
        } else {
          writePromises.push(CodingSubmission.create({
            attemptId,
            problemId: problemIdVal,
            code: ev.code,
            language: ev.language,
            status: ev.status,
            totalTestCases: ev.totalTC,
            passedTestCases: ev.passedTC,
            executionTime: ev.maxExecTime,
            memoryUsed: ev.maxMem,
            score: ev.score,
            output: ev.outputData
          }, { transaction: t }));
        }
      }
      if (writePromises.length > 0) await Promise.all(writePromises);

      const finalSubs = await CodingSubmission.findAll({ where: { attemptId }, transaction: t });
      let totalScore = 0;
      let maxScore = 0;
      let problemsSolved = 0;
      let totalTestCases = 0;
      let passedTestCases = 0;
      for (const p of problems) {
        maxScore += (p.marks || 10);
      }
      for (const sub of finalSubs) {
        totalScore += parseFloat(sub.score || 0);
        totalTestCases += (sub.totalTestCases || 0);
        passedTestCases += (sub.passedTestCases || 0);
        if (sub.status === 'ACCEPTED') problemsSolved++;
      }
      totalScore = Math.min(totalScore, maxScore);
      const percentage = maxScore > 0 ? Math.min(Math.round((totalScore / maxScore) * 10000) / 100, 100) : 0;
      let timeTaken = null;
      try {
        if (req.body?.actualTestDurationSeconds != null && Number(req.body.actualTestDurationSeconds) > 0) {
          timeTaken = Number(req.body.actualTestDurationSeconds);
        } else if (req.body?.timeTaken != null && Number(req.body.timeTaken) > 0) {
          timeTaken = Number(req.body.timeTaken);
        } else if (lockedAttempt.monitoringSessionId) {
          const { MonitoringSession } = require('../models');
          const ms = await MonitoringSession.findOne({ where: { sessionId: lockedAttempt.monitoringSessionId } });
          if (ms?.metadata?.actualTestDurationSeconds) {
            timeTaken = Number(ms.metadata.actualTestDurationSeconds);
          } else if (ms?.metadata?.activeDurationSeconds) {
            timeTaken = Number(ms.metadata.activeDurationSeconds);
          }
        }
        if (timeTaken == null && lockedAttempt.startedAt) {
          timeTaken = Math.max(0, Math.round((Date.now() - new Date(lockedAttempt.startedAt).getTime()) / 1000));
        }
      } catch (_) {}

      await lockedAttempt.update({
        status: 'SUBMITTED', submittedAt: new Date(),
        ...(timeTaken != null ? { timeTaken } : {})
      }, { transaction: t });

      // Calculate AI usage statistics for this attempt
      const aiAssistantService = require('../services/codingAiAssistantService');
      const aiStats = await aiAssistantService.calculateAiUsageStats({
        attemptId: lockedAttempt.id,
        assessmentId: lockedAttempt.assessmentId,
        participantId: req.user.id,
      });

      const codingResult = await CodingResult.create({
        attemptId: lockedAttempt.id, assessmentId: lockedAttempt.assessmentId, participantId: req.user.id,
        totalScore: Math.min(totalScore, 999.99),
        maxScore: Math.min(maxScore, 999.99),
        percentage: Math.min(percentage, 100),
        problemsSolved, totalProblems: problems.length,
        totalTestCases, passedTestCases,
        aiUsed: aiStats.aiUsed,
        aiInteractionCount: aiStats.totalInteractions,
        aiUsageDetails: aiStats.problemUsage,
        aiUsageLevel: aiStats.aiUsageLevel,
      }, { transaction: t });
      return codingResult;
    });

    // Automatically conclude verification and monitoring session and close mobile camera in background
    setImmediate(() => {
      try {
        const verificationService = require('../services/assessmentVerificationService');
        verificationService.endSession({ attemptId: result.attemptId, participantId: req.user.id }).catch(() => {});
      } catch (_) {}

      try {
        const monitoringService = require('../services/monitoringService');
        const activeDurationSec = req.body?.actualTestDurationSeconds || req.body?.timeTaken || null;
        monitoringService.endSession({
          sessionId: result.monitoringSessionId,
          attemptId: result.attemptId,
          participantId: req.user.id,
          actualTestDurationSeconds: activeDurationSec
        }).catch(() => {});
      } catch (_) {}

      // Auto-generate proctoring report in background for coding attempt
      try {
        const proctoringReportService = require('../services/proctoringReportService');
        proctoringReportService.generateFinalProctoringReport(result.attemptId).catch(err => {
          logger.warn('Failed to auto-generate proctoring report for coding attempt', { attemptId: result.attemptId, error: err.message });
        });
      } catch (_) {}
    });

    ok(res, { result });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    fail(res, 500, err.message);
  }
};

exports.getResults = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const { ProctoringReport, MonitoringSession } = require('../models');
    const results = await CodingResult.findAll({
      where: { assessmentId: req.params.id },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        {
          model: CodingAttempt,
          as: 'attempt',
          attributes: ['id', 'status', 'violationCount', 'timeTaken', 'startedAt', 'submittedAt'],
          include: [
            { model: ProctoringReport, as: 'proctoringReport', required: false, attributes: ['riskScore', 'riskLevel', 'status', 'summary'] },
            { model: MonitoringSession, as: 'monitoringSession', required: false, attributes: ['score', 'riskLevel', 'totalEvents', 'laptopStatus'] },
          ]
        }
      ],
      order: [['percentage', 'DESC']]
    });

    let formattedResults = results;
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      formattedResults = results.filter(r =>
        (r.participant?.name || '').toLowerCase().includes(q) ||
        (r.participant?.email || '').toLowerCase().includes(q)
      );
    }

    const total = formattedResults.length;
    const pagedResults = isPaginated ? formattedResults.slice(offset, offset + limit) : formattedResults;
    const paginationMeta = formatPaginationMeta(total, page, limit);

    ok(res, {
      results: pagedResults,
      data: pagedResults,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (err) { fail(res, 500, err.message); }
};

/**
 * Exports assessment results to Excel format with AI usage information.
 */
exports.exportResultsToExcel = async (req, res) => {
  try {
    const { CodingAiHelp, CodingProblem } = require('../models');
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const results = await CodingResult.findAll({
      where: { assessmentId: req.params.id },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        {
          model: CodingAttempt,
          as: 'attempt',
          attributes: ['id', 'status', 'timeTaken', 'startedAt', 'submittedAt'],
        }
      ],
      order: [['percentage', 'DESC']],
    });

    // Get detailed AI usage for each result
    const resultsWithAiDetails = await Promise.all(results.map(async (result) => {
      const aiHelpRecords = await CodingAiHelp.findAll({
        where: { attemptId: result.attemptId, participantId: result.participantId },
        include: [
          {
            model: CodingProblem,
            as: 'problem',
            attributes: ['id', 'title'],
          }
        ],
        order: [['created_at', 'ASC']],
      });

      const totalInteractions = aiHelpRecords.length;
      const questionsWithAi = new Set(aiHelpRecords.map(r => String(r.problemId))).size;

      // Group by problem for question-level breakdown
      const problemBreakdown = {};
      aiHelpRecords.forEach(record => {
        const problemId = String(record.problemId);
        if (!problemBreakdown[problemId]) {
          problemBreakdown[problemId] = {
            problemId,
            problemTitle: record.problem?.title || 'Unknown',
            aiUsed: true,
            interactions: 0,
          };
        }
        problemBreakdown[problemId].interactions += 1;
      });

      return {
        ...result.toJSON(),
        participantName: result.participant?.name || '—',
        participantEmail: result.participant?.email || '—',
        aiUsed: result.aiUsed || false,
        aiInteractionCount: result.aiInteractionCount || 0,
        questionsWithAi,
        problemBreakdown: Object.values(problemBreakdown),
      };
    }));

    // Create Excel-compatible CSV format
    const headers = [
      'Participant Name',
      'Participant Email',
      'Score',
      'Percentage',
      'Problems Solved',
      'Total Problems',
      'Time Taken (seconds)',
      'AI Used',
      'AI Interaction Count',
      'Questions With AI',
      'AI Usage Level',
      'Submitted At',
    ];

    const rows = resultsWithAiDetails.map(r => [
      r.participantName,
      r.participantEmail,
      r.totalScore,
      r.percentage,
      r.problemsSolved,
      r.totalProblems,
      r.attempt?.timeTaken || 0,
      r.aiUsed ? 'Yes' : 'No',
      r.aiInteractionCount,
      r.questionsWithAi,
      r.aiUsageLevel || 'NONE',
      r.attempt?.submittedAt ? new Date(r.attempt.submittedAt).toISOString() : '—',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="coding-assessment-${assessment.title}-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) { fail(res, 500, err.message); }
};

exports.getParticipants = async (req, res) => {
  try {
    const { search = '', status: filterStatus = '' } = req.query;
    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const { Enrollment } = require('../models');
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const enrollmentWhere = [];
    if (assessment.courseId)   enrollmentWhere.push({ courseId: assessment.courseId });
    if (assessment.trainingId) enrollmentWhere.push({ trainingId: assessment.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({
          where: { [Op.or]: enrollmentWhere, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } },
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }]
        })
      : [];

    const attempts = await CodingAttempt.findAll({
      where: { assessmentId: assessment.id },
      include: [{ model: CodingResult, as: 'result' }]
    });

    let participants = enrollments.map(e => {
      const participantId = e.participantId;
      const attempt = attempts.find(a => a.participantId === participantId);

      let status = 'NOT_STARTED';
      if (attempt) {
        if (attempt.status === 'IN_PROGRESS') {
          status = 'IN_PROGRESS';
        } else if (attempt.status === 'disqualified' || attempt.status === 'DISQUALIFIED') {
          status = 'DISQUALIFIED';
        } else if (['SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'EXPIRED'].includes(attempt.status)) {
          status = 'SUBMITTED';
        }
      }

      return {
        id: participantId,
        name: e.participant?.name || '—',
        email: e.participant?.email || '—',
        status,
        attemptId: attempt?.id || null,
        resultPublished: attempt?.result?.resultPublished || false,
        score: attempt?.result?.percentage || null,
        violationCount: attempt?.violationCount || 0,
        submittedAt: attempt?.submittedAt || null
      };
    });

    if (filterStatus && filterStatus !== 'ALL') {
      participants = participants.filter(p => p.status === filterStatus);
    }
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      participants = participants.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    }

    const total = participants.length;
    const pagedParticipants = isPaginated ? participants.slice(offset, offset + limit) : participants;
    const paginationMeta = formatPaginationMeta(total, page, limit);

    ok(res, {
      participants: pagedParticipants,
      data: pagedParticipants,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (err) { fail(res, 500, err.message); }
};

/**
 * POST /api/coding/participant/attempts/:attemptId/violation
 * Logs a coding assessment violation (same rules as Quiz).
 * Uses proctoringService.recordViolation which already handles both Quiz and Coding identically.
 */
exports.recordViolation = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { type, weight, questionNumber } = req.body;
    const participantId = req.user.id;

    console.log('[CODING_VIOLATION] Payload received:', { attemptId, type, weight, participantId, body: req.body });

    const { CodingAttempt } = require('../models');
    const proctoringService = require('../services/proctoringService');

    const attempt = await CodingAttempt.findOne({
      where: { id: attemptId, participantId }
    });
    if (!attempt) {
      console.log('[CODING_VIOLATION] Attempt not found:', { attemptId, participantId });
      return res.status(404).json({ error: 'Attempt not found' });
    }

    // Get the proctoring session for this attempt
    const { ExamSession } = require('../models');
    const session = await ExamSession.findOne({
      where: { codingAttemptId: attemptId, status: { [Op.in]: ['PENDING', 'ACTIVE'] } }
    });

    if (!session) {
      console.log('[CODING_VIOLATION] No active proctoring session found for attempt:', attemptId);
      // Still record the violation even without a session
    }

    // Use proctoringService.recordViolation - it handles Quiz and Coding identically
    // TAB_SWITCH and other browser types are in AUDIT_ONLY_BROWSER_TYPES and never terminate
    if (session) {
      const { violation, terminated } = await proctoringService.recordViolation({
        session,
        type: type || 'TAB_SWITCH',
        message: `${type || 'TAB_SWITCH'} detected during coding assessment`,
        metadata: { questionNumber, weight }
      });

      console.log('[CODING_VIOLATION] Recorded:', { violationId: violation?.id, terminated });

      return res.json({
        success: true,
        disqualified: terminated,
        violationCount: session.warningsCount || 0,
        message: terminated ? 'Assessment terminated due to violation' : 'Violation recorded'
      });
    } else {
      // Fallback: just acknowledge the violation if no session exists
      console.log('[CODING_VIOLATION] No session - acknowledging violation without recording');
      return res.json({
        success: true,
        disqualified: false,
        violationCount: 0,
        message: 'Violation acknowledged (no active session)'
      });
    }
  } catch (err) {
    console.error('[CODING_VIOLATION] Error:', err.message);
    fail(res, 500, err.message);
  }
};

exports.getResultsSummary = async (req, res) => {
  try {
    const { Enrollment } = require('../models');
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const enrollmentWhere = [];
    if (assessment.courseId)   enrollmentWhere.push({ courseId: assessment.courseId });
    if (assessment.trainingId) enrollmentWhere.push({ trainingId: assessment.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({ where: { [Op.or]: enrollmentWhere, status: 'ENROLLED' }, attributes: ['participantId'] })
      : [];

    const participantIds = [...new Set(enrollments.map(e => String(e.participantId)))];
    const enrolled = participantIds.length;

    const results = enrolled === 0 ? [] : await CodingResult.findAll({
      where: { assessmentId: assessment.id, participantId: participantIds },
    });

    const completed = results.length;
    const pending = enrolled - completed;

    let averageScore = 0;
    let passRate = 0;
    if (completed > 0) {
      const totalScoreSum = results.reduce((sum, r) => sum + parseFloat(r.percentage || 0), 0);
      averageScore = Math.round((totalScoreSum / completed) * 10) / 10;

      const passedCount = results.filter(r => parseFloat(r.percentage || 0) >= 50).length;
      passRate = Math.round((passedCount / completed) * 1000) / 10;
    }

    res.json({
      success: true,
      assessment_id: assessment.id,
      title: assessment.title,
      enrolled,
      completed,
      pending,
      averageScore,
      passRate,
      results_visibility: assessment.resultStatus || 'HIDDEN',
      can_publish_without_override: pending === 0 && enrolled > 0,
    });
  } catch (err) { fail(res, 500, err.message); }
};

// ── RECORDINGS ──

exports.getRecordings = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');

    const total = await QuizRecording.count({
      where: { quizId: req.params.id, assessmentType: 'coding' }
    });

    let findOptions = {
      where: { quizId: req.params.id, assessmentType: 'coding' },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC']]
    };

    if (isPaginated) {
      findOptions.limit = limit;
      findOptions.offset = offset;
    }

    const recordings = await QuizRecording.findAll(findOptions);
    const paginationMeta = formatPaginationMeta(total, page, limit);

    ok(res, {
      recordings,
      data: recordings,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (err) { fail(res, 500, err.message); }
};

// ── ANALYTICS ──

exports.getAnalytics = async (req, res) => {
  try {
    const results = await CodingResult.findAll({
      where: { assessmentId: req.params.id },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        { model: CodingAttempt, as: 'attempt', include: [{ model: CodingSubmission, as: 'submissions', include: [{ model: CodingProblem, as: 'problem', attributes: ['id', 'title'] }] }] }
      ],
      order: [['percentage', 'DESC']]
    });
    const problemStats = {};
    const languageCounts = {};
    for (const r of results) {
      for (const sub of r.attempt?.submissions || []) {
        const pTitle = sub.problem?.title || 'Unknown';
        if (!problemStats[pTitle]) problemStats[pTitle] = { total: 0, passed: 0 };
        problemStats[pTitle].total++;
        if (sub.status === 'ACCEPTED') problemStats[pTitle].passed++;
        languageCounts[sub.language] = (languageCounts[sub.language] || 0) + 1;
      }
    }
    ok(res, { results, problemStats, languageCounts });
  } catch (err) { fail(res, 500, err.message); }
};

// ── LEADERBOARD ──

exports.getLeaderboard = async (req, res) => {
  try {
    const results = await CodingResult.findAll({
      where: { assessmentId: req.params.id, resultPublished: true },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email', 'profilePic'] }],
      order: [['percentage', 'DESC'], ['passedTestCases', 'DESC']],
      limit: 100
    });
    const ranked = results.map((r, i) => {
      const json = r.toJSON();
      return {
        rank: i + 1,
        ...json,
        participantId: json.participantId || json.participant?.id,
        participantName: json.participant?.name || 'Participant',
        name: json.participant?.name || 'Participant',
        profileImage: json.participant?.profilePic || null,
        profilePic: json.participant?.profilePic || null,
        avatar: json.participant?.profilePic || null,
      };
    });
    ok(res, { leaderboard: ranked });
  } catch (err) { fail(res, 500, err.message); }
};
