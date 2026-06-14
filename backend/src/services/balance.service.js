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
// Balance Calculator Class
// ─────────────────────────────────────────────

class BalanceCalculator {
  constructor(groupId) {
    this.groupId = groupId;
    this.expenses = [];
    this.settlements = [];
    this.members = [];
    this.netBalances = {};
    this.paidByUser = {};
    this.owedByUser = {};
    this.settlementEffects = {};
    this.contributingExpenses = {};
    this.users = {};
  }

  async init() {
    this.members = await prisma.groupMember.findMany({
      where: { groupId: this.groupId },
      include: { user: true },
    });
    this.users = {};
    for (const m of this.members) {
      this.users[m.user.id] = m.user;
    }

    this.expenses = await prisma.expense.findMany({
      where: { groupId: this.groupId, isDeleted: false },
      include: {
        paidBy: { select: { id: true, name: true, avatarColor: true } },
        shares: {
          include: { user: { select: { id: true, name: true, avatarColor: true } } },
        },
      },
      orderBy: { date: 'asc' },
    });

    this.settlements = await prisma.settlement.findMany({
      where: { groupId: this.groupId },
      include: {
        payer: { select: { id: true, name: true, avatarColor: true } },
        receiver: { select: { id: true, name: true, avatarColor: true } },
      },
    });
  }

  calculate_net_balances(as_of_date = null, member_id = null) {
    const paidByUser = {};
    const owedByUser = {};
    const settlementEffects = {};
    const contributingExpenses = {};

    const cutoffDate = as_of_date ? new Date(as_of_date) : null;

    // Filter expenses by cutoffDate
    const filteredExpenses = cutoffDate
      ? this.expenses.filter((e) => new Date(e.date) <= cutoffDate)
      : this.expenses;

    const filteredSettlements = cutoffDate
      ? this.settlements.filter((s) => new Date(s.date) <= cutoffDate)
      : this.settlements;

    for (const expense of filteredExpenses) {
      const payerId = expense.paidById;
      const amount = Number(expense.amount);
      const expenseDate = new Date(expense.date);

      // Check if it is a recurring monthly bill
      const isRecurring = /rent|electricity|maintenance|monthly|internet|cleaning/i.test(expense.description || '');

      paidByUser[payerId] = (paidByUser[payerId] || 0) + amount;

      // Handle pro-rata calculation if recurring and membership dates change
      let shares = expense.shares.map((s) => ({
        userId: s.userId,
        amount: Number(s.amount),
        percentage: s.percentage ? Number(s.percentage) : null,
        shareUnit: s.shareUnit || null,
        user: s.user,
      }));

      if (isRecurring) {
        // Get start and end of that month
        const year = expenseDate.getFullYear();
        const month = expenseDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);

        // Compute pro-rata weights for each split member
        const weights = {};
        let totalWeight = 0;

        for (const share of shares) {
          const m = this.members.find((mb) => mb.userId === share.userId);
          if (m) {
            // Find overlap between [joinedAt, leftAt] and [monthStart, monthEnd]
            const join = new Date(m.joinedAt);
            const left = m.leftAt ? new Date(m.leftAt) : null;

            const overlapStart = new Date(Math.max(monthStart.getTime(), join.getTime()));
            const overlapEnd = left
              ? new Date(Math.min(monthEnd.getTime(), left.getTime()))
              : monthEnd;

            if (overlapStart <= overlapEnd) {
              const activeMs = overlapEnd.getTime() - overlapStart.getTime();
              const activeDays = Math.ceil(activeMs / (1000 * 60 * 60 * 24)) + 1;
              weights[share.userId] = activeDays / daysInMonth;
            } else {
              weights[share.userId] = 0;
            }
          } else {
            weights[share.userId] = 1;
          }
          totalWeight += weights[share.userId];
        }

        // Adjust shares based on weights
        if (totalWeight > 0) {
          shares = shares.map((share) => {
            const adjustedShare = (weights[share.userId] / totalWeight) * amount;
            return {
              ...share,
              amount: roundHalfUp(adjustedShare, 2),
            };
          });

          // Redistribute rounding remainders
          const sumAdjusted = shares.reduce((sum, s) => sum + s.amount, 0);
          const remainder = roundHalfUp(amount - sumAdjusted, 2);
          if (remainder !== 0 && shares.length > 0) {
            shares[0].amount = roundHalfUp(shares[0].amount + remainder, 2);
          }
        }
      }

      for (const share of shares) {
        const uid = share.userId;
        const shareAmt = share.amount;

        owedByUser[uid] = (owedByUser[uid] || 0) + shareAmt;

        if (!contributingExpenses[uid]) contributingExpenses[uid] = [];
        contributingExpenses[uid].push({
          expenseId: expense.id,
          description: expense.description,
          date: expense.date,
          amount: expense.amount,
          shareAmount: shareAmt,
          paidBy: expense.paidBy || { name: payerId },
          splitType: expense.splitType,
        });
      }
    }

    for (const s of filteredSettlements) {
      const amt = Number(s.amount);
      const payerId = s.payerId;
      const receiverId = s.receiverId;

      settlementEffects[payerId] = (settlementEffects[payerId] || 0) + amt;
      settlementEffects[receiverId] = (settlementEffects[receiverId] || 0) - amt;
    }

    const netBalances = {};
    const allUserIds = new Set([
      ...Object.keys(paidByUser),
      ...Object.keys(owedByUser),
      ...Object.keys(settlementEffects),
      ...this.members.map((m) => m.userId),
    ]);

    for (const uid of allUserIds) {
      const paid = paidByUser[uid] || 0;
      const owed = owedByUser[uid] || 0;
      const settlement = settlementEffects[uid] || 0;
      netBalances[uid] = roundHalfUp(paid - owed + settlement, 2);
    }

    this.paidByUser = paidByUser;
    this.owedByUser = owedByUser;
    this.settlementEffects = settlementEffects;
    this.contributingExpenses = contributingExpenses;
    this.netBalances = netBalances;

    if (member_id) {
      return netBalances[member_id] || 0;
    }
    return netBalances;
  }

  get_balance_breakdown(user_id) {
    const contributing = this.contributingExpenses[user_id] || [];
    let runningTotal = 0;

    return contributing.map((e) => {
      const isPayer = e.paidBy.id === user_id;
      const shareOwed = e.shareAmount;
      const netEffect = (isPayer ? e.amount : 0) - shareOwed;
      runningTotal = roundHalfUp(runningTotal + netEffect, 2);

      return {
        expenseId: e.expenseId,
        description: e.description,
        date: e.date,
        totalAmount: e.amount,
        shareOwed,
        isPayer,
        netEffect,
        runningTotal,
      };
    });
  }

  simplify_debts() {
    const userMap = new Map();
    for (const m of this.members) {
      userMap.set(m.userId, m.user);
    }
    return computeMinimumSettlements(this.netBalances, userMap);
  }

  get_settlement_plan() {
    return this.simplify_debts();
  }
}

async function computeGroupBalances(groupId) {
  const calc = new BalanceCalculator(groupId);
  await calc.init();
  const netBalances = calc.calculate_net_balances();
  const minSettlements = calc.simplify_debts();

  return {
    netBalances,
    paidByUser: calc.paidByUser,
    owedByUser: calc.owedByUser,
    settlementEffects: calc.settlementEffects,
    minSettlements,
    contributingExpenses: calc.contributingExpenses,
    users: calc.users,
    expenseCount: calc.expenses.length,
    settlementCount: calc.settlements.length,
  };
}

/**
 * Greedy minimum-transaction debt settlement algorithm.
 */
function computeMinimumSettlements(netBalances, userMap) {
  const transactions = [];

  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of Object.entries(netBalances)) {
    if (balance > 0.01) {
      creditors.push({ userId, amount: balance });
    } else if (balance < -0.01) {
      debtors.push({ userId, amount: -balance });
    }
  }

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

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
  }

  return transactions;
}

/**
 * Round to N decimal places using "round half up"
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
  BalanceCalculator,
};
