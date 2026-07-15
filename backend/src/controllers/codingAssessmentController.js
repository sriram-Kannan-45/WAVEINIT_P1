const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const {
  CodingAssessment, CodingProblem, CodingTestCase, CodingAttempt, CodingSubmission, CodingResult,
  Training, User, QuizRecording, ExamSession
} = require('../models');
const logger = require('../utils/logger');

// ── Helpers ──
// Follow the same response format as aiQuizRoutes / trainerRoutes:
//   success: { success: true, ...data }
//   error:   { error: 'message' }
function ok(res, data) { return res.json({ success: true, ...data }); }
function fail(res, status, err) { return res.status(status).json({ error: typeof err === 'string' ? err : err.message || 'Unknown error' }); }

// ── TRAINER: CRUD Assessments ──

exports.list = async (req, res) => {
  try {
    const { trainingId } = req.query;
    const where = { trainerId: req.user.id };
    if (trainingId) where.trainingId = trainingId;
    const assessments = await CodingAssessment.findAll({
      where,
      include: [
        { model: CodingProblem, as: 'problems', attributes: ['id', 'title', 'difficulty', 'programmingLanguage', 'marks'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] }
      ],
      order: [['created_at', 'DESC']]
    });
    ok(res, { assessments });
  } catch (err) { fail(res, 500, err.message); }
};

exports.getOne = async (req, res) => {
  try {
    const isParticipant = req.user.role === 'PARTICIPANT';
    const assessment = await CodingAssessment.findByPk(req.params.id, {
      include: [
        {
          model: CodingProblem,
          as: 'problems',
          include: [{
            model: CodingTestCase,
            as: 'testCases',
            ...(isParticipant ? { where: { isHidden: false }, required: false } : {})
          }]
        },
        { model: Training, as: 'training', attributes: ['id', 'title'] }
      ]
    });
    if (!assessment) return fail(res, 404, 'Assessment not found');

    if (isParticipant) {
      const { Enrollment } = require('../models');
      const enrollmentCheck = await Enrollment.findOne({
        where: {
          participantId: req.user.id,
          status: 'ENROLLED',
          [Op.or]: [
            ...(assessment.courseId ? [{ courseId: assessment.courseId }] : []),
            ...(assessment.trainingId ? [{ trainingId: assessment.trainingId }] : []),
          ]
        }
      });
      if (!enrollmentCheck) return fail(res, 403, 'Participant not enrolled');

      const attempt = await CodingAttempt.findOne({
        where: { assessmentId: assessment.id, participantId: req.user.id, status: 'IN_PROGRESS' }
      });
      if (!attempt) return fail(res, 400, 'Attempt not started or already submitted');

      const problemsJson = [];
      for (const problem of assessment.problems || []) {
        const pJson = problem.toJSON();
        delete pJson.expectedSolution;

        const latestSub = await CodingSubmission.findOne({
          where: { attemptId: attempt.id, problemId: problem.id },
          order: [['created_at', 'DESC']]
        });
        if (latestSub) {
          pJson.starterCode = latestSub.code;
        }
        problemsJson.push(pJson);
      }

      const assessmentJson = assessment.toJSON();
      assessmentJson.problems = problemsJson;
      return ok(res, { assessment: assessmentJson });
    }

    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

exports.create = async (req, res) => {
  try {
    const { title, description, timeLimit, difficulty, courseId, trainingId, languages } = req.body;
    const resolvedCourseId = courseId && courseId !== 'undefined' ? courseId : null;
    const resolvedTrainingId = trainingId && trainingId !== 'undefined' && trainingId !== 'null' ? trainingId : null;
    const assessment = await CodingAssessment.create({
      title: title || 'Untitled Coding Assessment', description, timeLimit,
      difficulty, courseId: resolvedCourseId, trainingId: resolvedTrainingId,
      languages: Array.isArray(languages) ? languages : ['javascript'],
      trainerId: req.user.id, status: 'DRAFT'
    });
    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

exports.update = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const allowed = ['title', 'description', 'timeLimit', 'difficulty', 'status', 'startTime', 'endTime', 'showResultImmediately', 'allowMultipleAttempts', 'maxAttempts', 'proctoringEnabled', 'proctoringLevel', 'gracePeriodMinutes', 'maxCopyWarnings'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await assessment.update(updates);
    ok(res, { assessment });
  } catch (err) { fail(res, 500, err.message); }
};

exports.destroy = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const problems = await CodingProblem.findAll({ where: { assessmentId: assessment.id } });
    for (const p of problems) {
      await CodingTestCase.destroy({ where: { problemId: p.id } });
      await CodingSubmission.destroy({ where: { problemId: p.id } });
    }
    await CodingProblem.destroy({ where: { assessmentId: assessment.id } });
    await CodingResult.destroy({ where: { assessmentId: assessment.id } });
    await CodingAttempt.destroy({ where: { assessmentId: assessment.id } });
    await assessment.destroy();
    ok(res, { message: 'Assessment deleted' });
  } catch (err) { fail(res, 500, err.message); }
};

// ── TRAINER: Problems CRUD ──

exports.createProblem = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const { title, description, constraints, inputFormat, outputFormat, sampleInput, sampleOutput, explanation, difficulty, programmingLanguage, starterCode, expectedSolution, timeLimit, memoryLimit, marks, tags, testCases } = req.body;
    const problem = await CodingProblem.create({
      assessmentId: assessment.id, title, description, constraints, inputFormat, outputFormat, sampleInput, sampleOutput, explanation, difficulty, programmingLanguage, starterCode, expectedSolution, timeLimit, memoryLimit, marks, tags
    });
    if (testCases && Array.isArray(testCases)) {
      for (let i = 0; i < testCases.length; i++) {
        await CodingTestCase.create({ problemId: problem.id, ...testCases[i], order: i });
      }
    }
    const full = await CodingProblem.findByPk(problem.id, { include: [{ model: CodingTestCase, as: 'testCases' }] });
    ok(res, { problem: full });
  } catch (err) { fail(res, 500, err.message); }
};

exports.updateProblem = async (req, res) => {
  try {
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }]
    });
    if (!problem) return fail(res, 404, 'Problem not found');
    const allowed = ['title', 'description', 'constraints', 'inputFormat', 'outputFormat', 'sampleInput', 'sampleOutput', 'explanation', 'difficulty', 'programmingLanguage', 'starterCode', 'expectedSolution', 'timeLimit', 'memoryLimit', 'marks', 'tags'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await problem.update(updates);
    if (req.body.testCases && Array.isArray(req.body.testCases)) {
      await CodingTestCase.destroy({ where: { problemId: problem.id } });
      for (let i = 0; i < req.body.testCases.length; i++) {
        await CodingTestCase.create({ problemId: problem.id, ...req.body.testCases[i], order: i });
      }
    }
    const full = await CodingProblem.findByPk(problem.id, { include: [{ model: CodingTestCase, as: 'testCases' }] });
    ok(res, { problem: full });
  } catch (err) { fail(res, 500, err.message); }
};

exports.deleteProblem = async (req, res) => {
  try {
    const problem = await CodingProblem.findByPk(req.params.problemId, {
      include: [{ model: CodingAssessment, as: 'assessment', where: { trainerId: req.user.id } }]
    });
    if (!problem) return fail(res, 404, 'Problem not found');
    await CodingTestCase.destroy({ where: { problemId: problem.id } });
    await CodingSubmission.destroy({ where: { problemId: problem.id } });
    await problem.destroy();
    ok(res, { message: 'Problem deleted' });
  } catch (err) { fail(res, 500, err.message); }
};

// ── AI GENERATION ──

exports.generateFromPrompt = async (req, res) => {
  try {
    const { prompt, difficulty = 'MEDIUM', problemCount = 5, courseId, trainingId, languages } = req.body;
    if (!prompt) return fail(res, 400, 'Prompt is required');
    const count = parseInt(problemCount, 10) || 5;
    const aiService = require('../services/aiService');
    const result = await aiService.generateCodingProblemsFromPrompt(prompt, count, difficulty);
    if (!result.problems || result.problems.length === 0) {
      return fail(res, 502, 'AI returned no problems');
    }
    const resolvedCourseId = courseId && courseId !== 'undefined' && courseId !== 'null' ? courseId : null;
    const resolvedTrainingId = trainingId && trainingId !== 'undefined' && trainingId !== 'null' ? trainingId : null;
    const lang = Array.isArray(languages) ? languages : (result.languages || ['javascript']);
    const assessment = await CodingAssessment.create({
      trainerId: req.user.id, trainingId: resolvedTrainingId, courseId: resolvedCourseId,
      title: result.title || `Coding: ${prompt.substring(0, 60)}`,
      numProblems: result.problems.length, difficulty, status: 'DRAFT',
      languages: Array.isArray(lang) ? lang : ['javascript'],
    });
    for (let i = 0; i < result.problems.length; i++) {
      const p = result.problems[i];
      const problem = await CodingProblem.create({
        assessmentId: assessment.id, title: p.title, description: p.description,
        constraints: p.constraints, inputFormat: p.inputFormat, outputFormat: p.outputFormat,
        sampleInput: p.sampleInput, sampleOutput: p.sampleOutput, explanation: p.explanation,
        difficulty: p.difficulty || 'MEDIUM', programmingLanguage: p.programmingLanguage || 'javascript',
        starterCode: p.starterCode, expectedSolution: p.expectedSolution,
        timeLimit: p.timeLimit || 5, memoryLimit: p.memoryLimit || 256, marks: p.marks || 10,
        tags: p.tags || [], order: i
      });
      if (p.testCases && Array.isArray(p.testCases)) {
        for (let j = 0; j < p.testCases.length; j++) {
          await CodingTestCase.create({ problemId: problem.id, ...p.testCases[j], order: j });
        }
      }
    }
    const full = await CodingAssessment.findByPk(assessment.id, {
      include: [{ model: CodingProblem, as: 'problems', include: [{ model: CodingTestCase, as: 'testCases' }] }]
    });
    ok(res, { assessment: full });
  } catch (err) { fail(res, 500, err.message); }
};

// ── PUBLISHING ──

exports.publish = async (req, res) => {
  try {
    const assessment = await CodingAssessment.findOne({ where: { id: req.params.id, trainerId: req.user.id } });
    if (!assessment) return fail(res, 404, 'Assessment not found');
    if (assessment.status !== 'DRAFT') return fail(res, 400, 'Assessment is not in DRAFT status');
    const problems = await CodingProblem.findAll({ where: { assessmentId: assessment.id } });
    if (problems.length === 0) return fail(res, 400, 'Cannot publish: no problems defined');
    const totalMarks = problems.reduce((s, p) => s + (p.marks || 10), 0);
    await assessment.update({ status: 'PUBLISHED', publishedAt: new Date(), totalMarks });
    ok(res, { assessment });
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

    console.log('Attempt created successfully. Attempt ID:', attempt.id, 'Session Token:', session.sessionToken);

    ok(res, {
      success: true,
      attemptId: attempt.id,
      sessionToken: session.sessionToken,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        timeLimit: assessment.timeLimit,
        proctoringEnabled: assessment.proctoringEnabled
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
    }

    const hasCompileError = sampleResults.some(r => r.verdict === 'COMPILATION_ERROR');
    if (hasCompileError) {
      return ok(res, {
        run: {
          status: 'COMPILATION_ERROR',
          compileOutput,
          sampleResults,
          allPassed: false,
        }
      });
    }

    ok(res, {
      run: {
        status: allPassed ? 'ACCEPTED' : 'WRONG_ANSWER',
        compileOutput,
        stderr,
        executionTime: Math.max(...sampleResults.map(r => r.executionTime || 0)),
        memoryUsed: Math.max(...sampleResults.map(r => r.memoryUsed || 0)),
        sampleResults,
        allPassed,
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
    if (testCases.length === 0) {
      return fail(res, 400, 'This problem has no test cases configured. Please contact your trainer.');
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

    const submission = await CodingSubmission.create({
      attemptId, problemId, code, language, status: 'PENDING',
      totalTestCases: tcData.length, passedTestCases: 0,
      executionTime: 0, memoryUsed: 0, score: 0,
    });

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

    ok(res, {
      submission: {
        id: submission.id,
        status: 'PENDING',
        message: 'Submission queued for evaluation',
        totalTestCases: tcData.length,
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

// ── PARTICIPANT: Submit entire assessment ──

exports.submitAssessment = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const executionService = require('../services/codeExecutionService');

    // Use a transaction with row lock to prevent duplicate submissions atomically
    const result = await sequelize.transaction(async (t) => {
      const attempt = await CodingAttempt.findOne({
        where: { id: attemptId, participantId: req.user.id },
        include: [
          { model: CodingSubmission, as: 'submissions' },
          { model: CodingAssessment, as: 'assessment', include: [{ model: CodingProblem, as: 'problems', include: [{ model: CodingTestCase, as: 'testCases' }] }] }
        ],
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });
      if (attempt.status !== 'IN_PROGRESS') throw Object.assign(new Error('Attempt already submitted'), { status: 409 });

      const problems = attempt.assessment.problems || [];
      const existingSubs = attempt.submissions || [];
      const evaluatedProblemIds = new Set(existingSubs.filter(s => s.status !== 'PENDING' && s.totalTestCases > 0).map(s => s.problemId));
      const problemData = req.body.submissions || [];

      for (const pd of problemData) {
        if (evaluatedProblemIds.has(pd.problemId)) continue;
        const problem = problems.find(p => p.id === pd.problemId);
        if (!problem) continue;

        const testCases = problem.testCases || [];
        if (testCases.length === 0) continue;

        try {
          const results = await executionService.runTests(pd.code, pd.language || 'javascript', testCases, problem.timeLimit, problem.memoryLimit);
          const totalTC = results.length;
          const passedTC = results.filter(r => r.passed).length;
          const maxExecTime = Math.max(...results.map(r => r.executionTime || 0));
          const maxMem = Math.max(...results.map(r => r.memoryUsed || 0));
          const problemMarks = problem.marks || 10;
          const score = totalTC > 0 ? Math.min((passedTC / totalTC) * problemMarks, problemMarks) : 0;
          const isAccepted = passedTC === totalTC;
          let status = 'FAILED';
          if (isAccepted) status = 'ACCEPTED';
          else if (results.some(r => r.status === 'TIME_LIMIT_EXCEEDED')) status = 'TIME_LIMIT_EXCEEDED';
          else if (results.some(r => r.status === 'RUNTIME_ERROR')) status = 'RUNTIME_ERROR';
          else if (results.some(r => r.status === 'COMPILATION_ERROR')) status = 'COMPILATION_ERROR';
          else if (passedTC > 0) status = 'WRONG_ANSWER';

          let submission = existingSubs.find(s => s.problemId === pd.problemId);
          if (submission) {
            await submission.update({
              code: pd.code, language: pd.language || 'javascript', status,
              totalTestCases: totalTC, passedTestCases: passedTC,
              executionTime: maxExecTime, memoryUsed: maxMem,
              score: Math.round(score * 100) / 100,
              output: results.map(r => ({
                testCaseId: r.testCaseId, input: r.input, expectedOutput: r.expectedOutput,
                actualOutput: r.actualOutput, passed: r.passed, status: r.status,
                executionTime: r.executionTime, memoryUsed: r.memoryUsed, isHidden: r.isHidden
              }))
            }, { transaction: t });
          } else {
            submission = await CodingSubmission.create({
              attemptId, problemId: pd.problemId, code: pd.code, language: pd.language || 'javascript',
              status, totalTestCases: totalTC, passedTestCases: passedTC,
              executionTime: maxExecTime, memoryUsed: maxMem,
              score: Math.round(score * 100) / 100, output: results
            }, { transaction: t });
          }
        } catch (evalErr) {
          logger.error('Error evaluating problem during submission', { problemId: pd.problemId, error: evalErr.message });
        }
      }

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
      await attempt.update({
        status: 'SUBMITTED', submittedAt: new Date(),
        timeTaken: Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
      }, { transaction: t });
      const codingResult = await CodingResult.create({
        attemptId: attempt.id, assessmentId: attempt.assessmentId, participantId: req.user.id,
        totalScore: Math.min(totalScore, 999.99),
        maxScore: Math.min(maxScore, 999.99),
        percentage: Math.min(percentage, 100),
        problemsSolved, totalProblems: problems.length,
        totalTestCases, passedTestCases
      }, { transaction: t });
      return codingResult;
    });

    ok(res, { result });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    fail(res, 500, err.message);
  }
};

// ── TRAINER: Results & Participants ──

exports.getResults = async (req, res) => {
  try {
    const results = await CodingResult.findAll({
      where: { assessmentId: req.params.id },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        { model: CodingAttempt, as: 'attempt', attributes: ['id', 'status', 'violationCount', 'timeTaken', 'startedAt', 'submittedAt'] }
      ],
      order: [['percentage', 'DESC']]
    });
    ok(res, { results });
  } catch (err) { fail(res, 500, err.message); }
};

exports.getParticipants = async (req, res) => {
  try {
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

    const participants = enrollments.map(e => {
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
    ok(res, { participants });
  } catch (err) { fail(res, 500, err.message); }
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
    const assessment = await CodingAssessment.findByPk(req.params.id);
    if (!assessment) return fail(res, 404, 'Assessment not found');
    const recordings = await QuizRecording.findAll({
      where: { quizId: req.params.id, assessmentType: 'coding' },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC']]
    });
    ok(res, { recordings });
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
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['percentage', 'DESC'], ['passedTestCases', 'DESC']],
      limit: 100
    });
    const ranked = results.map((r, i) => ({ rank: i + 1, ...r.toJSON() }));
    ok(res, { leaderboard: ranked });
  } catch (err) { fail(res, 500, err.message); }
};
