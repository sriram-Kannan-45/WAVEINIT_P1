/**
 * Interview Routes
 * All routes prefixed with /api/interviews
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const { Interview, InterviewSession, InterviewDevice } = require('../models');
const tokenService = require('../services/interviewTokenService');
const logger = require('../utils/logger');

// Multer for interview recording chunks (kept in memory, written by service).
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per chunk
});

// Public endpoint: mobile device validates a pairing token and receives a
// short-lived socket token (no auth required).
router.post('/pair-validate', interviewController.validatePairing);

// Public endpoint: mobile device pairs using token (no auth required)
router.post('/pair-by-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const validation=await tokenService.validatePairingToken(token);
    if(!validation.success) return res.status(validation.status||400).json({error:validation.message});
    const result=await tokenService.consumePairingToken(token,validation.device.user_id);
    if(!result.success) return res.status(result.status||400).json({error:result.message});
    // Pairing is distinct from an active socket/video connection.
    if(result.device.status!=='CONNECTED') await result.device.update({status:'PAIRED'});

    res.json({
      success: true,
      message: 'Mobile device paired successfully',
    });
  } catch (error) {
    logger.error('Error pairing by token', { error: error.message });
    res.status(500).json({ error: 'Failed to pair device' });
  }
});

// All interview routes below require authentication
router.use(authenticateToken);
// All id-based operations share membership/assigned-interviewer authorization.
router.param('id', async (req,res,next,id) => {
  try { req.interviewRecord=await require('../services/interviewLifecycleService').access(id,req.user); next(); }
  catch(error) { res.status(error.status||500).json({error:error.message}); }
});

// Lookup data for scheduling (MUST be before /:id to avoid param capture)
router.get('/candidates', roleMiddleware('ADMIN', 'TRAINER'), interviewController.getCandidates);
router.get('/interviewers', roleMiddleware('ADMIN', 'TRAINER'), interviewController.getInterviewers);
router.get('/stats', interviewController.getInterviewStats);

// CRUD
router.post('/create', roleMiddleware('ADMIN', 'TRAINER'), interviewController.createInterview);
router.get('/', interviewController.listInterviews);
router.get('/:id', interviewController.getInterview);
router.get('/:id/report', async (req,res) => {
  try { res.json(await require('../services/interviewLifecycleService').report(req.params.id,req.user)); }
  catch(error) { res.status(error.status||500).json({error:error.message}); }
});
router.post('/:id/participants/:candidateId/evaluation', roleMiddleware('ADMIN','TRAINER'), async (req,res) => {
  try { res.json({success:true,evaluation:await require('../services/interviewLifecycleService').saveEvaluation(req.params.id,req.params.candidateId,req.user,req.body)}); }
  catch(error) { res.status(error.status||500).json({error:error.message}); }
});
router.get('/:id/report.xlsx', async (req,res) => {
  try {
    const report=await require('../services/interviewLifecycleService').report(req.params.id,req.user);
    const workbook=new (require('exceljs').Workbook)(); const sheet=workbook.addWorksheet('Discussion results');
    sheet.addRow(['Session',report.interview.title||report.interview.id]);
    sheet.addRow(['Status',report.interview.status,'Duration (seconds)',report.session?.durationSeconds||0]);
    sheet.addRow(['Candidate','Email','Participation (seconds)',...report.criteria.map(c=>c.name),'Overall (%)','Result','Published','Comments','Performance summary','Monitoring score','Monitoring events']);
    for(const p of report.participants) sheet.addRow([p.name,p.email,p.participationSeconds,...report.criteria.map(c=>p.evaluation?.scores?.[c.id]??''),p.evaluation?.overallScore??'',p.evaluation?.decision||'Pending',p.evaluation?.isPublished?'Yes':'No',p.evaluation?.comments||'',p.evaluation?.summary||'',p.monitoring?.score??'',p.monitoring?.totalEvents??'']);
    const criteria=workbook.addWorksheet('Criteria');criteria.addRow(['Criterion','Maximum score','Weight']);report.criteria.forEach(c=>criteria.addRow([c.name,c.maxScore,c.weight]));criteria.columns.forEach(c=>{c.width=28});criteria.getRow(1).font={bold:true};
    const monitoring=workbook.addWorksheet('Monitoring summary');monitoring.addRow(['Candidate','Category','Risk score','Maximum','Events','Duration (seconds)']);
    for(const p of report.participants)for(const [category,value]of Object.entries(p.monitoring?.scoringBreakdown||{}))if(value&&typeof value==='object')monitoring.addRow([p.name,category,value.score,value.max,value.count??'',value.violationSeconds??value.faceAbsentSeconds??'']);
    monitoring.columns.forEach(c=>{c.width=25});monitoring.getRow(1).font={bold:true};
    sheet.getRow(3).font={bold:true}; sheet.columns.forEach(column=>{column.width=24;});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="interview-${report.interview.id}-report.xlsx"`);
    await workbook.xlsx.write(res);res.end();
  } catch(error) { res.status(error.status||500).json({error:error.message}); }
});

// Update & Delete
router.put('/:id', roleMiddleware('ADMIN', 'TRAINER'), interviewController.updateInterview);
router.patch('/:id/status', roleMiddleware('ADMIN', 'TRAINER'), interviewController.updateInterviewStatus);
router.delete('/:id', roleMiddleware('ADMIN'), interviewController.deleteInterview);

// Session lifecycle
router.post('/:id/join', interviewController.joinInterview);
router.post('/:id/consent', interviewController.recordConsent);
router.post('/:id/pair-mobile', interviewController.pairMobile);
router.post('/:id/refresh-qr', interviewController.refreshQr);
router.post('/:id/start', roleMiddleware('ADMIN', 'TRAINER'), interviewController.startInterview);
router.post('/:id/end', roleMiddleware('ADMIN', 'TRAINER'), interviewController.endInterview);

// Feedback & Results
const individualInterviewOnly=(req,res,next)=>req.interviewRecord.mode==='GROUP_DISCUSSION'?res.status(409).json({error:'Use the individual candidate evaluation endpoint for Group Discussion.'}):next();
router.post('/:id/feedback', roleMiddleware('ADMIN', 'TRAINER'), individualInterviewOnly, interviewController.submitFeedback);
router.get('/:id/feedback', interviewController.getFeedback);
router.post('/:id/result', roleMiddleware('ADMIN', 'TRAINER'), individualInterviewOnly, interviewController.submitResult);
router.post('/:id/publish-result', roleMiddleware('ADMIN', 'TRAINER'), individualInterviewOnly, interviewController.publishResult);

// Status & Recordings
router.get('/:id/status', interviewController.getInterviewStatus);
router.get('/:id/recordings', interviewController.getRecordings);

// Notes (shared, live interview scratchpad)
router.get('/:id/notes', interviewController.getNotes);
router.post('/:id/notes', interviewController.createNote);

// AI Monitoring alerts
router.post('/:id/alerts', interviewController.logAlert);

// Recording chunk upload + finalize (MediaRecorder → chunks → merged webm)
router.post(
  '/upload-chunk',
  roleMiddleware('TRAINER', 'ADMIN'),
  chunkUpload.single('chunk'),
  interviewController.uploadChunk
);
router.post(
  '/finalize-recording',
  roleMiddleware('TRAINER', 'ADMIN'),
  interviewController.finalizeRecording
);

module.exports = router;
