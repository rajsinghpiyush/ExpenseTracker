const prisma = require('../config/database');

exports.listSettlements = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, avatarColor: true } },
        receiver: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { date: 'desc' },
    });
    res.json({ settlements });
  } catch (err) {
    next(err);
  }
};

exports.createSettlement = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { payerId, receiverId, amount, date, notes, currency = 'INR' } = req.body;

    if (!payerId || !receiverId || !amount || !date) {
      return res.status(400).json({ error: 'payerId, receiverId, amount, and date are required' });
    }
    if (payerId === receiverId) {
      return res.status(400).json({ error: 'Payer and receiver cannot be the same person' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'Settlement amount must be positive' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        receiverId,
        amount,
        currency,
        date: new Date(date),
        notes,
      },
      include: {
        payer: { select: { id: true, name: true, avatarColor: true } },
        receiver: { select: { id: true, name: true, avatarColor: true } },
      },
    });

    res.status(201).json({ settlement });
  } catch (err) {
    next(err);
  }
};

exports.deleteSettlement = async (req, res, next) => {
  try {
    const { settlementId } = req.params;
    await prisma.settlement.delete({ where: { id: settlementId } });
    res.json({ message: 'Settlement deleted' });
  } catch (err) {
    next(err);
  }
};
