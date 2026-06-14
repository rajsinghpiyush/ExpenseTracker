const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const groupsController = require('../controllers/groups.controller');
const { authenticate, requireGroupMember, requireGroupAdmin } = require('../middleware/auth');

// All group routes require authentication
router.use(authenticate);

// List all groups for the current user
router.get('/', groupsController.listGroups);

// Create a new group
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Group name is required'),
    body('currency').optional().isIn(['INR', 'USD', 'EUR']),
  ],
  groupsController.createGroup
);

// Get a specific group
router.get('/:groupId', requireGroupMember, groupsController.getGroup);

// Update group
router.patch('/:groupId', requireGroupAdmin, groupsController.updateGroup);

// Members management
router.get('/:groupId/members', requireGroupMember, groupsController.listMembers);
router.post('/:groupId/members', requireGroupAdmin, groupsController.addMember);
router.patch('/:groupId/members/:userId', requireGroupAdmin, groupsController.updateMember);
router.delete('/:groupId/members/:userId', requireGroupAdmin, groupsController.removeMember);

module.exports = router;
