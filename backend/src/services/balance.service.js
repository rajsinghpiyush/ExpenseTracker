/**
 * balance.service.js
 *
 * Core financial calculation engine.
 * All amounts are in the group's base currency (INR).
 *
 * Key functions:
 *  - computeShares: given a split type and raw input, produce per-user share amounts
 *  - computeGroupBalances: full balance matrix for a group
 *  - minimumSettlements: debt simplification algorithm
 */

const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../config/database');

// ─────────────────────────────────────────────
// Share Computation
// ─────────────────────────────────────────────

/**
 * Compute per-user share amounts given split type and input.
 *
 * @param {string} splitType - 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE'
 * @param {number} totalAmount - total expense amount (in base currency)
 * @param {Array} sharesInput - array of { userId, amount?, percentage?, shareUnit? }
 * @returns {Array} - array of { userId, amount, percentage?, shareUnit? }
 */
function computeShares(splitType, totalAmount, sharesInput) {
  if (!sharesInput || sharesInput.length === 0) {
    throw new Error('sharesInput is required');
  }

  switch (splitType) {
    case 'EQUAL': {
      const perPerson = roundHalfUp(totalAmount / sharesInput.length, 2);
      // Handle rounding: distribute remainder to first person
      const baseShares = sharesInput.map((s, i) => ({
        userId: s.userId,
        amount: perPerson,
      }));
      const distributed = baseShares.reduce((sum, s) => sum + Number(s.amount), 0);
      const remainder = roundHalfUp(totalAmount - distributed, 2);
      if (remainder !== 0) {
        baseShares[0].amount = roundHalfUp(Number(baseShares[0].amount) + remainder, 2);
      }
      return baseShares;
    }

    case 'UNEQUAL': {
      const sum = sharesInput.reduce((acc, s) => acc + Number(s.amount), 0);
      const tolerance = 0.02; // 2 paise tolerance for floating point
      if (Math.abs(sum - totalAmount) > tolerance) {
        throw new Error(
          `Unequal shares sum (${sum}) does not match total (${totalAmount})`
        );
      }
      return sharesInput.map((s) => ({
        userId: s.userId,
        amount: roundHalfUp(Number(s.amount), 2),
      }));
    }

    case 'PERCENTAGE': {
      const percentSum = sharesInput.reduce((acc, s) => acc + Number(s.percentage), 0);
      const tolerance = 0.01;
      if (Math.abs(percentSum - 100) > tolerance) {
        throw new Error(
          `Percentages sum to ${percentSum}%, expected 100%`
        );
      }
      const shares = sharesInput.map((s) => ({
        userId: s.userId,
        percentage: Number(s.percentage),
        amount: roundHalfUp((Number(s.percentage) / 100) * totalAmount, 2),
      }));
      // Fix rounding
      const distributed = shares.reduce((sum, s) => sum + Number(s.amount), 0);
      const remainder = roundHalfUp(totalAmount - distributed, 2);
      if (remainder !== 0) {
        shares[0].amount = roundHalfUp(Number(shares[0].amount) + remainder, 2);
      }
      return shares;
    }

    case 'SHARE': {
      const totalShares = sharesInput.reduce((acc, s) => acc + Number(s.shareUnit), 0);
      if (totalShares === 0) throw new Error('Total share units cannot be zero');
      const shares = sharesInput.map((s) => ({
        userId: s.userId,
        shareUnit: Number(s.shareUnit),
        amount: roundHalfUp((Number(s.shareUnit) / totalShares) * totalAmount, 2),
      }));
      // Fix rounding
      const distributed = shares.reduce((sum, s) => sum + Number(s.amount), 0);
      const remainder = roundHalfUp(totalAmount - distributed, 2);
      if (remainder !== 0) {
        shares[0].amount = roundHalfUp(Number(shares[0].amount) + remainder, 2);
      }
      return shares;
    }

    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }
}

// ─────────────────────────────────────────────
// Balance Computation
// ─────────────────────────────────────────────

/**
 * Compute the full balance matrix for a group.
 *
 * Returns:
 *  - netBalances: { userId -> netAmount }  (positive = owed money, negative = owes money)
 *  - paidByUser: { userId -> total paid }
 *  - owedByUser: { userId -> total owed across shares }
 *  - minSettlements: list of { from, to, amount } to clear all debts with minimum transactions
 *  - contributingExpenses: { userId -> array of expense summaries affecting their balance }
 */
async function computeGroupBalances(groupId) {
  // Fetch all non-deleted expenses with shares
  const expenses = await prisma.expense.findMany({
    where: { groupId, isDeleted: false },
    include: {
      paidBy: { select: { id: true, name: true, avatarColor: true } },
      shares: {
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Fetch all settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      payer: { select: { id: true, name: true, avatarColor: true } },
      receiver: { select: { id: true, name: true, avatarColor: true } },
    },
  });

  // All unique user IDs involved
  const userMap = new Map();

  const paidByUser = {}; // userId -> total amount paid
  const owedByUser = {}; // userId -> total share amount owed

  // Track per-user contributing expenses for drill-down (Rohan's requirement)
  const contributingExpenses = {};

  for (const expense of expenses) {
    const payerId = expense.paidById;
    const amount = Number(expense.amount);

    if (!userMap.has(payerId)) {
      userMap.set(payerId, expense.paidBy);
    }

    paidByUser[payerId] = (paidByUser[payerId] || 0) + amount;

    for (const share of expense.shares) {
      const uid = share.userId;
      const shareAmt = Number(share.amount);

      if (!userMap.has(uid)) {
        userMap.set(uid, share.user);
      }

      owedByUser[uid] = (owedByUser[uid] || 0) + shareAmt;

      // Store contributing expense for this user
      if (!contributingExpenses[uid]) contributingExpenses[uid] = [];
      contributingExpenses[uid].push({
        expenseId: expense.id,
        description: expense.description,
        date: expense.date,
        amount: expense.amount,
        shareAmount: share.amount,
        paidBy: expense.paidBy,
        splitType: expense.splitType,
      });
    }
  }

  // Settlements adjust net balances
  const settlementEffects = {}; // userId -> net adjustment from settlements

  for (const s of settlements) {
    const amt = Number(s.amount);
    const payerId = s.payerId;
    const receiverId = s.receiverId;

    if (!userMap.has(payerId)) userMap.set(payerId, s.payer);
    if (!userMap.has(receiverId)) userMap.set(receiverId, s.receiver);

    // Payer sends money → their outstanding debt decreases (positive adjustment)
    settlementEffects[payerId] = (settlementEffects[payerId] || 0) + amt;
    // Receiver gets money → their outstanding credit decreases (negative adjustment)
    settlementEffects[receiverId] = (settlementEffects[receiverId] || 0) - amt;
  }

  // Compute net balances:
  // net = paid - owed + settlement_effects
  // positive = others owe this person
  // negative = this person owes others
  const allUserIds = new Set([
    ...Object.keys(paidByUser),
    ...Object.keys(owedByUser),
    ...Object.keys(settlementEffects),
  ]);

  const netBalances = {};
  for (const uid of allUserIds) {
    const paid = paidByUser[uid] || 0;
    const owed = owedByUser[uid] || 0;
    const settlement = settlementEffects[uid] || 0;
    netBalances[uid] = roundHalfUp(paid - owed + settlement, 2);
  }

  // Minimum settlement transactions
  const minSettlements = computeMinimumSettlements(netBalances, userMap);

  return {
    netBalances,
    paidByUser,
    owedByUser,
    settlementEffects,
    minSettlements,
    contributingExpenses,
    users: Object.fromEntries(userMap),
    expenseCount: expenses.length,
    settlementCount: settlements.length,
  };
}

/**
 * Greedy minimum-transaction debt settlement algorithm.
 *
 * Given a map of { userId -> netBalance }, produces the minimum set of
 * transactions to clear all debts.
 *
 * Algorithm:
 * 1. Separate into creditors (positive balance) and debtors (negative balance)
 * 2. Repeatedly pair the largest creditor with the largest debtor
 * 3. Transfer min(|creditor|, |debtor|) to clear one side
 */
function computeMinimumSettlements(netBalances, userMap) {
  const transactions = [];

  // Build mutable arrays
  const creditors = []; // { userId, amount (positive) }
  const debtors = [];   // { userId, amount (negative, stored as positive) }

  for (const [userId, balance] of Object.entries(netBalances)) {
    if (balance > 0.01) {
      creditors.push({ userId, amount: balance });
    } else if (balance < -0.01) {
      debtors.push({ userId, amount: -balance });
    }
  }

  // Sort descending
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];

    const transferAmount = roundHalfUp(Math.min(creditor.amount, debtor.amount), 2);

    transactions.push({
      from: { ...(userMap.get(debtor.userId) || { id: debtor.userId, name: debtor.userId }) },
      to: { ...(userMap.get(creditor.userId) || { id: creditor.userId, name: creditor.userId }) },
      amount: transferAmount,
    });

    creditor.amount = roundHalfUp(creditor.amount - transferAmount, 2);
    debtor.amount = roundHalfUp(debtor.amount - transferAmount, 2);

    if (creditor.amount < 0.01) creditors.shift();
    if (debtor.amount < 0.01) debtors.shift();

    // Re-sort after modification
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
  }

  return transactions;
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

/**
 * Round to N decimal places using "round half up" (standard financial rounding)
 */
function roundHalfUp(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

module.exports = {
  computeShares,
  computeGroupBalances,
  computeMinimumSettlements,
  roundHalfUp,
};
