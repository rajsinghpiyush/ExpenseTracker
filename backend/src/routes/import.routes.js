const express = require('express');
const router = express.Router({ mergeParams: true });
const importController = require('../controllers/import.controller');
const { authenticate, requireGroupMember } = require('../middleware/auth');

router.use(authenticate);
router.use('/:groupId/import', requireGroupMember);

// Step 1: Preview — parse CSV, run anomaly detection, return report (no DB write)
router.post('/:groupId/import/preview', importController.preview);

// Step 2: Confirm — user has reviewed anomalies, submit decisions, commit to DB
router.post('/:groupId/import/confirm', importController.confirm);

// Get all import batches for a group
router.get('/:groupId/import/batches', importController.listBatches);

// Get a specific batch + report
router.get('/:groupId/import/batches/:batchId', importController.getBatch);

module.exports = router;
