const express = require('express');
const router = express.Router();
const privacyController = require('../controllers/privacyController');
const authenticateToken = require('../middleware/auth');

// All privacy routes require active authentication
router.use(authenticateToken);

// Right of Access & Data Portability: export structured JSON data
router.get('/export-data', privacyController.exportData);

// Right to Erasure: self-service account and personal data deletion
router.post('/request-erasure', privacyController.requestErasure);

// Consent Management
router.post('/revoke-consent', privacyController.revokeConsent);
router.get('/consent-status', privacyController.getConsentStatus);

module.exports = router;
