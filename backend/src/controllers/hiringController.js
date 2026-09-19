const { Op } = require('sequelize');
const {
  HiringAssessment,
  HiringCandidate,
  HiringAssignment,
  AIQuiz,
  AIQuestion,
  QuizAttempt,
  QuizResult,
  CodingAssessment,
  CodingProblem,
  CodingTestCase,
  CodingAttempt,
  CodingResult,
  User,
  sequelize,
} = require('../models');
const hiringService = require('../services/hiringService');
const logger = require('../utils/logger');
const { normalizePolicy } = require('../services/hireProctoringPolicy');

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const typeOf = (body = {}) => String(body.assessmentType || body.assessment_type || body.type || 'QUIZ').toUpperCase();

function mapEngineStatus(status) {
  const value = String(status || 'DRAFT').toUpperCase();
  if (value === 'DRAFT') return 'DRAFT';
  if (value === 'ARCHIVED') return 'EXPIRED';
  if (['CLOSED', 'RESULTS_PUBLISHED'].includes(value)) return 'COMPLETED';
  return 'PUBLISHED';
}

function parseCsvRow(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

async function loadWorkflow(id) {
  return HiringAssessment.findByPk(id, {
    include: [
      { model: AIQuiz, as: 'quiz', required: false },
      { model: CodingAssessment, as: 'codingAssessment', required: false },
    ],
  });
}

async function workflowMetrics(workflow) {
  const isCoding = workflow.assessment_type === 'CODING';
  const isCombined = workflow.assessment_type === 'COMBINED';
  const engine = isCoding ? workflow.codingAssessment : (workflow.quiz || workflow.codingAssessment);
  const quizId = workflow.quiz_id;
  const codingId = workflow.coding_assessment_id;

  const [
    candidateCount,
    registeredCount,
    pendingCount,
    assignments,
    quizAttempts,
    codingAttempts,
    quizQuestionCount,
    codingProblemCount,
  ] = await Promise.all([
    HiringCandidate.count({ where: { assessment_id: workflow.id } }),
    HiringCandidate.count({ where: { assessment_id: workflow.id, registration_status: 'REGISTERED' } }),
    HiringCandidate.count({ where: { assessment_id: workflow.id, registration_status: { [Op.ne]: 'REGISTERED' } } }),
    HiringAssignment.findAll({ where: { assessment_id: workflow.id }, attributes: ['status'] }),
    quizId ? QuizAttempt.findAll({ where: { quizId }, attributes: ['status'] }) : [],
    codingId ? CodingAttempt.findAll({ where: { assessmentId: codingId }, attributes: ['status'] }) : [],
    quizId ? AIQuestion.count({ where: { quizId } }) : 0,
    codingId ? CodingProblem.count({ where: { assessmentId: codingId } }) : 0,
  ]);

  const attempts = isCoding ? codingAttempts : (isCombined ? [...quizAttempts, ...codingAttempts] : quizAttempts);
  const inProgress = attempts.filter((a) => String(a.status).toUpperCase() === 'IN_PROGRESS').length;
  const completed = attempts.filter((a) => ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'].includes(String(a.status).toUpperCase())).length;

  const totalContent = isCombined
    ? (quizQuestionCount + codingProblemCount)
    : (isCoding ? codingProblemCount : quizQuestionCount);

  return {
    engine_status: engine?.status || 'DRAFT',
    content_count: totalContent,
    candidate_count: candidateCount,
    registered_count: registeredCount,
    pending_candidates: pendingCount,
    assigned_count: assignments.length,
    in_progress_count: inProgress,
    completed_count: completed,
    quiz_metrics: {
      exists: Boolean(quizId && workflow.quiz),
      id: quizId || null,
      title: workflow.quiz?.title || null,
      status: workflow.quiz?.status || (quizId ? 'DRAFT' : 'NOT_CREATED'),
      question_count: quizQuestionCount,
    },
    coding_metrics: {
      exists: Boolean(codingId && workflow.codingAssessment),
      id: codingId || null,
      title: workflow.codingAssessment?.title || null,
      status: workflow.codingAssessment?.status || (codingId ? 'DRAFT' : 'NOT_CREATED'),
      problem_count: codingProblemCount,
    },
  };
}

function responseWorkflow(workflow, metrics = {}) {
  const json = workflow.toJSON ? workflow.toJSON() : workflow;
  const engine = json.assessment_type === 'CODING' ? json.codingAssessment : (json.quiz || json.codingAssessment);
  const engineStatus = mapEngineStatus(metrics.engine_status || engine?.status);
  return {
    ...json,
    id: Number(json.id),
    title: engine?.title || json.title,
    description: engine?.description ?? json.description,
    duration_minutes: engine?.timeLimit ?? engine?.time_limit ?? json.duration_minutes,
    status: ['COMPLETED', 'EXPIRED'].includes(engineStatus)
      ? engineStatus
      : (metrics.in_progress_count > 0
      ? 'IN_PROGRESS'
      : (metrics.assigned_count > 0 && metrics.completed_count >= metrics.assigned_count
        ? 'COMPLETED'
        : (metrics.assigned_count > 0 ? 'ASSIGNED' : engineStatus))),
    engine_id: json.assessment_type === 'CODING'
      ? (json.coding_assessment_id ? Number(json.coding_assessment_id) : null)
      : (json.quiz_id ? Number(json.quiz_id) : (json.coding_assessment_id ? Number(json.coding_assessment_id) : null)),
    quiz_id: json.quiz_id ? Number(json.quiz_id) : null,
    coding_assessment_id: json.coding_assessment_id ? Number(json.coding_assessment_id) : null,
    proctoring_config: normalizePolicy(json.proctoring_config || {}),
    quiz: json.quiz || null,
    codingAssessment: json.codingAssessment || null,
    ...metrics,
  };
}

async function createAssessment(req, res) {
  try {
    const assessmentType = typeOf(req.body);
    if (!['QUIZ', 'CODING', 'COMBINED'].includes(assessmentType)) {
      return res.status(422).json({ error: 'Assessment type must be QUIZ, CODING, or COMBINED.' });
    }
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(422).json({ error: 'Title is required.' });
    const duration = Math.max(1, Math.min(480, Number(req.body.durationMinutes || req.body.duration_minutes) || 60));

    const workflow = await sequelize.transaction(async (transaction) => {
      let quiz = null;
      let coding = null;
      if (assessmentType === 'QUIZ' || assessmentType === 'COMBINED') {
        quiz = await AIQuiz.create({
          title,
          description: req.body.description || null,
          trainerId: req.user.id,
          createdBy: req.user.id,
          context: 'HIRE',
          timeLimit: duration,
          difficulty: req.body.difficulty || 'MIXED',
          status: 'DRAFT',
          resultStatus: 'HIDDEN',
          showResultImmediately: req.body.showResultImmediately !== false,
          shuffleQuestions: req.body.shuffleQuestions !== false,
          allowMultipleAttempts: Boolean(req.body.allowRetake || req.body.allow_retake),
          maxAttempts: Number(req.body.maxAttempts || req.body.max_attempts) || 1,
          proctoringEnabled: req.body.proctoringEnabled !== false,
          startTime: req.body.startDate || req.body.start_date || null,
          endTime: req.body.endDate || req.body.end_date || null,
          timezone: req.body.timezone || 'Asia/Kolkata',
        }, { transaction });
      }
      if (assessmentType === 'CODING' || assessmentType === 'COMBINED') {
        coding = await CodingAssessment.create({
          title,
          description: req.body.description || null,
          trainerId: req.user.id,
          context: 'HIRE',
          timeLimit: duration,
          difficulty: req.body.difficulty || 'MIXED',
          status: 'DRAFT',
          resultStatus: 'HIDDEN',
          showResultImmediately: req.body.showResultImmediately !== false,
          allowMultipleAttempts: Boolean(req.body.allowRetake || req.body.allow_retake),
          maxAttempts: Number(req.body.maxAttempts || req.body.max_attempts) || 1,
          proctoringEnabled: req.body.proctoringEnabled !== false,
          startTime: req.body.startDate || req.body.start_date || null,
          endTime: req.body.endDate || req.body.end_date || null,
          timezone: req.body.timezone || 'Asia/Kolkata',
        }, { transaction });
      }
      return HiringAssessment.create({
        title,
        description: req.body.description || null,
        instructions: req.body.instructions || null,
        assessment_type: assessmentType,
        quiz_id: quiz?.id || null,
        coding_assessment_id: coding?.id || null,
        duration_minutes: duration,
        passing_score: Number(req.body.passingScore || req.body.passing_score) || 50,
        start_date: req.body.startDate || req.body.start_date || null,
        end_date: req.body.endDate || req.body.end_date || null,
        timezone: req.body.timezone || 'Asia/Kolkata',
        status: 'DRAFT',
        hiring_role: req.body.hiringRole || req.body.hiring_role || null,
        job_position: req.body.jobPosition || req.body.job_position || null,
        required_skills: Array.isArray(req.body.requiredSkills)
          ? req.body.requiredSkills
          : req.body.required_skills || null,
        experience_level: req.body.experienceLevel || req.body.experience_level || null,
        recruitment_stage: req.body.recruitmentStage || req.body.recruitment_stage || null,
        proctoring_config: normalizePolicy(req.body.proctoringConfig || { enabled: req.body.proctoringEnabled !== false }),
        created_by: req.user.id,
      }, { transaction });
    });
    const loaded = await loadWorkflow(workflow.id);
    res.status(201).json({ success: true, assessment: responseWorkflow(loaded, await workflowMetrics(loaded)) });
  } catch (error) {
    logger.error('Create hiring workflow failed', { error: error.message });
    res.status(500).json({ error: 'Failed to create hiring assessment.' });
  }
}

async function listAssessments(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.type && req.query.type !== 'ALL') where.assessment_type = String(req.query.type).toUpperCase();
    if (req.query.search) where.title = { [Op.like]: `%${String(req.query.search).trim()}%` };
    const { rows, count } = await HiringAssessment.findAndCountAll({
      where,
      include: [
        { model: AIQuiz, as: 'quiz', required: false },
        { model: CodingAssessment, as: 'codingAssessment', required: false },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    const assessments = [];
    for (const workflow of rows) assessments.push(responseWorkflow(workflow, await workflowMetrics(workflow)));
    res.json({ assessments, total: count, page, limit, totalPages: Math.max(1, Math.ceil(count / limit)) });
  } catch (error) {
    logger.error('List hiring workflows failed', { error: error.message });
    res.status(500).json({ error: 'Failed to list hiring assessments.' });
  }
}

async function getAssessment(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid assessment ID.' });
    const workflow = await loadWorkflow(id);
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    res.json({ assessment: responseWorkflow(workflow, await workflowMetrics(workflow)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load hiring assessment.' });
  }
}

async function updateAssessment(req, res) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    const engine = workflow.assessment_type === 'CODING' ? workflow.codingAssessment : (workflow.quiz || workflow.codingAssessment);
    if (!engine) return res.status(409).json({ error: 'The shared assessment content is missing.' });
    const title = req.body.title !== undefined ? String(req.body.title).trim() : engine.title;
    const duration = Number(req.body.durationMinutes || req.body.duration_minutes) || engine.timeLimit;
    const passingScore = Number(req.body.passingScore ?? req.body.passing_score ?? workflow.passing_score) || 0;
    await sequelize.transaction(async (transaction) => {
      const enginePatch = {
        title,
        description: req.body.description ?? engine.description,
        timeLimit: duration,
      };
      // Passing percentage lives on the shared engine so participant pass/fail
      // computation and the Hire workflow stay synchronized.
      if (req.body.passingScore !== undefined || req.body.passing_score !== undefined) {
        enginePatch.passingPercentage = Math.max(0, Math.min(100, passingScore));
      }
      if (workflow.assessment_type !== 'CODING' && req.body.shuffleQuestions !== undefined) {
        enginePatch.shuffleQuestions = Boolean(req.body.shuffleQuestions);
      }
      if (req.body.maxAttempts !== undefined) enginePatch.maxAttempts = Math.max(1, Math.min(10, Number(req.body.maxAttempts) || 1));
      if (req.body.allowRetake !== undefined) enginePatch.allowMultipleAttempts = Boolean(req.body.allowRetake);

      if (workflow.quiz) {
        await workflow.quiz.update(enginePatch, { transaction });
      }
      if (workflow.codingAssessment) {
        await workflow.codingAssessment.update(enginePatch, { transaction });
      }

      await workflow.update({
        title,
        description: req.body.description ?? workflow.description,
        instructions: req.body.instructions ?? workflow.instructions,
        duration_minutes: duration,
        passing_score: passingScore || workflow.passing_score,
        end_date: req.body.endDate ?? req.body.end_date ?? workflow.end_date,
        hiring_role: req.body.hiringRole ?? req.body.hiring_role ?? workflow.hiring_role,
        job_position: req.body.jobPosition ?? req.body.job_position ?? workflow.job_position,
        required_skills: req.body.requiredSkills ?? req.body.required_skills ?? workflow.required_skills,
        experience_level: req.body.experienceLevel ?? req.body.experience_level ?? workflow.experience_level,
        recruitment_stage: req.body.recruitmentStage ?? req.body.recruitment_stage ?? workflow.recruitment_stage,
        ...(req.body.proctoringConfig ? { proctoring_config: normalizePolicy(req.body.proctoringConfig) } : {}),
      }, { transaction });
    });
    const loaded = await loadWorkflow(workflow.id);
    res.json({ success: true, assessment: responseWorkflow(loaded, await workflowMetrics(loaded)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update hiring assessment.' });
  }
}

async function deleteAssessment(req, res) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ success: false, error: 'Hiring assessment not found.' });
    const force = Boolean(req.body?.force || req.query?.force === 'true');
    const assignmentCount = await HiringAssignment.count({ where: { assessment_id: workflow.id } });
    if (assignmentCount && !force) {
      return res.status(409).json({
        success: false,
        error: `${assignmentCount} candidate(s) are currently assigned to this assessment. Use Force Delete to override.`,
        failed: [{
          id: workflow.id,
          name: workflow.title,
          reason: `${assignmentCount} candidate(s) are currently assigned to this assessment.`
        }]
      });
    }

    await sequelize.transaction(async (transaction) => {
      if (force && assignmentCount) {
        await HiringAssignment.destroy({ where: { assessment_id: workflow.id }, transaction });
      }
      if (workflow.quiz) await workflow.quiz.update({ status: 'ARCHIVED' }, { transaction });
      if (workflow.codingAssessment) await workflow.codingAssessment.update({ status: 'ARCHIVED' }, { transaction });
      await HiringCandidate.destroy({ where: { assessment_id: workflow.id }, transaction });
      await workflow.destroy({ transaction });
    });

    res.json({ success: true, message: 'Assessment deleted successfully' });
  } catch (error) {
    logger.error('Delete hiring workflow failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to remove hiring workflow.' });
  }
}

async function bulkDeleteAssessments(req, res) {
  try {
    const { ids, force = false } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of assessment IDs to delete.' });
    }
    const validIds = ids.map(id => parseId(id)).filter(id => Boolean(id));
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid assessment IDs provided.' });
    }

    const workflows = await HiringAssessment.findAll({
      where: { id: { [Op.in]: validIds } },
      include: [
        { model: AIQuiz, as: 'quiz', required: false },
        { model: CodingAssessment, as: 'codingAssessment', required: false },
      ],
    });

    if (workflows.length === 0) {
      return res.json({
        success: true,
        message: 'The selected assessment(s) have already been removed.',
        summary: { total: validIds.length, deleted: validIds.length, failed: 0 },
        deletedIds: validIds,
        failed: [],
      });
    }

    const failed = [];
    const eligibleWorkflows = [];

    for (const workflow of workflows) {
      if (!force) {
        const assignmentCount = await HiringAssignment.count({ where: { assessment_id: workflow.id } });
        if (assignmentCount > 0) {
          failed.push({
            id: workflow.id,
            name: workflow.title || `Assessment #${workflow.id}`,
            reason: `${assignmentCount} candidate(s) are currently assigned. Use Force Delete to override.`,
          });
          continue;
        }
      }
      eligibleWorkflows.push(workflow);
    }

    if (failed.length > 0 && eligibleWorkflows.length === 0) {
      return res.json({
        success: true,
        message: 'All selected assessments have active candidate assignments.',
        summary: { total: workflows.length, deleted: 0, failed: failed.length },
        deletedIds: [],
        failed,
      });
    }

    const deletedIds = [];
    await sequelize.transaction(async (transaction) => {
      for (const workflow of eligibleWorkflows) {
        if (force) {
          await HiringAssignment.destroy({ where: { assessment_id: workflow.id }, transaction });
        }
        if (workflow.quiz) {
          await workflow.quiz.update({ status: 'ARCHIVED' }, { transaction });
        }
        if (workflow.codingAssessment) {
          await workflow.codingAssessment.update({ status: 'ARCHIVED' }, { transaction });
        }
        await HiringCandidate.destroy({ where: { assessment_id: workflow.id }, transaction });
        await workflow.destroy({ transaction });
        deletedIds.push(workflow.id);
      }
    });

    return res.json({
      success: true,
      message: `Successfully deleted ${deletedIds.length} assessment${deletedIds.length === 1 ? '' : 's'}.${failed.length > 0 ? ` ${failed.length} item(s) protected.` : ''}`,
      summary: { total: workflows.length, deleted: deletedIds.length, failed: failed.length },
      deletedIds,
      failed,
    });
  } catch (error) {
    logger.error('Bulk delete hiring assessments failed', { error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to bulk delete hiring assessments.' });
  }
}

// Backward-compatible Hire actions delegate to the canonical publishing and
// closing handlers, including their validation, scheduling and notifications.
async function delegateEngineAction(req, res, action) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });

    if (workflow.assessment_type === 'COMBINED') {
      if (!workflow.quiz_id && !workflow.coding_assessment_id) {
        return res.status(409).json({ error: 'Assessment content is unavailable.' });
      }
      const quizHandler = require('../routes/quizzesRoutes')[action === 'publish' ? 'publishQuiz' : 'closeQuiz'];
      const codingHandler = require('./codingAssessmentController')[action];

      if (workflow.quiz_id) {
        let quizErr = null;
        const mockQuizRes = {
          statusCode: 200,
          status(c) { this.statusCode = c; return this; },
          json(data) { if (this.statusCode >= 400) quizErr = data; return this; },
          send(data) { return this; },
        };
        const quizReq = Object.assign(Object.create(req), { params: { ...req.params, id: workflow.quiz_id }, body: req.body || {} });
        await quizHandler(quizReq, mockQuizRes);
        if (quizErr) {
          return res.status(mockQuizRes.statusCode || 400).json(quizErr);
        }
      }

      if (workflow.coding_assessment_id) {
        const codingReq = Object.assign(Object.create(req), { params: { ...req.params, id: workflow.coding_assessment_id }, body: req.body || {} });
        return await codingHandler(codingReq, res);
      }

      return res.json({ success: true, message: `Assessment ${action}ed successfully.` });
    }

    const coding = workflow.assessment_type === 'CODING';
    const id = coding ? workflow.coding_assessment_id : workflow.quiz_id;
    if (!id) return res.status(409).json({ error: 'Assessment content is unavailable.' });
    const engineRequest = Object.assign(Object.create(req), { params: { ...req.params, id }, body: req.body || {} });
    const handler = coding
      ? require('./codingAssessmentController')[action]
      : require('../routes/quizzesRoutes')[action === 'publish' ? 'publishQuiz' : 'closeQuiz'];
    return await handler(engineRequest, res);
  } catch (error) {
    logger.error('Hiring assessment action failed', { action, error: error.message });
    return res.status(500).json({ error: 'Failed to update assessment status.' });
  }
}
const publishAssessment = (req, res) => delegateEngineAction(req, res, 'publish');
const closeAssessment = (req, res) => delegateEngineAction(req, res, 'close');

async function uploadCandidatesCsv(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
    const lines = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return res.status(422).json({ error: 'CSV needs a header and at least one candidate.' });
    const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
    const emailIndex = headers.findIndex((h) => ['email', 'email id', 'email_id', 'candidate email', 'candidate_email', 'mail'].includes(h));
    const nameIndex = headers.findIndex((h) => ['name', 'full name', 'full_name', 'candidate name', 'candidate_name'].includes(h));
    if (emailIndex < 0) return res.status(422).json({ error: 'CSV must contain an Email column.' });
    const seen = new Set();
    const summary = { totalRecords: lines.length - 1, validEmails: 0, invalidEmails: 0, duplicatesInCsv: 0, alreadyAssigned: 0, registeredAndAssigned: 0, unregistered: 0 };
    const skipped = [];
    for (let index = 1; index < lines.length; index += 1) {
      const columns = parseCsvRow(lines[index]);
      const email = hiringService.normalizeEmail(columns[emailIndex]);
      if (!hiringService.isValidEmail(email)) { summary.invalidEmails += 1; skipped.push({ email, reason: 'Invalid email' }); continue; }
      summary.validEmails += 1;
      if (seen.has(email)) { summary.duplicatesInCsv += 1; skipped.push({ email, reason: 'Duplicate in CSV' }); continue; }
      seen.add(email);
      let candidate = await HiringCandidate.findOne({ where: { assessment_id: workflow.id, email } });
      if (candidate) { if (candidate.assignment_status === 'ASSIGNED') summary.alreadyAssigned += 1; skipped.push({ email, reason: 'Already added' }); continue; }
      const user = await User.findOne({ where: { email, role: 'PARTICIPANT', isDeleted: false }, attributes: ['id', 'status'] });
      const registered = Boolean(user) && String(user.status).toUpperCase() === 'APPROVED';
      candidate = await HiringCandidate.create({
        assessment_id: workflow.id,
        email,
        full_name: nameIndex >= 0 ? columns[nameIndex] || null : null,
        user_id: registered ? user.id : null,
        registration_status: registered ? 'REGISTERED' : (user ? 'PENDING' : 'NOT_REGISTERED'),
        created_by: req.user.id,
      });
      if (registered) { await hiringService.assignCandidate(workflow, candidate); summary.registeredAndAssigned += 1; }
      else summary.unregistered += 1;
    }
    await hiringService.recomputeAssessmentStatus(workflow.id);
    res.json({ success: true, summary, stats: summary, skipped });
  } catch (error) {
    logger.error('Candidate CSV upload failed', { error: error.message });
    res.status(500).json({ error: 'Failed to process candidate CSV.' });
  }
}

async function listCandidates(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid assessment ID.' });
    const where = { assessment_id: id };
    if (req.query.registration_status) where.registration_status = req.query.registration_status;
    const candidates = await HiringCandidate.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ candidates });
  } catch (error) { res.status(500).json({ error: 'Failed to list candidates.' }); }
}

async function recheckRegistration(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!await HiringAssessment.findByPk(id)) return res.status(404).json({ error: 'Hiring assessment not found.' });
    res.json({ success: true, ...(await hiringService.recheckCandidateRegistration(id)) });
  } catch (error) { res.status(500).json({ error: 'Failed to re-check registration.' }); }
}

async function exportUnregistered(req, res) {
  try {
    const candidates = await HiringCandidate.findAll({
      where: { assessment_id: parseId(req.params.id), registration_status: { [Op.ne]: 'REGISTERED' } },
      order: [['email', 'ASC']],
    });
    const escape = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
    const csv = ['Email,Name,Registration Status', ...candidates.map((c) => [c.email, c.full_name, c.registration_status].map(escape).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="unregistered-candidates-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) { res.status(500).json({ error: 'Failed to export candidates.' }); }
}

async function assignCandidates(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    const ids = Array.isArray(req.body.candidateIds) ? req.body.candidateIds.map(parseId).filter(Boolean) : [];
    const where = { assessment_id: workflow.id, registration_status: 'REGISTERED' };
    if (ids.length) where.id = { [Op.in]: ids };
    else where.assignment_status = 'NOT_ASSIGNED';
    const candidates = await HiringCandidate.findAll({ where });
    let assigned = 0;
    for (const candidate of candidates) {
      const result = await hiringService.assignCandidate(workflow, candidate);
      if (result.assignment && !result.alreadyAssigned) assigned += 1;
    }
    await hiringService.recomputeAssessmentStatus(workflow.id);
    res.json({ success: true, assigned });
  } catch (error) { res.status(500).json({ error: 'Failed to assign candidates.' }); }
}

async function toggleAssignCandidate(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    if (candidate.registration_status !== 'REGISTERED') return res.status(422).json({ error: 'Only registered candidates can be assigned.' });
    if (candidate.assignment_status === 'ASSIGNED') {
      await hiringService.unassignCandidate(workflow, candidate);
      return res.json({ success: true, assigned: false });
    }
    const result = await hiringService.assignCandidate(workflow, candidate);
    res.json({ success: true, assigned: true, assignment: result.assignment });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to update assignment.' }); }
}

async function removeCandidate(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    if (candidate.assignment_status === 'ASSIGNED') await hiringService.unassignCandidate(workflow, candidate);
    await candidate.destroy();
    res.json({ success: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to remove candidate.' }); }
}

async function revokeCandidate(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    await hiringService.revokeCandidate(workflow, candidate);
    await hiringService.recomputeAssessmentStatus(workflow.id);
    res.json({ success: true, revoked: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to revoke candidate assignment.' }); }
}

async function reassignCandidate(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    await hiringService.reassignCandidate(workflow, candidate);
    await hiringService.recomputeAssessmentStatus(workflow.id);
    res.json({ success: true, reassigned: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to reassign candidate.' }); }
}

async function resetCandidateAttempt(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    await hiringService.resetCandidateAttempt(workflow, candidate);
    await hiringService.recomputeAssessmentStatus(workflow.id);
    res.json({ success: true, reset: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to reset candidate attempt.' }); }
}

async function extendCandidateTime(req, res) {
  try {
    const workflow = await HiringAssessment.findByPk(parseId(req.params.id));
    const candidate = workflow && await HiringCandidate.findOne({ where: { id: parseId(req.params.cid), assessment_id: workflow.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    const minutes = Number(req.body.minutes || 15);
    const result = await hiringService.extendCandidateTime(workflow, candidate, minutes);
    res.json({ success: true, ...result });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Failed to extend candidate time.' }); }
}

async function getReport(req, res) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    await hiringService.recomputeAssessmentStatus(workflow.id);
    const isCoding = workflow.assessment_type === 'CODING';
    const isCombined = workflow.assessment_type === 'COMBINED';

    let results = [];
    let attempts = [];

    if (isCombined) {
      const [quizResults, codingResults, quizAttempts, codingAttempts] = await Promise.all([
        workflow.quiz_id ? QuizResult.findAll({ where: { quizId: workflow.quiz_id }, attributes: ['participantId', 'percentage', 'rank'] }) : [],
        workflow.coding_assessment_id ? CodingResult.findAll({ where: { assessmentId: workflow.coding_assessment_id }, attributes: ['participantId', 'percentage', 'rank'] }) : [],
        workflow.quiz_id ? QuizAttempt.findAll({ where: { quizId: workflow.quiz_id }, attributes: ['id', 'participantId', 'monitoringSessionId', 'status'] }) : [],
        workflow.coding_assessment_id ? CodingAttempt.findAll({ where: { assessmentId: workflow.coding_assessment_id }, attributes: ['id', 'participantId', 'monitoringSessionId', 'status'] }) : [],
      ]);
      results = [...quizResults, ...codingResults];
      attempts = [...quizAttempts, ...codingAttempts];
    } else {
      const engineId = isCoding ? workflow.coding_assessment_id : workflow.quiz_id;
      if (engineId) {
        const ResultModel = isCoding ? CodingResult : QuizResult;
        const AttemptModel = isCoding ? CodingAttempt : QuizAttempt;
        const whereClause = isCoding ? { assessmentId: engineId } : { quizId: engineId };
        results = await ResultModel.findAll({ where: whereClause, attributes: ['participantId', 'percentage', 'rank'] });
        attempts = await AttemptModel.findAll({ where: whereClause, attributes: ['id', 'participantId', 'monitoringSessionId', 'status'] });
      }
    }

    const monitoring = [];
    for (const attempt of attempts) {
      if (!attempt.monitoringSessionId) continue;
      try {
        const report = await require('../services/monitoringService').getReport({ sessionId: attempt.monitoringSessionId });
        monitoring.push({ attemptId: attempt.id, participantId: attempt.participantId, status: attempt.status,
          riskScore: report.finalScore ?? report.score ?? 0, riskLevel: report.riskLevel, identity: report.hireProctoring || null,
          evidence: (report.timeline || []).filter(item => item.evidenceRef).map(item => ({ eventType: item.eventType, occurredAt: item.occurredAt, evidenceRef: item.evidenceRef })) });
      } catch (_) {}
    }
    res.json({ report: { ...(await workflowMetrics(workflow)), results, monitoring } });
  } catch (error) { res.status(500).json({ error: 'Failed to load hiring report.' }); }
}

async function myAssessments(req, res) {
  try {
    const assignments = await HiringAssignment.findAll({
      where: { participant_id: req.user.id },
      include: [{
        model: HiringAssessment,
        as: 'assessment',
        include: [
          { model: AIQuiz, as: 'quiz', required: false },
          { model: CodingAssessment, as: 'codingAssessment', required: false },
        ],
      }],
      order: [['created_at', 'DESC']],
    });
    const items = [];
    for (const assignment of assignments) {
      if (!assignment.assessment) continue;
      const { attempt } = await hiringService.refreshAssignmentStatus(assignment, assignment.assessment);
      const workflow = responseWorkflow(assignment.assessment);
      const engine = assignment.assessment.assessment_type === 'CODING'
        ? assignment.assessment.codingAssessment
        : assignment.assessment.quiz;
      items.push({
        assignment_id: assignment.id,
        assignment_status: assignment.status,
        assessment: workflow,
        engine: engine?.toJSON ? engine.toJSON() : engine,
        attempt: attempt?.toJSON ? attempt.toJSON() : attempt,
      });
    }
    res.json({ assessments: items });
  } catch (error) {
    logger.error('List participant hiring workflows failed', { error: error.message });
    res.status(500).json({ error: 'Failed to load assigned hiring assessments.' });
  }
}

async function ensureQuiz(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(422).json({ error: 'Valid assessment ID is required.' });

    const result = await sequelize.transaction(async (transaction) => {
      const workflow = await HiringAssessment.findByPk(id, {
        include: [{ model: AIQuiz, as: 'quiz', required: false }],
        transaction,
        ...(transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
      });
      if (!workflow) return { notFound: true };

      if (workflow.quiz_id) {
        let existingQuiz = workflow.quiz;
        if (!existingQuiz) {
          existingQuiz = await AIQuiz.findByPk(workflow.quiz_id, { transaction });
        }
        if (existingQuiz) {
          return { quiz: existingQuiz, alreadyExisted: true, workflow };
        }
      }

      const duration = workflow.duration_minutes || 60;
      const quiz = await AIQuiz.create({
        title: workflow.title || 'Hiring Quiz Assessment',
        description: workflow.description || null,
        trainerId: req.user.id,
        createdBy: req.user.id,
        context: 'HIRE',
        timeLimit: duration,
        difficulty: 'MIXED',
        status: 'DRAFT',
        resultStatus: 'HIDDEN',
        showResultImmediately: workflow.show_result_immediately !== false,
        shuffleQuestions: workflow.shuffle_questions !== false,
        allowMultipleAttempts: Boolean(workflow.allow_retake),
        maxAttempts: Number(workflow.max_attempts) || 1,
        proctoringEnabled: Boolean(workflow.proctoring_config?.enabled ?? true),
        timezone: workflow.timezone || 'Asia/Kolkata',
      }, { transaction });

      const newType = workflow.assessment_type === 'CODING' ? 'COMBINED' : workflow.assessment_type;
      await workflow.update({ quiz_id: quiz.id, assessment_type: newType }, { transaction });

      return { quiz, alreadyExisted: false, workflow };
    });

    if (result.notFound) return res.status(404).json({ error: 'Hiring assessment not found.' });

    let reloaded = null;
    let metrics = null;
    try {
      reloaded = (await loadWorkflow(id)) || result.workflow;
      if (reloaded) {
        metrics = await workflowMetrics(reloaded);
      }
    } catch {
      /* ignore metric calculation errors in mock/test environments */
    }

    res.json({
      success: true,
      quizId: result.quiz?.id,
      quiz: result.quiz,
      alreadyExisted: result.alreadyExisted,
      created: !result.alreadyExisted,
      assessment: reloaded ? responseWorkflow(reloaded, metrics) : null,
    });
  } catch (error) {
    logger.error('Ensure hiring quiz failed', { error: error.message });
    res.status(500).json({ error: 'Failed to ensure hiring quiz.' });
  }
}

async function ensureCoding(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(422).json({ error: 'Valid assessment ID is required.' });

    const result = await sequelize.transaction(async (transaction) => {
      const workflow = await HiringAssessment.findByPk(id, {
        include: [{ model: CodingAssessment, as: 'codingAssessment', required: false }],
        transaction,
        ...(transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
      });
      if (!workflow) return { notFound: true };

      if (workflow.coding_assessment_id) {
        let existingCoding = workflow.codingAssessment;
        if (!existingCoding) {
          existingCoding = await CodingAssessment.findByPk(workflow.coding_assessment_id, { transaction });
        }
        if (existingCoding) {
          return { codingAssessment: existingCoding, alreadyExisted: true, workflow };
        }
      }

      const duration = workflow.duration_minutes || 60;
      const coding = await CodingAssessment.create({
        title: workflow.title || 'Hiring Coding Assessment',
        description: workflow.description || null,
        trainerId: req.user.id,
        context: 'HIRE',
        timeLimit: duration,
        difficulty: 'MIXED',
        status: 'DRAFT',
        resultStatus: 'HIDDEN',
        showResultImmediately: workflow.show_result_immediately !== false,
        allowMultipleAttempts: Boolean(workflow.allow_retake),
        maxAttempts: Number(workflow.max_attempts) || 1,
        proctoringEnabled: Boolean(workflow.proctoring_config?.enabled ?? true),
        timezone: workflow.timezone || 'Asia/Kolkata',
      }, { transaction });

      const newType = workflow.assessment_type === 'QUIZ' ? 'COMBINED' : workflow.assessment_type;
      await workflow.update({ coding_assessment_id: coding.id, assessment_type: newType }, { transaction });

      return { codingAssessment: coding, alreadyExisted: false, workflow };
    });

    if (result.notFound) return res.status(404).json({ error: 'Hiring assessment not found.' });

    let reloaded = null;
    let metrics = null;
    try {
      reloaded = (await loadWorkflow(id)) || result.workflow;
      if (reloaded) {
        metrics = await workflowMetrics(reloaded);
      }
    } catch {
      /* ignore metric calculation errors in mock/test environments */
    }

    res.json({
      success: true,
      assessmentId: result.codingAssessment?.id,
      codingAssessment: result.codingAssessment,
      alreadyExisted: result.alreadyExisted,
      created: !result.alreadyExisted,
      assessment: reloaded ? responseWorkflow(reloaded, metrics) : null,
    });
  } catch (error) {
    logger.error('Ensure hiring coding failed', { error: error.message });
    res.status(500).json({ error: 'Failed to ensure hiring coding assessment.' });
  }
}

module.exports = {
  createAssessment,
  listAssessments,
  getAssessment,
  updateAssessment,
  deleteAssessment,
  bulkDeleteAssessments,
  publishAssessment,
  closeAssessment,
  uploadCandidatesCsv,
  listCandidates,
  recheckRegistration,
  exportUnregistered,
  assignCandidates,
  toggleAssignCandidate,
  removeCandidate,
  revokeCandidate,
  reassignCandidate,
  resetCandidateAttempt,
  extendCandidateTime,
  getReport,
  myAssessments,
  ensureQuiz,
  ensureCoding,
};

