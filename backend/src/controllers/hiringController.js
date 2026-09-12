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
  const engine = isCoding ? workflow.codingAssessment : workflow.quiz;
  const engineId = isCoding ? workflow.coding_assessment_id : workflow.quiz_id;
  const [candidateCount, registeredCount, pendingCount, assignments, attempts, contentCount] = await Promise.all([
    HiringCandidate.count({ where: { assessment_id: workflow.id } }),
    HiringCandidate.count({ where: { assessment_id: workflow.id, registration_status: 'REGISTERED' } }),
    HiringCandidate.count({ where: { assessment_id: workflow.id, registration_status: { [Op.ne]: 'REGISTERED' } } }),
    HiringAssignment.findAll({ where: { assessment_id: workflow.id }, attributes: ['status'] }),
    engineId
      ? (isCoding
        ? CodingAttempt.findAll({ where: { assessmentId: engineId }, attributes: ['status'] })
        : QuizAttempt.findAll({ where: { quizId: engineId }, attributes: ['status'] }))
      : [],
    engineId
      ? (isCoding ? CodingProblem.count({ where: { assessmentId: engineId } }) : AIQuestion.count({ where: { quizId: engineId } }))
      : 0,
  ]);
  const inProgress = attempts.filter((a) => String(a.status).toUpperCase() === 'IN_PROGRESS').length;
  const completed = attempts.filter((a) => ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'].includes(String(a.status).toUpperCase())).length;
  return {
    engine_status: engine?.status || 'DRAFT',
    content_count: contentCount,
    candidate_count: candidateCount,
    registered_count: registeredCount,
    pending_candidates: pendingCount,
    assigned_count: assignments.length,
    in_progress_count: inProgress,
    completed_count: completed,
  };
}

function responseWorkflow(workflow, metrics = {}) {
  const json = workflow.toJSON ? workflow.toJSON() : workflow;
  const engine = json.assessment_type === 'CODING' ? json.codingAssessment : json.quiz;
  const engineStatus = mapEngineStatus(metrics.engine_status || engine?.status);
  return {
    ...json,
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
    engine_id: json.assessment_type === 'CODING' ? json.coding_assessment_id : json.quiz_id,
    proctoring_config: normalizePolicy(json.proctoring_config || {}),
    ...metrics,
  };
}

async function createAssessment(req, res) {
  try {
    const assessmentType = typeOf(req.body);
    if (!['QUIZ', 'CODING'].includes(assessmentType)) {
      return res.status(422).json({ error: 'Assessment type must be QUIZ or CODING.' });
    }
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(422).json({ error: 'Title is required.' });
    const duration = Math.max(1, Math.min(480, Number(req.body.durationMinutes || req.body.duration_minutes) || 60));

    const workflow = await sequelize.transaction(async (transaction) => {
      let quiz = null;
      let coding = null;
      if (assessmentType === 'QUIZ') {
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
      } else {
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
    const workflow = await loadWorkflow(parseId(req.params.id));
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
    const engine = workflow.assessment_type === 'CODING' ? workflow.codingAssessment : workflow.quiz;
    if (!engine) return res.status(409).json({ error: 'The shared assessment content is missing.' });
    const title = req.body.title !== undefined ? String(req.body.title).trim() : engine.title;
    const duration = Number(req.body.durationMinutes || req.body.duration_minutes) || engine.timeLimit;
    await sequelize.transaction(async (transaction) => {
      await engine.update({ title, description: req.body.description ?? engine.description, timeLimit: duration }, { transaction });
      await workflow.update({
        title,
        description: req.body.description ?? workflow.description,
        instructions: req.body.instructions ?? workflow.instructions,
        duration_minutes: duration,
        passing_score: req.body.passingScore ?? req.body.passing_score ?? workflow.passing_score,
        end_date: req.body.endDate ?? req.body.end_date ?? workflow.end_date,
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
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    const assignmentCount = await HiringAssignment.count({ where: { assessment_id: workflow.id } });
    if (assignmentCount) return res.status(409).json({ error: 'Archive the shared assessment after preserving assigned candidate history.' });
    const engine = workflow.assessment_type === 'CODING' ? workflow.codingAssessment : workflow.quiz;
    if (engine) await engine.update({ status: 'ARCHIVED' });
    await HiringCandidate.destroy({ where: { assessment_id: workflow.id } });
    await workflow.destroy();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove hiring workflow.' });
  }
}

// Backward-compatible Hire actions delegate to the canonical publishing and
// closing handlers, including their validation, scheduling and notifications.
async function delegateEngineAction(req, res, action) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
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
    const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
    const emailIndex = headers.findIndex((h) => ['email', 'email id', 'email_id'].includes(h));
    const nameIndex = headers.findIndex((h) => ['name', 'full name', 'full_name'].includes(h));
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

async function getReport(req, res) {
  try {
    const workflow = await loadWorkflow(parseId(req.params.id));
    if (!workflow) return res.status(404).json({ error: 'Hiring assessment not found.' });
    await hiringService.recomputeAssessmentStatus(workflow.id);
    const isCoding = workflow.assessment_type === 'CODING';
    const engineId = isCoding ? workflow.coding_assessment_id : workflow.quiz_id;
    const results = engineId
      ? await (isCoding ? CodingResult : QuizResult).findAll({
        where: isCoding ? { assessmentId: engineId } : { quizId: engineId },
        attributes: ['participantId', 'percentage', 'rank'],
      })
      : [];
    const Attempt = isCoding ? CodingAttempt : QuizAttempt;
    const attempts = engineId ? await Attempt.findAll({ where: isCoding ? { assessmentId: engineId } : { quizId: engineId }, attributes: ['id', 'participantId', 'monitoringSessionId', 'status'] }) : [];
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

module.exports = {
  createAssessment,
  listAssessments,
  getAssessment,
  updateAssessment,
  deleteAssessment,
  publishAssessment,
  closeAssessment,
  uploadCandidatesCsv,
  listCandidates,
  recheckRegistration,
  exportUnregistered,
  assignCandidates,
  toggleAssignCandidate,
  removeCandidate,
  getReport,
  myAssessments,
};
