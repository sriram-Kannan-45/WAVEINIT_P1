const axios = require('axios');
require('dotenv').config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_TIMEOUT = 300000;
const MAX_RETRIES = 2;

async function checkHealth() {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    return { available: true, details: response.data };
  } catch {
    return { available: false, details: null };
  }
}

function toDifficulty(value, fallback = 'MEDIUM') {
  const raw = String(value || fallback).trim().toUpperCase();
  if (['EASY', 'MEDIUM', 'HARD'].includes(raw)) return raw;
  return fallback;
}

function correctIndexFromOptions(options, correctAnswer) {
  const raw = String(correctAnswer || '').trim();
  if (['A', 'B', 'C', 'D'].includes(raw.toUpperCase())) {
    return String(raw.toUpperCase().charCodeAt(0) - 65);
  }
  if (['0', '1', '2', '3'].includes(raw)) return raw;
  const idx = options.findIndex(opt => String(opt).trim().toLowerCase() === raw.toLowerCase());
  return idx >= 0 ? String(idx) : '0';
}

function normalizeRagQuestions(questions = [], fallbackDifficulty = 'MEDIUM') {
  return questions.map((q, i) => {
    const questionType = String(q.questionType || 'MCQ').toUpperCase();
    const base = {
      questionText: q.question || q.questionText || `Question ${i + 1}`,
      explanation: q.explanation || '',
      difficulty: toDifficulty(q.difficulty, fallbackDifficulty),
      topic: q.topic || null,
      bloomsLevel: q.bloomsLevel || q.bloomLevel || q.blooms_level || null,
      order: i,
    };

    if (questionType === 'TRUE_FALSE') {
      const correct = String(q.correctAnswer || '').trim().toLowerCase() === 'false' ? '1' : '0';
      return {
        ...base,
        questionType: 'TRUE_FALSE',
        options: ['True', 'False'],
        correctAnswer: correct,
      };
    }

    if (questionType === 'FILL_BLANK') {
      const answer = q.correctAnswer || q.answer || '';
      return {
        ...base,
        questionType: 'FILL_BLANK',
        options: [],
        correctAnswer: answer,
        acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [answer].filter(Boolean),
      };
    }

    const options = Array.isArray(q.options) && q.options.length === 4
      ? q.options.map(opt => String(opt))
      : ['Option A', 'Option B', 'Option C', 'Option D'];

    return {
      ...base,
      questionType: 'MCQ',
      options,
      correctAnswer: correctIndexFromOptions(options, q.correctAnswer || q.correct_answer),
    };
  });
}

function buildAIError(error) {
  if (!error) return new Error('AI service failed without a response.');
  if (error.response) {
    const data = error.response.data || {};
    const detail = data.detail || data.error || data.message || '';
    if (error.response.status === 503) {
      const err = new Error(data.message || 'Gemini AI is currently experiencing high demand. Please try again in a few moments.');
      err.status = 503;
      return err;
    }
    if (error.response.status === 415) return new Error(`File type not supported: ${detail}`);
    if (error.response.status === 422) {
      if (detail && detail.includes("Document contains insufficient text")) {
        return new Error("Document contains insufficient text.");
      }
      return new Error(`Validation error: ${detail}`);
    }
    if (error.response.status === 502) return new Error(`AI generation failed: ${detail}`);
    return new Error(`AI service error (${error.response.status}): ${detail || error.response.statusText}`);
  }
  if (error.code === 'ECONNREFUSED') {
    return new Error('AI service is not running. Please start the Python AI service first.');
  }
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new Error('AI service timed out. The document may be complex or the embedding model may still be loading.');
  }
  return new Error('Failed to generate quiz: ' + error.message);
}

async function callRagGeneration(payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[aiService] RAG generation attempt ${attempt}/${MAX_RETRIES}`);
      const response = await axios.post(`${AI_SERVICE_URL}/rag/generate-quiz`, payload, {
        timeout: AI_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.data || !Array.isArray(response.data.questions)) {
        throw new Error('Invalid response from AI service - no questions returned');
      }

      return {
        questions: normalizeRagQuestions(response.data.questions, payload.difficulty),
        title: response.data.title || response.data.quiz_title || 'AI Generated Quiz',
        difficulty: response.data.difficulty,
        quizOutput: {
          title: response.data.title || response.data.quiz_title || 'AI Generated Quiz',
          difficulty: response.data.difficulty || payload.difficulty || 'MIXED',
          totalQuestions: Array.isArray(response.data.questions) ? response.data.questions.length : 0,
          questions: response.data.questions,
        },
        metadata: response.data.metadata || {},
      };
    } catch (error) {
      lastError = error;
      console.error(`[aiService] RAG attempt ${attempt} failed:`, error.message);
      if (error.response && [400, 415, 422, 502, 503].includes(error.response.status)) break;
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
      }
    }
  }
  throw buildAIError(lastError);
}

const aiService = {
  checkHealth,

  async generateQuizFromText(content, numQuestions = 10, difficulty = 'MIXED') {
    const cleanContent = (content || '').toString().replace(/\u0000/g, '').trim();
    if (!cleanContent || cleanContent.length < 50) {
      throw new Error('Document contains insufficient text.');
    }
    return callRagGeneration({
      text: cleanContent,
      numberOfQuestions: parseInt(numQuestions, 10),
      difficulty,
      questionType: 'MIXED',
      source_title: 'Provided learning material',
    });
  },

  async generateQuizFromFile({
    filePath,
    originalName,
    fileType,
    trainingId,
    courseId,
    numQuestions = 10,
    difficulty = 'MIXED',
    questionType = 'MIXED',
  }) {
    if (!filePath) throw new Error('filePath is required for RAG quiz generation.');
    return callRagGeneration({
      file_path: filePath,
      mime_type: fileType || null,
      source_title: originalName || 'Uploaded learning material',
      training_id: trainingId || null,
      course_id: courseId || null,
      numberOfQuestions: parseInt(numQuestions, 10),
      difficulty,
      questionType,
    });
  },

  async generateQuizFromUrl({
    url,
    trainingId,
    courseId,
    numQuestions = 10,
    difficulty = 'MIXED',
    questionType = 'MIXED',
  }) {
    if (!url) throw new Error('URL is required for RAG quiz generation.');
    return callRagGeneration({
      source_url: url,
      source_title: url,
      training_id: trainingId || null,
      course_id: courseId || null,
      numberOfQuestions: parseInt(numQuestions, 10),
      difficulty,
      questionType,
    });
  },

  async evaluateShortAnswer(question, modelAnswer, userAnswer) {
    try {
      const response = await axios.post(`${AI_SERVICE_URL}/evaluate`, {
        questionText: question,
        modelAnswer,
        userAnswer,
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      return {
        score: response.data.score || 0,
        feedback: response.data.feedback || 'Answer evaluated',
        isCorrect: response.data.isCorrect || false,
      };
    } catch (error) {
      console.error('[aiService] AI Evaluation Error:', error.message);
      const userWords = new Set(String(userAnswer || '').toLowerCase().split(/\s+/));
      const modelWords = new Set(String(modelAnswer || '').toLowerCase().split(/\s+/));
      let matchCount = 0;
      userWords.forEach(w => { if (modelWords.has(w)) matchCount++; });
      const score = Math.min(100, (matchCount / Math.max(modelWords.size, 1)) * 100);

      return {
        score,
        feedback: score > 50 ? 'Good answer with relevant keywords' : 'Answer needs improvement - missing key concepts',
        isCorrect: score >= 60,
      };
    }
  },

  async generateQuizFromPrompt(prompt, questionCount = 10, difficulty = 'Medium') {
    const cleanPrompt = (prompt || '').toString().trim();
    if (!cleanPrompt) {
      throw new Error('Prompt/Topic cannot be empty.');
    }
    if (questionCount < 1 || questionCount > 50) {
      throw new Error('Number of questions must be between 1 and 50.');
    }

    try {
      console.log(`[aiService] Querying AI service /generate-quiz-from-prompt for topic: "${cleanPrompt}"`);
      const response = await axios.post(`${AI_SERVICE_URL}/generate-quiz-from-prompt`, {
        prompt: cleanPrompt,
        questionCount: parseInt(questionCount, 10),
        difficulty,
      }, {
        timeout: AI_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.data || !response.data.success || !response.data.questions) {
        throw new Error('Invalid response from AI service');
      }

      return response.data.questions;
    } catch (error) {
      console.error('[aiService] generateQuizFromPrompt failed:', error.message);
      if (error.response) {
        const detail = error.response.data?.detail || '';
        throw new Error(`AI service error: ${detail || error.response.statusText}`);
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('AI service is not running. Please start the Python AI service first.');
      }
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('AI service timed out. The prompt may be too complex or the model is overloaded.');
      }
      throw new Error('Failed to generate quiz from prompt: ' + error.message);
    }
  },

  async generateCodingProblemsFromPrompt(prompt, numProblems = 5, difficulty = 'MEDIUM') {
    const cleanPrompt = (prompt || '').toString().trim();
    if (!cleanPrompt) throw new Error('Prompt cannot be empty.');
    try {
      console.log(`[aiService] Generating coding problems from prompt: "${cleanPrompt}"`);
      const response = await axios.post(`${AI_SERVICE_URL}/generate-coding-problems`, {
        prompt: cleanPrompt, numProblems: parseInt(numProblems, 10), difficulty,
      }, { timeout: AI_TIMEOUT, headers: { 'Content-Type': 'application/json' } });
      if (!response.data || !response.data.problems) {
        throw new Error('Invalid response from AI service');
      }
      return response.data;
    } catch (error) {
      console.error('[aiService] generateCodingProblems failed:', error.message);
      if (error.code === 'ECONNREFUSED') throw new Error('AI service is not running.');
      throw new Error('Failed to generate coding problems: ' + error.message);
    }
  },
};

module.exports = aiService;
