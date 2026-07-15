const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const multer = require('multer');
const path = require('path');
const { AIDocument, AIQuiz, AIQuestion, AIQuestionOption, QuizAttempt, QuizAnswer, QuizResult, Training, User, Course, CourseTrainerAssignment, TrainingTrainerAssignment, QuizAssignment } = require('../models');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const aiService = require('../services/aiService');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const { generateAIQuiz } = require('../controllers/aiQuizGenerationController');
const { uploadAIQuizMaterial } = require('../middleware/uploadAIQuizMaterial');

const { gradeAnswer } = require('../utils/gradeAnswer');
const { areResultsVisible } = require('../utils/quizStateMachine');
 
const router = express.Router();

  // Absolute path for uploads directory
  const uploadsDir = path.join(process.cwd(), 'uploads', 'ai-docs');
  
  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
      cb(null, unique);
    }
  });

  // STRICT image detection - check magic bytes
  const isImageFile = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return true;
    // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
    if (buffer.length >= 12 && buffer.slice(0,4).toString() === 'RIFF' && buffer.slice(8,12).toString() === 'WEBP') return true;
    return false;
  };

  const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      // Check MIME type first
      const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      const isImageMime = file.mimetype?.startsWith('image/');
      
      if (isImageMime) {
        return cb(new Error('Images are not supported. Please upload PDF, DOCX, or TXT files only.'));
      }
      
      if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF, DOCX, and TXT files are allowed'));
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  const extractText = async (filePath, mimeType) => {
    // Ensure the file path is absolute
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    if (mimeType === 'text/plain' || absPath.endsWith('.txt')) {
      return fs.readFileSync(absPath, 'utf8');
    }
    if (mimeType === 'application/pdf' || absPath.endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(absPath);
      try {
        const data = await pdf(dataBuffer);
        return data.text || '';
      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr.message);
        throw new Error('Failed to parse PDF: ' + pdfErr.message);
      }
    }
    if (mimeType.includes('wordprocessingml') || absPath.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ path: absPath });
        return result.value || '';
      } catch (docxErr) {
        console.error('DOCX parse error:', docxErr.message);
        throw new Error('Failed to parse DOCX: ' + docxErr.message);
      }
    }
    throw new Error('Unsupported file type: ' + mimeType);
  };

  // RAG replacement for the document quiz generator. This route is registered
  // before the legacy inline handler below, so existing clients keep using the
  // same URL while the implementation moves to retrieval-first generation.
  router.post('/trainer/upload-document',
    authenticateToken,
    roleMiddleware('TRAINER'),
    uploadAIQuizMaterial.single('file'),
    generateAIQuiz
  );

  // POST /api/ai-quiz/generate-from-document
  router.post('/generate-from-document',
    authenticateToken,
    roleMiddleware('TRAINER'),
    uploadAIQuizMaterial.single('file'),
    generateAIQuiz
  );

  // POST /api/ai-quiz/generate-from-prompt
  router.post('/generate-from-prompt',
    authenticateToken,
    roleMiddleware('TRAINER', 'ADMIN'),
    async (req, res) => {
      try {
        const { prompt, questionCount = 10, difficulty = 'MIXED', courseId, trainingId } = req.body;
        const trainerId = req.user.id;

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
          return res.status(422).json({ error: 'Prompt/Topic cannot be empty.' });
        }

        const count = parseInt(questionCount, 10);
        if (isNaN(count) || count < 1 || count > 50) {
          return res.status(422).json({ error: 'Number of questions must be between 1 and 50.' });
        }

        // ── Resolve courseId and trainingId ──
        let resolvedCourseId = courseId || null;
        let resolvedTrainingId = trainingId || null;

        // Clean up stringified values
        if (resolvedCourseId === 'undefined' || resolvedCourseId === 'null' || resolvedCourseId === 'NaN' || resolvedCourseId === '') {
          resolvedCourseId = null;
        }
        if (resolvedTrainingId === 'undefined' || resolvedTrainingId === 'null' || resolvedTrainingId === 'NaN' || resolvedTrainingId === '') {
          resolvedTrainingId = null;
        }

        if (resolvedCourseId && resolvedTrainingId && String(resolvedCourseId) === String(resolvedTrainingId)) {
          resolvedCourseId = null;
        }

        // Fallback: If trainingId was passed but no courseId was provided, check if it's actually a courseId or a trainingId.
        if (resolvedTrainingId && !resolvedCourseId) {
          const courseCheck = await Course.findByPk(resolvedTrainingId);
          if (courseCheck) {
            resolvedCourseId = resolvedTrainingId;
            resolvedTrainingId = courseCheck.trainingProgramId;
          } else {
            const course = await Course.findOne({ where: { trainingProgramId: resolvedTrainingId } });
            if (course) {
              resolvedCourseId = course.id;
            }
          }
        }

        // Perform validation and authorization
        if (resolvedCourseId) {
          const course = await Course.findByPk(resolvedCourseId);
          if (!course) {
            return res.status(400).json({
              success: false,
              error: 'Course not found',
              details: `The selected course (ID: ${resolvedCourseId}) does not exist.`
            });
          }

          // Verify trainer assignment
          const courseAssigned = await CourseTrainerAssignment.findOne({
            where: { courseId: resolvedCourseId, trainerId }
          });
          const hasCourseAccess = course.trainerId === trainerId || courseAssigned !== null || req.user.role === 'ADMIN';
          if (!hasCourseAccess) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
              details: `You are not authorized to generate quizzes for course (ID: ${resolvedCourseId}).`
            });
          }

          resolvedTrainingId = course.trainingProgramId;
        } else if (resolvedTrainingId) {
          const training = await Training.findByPk(resolvedTrainingId);
          if (!training) {
            return res.status(400).json({
              success: false,
              error: 'Training not found',
              details: `The selected training program (ID: ${resolvedTrainingId}) does not exist.`
            });
          }

          // Verify trainer assignment
          const trainingAssigned = await TrainingTrainerAssignment.findOne({
            where: { trainingId: resolvedTrainingId, trainerId }
          });
          const hasTrainingAccess = training.trainerId === trainerId || training.createdBy === trainerId || trainingAssigned !== null || req.user.role === 'ADMIN';
          if (!hasTrainingAccess) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
              details: `You are not authorized to generate quizzes for training program (ID: ${resolvedTrainingId}).`
            });
          }
        }

        // Coerce difficulty for prompt generation
        const diffCoerced = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
        const diffUpper = difficulty.toUpperCase();

        console.log(`[aiQuizRoutes] Requesting prompt-quiz generation from AI for: "${prompt}"`);
        const questions = await aiService.generateQuizFromPrompt(prompt.trim(), count, ['Easy', 'Medium', 'Hard'].includes(diffCoerced) ? diffCoerced : 'Medium');

        if (!questions || questions.length === 0) {
          return res.status(502).json({
            error: 'AI service returned no questions',
            details: 'The prompt was processed but the LLM did not produce any usable questions.'
          });
        }

        // Auto-assign training if missing
        if (!resolvedTrainingId) {
          console.log(`[aiQuizRoutes] No trainingId provided — attempting auto-assignment for trainer #${trainerId}`);
          resolvedTrainingId = await resolveTrainingId(trainerId, resolvedTrainingId);
        }

        // Always resolve corresponding courseId if trainingId is present but courseId is not
        if (resolvedTrainingId && !resolvedCourseId) {
          const course = await Course.findOne({ where: { trainingProgramId: resolvedTrainingId } });
          if (course) {
            resolvedCourseId = course.id;
          }
        }

        console.log(`[aiQuizRoutes] Resolved trainingId=${resolvedTrainingId}, courseId=${resolvedCourseId} for quiz creation`);

        // Save Quiz to database
        const quiz = await AIQuiz.create({
          trainerId,
          trainingId: resolvedTrainingId,
          courseId: resolvedCourseId,
          title: `Quiz: ${prompt.trim()}`,
          numQuestions: questions.length,
          difficulty: ['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(diffUpper) ? diffUpper : 'MIXED',
          status: 'DRAFT',
          isPublished: false,
          isActive: true,
          published: false,
          createdBy: trainerId
        });

        console.log(`[aiQuizRoutes] ✅ Quiz #${quiz.id} created as DRAFT — trainingId=${quiz.trainingId}, courseId=${quiz.courseId}, createdBy=${trainerId}`);
        // NOTE: quiz_assignments are created per-participant when trainer clicks "Send Quiz"

        console.log(`[aiQuizRoutes] Saving ${questions.length} prompt-generated questions for quiz #${quiz.id}...`);
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          
          // Extract options and correct answer
          const optionA = q.optionA || q.option_a || '';
          const optionB = q.optionB || q.option_b || '';
          const optionC = q.optionC || q.option_c || '';
          const optionD = q.optionD || q.option_d || '';
          const optionsList = [optionA, optionB, optionC, optionD].filter(Boolean);

          const rawCorrect = q.correctAnswer || q.correct_answer || '';
          
          // Map correct answer text to options index (0-3)
          let correctIdx = 0;
          const idx = optionsList.findIndex(opt => String(opt).trim().toLowerCase() === String(rawCorrect).trim().toLowerCase());
          if (idx >= 0) {
            correctIdx = idx;
          } else if (['0', '1', '2', '3'].includes(String(rawCorrect))) {
            correctIdx = parseInt(rawCorrect, 10);
          } else if (['A', 'B', 'C', 'D'].includes(String(rawCorrect).toUpperCase())) {
            correctIdx = String(rawCorrect).toUpperCase().charCodeAt(0) - 65;
          }

          const savedQuestion = await AIQuestion.create({
            quizId: quiz.id,
            questionText: q.question || q.questionText || `Question ${i + 1}`,
            questionType: 'MCQ',
            options: optionsList,
            correctAnswer: String(correctIdx),
            explanation: q.explanation || '',
            difficulty: q.difficulty || diffUpper || 'MEDIUM',
            order: i
          });

          // Also save to AIQuestionOption table if options exist
          for (let optionIndex = 0; optionIndex < optionsList.length; optionIndex++) {
            await AIQuestionOption.create({
              questionId: savedQuestion.id,
              optionText: String(optionsList[optionIndex]),
              isCorrect: optionIndex === correctIdx,
              order: optionIndex
            });
          }
        }

        await quiz.reload({ include: [{ model: AIQuestion, as: 'questions' }] });

        return res.status(201).json({
          success: true,
          message: `Quiz "${quiz.title}" generated successfully from prompt with ${questions.length} questions`,
          quiz
        });

    } catch (error) {
      console.error('Prompt generation endpoint error:', error.message);
      const statusCode = error.status || 500;
      res.status(statusCode).json({ error: error.message });
    }
    }
  );

  // POST /api/ai-quiz/trainer/upload-document
  router.post('/trainer/upload-document',
    authenticateToken,
    roleMiddleware('TRAINER'),
    upload.single('file'),
    async (req, res) => {
      try {
        const { trainingId, courseId, numQuestions = 10, difficulty = 'MIXED' } = req.body;
        const trainerId = req.user.id;

        // Print received params for debugging as requested
        console.log(`[aiQuizRoutes] Request received: trainingId="${trainingId}" (type: ${typeof trainingId}), courseId="${courseId}" (type: ${typeof courseId}), trainerId="${trainerId}"`);

        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = path.resolve(req.file.path);  // Get absolute path
        const fileType = req.file.mimetype;
        const originalName = req.file.originalname;

        // STRICT validation: Read first bytes to detect image signatures
        try {
          const fileBuffer = fs.readFileSync(filePath);
          
          // Check for image file signatures (magic bytes)
          if (isImageFile(fileBuffer)) {
            // Clean up the uploaded file
            try { fs.unlinkSync(filePath); } catch(e) {}
            return res.status(415).json({ 
              error: 'Images are not supported. Please upload PDF, DOCX, or TXT files only.',
              details: 'The AI model (google/flan-t5-base) does not support image input.'
            });
          }
        } catch (readErr) {
          console.warn('Could not read file for image detection:', readErr.message);
        }

      let content = '';
      try {
        // Ensure we pass absolute path to extractText
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        content = await extractText(absPath, fileType);
      } catch (err) {
        // Clean up file on error
        try { fs.unlinkSync(filePath); } catch(e) {}
        return res.status(400).json({ error: 'Failed to extract text from file: ' + err.message });
      }

      if (!content || content.trim().length < 50) {
        return res.status(400).json({ error: 'Document content too short or empty' });
      }

      // ── Resolve courseId and trainingId ──
      let resolvedCourseId = courseId || null;
      let resolvedTrainingId = trainingId || null;

      // Clean up stringified values
      if (resolvedCourseId === 'undefined' || resolvedCourseId === 'null' || resolvedCourseId === 'NaN' || resolvedCourseId === '') {
        resolvedCourseId = null;
      }
      if (resolvedTrainingId === 'undefined' || resolvedTrainingId === 'null' || resolvedTrainingId === 'NaN' || resolvedTrainingId === '') {
        resolvedTrainingId = null;
      }

      if (resolvedCourseId && resolvedTrainingId && String(resolvedCourseId) === String(resolvedTrainingId)) {
        resolvedCourseId = null;
      }

      // Fallback: If trainingId was passed but no courseId was provided, check if it's actually a courseId or a trainingId.
      if (resolvedTrainingId && !resolvedCourseId) {
        const courseCheck = await Course.findByPk(resolvedTrainingId);
        if (courseCheck) {
          resolvedCourseId = resolvedTrainingId;
          resolvedTrainingId = courseCheck.trainingProgramId;
          console.log(`[aiQuizRoutes] Detected courseId "${resolvedCourseId}" passed in trainingId parameter. Resolved trainingProgramId: "${resolvedTrainingId}"`);
        } else {
          // If it is indeed a trainingId, resolve its associated Course under the new architecture
          const course = await Course.findOne({ where: { trainingProgramId: resolvedTrainingId } });
          if (course) {
            resolvedCourseId = course.id;
            console.log(`[aiQuizRoutes] Resolved courseId "${resolvedCourseId}" from trainingId "${resolvedTrainingId}"`);
          }
        }
      }

      // Perform validation and authorization
      if (resolvedCourseId) {
        const course = await Course.findByPk(resolvedCourseId);
        if (!course) {
          try { fs.unlinkSync(filePath); } catch (e) {}
          return res.status(400).json({
            success: false,
            error: 'Course not found',
            details: `The selected course (ID: ${resolvedCourseId}) does not exist.`
          });
        }

        // Verify trainer assignment
        const courseAssigned = await CourseTrainerAssignment.findOne({
          where: { courseId: resolvedCourseId, trainerId }
        });
        const hasCourseAccess = course.trainerId === trainerId || courseAssigned !== null;
        if (!hasCourseAccess) {
          try { fs.unlinkSync(filePath); } catch (e) {}
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            details: `You are not authorized to generate quizzes for course (ID: ${resolvedCourseId}).`
          });
        }

        resolvedTrainingId = course.trainingProgramId;
      } else if (resolvedTrainingId) {
        const training = await Training.findByPk(resolvedTrainingId);
        if (!training) {
          try { fs.unlinkSync(filePath); } catch (e) {}
          return res.status(400).json({
            success: false,
            error: 'Training not found',
            details: `The selected training program (ID: ${resolvedTrainingId}) does not exist.`
          });
        }

        // Verify trainer assignment
        const trainingAssigned = await TrainingTrainerAssignment.findOne({
          where: { trainingId: resolvedTrainingId, trainerId }
        });
        const hasTrainingAccess = training.trainerId === trainerId || training.createdBy === trainerId || trainingAssigned !== null;
        if (!hasTrainingAccess) {
          try { fs.unlinkSync(filePath); } catch (e) {}
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            details: `You are not authorized to generate quizzes for training program (ID: ${resolvedTrainingId}).`
          });
        }
      }

      // Auto-assign training if still missing
      if (!resolvedTrainingId) {
        console.log(`[aiQuizRoutes/upload] No trainingId provided — attempting auto-assignment for trainer #${trainerId}`);
        resolvedTrainingId = await resolveTrainingId(trainerId, resolvedTrainingId);
      }

      // Always resolve corresponding courseId if trainingId is present but courseId is not
      if (resolvedTrainingId && !resolvedCourseId) {
        const course = await Course.findOne({ where: { trainingProgramId: resolvedTrainingId } });
        if (course) {
          resolvedCourseId = course.id;
        }
      }

      console.log(`[aiQuizRoutes/upload] Resolved trainingId=${resolvedTrainingId}, courseId=${resolvedCourseId}`);

      const document = await AIDocument.create({
        trainerId,
        trainingId: resolvedTrainingId,
        title: req.file.originalname,
        content: content.substring(0, 50000),
        fileUrl: `/uploads/ai-docs/${req.file.filename}`,
        fileType: fileType,
        status: 'PROCESSING'
      });

      const quiz = await AIQuiz.create({
        documentId: document.id,
        trainerId,
        trainingId: resolvedTrainingId,
        courseId: resolvedCourseId,
        title: `Quiz: ${req.file.originalname}`,
        numQuestions: parseInt(numQuestions),
        difficulty,
        status: 'PUBLISHED',
        isPublished: true,
        isActive: true,
        published: true, // legacy compatibility
        publishedAt: new Date(),
        createdBy: trainerId
      });

      console.log(`[aiQuizRoutes/upload] ✅ Quiz #${quiz.id} created — trainingId=${quiz.trainingId}, courseId=${quiz.courseId}, isPublished=${quiz.isPublished}, isActive=${quiz.isActive}, createdBy=${trainerId}`);

      // Create quiz_assignment record
      if (resolvedTrainingId) {
        await ensureQuizAssignment(quiz.id, resolvedTrainingId);
      }

      try {
        // Strip image references that might confuse the AI. Keep newlines and
        // sentence punctuation intact — the Python service does the heavier
        // text normalization, and over-cleaning here was destroying context.
        let cleanContent = content;
        // Remove image filename patterns (image.png, fig1.jpg, etc.)
        cleanContent = cleanContent.replace(/\b(image|img|fig|figure)\d*\.(png|jpg|jpeg|gif|bmp|webp|svg)\b/gi, ' ');
        cleanContent = cleanContent.replace(/\b(image|img|fig|figure)\s*\d+\.(png|jpg|jpeg|gif|bmp|webp|svg)\b/gi, ' ');
        // Remove markdown image tags
        cleanContent = cleanContent.replace(/!\[.*?\]\(.*?\)/g, ' ');
        cleanContent = cleanContent.replace(/\[image:?\s*[^\]]*\]/gi, ' ');
        // Remove "Figure X:" or "Fig. X:" labels
        cleanContent = cleanContent.replace(/\b(figure|fig)\.?\s*\d+[:\-–—]\s*/gi, ' ');
        // Remove file path references to images
        cleanContent = cleanContent.replace(/[C-Z]:\\[^\s]*\.(png|jpg|jpeg|gif|bmp|webp|svg)/gi, ' ');
        cleanContent = cleanContent.replace(/(\/|\\)[^\s]+\.(png|jpg|jpeg|gif|bmp|webp|svg)/gi, ' ');

        console.log('[aiQuizRoutes] Sending', cleanContent.length, 'chars to AI service');
        const result = await aiService.generateQuizFromText(cleanContent, parseInt(numQuestions), difficulty);

        const questions = result.questions || [];
        const quizTitle = result.title || `Quiz: ${req.file.originalname}`;

        // CRITICAL: refuse to save a quiz with zero questions. Previously we
        // happily saved an empty AIQuiz record, leaving the trainer with a
        // useless DRAFT and the participant with "no questions yet" errors.
        if (questions.length === 0) {
          await document.update({ status: 'ERROR' });
          await quiz.destroy();
          return res.status(502).json({
            error: 'AI service returned no questions',
            details: 'The document was processed but the LLM did not produce any usable questions. Please verify the document has enough structured content and that the AI service is reachable.'
          });
        }

        // Update quiz title to whatever the LLM chose
        await quiz.update({ title: quizTitle });

        console.log(`[aiQuizRoutes] Saving ${questions.length} questions for quiz #${quiz.id}...`);
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const saved = await AIQuestion.create({
            quizId: quiz.id,
            questionText: q.questionText,
            questionType: q.questionType || 'MCQ',
            options: q.options || null,
            correctAnswer: String(q.correctAnswer),
            explanation: q.explanation || '',
            difficulty: q.difficulty || difficulty || 'MEDIUM',
            order: i
          });
          console.log(`  ✅ Saved Q${i + 1} (id=${saved.id}) quiz_id=${saved.quizId}: "${q.questionText?.substring(0, 60)}..."`);
        }
        console.log(`[aiQuizRoutes] ✅ All ${questions.length} questions saved for quiz #${quiz.id}`);
        await document.update({ status: 'READY' });
        await quiz.reload({ include: [{ model: AIQuestion, as: 'questions' }] });
        console.log(`[aiQuizRoutes] Quiz reloaded — questions count: ${quiz.questions?.length ?? 0}`);

        res.status(201).json({
          message: `Quiz "${quizTitle}" generated successfully with ${questions.length} questions`,
          quiz
        });
      } catch (err) {
        // Roll the failed quiz back so we don't leak empty DRAFT rows.
        try {
          await document.update({ status: 'ERROR' });
          await quiz.destroy();
          console.warn(`[aiQuizRoutes] Rolled back quiz #${quiz.id} after failure: ${err.message}`);
        } catch (rollbackErr) {
          console.error('[aiQuizRoutes] Rollback failed:', rollbackErr.message);
        }
        return res.status(500).json({ error: 'AI generation failed: ' + err.message });
      }
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/ai-quiz/trainer/quizzes
router.get('/trainer/quizzes',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const quizzes = await AIQuiz.findAll({
        where: { trainerId: req.user.id },
        include: [
          { model: AIQuestion, as: 'questions' },
          { model: AIDocument, as: 'document' },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ],
        order: [['created_at', 'DESC']]
      });
      res.json({ quizzes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PUT /api/ai-quiz/trainer/quiz/:id
router.put('/trainer/quiz/:id',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const quiz = await AIQuiz.findOne({
        where: { id: req.params.id, trainerId: req.user.id }
      });
      if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

      const {
        title, timeLimit, status,
        showResultImmediately, showCorrectAnswersOnResult, shuffleQuestions,
        allowMultipleAttempts, maxAttempts, difficulty, isMandatory,
        copyProtectionEnabled, maxCopyWarnings, copyViolationActions,
        copyWarningMessage, copyDisqualifyAction,
        proctoringLevel, gracePeriodMinutes, proctoringEnabled
      } = req.body;
      const update = {};
      if (title !== undefined) update.title = title;
      if (timeLimit !== undefined) update.timeLimit = timeLimit ? parseInt(timeLimit) : null;
      if (status && ['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) update.status = status;
      if (showResultImmediately !== undefined) update.showResultImmediately = showResultImmediately;
      if (showCorrectAnswersOnResult !== undefined) update.showCorrectAnswersOnResult = showCorrectAnswersOnResult;
      if (shuffleQuestions !== undefined) update.shuffleQuestions = shuffleQuestions;
      if (allowMultipleAttempts !== undefined) update.allowMultipleAttempts = allowMultipleAttempts;
      if (maxAttempts !== undefined) update.maxAttempts = parseInt(maxAttempts);
      if (difficulty !== undefined) update.difficulty = difficulty;
      if (isMandatory !== undefined) update.isMandatory = isMandatory;
      if (copyProtectionEnabled !== undefined) update.copyProtectionEnabled = copyProtectionEnabled;
      if (maxCopyWarnings !== undefined) update.maxCopyWarnings = parseInt(maxCopyWarnings);
      if (copyViolationActions !== undefined) update.copyViolationActions = copyViolationActions;
      if (copyWarningMessage !== undefined) update.copyWarningMessage = copyWarningMessage;
      if (copyDisqualifyAction !== undefined) update.copyDisqualifyAction = copyDisqualifyAction;
      if (proctoringLevel !== undefined) update.proctoringLevel = proctoringLevel;
      if (gracePeriodMinutes !== undefined) update.gracePeriodMinutes = parseInt(gracePeriodMinutes);
      if (proctoringEnabled !== undefined) update.proctoringEnabled = proctoringEnabled;

      await quiz.update(update);
      res.json({ message: 'Quiz updated', quiz });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// DELETE /api/ai-quiz/trainer/quiz/:id
router.delete('/trainer/quiz/:id',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const { QuizAssignment, QuizAttempt, QuizAnswer, QuizResult, AIQuestion, AIQuestionOption, AIDocument } = require('../models');
      const quiz = await AIQuiz.findOne({
        where: { id: req.params.id, trainerId: req.user.id }
      });
      if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

      const quizId = quiz.id;

      // Delete in dependency order
      const attempts = await QuizAttempt.findAll({ where: { quizId } });
      for (const attempt of attempts) {
        await QuizAnswer.destroy({ where: { attemptId: attempt.id } });
        await QuizResult.destroy({ where: { attemptId: attempt.id } });
      }
      await QuizAttempt.destroy({ where: { quizId } });
      await QuizResult.destroy({ where: { quizId } });
      await QuizAssignment.destroy({ where: { quizId } });

      const questions = await AIQuestion.findAll({ where: { quizId } });
      for (const q of questions) {
        await AIQuestionOption.destroy({ where: { questionId: q.id } });
      }
      await AIQuestion.destroy({ where: { quizId } });
      await quiz.destroy();

      console.log(`[DELETE quiz] ✅ Quiz #${quizId} and all related records deleted by trainer #${req.user.id}`);
      res.json({ success: true, message: 'Quiz deleted successfully' });
    } catch (error) {
      console.error('[DELETE quiz] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/ai-quiz/trainer/quiz/:id/send
// POST /api/ai-quiz/trainer/quiz/:id/send
// Assigns quiz to ALL participants enrolled in the quiz's training/course,
// then marks the quiz as PUBLISHED so participants can see it.
router.post('/trainer/quiz/:id/send',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const { Enrollment, QuizAssignment, Course } = require('../models');
      const { Op } = require('sequelize');

      const quiz = await AIQuiz.findOne({
        where: { id: req.params.id, trainerId: req.user.id }
      });
      if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

      if (!quiz.courseId && !quiz.trainingId) {
        return res.status(400).json({ error: 'Quiz has no training or course association. Cannot determine participants.' });
      }

      // Collect all course IDs that belong to this training
      let courseIds = quiz.courseId ? [quiz.courseId] : [];
      if (quiz.trainingId && !quiz.courseId) {
        const relatedCourses = await Course.findAll({
          where: { trainingProgramId: quiz.trainingId },
          attributes: ['id']
        });
        courseIds = relatedCourses.map(c => c.id);
      }

      // Build OR conditions for enrollment lookup
      const enrollmentOrConditions = [];
      if (quiz.trainingId) {
        enrollmentOrConditions.push({ trainingId: quiz.trainingId });
      }
      if (courseIds.length > 0) {
        enrollmentOrConditions.push({ courseId: courseIds });
      }

      const enrollments = await Enrollment.findAll({
        where: {
          status: { [Op.in]: ['ENROLLED', 'COMPLETED', 'PENDING'] },
          [Op.or]: enrollmentOrConditions.length > 0 ? enrollmentOrConditions : [{ id: null }]
        },
        attributes: ['participantId'],
      });

      // Deduplicate participant IDs
      const participantIds = [...new Set(enrollments.map(e => String(e.participantId)))];
      console.log(`[send quiz] Quiz #${quiz.id} — found ${participantIds.length} enrolled participants`);

      if (participantIds.length === 0) {
        // Still publish the quiz so it shows up once someone enrolls
        await quiz.update({
          isPublished: true,
          published: true,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        });
        return res.json({
          success: true,
          message: 'Quiz published. No enrolled participants found yet — they will see it when they enroll.',
          participantCount: 0,
        });
      }

      // Upsert one quiz_assignment row per participant
      let assignedCount = 0;
      for (const participantId of participantIds) {
        const [, created] = await QuizAssignment.findOrCreate({
          where: { quizId: quiz.id, participantId },
          defaults: { quizId: quiz.id, participantId, status: 'PENDING' },
        });
        if (created) assignedCount++;
      }

      // Mark quiz as PUBLISHED
      await quiz.update({
        isPublished: true,
        published: true,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });

      // Emit real-time update so participant dashboards refresh
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('quiz:published', { quizId: quiz.id, trainingId: quiz.trainingId });
        }
      } catch (_) {}

      console.log(`[send quiz] ✅ Quiz #${quiz.id} published. Assigned to ${assignedCount} new participants (${participantIds.length} total enrolled).`);
      res.json({
        success: true,
        message: `Quiz sent to ${participantIds.length} participant(s)`,
        participantCount: participantIds.length,
        newAssignments: assignedCount,
      });
    } catch (error) {
      console.error('[send quiz] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/ai-quiz/trainer/quiz/:id/publish-result
// Reveals scores and correct answers to participants.
router.post('/trainer/quiz/:id/publish-result',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const quiz = await AIQuiz.findOne({
        where: { id: req.params.id, trainerId: req.user.id }
      });
      if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
      if (!quiz.isPublished) {
        return res.status(400).json({ error: 'Quiz must be sent to participants before publishing results.' });
      }

      const now = new Date();
      await QuizResult.update(
        { resultPublished: true, publishedAt: now, publishedBy: req.user.id },
        { where: { quizId: quiz.id } }
      );

      await quiz.update({
        isResultPublished: true,
        resultPublishedAt: now,
        resultStatus: 'PUBLISHED',
      });

      // Emit real-time update
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('quiz:results:published', { quizId: quiz.id, trainingId: quiz.trainingId });
        }
      } catch (_) {}

      console.log(`[publish-result] ✅ Results published for quiz #${quiz.id} by trainer #${req.user.id}`);
      res.json({ success: true, message: 'Results published. Participants can now view their scores.' });
    } catch (error) {
      console.error('[publish-result] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/ai-quiz/participant/start/:quizId
router.post('/participant/start/:quizId',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const { Course, Training, QuizAssignment } = require('../models');

      // Check if any completed/disqualified attempt already exists to prevent duplicate attempt records
      const existingAttempt = await QuizAttempt.findOne({
        where: { 
          quizId: req.params.quizId, 
          participantId: req.user.id,
          status: { [Op.ne]: 'IN_PROGRESS' }
        }
      });
      if (existingAttempt) {
        console.log(`[aiQuiz/start] Rejecting start: attempt already exists for quiz #${req.params.quizId}, participant #${req.user.id}`);
        return res.status(400).json({
          success: false,
          message: "You have already attempted this quiz."
        });
      }

      const quiz = await AIQuiz.findOne({
        where: { id: req.params.quizId, status: 'PUBLISHED' },
        include: [
          { model: AIQuestion, as: 'questions' },
          { model: Course, as: 'course', include: [{ model: Training, as: 'program' }] }
        ]
      });

      if (!quiz) return res.status(404).json({ error: 'Quiz not found or not available' });

      // Verify participant has access — either via QuizAssignment or enrollment
      let assignment = await QuizAssignment.findOne({
        where: { quizId: quiz.id, participantId: req.user.id, status: 'PENDING' }
      });

      // Fallback: check if participant is enrolled in the quiz's course/training
      if (!assignment) {
        const { Enrollment } = require('../models');
        const enrollmentCheck = await Enrollment.findOne({
          where: {
            participantId: req.user.id,
            status: 'ENROLLED',
            [Op.or]: [
              ...(quiz.courseId ? [{ courseId: quiz.courseId }] : []),
              ...(quiz.trainingId ? [{ trainingId: quiz.trainingId }] : []),
            ]
          }
        });
        if (!enrollmentCheck) {
          return res.status(403).json({ error: 'This quiz has not been assigned to you' });
        }
        // Create a pending QuizAssignment on-the-fly for tracking
        assignment = await QuizAssignment.create({
          quizId: quiz.id,
          participantId: req.user.id,
          status: 'PENDING'
        });
        console.log(`[participant/start] Created QuizAssignment on-the-fly for participant #${req.user.id}, quiz #${quiz.id}`);
      }

      // Check if attempt already exists
      const { QuizAttempt } = require('../models');
      const activeAttempt = await QuizAttempt.findOne({
        where: { quizId: quiz.id, participantId: req.user.id }
      });

      if (!activeAttempt) {
        // Time window check on the quiz itself
        const now = new Date();
        if (quiz.startTime && now < new Date(quiz.startTime)) {
          return res.status(403).json({ error: 'Quiz is not yet available' });
        }
        if (quiz.endTime && now > new Date(quiz.endTime)) {
          return res.status(403).json({ error: 'Quiz availability window has ended' });
        }

        // Training dates check
        const training = quiz.course?.program || (quiz.trainingId ? await Training.findByPk(quiz.trainingId) : null);
        if (training) {
          if (training.startDate && now < new Date(training.startDate)) {
            return res.status(403).json({ error: 'Quiz is not yet available (training program has not started)' });
          }
          if (training.endDate && now > new Date(training.endDate)) {
            return res.status(403).json({ error: 'Quiz is no longer available (training program has ended)' });
          }
        }
      }

      console.log(`[participant/start] Quiz #${quiz.id} "${quiz.title}" has ${quiz.questions?.length ?? 0} questions`);

      if (!quiz.questions || quiz.questions.length === 0) {
        return res.status(422).json({ error: 'This quiz has no questions yet. Please contact your trainer.' });
      }

      // ── Secure assessment session lock ────────────────────────────────
      // The frontend (new gate flow) supplies deviceFingerprint in the body;
      // legacy / proctoring callers may omit it. We treat a missing
      // fingerprint as "permissive" (skip device-conflict check) so that
      // existing flows aren't broken.
      const crypto = require('crypto');
      const { Op } = require('sequelize');
      const { AssessmentSession } = require('../models');

      const ipAddress = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      const userAgent = (req.headers['user-agent'] || '').slice(0, 1024);
      const deviceFingerprint = (req.body?.deviceFingerprint || '').toString().slice(0, 512) || null;

      // Compute expiry: timeLimit minutes + 15 min buffer; fallback 3 h.
      const minutes = Number.isFinite(quiz.timeLimit) && quiz.timeLimit > 0 ? quiz.timeLimit : 0;
      const ttlMs = minutes > 0 ? (minutes + 15) * 60_000 : 3 * 60 * 60_000;
      const expiresAt = new Date(now.getTime() + ttlMs);

      // Check existing active session for THIS user + quiz.
      const activeForUser = await AssessmentSession.findOne({
        where: {
          participantId: req.user.id,
          quizId: quiz.id,
          status: 'ACTIVE',
          expiresAt: { [Op.gt]: now },
        },
        order: [['locked_at', 'DESC']],
      });

      // Resume an existing in-progress attempt if one exists.
      const existing = await QuizAttempt.findOne({
        where: { quizId: quiz.id, participantId: req.user.id, status: 'IN_PROGRESS' }
      });

      if (existing) {
        // We're resuming. If a session row exists for this attempt, decide
        // whether the calling device is allowed to use it.
        let session = activeForUser && activeForUser.attemptId === existing.id
          ? activeForUser
          : await AssessmentSession.findOne({ where: { attemptId: existing.id, status: 'ACTIVE' } });

        if (session) {
          const fpMatches =
            !session.deviceFingerprint ||
            !deviceFingerprint ||
            session.deviceFingerprint === deviceFingerprint;
          const ipMatches =
            !session.ipAddress || !ipAddress || session.ipAddress === ipAddress;

          if (fpMatches && ipMatches) {
            console.log(`[participant/start] Resuming attempt #${existing.id} with existing session #${session.id}`);
            console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${existing.id} status set to IN_PROGRESS at ${new Date().toISOString()}`);
            return res.json({
              attemptId: existing.id,
              quiz,
              sessionToken: session.sessionToken,
              violationCount: existing.violationCount || 0
            });
          }

          // Device conflict — only refuse if the caller actually sent a
          // fingerprint (so legacy clients still work).
          if (deviceFingerprint) {
            console.warn(`[participant/start] Device conflict for user #${req.user.id} on quiz #${quiz.id} — refusing with 423`);
            return res.status(423).json({
              error: 'SESSION_LOCKED',
              message:
                'This assessment is already active on another device. Please contact the administrator for device change approval.',
              lockedAt: session.lockedAt,
              sessionId: session.id,
            });
          }
        }

        // Find existing session for the attempt (Active, Expired, or Reset)
        session = await AssessmentSession.findOne({ where: { attemptId: existing.id } });
        const newToken = crypto.randomBytes(32).toString('hex');

        if (session) {
          console.log(`[aiQuizRoutes/start] Found existing session #${session.id} for attempt #${existing.id}. Updating...`);
          await session.update({
            quizId: quiz.id,
            participantId: req.user.id,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            deviceFingerprint,
            sessionToken: newToken,
            status: 'ACTIVE',
            lockedAt: now,
            expiresAt,
          });
          console.log(`[aiQuizRoutes/start] Successfully updated session #${session.id}`);
        } else {
          console.log(`[aiQuizRoutes/start] No existing session found for attempt #${existing.id}. Creating...`);
          session = await AssessmentSession.create({
            attemptId: existing.id,
            quizId: quiz.id,
            participantId: req.user.id,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            deviceFingerprint,
            sessionToken: newToken,
            status: 'ACTIVE',
            lockedAt: now,
            expiresAt,
          });
          console.log(`[aiQuizRoutes/start] Successfully created session #${session.id}`);
        }
        console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${existing.id} status set to IN_PROGRESS at ${new Date().toISOString()}`);
        return res.json({ attemptId: existing.id, quiz, sessionToken: session.sessionToken, violationCount: existing.violationCount || 0 });
      }

      // No existing attempt — but maybe a session row for a new quiz exists
      // already from another device. Honor the same conflict rule.
      if (activeForUser && deviceFingerprint && activeForUser.deviceFingerprint && activeForUser.deviceFingerprint !== deviceFingerprint) {
        return res.status(423).json({
          error: 'SESSION_LOCKED',
          message:
            'This assessment is already active on another device. Please contact the administrator for device change approval.',
          lockedAt: activeForUser.lockedAt,
          sessionId: activeForUser.id,
        });
      }

      const attempt = await QuizAttempt.create({
        quizId: quiz.id,
        participantId: req.user.id,
        status: 'IN_PROGRESS'
      });
      console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status set to IN_PROGRESS at ${new Date().toISOString()}`);

      const sessionToken = crypto.randomBytes(32).toString('hex');
      await AssessmentSession.create({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId: req.user.id,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        deviceFingerprint,
        sessionToken,
        status: 'ACTIVE',
        lockedAt: now,
        expiresAt,
      });

      console.log(`[participant/start] Created attempt #${attempt.id} + session for quiz #${quiz.id}`);
      res.status(201).json({ attemptId: attempt.id, quiz, sessionToken });
    } catch (error) {
      console.error('[participant/start] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/ai-quiz/participant/submit/:attemptId
// Optional session lock: when X-Assessment-Session header is present we
// validate it via validateAssessmentSession. Legacy callers (proctoring,
// older clients) that don't send the header are unaffected.
const validateAssessmentSession = require('../middleware/validateAssessmentSession');
const optionalAssessmentSession = (req, res, next) => {
  if (req.headers['x-assessment-session'] || req.headers['X-Assessment-Session']) {
    return validateAssessmentSession(req, res, next);
  }
  return next();
};

router.post('/participant/submit/:attemptId',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  optionalAssessmentSession,
  async (req, res) => {
    try {
      const { answers } = req.body;
      if (!Array.isArray(answers)) {
        return res.status(422).json({ error: 'answers[] is required' });
      }

      await sequelize.transaction(async (t) => {
        const attempt = await QuizAttempt.findOne({
          where: { id: req.params.attemptId, participantId: req.user.id },
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (!attempt) {
          const err = new Error('Attempt not found');
          err.status = 404;
          throw err;
        }

        if (attempt.status !== 'IN_PROGRUS') {
          const err = new Error('Quiz has already been submitted');
          err.status = 409;
          throw err;
        }

        const { Course, Training } = require('../models');
        const quiz = await AIQuiz.findByPk(attempt.quizId, {
          include: [
            { model: AIQuestion, as: 'questions' },
            { model: Course, as: 'course', include: [{ model: Training, as: 'program' }] }
          ],
          transaction: t
        });

        if (!quiz || (quiz.status !== 'PUBLISHED' && quiz.status !== 'CLOSED')) {
          const err = new Error('Quiz is not available for submission');
          err.status = 403;
          throw err;
        }

        // Check availability
        const training = quiz.course?.program || (quiz.trainingId ? await Training.findByPk(quiz.trainingId, { transaction: t }) : null);
        if (training) {
          const now = new Date();
          if (training.startDate && now < new Date(training.startDate)) {
            const err = new Error('Quiz is not yet available (training program has not started)');
            err.status = 403;
            throw err;
          }
        }

        // Wipe any prior partial answers for this attempt then recreate.
        await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction: t });

        let totalScore = 0;
        let maxScore = 0;
        const questionsMap = {};
        quiz.questions.forEach(q => { questionsMap[q.id] = q; maxScore += (q.marks || 1); });

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
            const evaluation = await aiService.evaluateShortAnswer(
              question.questionText,
              question.correctAnswer,
              ans.answerText || ''
            );
            score = evaluation.score || 0;
            feedback = evaluation.feedback || '';
            isCorrect = evaluation.isCorrect || false;
          }

          await QuizAnswer.create({
            attemptId: attempt.id,
            questionId: ans.questionId,
            answerText: ans.answerText || '',
            selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
            isCorrect,
            score,
            feedback,
            evaluatedByAI: true
          }, { transaction: t });

          totalScore += score;
        }

        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
        const submittedAt = new Date();
        let timeTaken = null;
        try {
          if (attempt.startedAt) {
            timeTaken = Math.max(0, Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
          }
        } catch (e) { /* non-fatal */ }

        await attempt.update({
          status: 'SUBMITTED',
          submittedAt,
          ...(timeTaken != null ? { timeTaken } : {})
        }, { transaction: t });
        console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status changed to SUBMITTED at ${submittedAt.toISOString()}`);

        await QuizResult.create({
          attemptId: attempt.id,
          quizId: quiz.id,
          participantId: req.user.id,
          totalScore,
          maxScore,
          percentage,
          evaluatedAt: submittedAt,
          resultPublished: false
        }, { transaction: t });

        // Mark quiz_assignment as COMPLETED
        const { QuizAssignment } = require('../models');
        await QuizAssignment.update(
          { status: 'COMPLETED' },
          { where: { quizId: quiz.id, participantId: req.user.id }, transaction: t }
        );
        console.log(`[submit] ✅ Quiz assignment marked COMPLETED for participant #${req.user.id}, quiz #${quiz.id}`);

        // Mark the assessment session EXPIRED
        if (req.assessmentSession) {
          await req.assessmentSession.update({ status: 'EXPIRED' }, { transaction: t });
        }
      });

      res.json({
        success: true,
        message: 'Quiz submitted successfully. Please wait for trainer to publish results.',
        status: 'PENDING_RESULT'
      });
    } catch (error) {
      console.error('Submit error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/ai-quiz/leaderboard/:quizId
// Only returns published results (resultPublished=true).
router.get('/leaderboard/:quizId',
  authenticateToken,
  async (req, res) => {
    try {
      const results = await QuizResult.findAll({
        where: { quizId: req.params.quizId, resultPublished: true },
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name'] }
        ],
        order: [['percentage', 'DESC']]
      });

      const leaderboard = results.map((r, idx) => ({
        rank: idx + 1,
        userId: r.participantId,
        name: r.participant?.name || 'Unknown',
        score: parseFloat(r.percentage),
        totalScore: parseFloat(r.totalScore),
        maxScore: parseFloat(r.maxScore)
      }));

      res.json({ leaderboard: leaderboard.slice(0, 50) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/ai-quiz/participant/quizzes
// Available → PENDING quiz_assignments (with status=PUBLISHED, within time window).
// Completed → COMPLETED quiz_assignments. Results only visible when status=RESULTS_PUBLISHED
// or showResultImmediately=true.
router.get('/participant/quizzes',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const { QuizAssignment, AIQuestion, Training, QuizResult, Enrollment, Course } = require('../models');

      const participantId = req.user.id;
      const now = new Date();

      // Find pending assignments
      const pendingAssignments = await QuizAssignment.findAll({
        where: { participantId, status: 'PENDING' },
        attributes: ['quizId']
      });

      // Find completed assignments
      const completedAssignments = await QuizAssignment.findAll({
        where: { participantId, status: 'COMPLETED' },
        attributes: ['quizId']
      });

      const pendingQuizIds = pendingAssignments.map(a => a.quizId);
      const completedQuizIds = completedAssignments.map(a => a.quizId);

      // ── Enrollment-based fallback ────────────────────────────────────
      // If no assignments exist yet (quiz was published without per-participant
      // assignments), find quizzes via the participant's enrolled courses.
      const enrollments = await Enrollment.findAll({
        where: { participantId, status: 'ENROLLED' },
        attributes: ['courseId', 'trainingId']
      });
      const enrolledCourseIds = [...new Set(enrollments.map(e => e.courseId).filter(Boolean))];
      const enrolledTrainingIds = [...new Set(enrollments.map(e => e.trainingId).filter(Boolean))];

      // Compute completed quiz IDs (for exclusion from available + display in completed)
      const participantResults = await QuizResult.findAll({
        where: { participantId },
        attributes: ['quizId'],
      });
      const allAttempts = await QuizAttempt.findAll({
        where: { participantId },
        attributes: ['quizId']
      });
      const attemptedQuizIds = allAttempts.map(a => a.quizId);

      const allQuizIdsForParticipant = new Set([
        ...completedQuizIds,
        ...attemptedQuizIds,
        ...participantResults.map(r => r.quizId)
      ]);
      const completedQuizIdArray = [...allQuizIdsForParticipant];

      // Available quizzes: PUBLISHED + within time window + not yet completed
      const quizWherePublished = {
        status: 'PUBLISHED',
        isActive: true,
        [Op.and]: [
          sequelize.where(sequelize.fn('COALESCE', sequelize.col('start_time'), sequelize.fn('NOW')), '<=', now),
          sequelize.where(sequelize.fn('COALESCE', sequelize.col('end_time'), sequelize.fn('NOW')), '>=', now),
        ]
      };

      const enrolledOrConds = [];
      if (pendingQuizIds.length > 0) enrolledOrConds.push({ id: pendingQuizIds });
      if (enrolledCourseIds.length > 0) enrolledOrConds.push({ courseId: enrolledCourseIds });
      if (enrolledTrainingIds.length > 0) enrolledOrConds.push({ trainingId: enrolledTrainingIds });

      const availableWhere = { ...quizWherePublished, [Op.or]: enrolledOrConds };
      if (completedQuizIdArray.length > 0) availableWhere.id = { [Op.notIn]: completedQuizIdArray };

      const quizzes = enrolledOrConds.length > 0
        ? await AIQuiz.findAll({
            where: availableWhere,
            include: [
              { model: AIQuestion, as: 'questions', attributes: ['id', 'questionText', 'questionType', 'options', 'difficulty', 'order', 'marks'] },
              { model: Training, as: 'training', attributes: ['id', 'title'] }
            ],
            order: [['created_at', 'DESC']]
          })
        : [];

      // Completed quizzes
      let completedQuizzes = [];
      if (completedQuizIdArray.length > 0) {
        const quizRows = await AIQuiz.findAll({
          where: { id: completedQuizIdArray, isActive: true },
          include: [
            { model: AIQuestion, as: 'questions', attributes: ['id', 'questionText', 'questionType', 'options', 'difficulty', 'order', 'marks'] },
            { model: Training, as: 'training', attributes: ['id', 'title'] }
          ],
          order: [['created_at', 'DESC']]
        });

        const resultRows = await QuizResult.findAll({
          where: { participantId, quizId: completedQuizIdArray },
          attributes: ['quizId', 'percentage', 'totalScore', 'maxScore', 'evaluatedAt', 'resultPublished'],
          order: [['percentage', 'DESC']]
        });
        const bestResultByQuiz = {};
        for (const r of resultRows) {
          if (!bestResultByQuiz[r.quizId]) {
            bestResultByQuiz[r.quizId] = {
              percentage: parseFloat(r.percentage),
              totalScore: parseFloat(r.totalScore),
              maxScore: parseFloat(r.maxScore),
              evaluatedAt: r.evaluatedAt,
              resultPublished: r.resultPublished,
            };
          }
        }

        completedQuizzes = quizRows.map(q => {
          const json = q.toJSON();
          const result = bestResultByQuiz[q.id] || null;
          // Show result if either: quiz has showResultImmediately (legacy), OR per-result is published
          const canSeeResult = q.showResultImmediately === true || (result?.resultPublished === true);
          return {
            ...json,
            myResult: canSeeResult ? result : null,
            completionPercent: result?.percentage ?? 100,
            _resultLocked: !canSeeResult,
            isCompleted: true,
          };
        });
      }

      console.log(`[participant/quizzes] Available: ${quizzes.length}, Completed: ${completedQuizzes.length}`);

      res.json({ quizzes, completedQuizzes });
    } catch (error) {
      console.error('[participant/quizzes] Error:', error.message);
      console.error('[participant/quizzes] Stack:', error.stack);
      res.status(500).json({ error: error.message });
    }
  }
);


// ════════════════════════════════════════════════════════════════════════════
// PARTICIPANT ANALYTICS & GLOBAL LEADERBOARD (additive — student dashboard)
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai-quiz/participant/stats
 * Aggregated quiz performance for the authenticated participant.
 * Returns: totalQuizzes, averageScore, bestRank, bestScore, accuracyTrend[], breakdownByQuiz[]
 */
router.get('/participant/stats',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const { Op, fn, col, literal } = require('sequelize');
      const { QuizAttempt, QuizResult, AIQuiz } = require('../models');
      const userId = req.user.id;

      // Count of all submitted attempts (regardless of whether results are published)
      const totalQuizzes = await QuizAttempt.count({
        where: {
          participantId: userId,
          status: { [Op.in]: ['SUBMITTED', 'EVALUATED', 'COMPLETED', 'GRADED'] }
        }
      });

      // Only published results appear in participant analytics
      const myResults = await QuizResult.findAll({
        where: { participantId: userId, resultPublished: true },
        include: [{ model: AIQuiz, as: 'quiz', attributes: ['id', 'title', 'trainingId'] }],
        order: [['evaluated_at', 'ASC']]
      });

      const publishedCount = myResults.length;
      const averageScore = publishedCount > 0
        ? Number((myResults.reduce((s, r) => s + parseFloat(r.percentage), 0) / publishedCount).toFixed(2))
        : 0;
      const bestScore = publishedCount > 0
        ? Number(Math.max(...myResults.map(r => parseFloat(r.percentage))).toFixed(2))
        : 0;

      // Compute current rank in each quiz the user has taken, then take the lowest (best)
      let bestRank = null;
      const breakdownByQuiz = [];
      const seenQuizIds = new Set();
      for (const r of myResults) {
        if (seenQuizIds.has(r.quizId)) continue;
        seenQuizIds.add(r.quizId);

        // Use the participant's BEST percentage on this quiz when computing rank
        const myBest = Math.max(
          ...myResults.filter(x => x.quizId === r.quizId).map(x => parseFloat(x.percentage))
        );
        const higherCount = await QuizResult.count({
          where: { quizId: r.quizId, percentage: { [Op.gt]: myBest }, resultPublished: true },
          distinct: true,
          col: 'participantId'
        });
        const rank = higherCount + 1;
        if (bestRank === null || rank < bestRank) bestRank = rank;

        breakdownByQuiz.push({
          quizId: r.quizId,
          title: r.quiz?.title || 'Quiz',
          bestScore: Number(myBest.toFixed(2)),
          rank,
          attempts: myResults.filter(x => x.quizId === r.quizId).length,
        });
      }

      // Accuracy trend — score vs. evaluated date (most recent 14 attempts)
      const trend = myResults
        .slice(-14)
        .map((r) => ({
          date: r.evaluatedAt ? new Date(r.evaluatedAt).toISOString().slice(0, 10) : null,
          score: Number(parseFloat(r.percentage).toFixed(2)),
          quizTitle: r.quiz?.title || 'Quiz',
        }))
        .filter(x => x.date != null);

      res.json({
        stats: {
          totalQuizzes,
          averageScore,
          bestRank,
          bestScore,
          accuracyTrend: trend,
          breakdownByQuiz,
        }
      });
    } catch (error) {
      console.error('[participant/stats] Error:', error.message);
      res.status(500).json({ error: 'Server error fetching stats' });
    }
  }
);

/**
 * GET /api/ai-quiz/participant/global-leaderboard
 *   ?scope=global|training|quiz
 *   &id=<trainingId|quizId>   (required when scope != global)
 *
 * Returns the top-50 participants for that scope, with rank, score (best %),
 * accuracy, time taken (best attempt), and avatar initials.
 */
router.get('/participant/global-leaderboard',
  authenticateToken,
  async (req, res) => {
    try {
      const { Op } = require('sequelize');
      const scope = (req.query.scope || 'global').toLowerCase();
      const id = req.query.id ? String(req.query.id) : null;

      // Build the where-clause for QuizResult — only published results appear
      const where = { resultPublished: true };
      if (scope === 'quiz' && id) {
        where.quizId = id;
      } else if (scope === 'training' && id) {
        const trainingQuizzes = await AIQuiz.findAll({
          where: { trainingId: id },
          attributes: ['id']
        });
        const ids = trainingQuizzes.map(q => q.id);
        if (ids.length === 0) return res.json({ leaderboard: [] });
        where.quizId = ids;
      }

      // Pull all results in scope, then group by participant taking their BEST
      const rows = await QuizResult.findAll({
        where,
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'profilePic'] },
          { model: QuizAttempt, as: 'attempt', attributes: ['id', 'timeTaken'], required: false }
        ],
        order: [['percentage', 'DESC']]
      });

      // Aggregate per participant — pick best %, with tie-break on shortest timeTaken
      const byUser = new Map();
      for (const r of rows) {
        const uid = r.participantId;
        const score = parseFloat(r.percentage);
        const timeTaken = r.attempt?.timeTaken ?? null;
        const accuracy = r.maxScore > 0 ? Number(((parseFloat(r.totalScore) / parseFloat(r.maxScore)) * 100).toFixed(1)) : score;
        const existing = byUser.get(uid);
        if (
          !existing ||
          score > existing.score ||
          (score === existing.score && timeTaken != null && (existing.timeTaken == null || timeTaken < existing.timeTaken))
        ) {
          byUser.set(uid, {
            userId: uid,
            name: r.participant?.name || 'Unknown',
            avatar: r.participant?.profilePic || null,
            score: Number(score.toFixed(2)),
            accuracy,
            timeTaken,                       // seconds (or null)
            attempts: (existing?.attempts || 0) + 1
          });
        } else {
          existing.attempts += 1;
        }
      }

      const sorted = Array.from(byUser.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.timeTaken == null && b.timeTaken == null) return 0;
        if (a.timeTaken == null) return 1;
        if (b.timeTaken == null) return -1;
        return a.timeTaken - b.timeTaken;
      });

      const leaderboard = sorted.slice(0, 50).map((entry, idx) => ({
        rank: idx + 1,
        ...entry,
        isCurrentUser: entry.userId === req.user.id,
      }));

      res.json({ scope, id, leaderboard });
    } catch (error) {
      console.error('[participant/global-leaderboard] Error:', error.message);
      res.status(500).json({ error: 'Server error fetching leaderboard' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — assessment session management (locked sessions + reset override)
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai-quiz/admin/locked-sessions
 * Returns every ACTIVE session for the admin/trainer panel.
 * Includes participant + quiz lookups for display.
 */
router.get('/admin/locked-sessions',
  authenticateToken,
  roleMiddleware('ADMIN', 'TRAINER'),
  async (req, res) => {
    try {
      const { Op } = require('sequelize');
      const { AssessmentSession } = require('../models');

      const rows = await AssessmentSession.findAll({
        where: {
          status: 'ACTIVE',
          expiresAt: { [Op.gt]: new Date() },
        },
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
          { model: AIQuiz, as: 'quiz', attributes: ['id', 'title'] },
        ],
        order: [['locked_at', 'DESC']],
      });

      const sessions = rows.map((s) => ({
        id: s.id,
        attemptId: s.attemptId,
        participantId: s.participantId,
        participantName: s.participant?.name || 'Unknown',
        participantEmail: s.participant?.email || '',
        quizId: s.quizId,
        quizTitle: s.quiz?.title || `Quiz #${s.quizId}`,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceFingerprint: s.deviceFingerprint,
        lockedAt: s.lockedAt,
        expiresAt: s.expiresAt,
        status: s.status,
      }));

      res.json({ sessions });
    } catch (err) {
      console.error('[admin/locked-sessions] Error:', err.message);
      res.status(500).json({ error: 'Server error fetching sessions' });
    }
  }
);

/**
 * POST /api/ai-quiz/admin/reset-session/:sessionId
 * Body: { reason?: string }
 * Marks the session RESET so the participant can restart from a new device.
 */
router.post('/admin/reset-session/:sessionId',
  authenticateToken,
  roleMiddleware('ADMIN', 'TRAINER'),
  async (req, res) => {
    try {
      const { AssessmentSession } = require('../models');
      const id = req.params.sessionId;
      const reason = (req.body?.reason || '').toString().slice(0, 500);

      const session = await AssessmentSession.findByPk(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      if (session.status === 'RESET') {
        return res.status(409).json({ error: 'Session has already been reset' });
      }

      await session.update({
        status: 'RESET',
        resetByAdmin: req.user.id,
        resetAt: new Date(),
      });

      console.log(`[admin/reset-session] session #${id} reset by user #${req.user.id}${reason ? ' — reason: ' + reason : ''}`);
      res.json({
        message: 'Session reset successfully. Participant may now restart on a new device.',
        sessionId: session.id,
      });
    } catch (err) {
      console.error('[admin/reset-session] Error:', err.message);
      res.status(500).json({ error: 'Server error resetting session' });
    }
  }
);

// Helper: create per-participant QuizAssignment records for all enrolled participants
async function ensureQuizAssignment(quizId, trainingId) {
  if (!quizId) return;
  if (!trainingId) {
    console.log(`[quizAssignment] Skipping — no trainingId for quiz #${quizId}`);
    return;
  }
  const { Enrollment } = require('../models');
  const enrollments = await Enrollment.findAll({
    where: { trainingId, status: 'ENROLLED' }
  });
  if (enrollments.length === 0) {
    console.log(`[quizAssignment] No enrolled participants for training #${trainingId}`);
    return;
  }
  const now = new Date();
  let count = 0;
  for (const enrollment of enrollments) {
    try {
      await QuizAssignment.findOrCreate({
        where: { quizId, participantId: enrollment.participantId },
        defaults: { quizId, participantId: enrollment.participantId, status: 'PENDING', assignedAt: now }
      });
      count++;
    } catch (e) {
      // skip duplicate
    }
  }
  console.log(`[quizAssignment] Created ${count} assignment(s) for quiz #${quizId} → training #${trainingId}`);
}

// Helper: if trainingId is null, try to auto-assign from the trainer's first training
async function resolveTrainingId(trainerId, trainingId) {
  if (trainingId) return trainingId;
  const { Op } = require('sequelize');
  // Try to find the trainer's first training
  const training = await Training.findOne({
    where: { [Op.or]: [{ trainerId }, { createdBy: trainerId }] }
  });
  if (training) {
    console.log(`[resolveTrainingId] Auto-assigned training #${training.id} for trainer #${trainerId}`);
    return training.id;
  }
  // Try via trainer assignment
  const assignment = await TrainingTrainerAssignment.findOne({
    where: { trainerId }
  });
  if (assignment) {
    console.log(`[resolveTrainingId] Auto-assigned training #${assignment.trainingId} via assignment for trainer #${trainerId}`);
    return assignment.trainingId;
  }
  console.log(`[resolveTrainingId] No training found for trainer #${trainerId}`);
  return null;
}

module.exports = router;
