const express = require('express');
const router = express.Router({ mergeParams: true });
const balancesController = require('../controllers/balances.controller');
const { authenticate, requireGroupMember } = require('../middleware/auth');

router.use(authenticate);
router.use('/:groupId/balances', requireGroupMember);

// Full balance summary for the group
router.get('/:groupId/balances', balancesController.getBalances);

// Drill-down: which expenses affect a specific member's balance
router.get('/:groupId/balances/:userId/breakdown', balancesController.getBreakdown);

module.exports = router;
