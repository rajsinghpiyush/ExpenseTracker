const { computeGroupBalances } = require('../services/balance.service');

exports.getBalances = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await computeGroupBalances(groupId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getBreakdown = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;
    const result = await computeGroupBalances(groupId);
    const contributing = result.contributingExpenses[userId] || [];
    res.json({
      userId,
      user: result.users[userId],
      netBalance: result.netBalances[userId] || 0,
      totalPaid: result.paidByUser[userId] || 0,
      totalOwed: result.owedByUser[userId] || 0,
      settlementEffect: result.settlementEffects[userId] || 0,
      contributingExpenses: contributing,
    });
  } catch (err) {
    next(err);
  }
};
