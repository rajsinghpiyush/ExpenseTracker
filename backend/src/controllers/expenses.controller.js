const { validationResult } = require('express-validator');
const prisma = require('../config/database');
const { computeShares } = require('../services/balance.service');

const EXPENSE_INCLUDE = {
  paidBy: { select: { id: true, name: true, avatarColor: true } },
  shares: {
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  },
};

exports.listExpenses = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50, splitType, from, to } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      groupId,
      isDeleted: false,
      ...(splitType && { splitType }),
      ...(from || to
        ? {
            date: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({ expenses, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
};

exports.createExpense = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { groupId } = req.params;
    const {
      description,
      amount,
      paidById,
      splitType,
      date,
      notes,
      shares: sharesInput,
      currency = 'INR',
      originalAmount,
      originalCurrency,
      exchangeRate,
    } = req.body;

    // Verify payer is in the group
    const payerMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: paidById } },
    });
    if (!payerMembership) {
      return res.status(400).json({ error: 'Payer is not a member of this group' });
    }

    // Compute shares based on split type
    const computedShares = computeShares(splitType, Number(amount), sharesInput);

    const expense = await prisma.expense.create({
      data: {
        groupId,
        description,
        amount,
        currency,
        originalAmount: originalAmount || null,
        originalCurrency: originalCurrency || null,
        exchangeRate: exchangeRate || null,
        paidById,
        splitType,
        date: new Date(date),
        notes,
        shares: {
          create: computedShares.map((s) => ({
            userId: s.userId,
            amount: s.amount,
            percentage: s.percentage || null,
            shareUnit: s.shareUnit || null,
          })),
        },
      },
      include: EXPENSE_INCLUDE,
    });

    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
};

exports.getExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
    if (!expense || expense.isDeleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ expense });
  } catch (err) {
    next(err);
  }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;
    const {
      description,
      amount,
      paidById,
      splitType,
      date,
      notes,
      shares: sharesInput,
    } = req.body;

    // Delete existing shares and recompute
    const computedShares = sharesInput
      ? computeShares(splitType, Number(amount), sharesInput)
      : null;

    const expense = await prisma.$transaction(async (tx) => {
      if (computedShares) {
        await tx.expenseShare.deleteMany({ where: { expenseId } });
      }

      return tx.expense.update({
        where: { id: expenseId },
        data: {
          description,
          amount,
          paidById,
          splitType,
          date: date ? new Date(date) : undefined,
          notes,
          ...(computedShares && {
            shares: {
              create: computedShares.map((s) => ({
                userId: s.userId,
                amount: s.amount,
                percentage: s.percentage || null,
                shareUnit: s.shareUnit || null,
              })),
            },
          }),
        },
        include: EXPENSE_INCLUDE,
      });
    });

    res.json({ expense });
  } catch (err) {
    next(err);
  }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    await prisma.expense.update({
      where: { id: expenseId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
};
