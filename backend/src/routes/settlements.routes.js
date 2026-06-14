const express = require('express');
const router = express.Router({ mergeParams: true });
const settlementsController = require('../controllers/settlements.controller');
const { authenticate, requireGroupMember } = require('../middleware/auth');

router.use(authenticate);
router.use('/:groupId/settlements', requireGroupMember);

router.get('/:groupId/settlements', settlementsController.listSettlements);
router.post('/:groupId/settlements', settlementsController.createSettlement);
router.delete('/:groupId/settlements/:settlementId', settlementsController.deleteSettlement);

module.exports = router;
