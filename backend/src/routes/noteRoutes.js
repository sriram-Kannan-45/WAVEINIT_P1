const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Note, User, Training, Notification } = require('../models');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const ActivityService = require('../services/activityService');

const router = express.Router();

// Ensure uploads directory exists
const notesDir = path.join(__dirname, '../../../uploads/notes');
if (!fs.existsSync(notesDir)) {
  fs.mkdirSync(notesDir, { recursive: true });
}

// Configure multer for notes storage
const notesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, notesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const notesUpload = multer({
  storage: notesStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    // Expanded format list — covers common educational resources.
    // NB: Files beyond IMAGE/VIDEO/PDF are classified as LINK in DB
    // (existing ENUM constraint) but the original filename is preserved so
    // the UI can show the correct icon and label.
    const allowedTypes = [
      // Documents
      '.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md',
      // Spreadsheets
      '.xls', '.xlsx', '.csv', '.ods',
      // Presentations
      '.ppt', '.pptx', '.odp',
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
      // Videos
      '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v',
      // Audio
      '.mp3', '.wav', '.m4a', '.ogg',
      // Archives
      '.zip', '.rar', '.7z', '.tar', '.gz',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type "${ext}". Allowed: documents, sheets, slides, images, video, audio, archives.`), false);
    }
  }
});

// Helper to detect file type — maps to the existing ENUM
// (PDF | IMAGE | VIDEO | LINK). Anything that isn't natively previewable in
// the browser gets stored as LINK; the original filename + extension drive
// the rich UI icons on the frontend.
const detectFileType = (file, link) => {
  if (link) return 'LINK';
  if (!file) return null;

  const mime = file.mimetype || '';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime === 'application/pdf') return 'PDF';

  // Fallback to extension when mime is generic (octet-stream)
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'IMAGE';
  if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].includes(ext)) return 'VIDEO';
  if (ext === '.pdf') return 'PDF';

  // Documents, spreadsheets, slides, archives, audio, etc.
  return 'LINK';
};

// TRAINER: Upload note
router.post(
  '/',
  authenticateToken,
  roleMiddleware('TRAINER'),
  notesUpload.single('file'),
  async (req, res) => {
    try {
      const { title, description, link, trainingId } = req.body;
      const trainerId = req.user.id;

      console.log('📤 Note upload - trainerId:', trainerId);
      console.log('📤 Note upload - body:', req.body);
      console.log('📤 Note upload - file:', req.file);

      if (!title) {
        return res.status(422).json({ error: 'Title is required' });
      }

      let fileUrl = null;
      let fileType = null;
      let fileName = null;
      let fileSize = null;

      // Handle file upload
      if (req.file) {
        fileUrl = `/uploads/notes/${req.file.filename}`;
        fileName = req.file.originalname;
        fileSize = req.file.size;
        fileType = detectFileType(req.file, null);
        console.log('📎 File uploaded:', fileUrl, 'Type:', fileType);
      } 
      // Handle link
      else if (link) {
        fileUrl = link;
        fileType = 'LINK';
        console.log('🔗 Link provided:', link);
      } else {
        return res.status(422).json({ error: 'File or link is required' });
      }

      const note = await Note.create({
        title,
        description: description || null,
        fileUrl,
        fileType,
        fileName,
        fileSize,
        trainerId: parseInt(trainerId),
        trainingId: trainingId ? parseInt(trainingId) : null,
        status: 'PENDING'
      });

      console.log('✅ Note created with ID:', note.id);

      const io = req.app.get('io');
      const trainer = await User.findByPk(trainerId);
      const training = trainingId ? await Training.findByPk(trainingId) : null;

      // Log activity
      await ActivityService.logActivity({
        userId: trainerId,
        userName: trainer?.name || 'Unknown',
        action: 'NOTE_UPLOADED',
        entityType: 'Note',
        entityId: note.id,
        details: { trainingName: training?.title || 'General' }
      }, io);

      // Notify admins
      const adminUsers = await User.findAll({ where: { role: 'ADMIN' } });
      for (const admin of adminUsers) {
        await Notification.create({
          userId: admin.id,
          message: `Trainer ${trainer?.name || 'Unknown'} uploaded a new note: ${title}`,
          type: 'NOTE_UPLOAD',
          isRead: false
        });
      }

      res.status(201).json({
        message: 'Note uploaded successfully. Pending admin approval.',
        note
      });
    } catch (error) {
      console.error('❌ Upload note error:', error.message, error.stack);
      res.status(500).json({ error: 'Server error uploading note' });
    }
  }
);

// TRAINER: Get own notes
router.get(
  '/my-notes',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const trainerId = req.user.id;
      const notes = await Note.findAll({
        where: { trainerId },
        order: [['created_at', 'DESC']]
      });
      res.json({ notes });
    } catch (error) {
      console.error('Get trainer notes error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// TRAINER: Edit own note (title, description, training, link, optionally replace file)
// - Updating title/description/training keeps current status untouched.
// - Replacing the file (or swapping link → file / file → link) resets status
//   to PENDING so admins re-approve, mirroring the original upload flow.
router.put(
  '/:id',
  authenticateToken,
  roleMiddleware('TRAINER'),
  notesUpload.single('file'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const trainerId = req.user.id;
      const { title, description, link, trainingId, removeFile } = req.body;

      const note = await Note.findByPk(id);
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      if (note.trainerId !== trainerId) {
        return res.status(403).json({ error: 'Not authorized to edit this note' });
      }

      const patch = {};
      let resetStatus = false;
      let oldFileToDelete = null;

      if (typeof title === 'string' && title.trim()) {
        patch.title = title.trim();
      } else if (typeof title === 'string' && !title.trim()) {
        return res.status(422).json({ error: 'Title cannot be empty' });
      }

      if (typeof description === 'string') {
        patch.description = description.trim() || null;
      }

      if (trainingId !== undefined) {
        patch.trainingId = trainingId ? parseInt(trainingId) : null;
      }

      // File replacement
      if (req.file) {
        // Stash old local file path for cleanup AFTER save succeeds
        if (note.fileUrl && !note.fileUrl.startsWith('http')) {
          oldFileToDelete = path.join(__dirname, '../../..', note.fileUrl);
        }
        patch.fileUrl = `/uploads/notes/${req.file.filename}`;
        patch.fileName = req.file.originalname;
        patch.fileSize = req.file.size;
        patch.fileType = detectFileType(req.file, null);
        resetStatus = true;
      } else if (link && link.trim()) {
        // Swap to a link instead of a file
        if (note.fileUrl && !note.fileUrl.startsWith('http')) {
          oldFileToDelete = path.join(__dirname, '../../..', note.fileUrl);
        }
        patch.fileUrl = link.trim();
        patch.fileName = null;
        patch.fileSize = null;
        patch.fileType = 'LINK';
        resetStatus = true;
      } else if (removeFile === 'true' || removeFile === true) {
        return res.status(422).json({ error: 'A note must have a file or link' });
      }

      if (resetStatus) {
        patch.status = 'PENDING';
      }

      await note.update(patch);

      // Best-effort cleanup of replaced file (don't fail the request on FS errors)
      if (oldFileToDelete) {
        try {
          if (fs.existsSync(oldFileToDelete)) fs.unlinkSync(oldFileToDelete);
        } catch (cleanupErr) {
          console.error('Old file cleanup failed:', cleanupErr.message);
        }
      }

      // If file was replaced, notify admins again (mirrors upload flow)
      if (resetStatus) {
        try {
          const trainer = await User.findByPk(trainerId);
          const adminUsers = await User.findAll({ where: { role: 'ADMIN' } });
          for (const admin of adminUsers) {
            await Notification.create({
              userId: admin.id,
              message: `Trainer ${trainer?.name || 'Unknown'} updated note: ${patch.title || note.title}`,
              type: 'NOTE_UPLOAD',
              isRead: false
            });
          }
        } catch (notifyErr) {
          console.error('Admin notification on note edit failed:', notifyErr.message);
        }
      }

      res.json({
        message: resetStatus
          ? 'Note updated. File replaced — pending admin approval.'
          : 'Note updated successfully.',
        note
      });
    } catch (error) {
      console.error('Edit note error:', error.message, error.stack);
      res.status(500).json({ error: 'Server error updating note' });
    }
  }
);

// ADMIN: Get notes (with optional status filter: pending, approved, or all)
router.get(
  '/admin/notes',
  authenticateToken,
  roleMiddleware('ADMIN'),
  async (req, res) => {
    try {
      const { status } = req.query;
      
      const where = {};
      if (status === 'pending') {
        where.status = 'PENDING';
      } else if (status === 'approved') {
        where.status = 'APPROVED';
      }
      // If no status filter, return all notes
      
      const notes = await Note.findAll({
        where,
        include: [
          { model: User, as: 'trainer', attributes: ['id', 'name', 'email'] },
          { model: Training, as: 'training', attributes: ['id', 'title'], required: false }
        ],
        order: [['created_at', 'DESC']]
      });
      res.json({ notes });
    } catch (error) {
      console.error('Get admin notes error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ADMIN: Get pending notes (legacy route - redirects to admin/notes with status filter)
router.get(
  '/pending',
  authenticateToken,
  roleMiddleware('ADMIN'),
  async (req, res) => {
    try {
      const notes = await Note.findAll({
        where: { status: 'PENDING' },
        include: [
          { model: User, as: 'trainer', attributes: ['id', 'name', 'email'] },
          { model: Training, as: 'training', attributes: ['id', 'title'], required: false }
        ],
        order: [['created_at', 'DESC']]
      });
      res.json({ notes });
    } catch (error) {
      console.error('Get pending notes error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ADMIN: Approve/reject note
router.put(
  '/:id/status',
  authenticateToken,
  roleMiddleware('ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(422).json({ error: 'Invalid status. Use APPROVED or REJECTED' });
      }

      const note = await Note.findByPk(id);
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      await note.update({ status });

      console.log(`✅ Note ${id} status changed to:`, status);

      const io = req.app.get('io');
      const trainer = await User.findByPk(note.trainerId);

      // Notify trainer
      await Notification.create({
        userId: note.trainerId,
        message: status === 'APPROVED' 
          ? `Your note "${note.title}" has been approved` 
          : `Your note "${note.title}" has been rejected`,
        type: 'NOTE_STATUS',
        isRead: false
      });

      // Log activity
      await ActivityService.logActivity({
        userId: req.user.id,
        userName: req.user.name || 'Admin',
        action: status === 'APPROVED' ? 'NOTE_APPROVED' : 'NOTE_REJECTED',
        entityType: 'Note',
        entityId: note.id,
        details: { noteTitle: note.title, trainerName: trainer?.name }
      }, io);

      res.json({ message: `Note ${status.toLowerCase()} successfully`, note });
    } catch (error) {
      console.error('Update note status error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PARTICIPANT: Get approved notes
router.get(
  '/',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const notes = await Note.findAll({
        where: { status: 'APPROVED' },
        include: [
          { model: User, as: 'trainer', attributes: ['id', 'name', 'email'] },
          { model: Training, as: 'training', attributes: ['id', 'title'], required: false }
        ],
        order: [['created_at', 'DESC']]
      });
      res.json({ notes });
    } catch (error) {
      console.error('Get approved notes error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// DELETE note (trainer can delete their own, admin can delete any)
router.delete(
  '/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const note = await Note.findByPk(id);
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      // Allow if owner or admin
      if (note.trainerId !== userId && userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to delete this note' });
      }

      // Delete file if exists
      if (note.fileUrl && !note.fileUrl.startsWith('http')) {
        const filePath = path.join(__dirname, '../../..', note.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await note.destroy();

      console.log('✅ Note deleted:', id);

      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      console.error('Delete note error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;