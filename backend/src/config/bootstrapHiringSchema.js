'use strict';

/**
 * Additive Hire schema bootstrap.
 *
 * The only Hire-owned tables are workflow/candidate/assignment metadata. Quiz
 * questions, coding problems, attempts, monitoring and results stay in their
 * established tables. Legacy hiring_questions/hiring_attempts tables are not
 * dropped so deployments that briefly ran the old draft remain recoverable.
 */
const { DataTypes, QueryTypes } = require('sequelize');
const { sequelize } = require('./db');
const {
  HiringAssessment, HiringCandidate, HiringAssignment, AIQuiz, AIQuestion,
  CodingAssessment, CodingProblem, CodingProblemLanguage, CodingTestCase,
} = require('../models');
const logger = require('../utils/logger');

async function addColumnIfMissing(queryInterface, table, name, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[name]) await queryInterface.addColumn(table, name, definition);
}

const jsonValue = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

async function migrateLegacyDrafts(queryInterface) {
  const tableNames = (await queryInterface.showAllTables()).map((item) => String(item?.tableName || item));
  if (!tableNames.includes('hiring_questions')) return;
  const workflows = await HiringAssessment.findAll({
    where: { quiz_id: null, coding_assessment_id: null },
    order: [['id', 'ASC']],
  });
  for (const workflow of workflows) {
    const questions = await sequelize.query(
      'SELECT * FROM hiring_questions WHERE assessment_id = :assessmentId ORDER BY sort_order ASC, id ASC',
      { replacements: { assessmentId: workflow.id }, type: QueryTypes.SELECT },
    );
    const codingOnly = questions.length > 0 && questions.every((q) => String(q.question_type).toUpperCase() === 'CODING');
    await sequelize.transaction(async (transaction) => {
      if (codingOnly) {
        const assessment = await CodingAssessment.create({
          title: workflow.title,
          description: workflow.description,
          trainerId: workflow.created_by,
          context: 'HIRE',
          timeLimit: workflow.duration_minutes,
          status: 'DRAFT',
          resultStatus: 'HIDDEN',
          proctoringEnabled: true,
        }, { transaction });
        for (const [index, source] of questions.entries()) {
          const language = String(source.language || 'javascript').toLowerCase();
          const problem = await CodingProblem.create({
            assessmentId: assessment.id,
            title: String(source.question_text || `Coding problem ${index + 1}`).slice(0, 255),
            description: source.question_text || 'Migrated hiring coding problem',
            constraints: source.constraints,
            inputFormat: source.input_format,
            outputFormat: source.output_format,
            sampleInput: source.sample_input,
            sampleOutput: source.sample_output,
            difficulty: source.difficulty || 'MEDIUM',
            programmingLanguage: language,
            starterCode: source.starter_code,
            expectedSolution: source.reference_solution,
            marks: Number(source.marks) || 10,
            order: index,
            source: source.source || 'MANUAL',
            aiValidationStatus: 'NEEDS_TRAINER_REVIEW',
          }, { transaction });
          await CodingProblemLanguage.create({
            problemId: problem.id,
            language,
            starterCode: source.starter_code,
            referenceSolution: source.reference_solution,
            generationStatus: source.reference_solution ? 'completed' : 'pending',
          }, { transaction });
          const tests = jsonValue(source.test_cases, []);
          for (const [testIndex, test] of tests.entries()) {
            await CodingTestCase.create({
              problemId: problem.id,
              input: String(test.input ?? ''),
              expectedOutput: String(test.expectedOutput ?? test.expected_output ?? test.output ?? ''),
              isHidden: Boolean(test.isHidden ?? test.is_hidden),
              order: testIndex,
            }, { transaction });
          }
        }
        await workflow.update({ assessment_type: 'CODING', coding_assessment_id: assessment.id }, { transaction });
      } else {
        const quiz = await AIQuiz.create({
          title: workflow.title,
          description: workflow.description,
          trainerId: workflow.created_by,
          createdBy: workflow.created_by,
          context: 'HIRE',
          timeLimit: workflow.duration_minutes,
          status: 'DRAFT',
          resultStatus: 'HIDDEN',
          proctoringEnabled: true,
          numQuestions: questions.filter((q) => String(q.question_type).toUpperCase() !== 'CODING').length,
        }, { transaction });
        let order = 0;
        for (const source of questions.filter((q) => String(q.question_type).toUpperCase() !== 'CODING')) {
          const options = jsonValue(source.options, []);
          const answerIndex = Number(source.correct_answer);
          await AIQuestion.create({
            quizId: quiz.id,
            questionText: source.question_text,
            questionType: source.question_type || 'MCQ',
            options,
            correctAnswer: Number.isInteger(answerIndex) && options[answerIndex] !== undefined ? options[answerIndex] : source.correct_answer,
            explanation: source.explanation,
            topic: source.topic,
            difficulty: source.difficulty || 'MEDIUM',
            order: order++,
            marks: Number(source.marks) || 1,
          }, { transaction });
        }
        await workflow.update({ assessment_type: 'QUIZ', quiz_id: quiz.id }, { transaction });
      }
    });
    logger.info('Migrated legacy Hire draft to shared assessment engine', { workflowId: workflow.id });
  }
}

async function ensureHiringSchema() {
  try {
    await HiringAssessment.sync();
    await HiringCandidate.sync();
    await HiringAssignment.sync();
    const queryInterface = sequelize.getQueryInterface();

    await addColumnIfMissing(queryInterface, 'ai_quizzes', 'context', {
      type: DataTypes.STRING(16), allowNull: false, defaultValue: 'TRAINING',
    });
    await addColumnIfMissing(queryInterface, 'coding_assessments', 'context', {
      type: DataTypes.STRING(16), allowNull: false, defaultValue: 'TRAINING',
    });
    await addColumnIfMissing(queryInterface, 'hiring_assessments', 'assessment_type', {
      type: DataTypes.STRING(16), allowNull: false, defaultValue: 'QUIZ',
    });
    await addColumnIfMissing(queryInterface, 'hiring_assessments', 'quiz_id', {
      type: DataTypes.BIGINT, allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'hiring_assessments', 'coding_assessment_id', {
      type: DataTypes.BIGINT, allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'hiring_assignments', 'quiz_assignment_id', {
      type: DataTypes.BIGINT, allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'hiring_assessments', 'proctoring_config', {
      type: DataTypes.JSON,
      allowNull: true,
    });

    await migrateLegacyDrafts(queryInterface);

    logger.info('Hiring workflow schema verified (shared Quiz/Coding engines)');
  } catch (error) {
    logger.error('Error bootstrapping hiring workflow schema', { error: error.message });
    throw error;
  }
}

module.exports = { ensureHiringSchema };
