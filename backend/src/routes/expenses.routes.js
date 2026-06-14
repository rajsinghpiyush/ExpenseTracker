const express = require('express');
const router = express.Router({ mergeParams: true });
const { body } = require('express-validator');
const expensesController = require('../controllers/expenses.controller');
const { authenticate, requireGroupMember } = require('../middleware/auth');

router.use(authenticate);
router.use('/:groupId/expenses', requireGroupMember);

router.get('/:groupId/expenses', expensesController.listExpenses);
router.post(
  '/:groupId/expenses',
  [
    body('description').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('paidById').notEmpty(),
    body('splitType').isIn(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE']),
    body('date').isISO8601(),
  ],
  expensesController.createExpense
);
router.get('/:groupId/expenses/:expenseId', expensesController.getExpense);
router.patch('/:groupId/expenses/:expenseId', expensesController.updateExpense);
router.delete('/:groupId/expenses/:expenseId', expensesController.deleteExpense);

module.exports = router;
