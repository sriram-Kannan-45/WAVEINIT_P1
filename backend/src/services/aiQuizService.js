const {
  AIQuiz,
  AIQuestion,
  AIQuestionOption,
  Enrollment,
  Training,
  Course,
  QuizAttempt,
  QuizResult,
  QuizAssignment,
  QuizAnswer
} = require('../models');
const aiService = require('./aiService');
const { gradeAnswer } = require('../utils/gradeAnswer');
const { Op } = require('sequelize');

class AIQuizService {
  /**
   * Generates quiz questions from Prompt or Document text using the Python microservice.
   * @param {string} type - 'prompt' or 'document'
   * @param {string} input - Prompt topic or extracted document text
   * @param {number} questionCount - Number of questions to generate
   * @param {string} difficulty - 'Easy', 'Medium', or 'Hard'
   */
  async generateQuiz(type, input, questionCount = 10, difficulty = 'Medium') {
    const coercedDiff = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase(); // Easy, Medium, Hard
    const diffUpper = difficulty.toUpperCase(); // EASY, MEDIUM, HARD, MIXED

    if (type === 'document') {
      console.log(`[AIQuizService] Generating quiz from document text (${input.length} chars)`);
      const result = await aiService.generateQuizFromText(input, questionCount, diffUpper);
      return result.questions || [];
    } else if (type === 'prompt') {
      console.log(`[AIQuizService] Generating quiz from prompt topic "${input}"`);
      const questions = await aiService.generateQuizFromPrompt(input, questionCount, coercedDiff);
      // generateQuizFromPrompt returns questions already, but let's normalize them just in case
      // Since it's from prompt, we use normalized parser to map properties cleanly.
      return this.parseResponse(questions, coercedDiff);
    } else {
      throw new Error(`Unsupported generation type: ${type}`);
    }
  }

  /**
   * Normalizes the questions format.
   */
  parseResponse(questions = [], fallbackDifficulty = 'MEDIUM') {
    // We can reuse the normalization logic from aiService.js or define a custom clean parser.
    return questions.map((q, i) => {
      const questionText = q.question || q.questionText || `Question ${i + 1}`;
      const explanation = q.explanation || '';
      const difficulty = (q.difficulty || fallbackDifficulty).toUpperCase();
      const questionType = String(q.questionType || q.question_type || 'MCQ').toUpperCase();

      let options = [];
      let correctAnswer = '';

      if (questionType === 'TRUE_FALSE') {
        options = ['True', 'False'];
        const correctRaw = String(q.correctAnswer || q.correct_answer || '').trim().toLowerCase();
        correctAnswer = correctRaw === 'false' || correctRaw === '1' ? '1' : '0';
      } else {
        // Handle MCQ
        options = Array.isArray(q.options) && q.options.length === 4
          ? q.options.map(opt => String(opt))
          : [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);

        if (options.length !== 4) {
          options = ['Option A', 'Option B', 'Option C', 'Option D'];
        }

        const rawCorrect = q.correctAnswer || q.correct_answer || '';
        // Find option index
        const idx = options.findIndex(opt => String(opt).trim().toLowerCase() === String(rawCorrect).trim().toLowerCase());
        if (idx >= 0) {
          correctAnswer = String(idx);
        } else if (['0', '1', '2', '3'].includes(String(rawCorrect))) {
          correctAnswer = String(rawCorrect);
        } else if (['A', 'B', 'C', 'D'].includes(String(rawCorrect).toUpperCase())) {
          correctAnswer = String(String(rawCorrect).toUpperCase().charCodeAt(0) - 65);
        } else {
          correctAnswer = '0';
        }
      }

      return {
        questionText,
        questionType: 'MCQ', // For now ensure MCQ compatibility
        options,
        correctAnswer,
        explanation,
        difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'MEDIUM',
        order: i
      };
    });
  }

  /**
   * Saves the quiz header.
   */
  async saveQuiz({
    courseId,
    trainingId,
    trainerId,
    title,
    description,
    difficulty,
    questionCount,
    status = 'PUBLISHED',
    published = true,
    documentId = null
  }) {
    const diffUpper = ['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(String(difficulty).toUpperCase())
      ? String(difficulty).toUpperCase()
      : 'MIXED';

    const quiz = await AIQuiz.create({
      courseId: courseId || null,
      trainingId: trainingId || null,
      trainerId,
      documentId: documentId || null,
      title: title || 'AI Generated Quiz',
      description: description || null,
      difficulty: diffUpper,
      numQuestions: questionCount,
      questionCount: questionCount,
      createdBy: trainerId,
      status: status || 'PUBLISHED',
      published: published !== false,
      isPublished: published !== false,
      resultStatus: published ? 'PUBLISHED' : 'HIDDEN',
      isMandatory: true,
      isActive: true
    });

    // Mirror PK id to quiz_id column for Issue 5 compliance
    await quiz.update({ quizId: quiz.id });
    return quiz;
  }

  /**
   * Saves the questions and their choices.
   */
  async saveQuestions(quizId, questions = []) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const savedQuestion = await AIQuestion.create({
        quizId,
        questionText: q.questionText,
        questionType: q.questionType || 'MCQ',
        options: q.options || null,
        correctAnswer: String(q.correctAnswer ?? ''),
        explanation: q.explanation || '',
        difficulty: q.difficulty || 'MEDIUM',
        order: i,
      });

      if (Array.isArray(q.options) && q.options.length > 0) {
        const correctIndex = ['0', '1', '2', '3'].includes(String(q.correctAnswer))
          ? parseInt(q.correctAnswer, 10)
          : q.options.findIndex(option => String(option).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase());

        for (let optionIndex = 0; optionIndex < q.options.length; optionIndex++) {
          await AIQuestionOption.create({
            questionId: savedQuestion.id,
            optionText: String(q.options[optionIndex]),
            isCorrect: optionIndex === correctIndex,
            order: optionIndex,
          });
        }
      }
    }
  }

  /**
   * Assigns a quiz to a course.
   */
  async assignQuiz(quizId, courseId) {
    const quiz = await AIQuiz.findByPk(quizId);
    if (!quiz) throw new Error(`Quiz with ID ${quizId} not found`);
    
    // Scopes it to the course and training (resolves trainingId from Course)
    const course = await Course.findByPk(courseId);
    if (course) {
      await quiz.update({
        courseId,
        trainingId: course.trainingProgramId
      });
      // Create quiz_assignment record
      if (course.trainingProgramId) {
        const existing = await QuizAssignment.findOne({
          where: { quizId, trainingId: course.trainingProgramId }
        });
        if (!existing) {
          await QuizAssignment.create({ quizId, trainingId: course.trainingProgramId });
          console.log(`[assignQuiz] Created quiz_assignment: quiz #${quizId} → training #${course.trainingProgramId}`);
        }
      }
    }
    return quiz;
  }

  /**
   * Publishes a quiz.
   */
  async publishQuiz(quizId) {
    const quiz = await AIQuiz.findByPk(quizId);
    if (!quiz) throw new Error(`Quiz with ID ${quizId} not found`);
    
    await quiz.update({
      status: 'PUBLISHED',
      resultStatus: 'PUBLISHED',
      published: true
    });
    return quiz;
  }

  /**
   * Retrieves participant quizzes (both manual and AI-generated).
   */
  async getParticipantQuizzes(participantId) {
    // Find courses and training programs the participant is enrolled in
    const enrollments = await Enrollment.findAll({
      where: { participantId, status: 'ENROLLED' }
    });

    const courseIds = enrollments.map(e => e.courseId).filter(Boolean);
    const trainingIds = enrollments.map(e => e.trainingId).filter(Boolean);

    const orConds = [];
    if (courseIds.length) orConds.push({ courseId: courseIds });
    if (trainingIds.length) orConds.push({ trainingId: trainingIds });

    // Also search via quiz_assignments table (new schema: participantId-based)
    {
      const assignmentRecords = await QuizAssignment.findAll({
        where: { participantId, status: 'PENDING' },
        attributes: ['quizId']
      });
      const assignedQuizIds = assignmentRecords.map(a => a.quizId);
      if (assignedQuizIds.length) {
        orConds.push({ id: assignedQuizIds });
        console.log(`[aiQuizService] Found ${assignedQuizIds.length} quiz IDs via quiz_assignments: [${assignedQuizIds.join(',')}]`);
      }
    }

    if (orConds.length === 0) {
      return { availableQuizzes: [], completedQuizzes: [] };
    }

    console.log(`[aiQuizService] Participant #${participantId} — querying with ${orConds.length} OR conditions`);

    const allQuizzes = await AIQuiz.findAll({
      where: {
        isPublished: true,
        isActive: true,
        [Op.or]: orConds
      },
      include: [
        { model: AIQuestion, as: 'questions', attributes: ['id', 'questionText', 'questionType', 'options'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const quizIds = allQuizzes.map(q => q.id);
    const [attempts, results] = await Promise.all([
      QuizAttempt.findAll({
        where: { quizId: quizIds, participantId },
        attributes: ['id', 'quizId', 'status'],
      }),
      QuizResult.findAll({
        where: { quizId: quizIds, participantId },
        attributes: ['quizId', 'percentage'],
      }),
    ]);

    const attemptMap = Object.fromEntries(attempts.map(a => [String(a.quizId), a]));
    const resultMap = Object.fromEntries(results.map(r => [String(r.quizId), r]));

    const enriched = allQuizzes.map(q => {
      const attempt = attemptMap[String(q.id)];
      const result = resultMap[String(q.id)];
      const data = q.toJSON();
      data.isAI = q.documentId !== null || q.createdBy !== null;
      data.questionCount = q.questions?.length ?? q.questionCount ?? q.numQuestions ?? 0;
      data.myStatus = attempt?.status || 'NOT_STARTED';
      data.completionPercent = (attempt?.status === 'SUBMITTED' || attempt?.status === 'EVALUATED') ? 100 : 0;
      data.myScore = q.isResultPublished && result ? Number(result.percentage) : null;
      return data;
    });

    const availableQuizzes = enriched.filter(q => q.myStatus !== 'SUBMITTED' && q.myStatus !== 'EVALUATED');
    const completedQuizzes = enriched.filter(q => q.myStatus === 'SUBMITTED' || q.myStatus === 'EVALUATED');

    return { availableQuizzes, completedQuizzes };
  }

  /**
   * Grades a quiz attempt and creates QuizAnswer + QuizResult rows.
   * Used by manual submit and by auto-submit on session termination.
   * @param {QuizAttempt} attempt
   * @param {Array} answers - [{ questionId, selectedOption, answerText, matches }]
   * @param {Object} [options]
   * @param {boolean} [options.autoSubmit=false]
   */
  async submitAndGradeAttempt(attempt, answers = [], options = {}) {
    const { autoSubmit = false } = options;
    const { sequelize } = require('../models');

    const quiz = await AIQuiz.findByPk(attempt.quizId);
    if (!quiz) throw new Error('Quiz not found');

    const questions = await AIQuestion.findAll({ where: { quizId: attempt.quizId } });
    const questionsMap = {};
    let maxScore = 0;
    questions.forEach(q => {
      questionsMap[q.id] = q;
      maxScore += (q.marks || 1);
    });

    let totalScore = 0;

    await sequelize.transaction(async (t) => {
      await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction: t });

      for (const ans of answers) {
        const question = questionsMap[ans.questionId];
        if (!question) continue;

        let score = 0;
        let feedback = '';
        let isCorrect = false;
        const qMarks = question.marks || 1;

        if (['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'].includes(question.questionType)) {
          const result = gradeAnswer(question, {
            selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
            answer: ans.answerText || ans.answer || '',
            answerText: ans.answerText || ans.answer || '',
            matches: ans.matches
          });
          isCorrect = result.isCorrect;
          score = result.score > 0 ? (result.score / 100) * qMarks : 0;
          if (question.questionType === 'MATCHING') {
            feedback = `Score: ${result.score}%. Matched ${result.correctCount} of ${result.total} correctly.`;
          } else {
            feedback = isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${question.correctAnswer}`;
          }
        } else {
          // Fallback to AI evaluation
          try {
            const evaluation = await aiService.evaluateShortAnswer(
              question.questionText,
              question.correctAnswer,
              ans.answerText || ''
            );
            score = evaluation.score || 0;
            feedback = evaluation.feedback || '';
            isCorrect = evaluation.isCorrect || false;
          } catch (aiErr) {
            console.error('AI evaluation failed, defaulting to 0:', aiErr.message);
          }
        }

        await QuizAnswer.create({
          attemptId: attempt.id,
          questionId: ans.questionId,
          answerText: ans.answerText || '',
          selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
          isCorrect,
          score,
          feedback,
          evaluatedByAI: !['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'].includes(question.questionType)
        }, { transaction: t });

        totalScore += score;
      }

      const submittedAt = new Date();
      let timeTaken = null;
      if (attempt.startedAt) {
        timeTaken = Math.max(0, Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
      }

      await attempt.update({
        status: autoSubmit ? 'AUTO_SUBMITTED' : 'EVALUATED',
        submittedAt,
        ...(timeTaken != null ? { timeTaken } : {})
      }, { transaction: t });

      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      await QuizResult.create({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId: attempt.participantId,
        totalScore,
        maxScore,
        percentage,
        evaluatedAt: submittedAt,
        resultPublished: false
      }, { transaction: t });

      await QuizAssignment.update(
        { status: 'COMPLETED' },
        { where: { quizId: quiz.id, participantId: attempt.participantId }, transaction: t }
      );
    });

    return { totalScore, maxScore, percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0 };
  }
}

module.exports = new AIQuizService();
