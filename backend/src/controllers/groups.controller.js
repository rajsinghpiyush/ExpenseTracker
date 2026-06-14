const { validationResult } = require('express-validator');
const prisma = require('../config/database');

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarColor: true,
};

exports.listGroups = async (req, res, next) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            _count: { select: { expenses: { where: { isDeleted: false } } } },
            members: {
              include: { user: { select: USER_SELECT } },
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map((m) => ({
      ...m.group,
      myRole: m.role,
      myJoinedAt: m.joinedAt,
      myLeftAt: m.leftAt,
    }));

    res.json({ groups });
  } catch (err) {
    next(err);
  }
};

exports.createGroup = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, currency = 'INR' } = req.body;

    const group = await prisma.group.create({
      data: {
        name,
        description,
        currency,
        members: {
          create: {
            userId: req.user.id,
            joinedAt: new Date(),
            role: 'admin',
          },
        },
      },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
      },
    });

    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
};

exports.getGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: USER_SELECT } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: {
            expenses: { where: { isDeleted: false } },
            settlements: true,
          },
        },
      },
    });

    if (!group) return res.status(404).json({ error: 'Group not found' });

    res.json({ group });
  } catch (err) {
    next(err);
  }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { name, description, currency } = req.body;

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { name, description, currency },
    });

    res.json({ group });
  } catch (err) {
    next(err);
  }
};

exports.listMembers = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json({ members });
  } catch (err) {
    next(err);
  }
};
exports.addMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { userId, email, name, joinedAt, role = 'member' } = req.body;

    let targetUser;

    if (userId) {
      targetUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
    } else if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      targetUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!targetUser) {
        const bcrypt = require('bcryptjs');
        const defaultPassword = await bcrypt.hash('password123', 12);
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        targetUser = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: name || email.split('@')[0],
            passwordHash: defaultPassword,
            avatarColor: randomColor,
          },
        });
      }
    } else {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }

    const targetUserId = targetUser.id;

    // Check if already a member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    let member;
    if (existing) {
      member = await prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId: targetUserId } },
        data: { leftAt: null, joinedAt: joinedAt ? new Date(joinedAt) : new Date(), role },
        include: { user: { select: USER_SELECT } },
      });
    } else {
      member = await prisma.groupMember.create({
        data: {
          groupId,
          userId: targetUserId,
          joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
          role,
        },
        include: { user: { select: USER_SELECT } },
      });
    }

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
};
exports.updateMember = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;
    const { leftAt, role, joinedAt } = req.body;

    const member = await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: {
        ...(leftAt !== undefined && { leftAt: leftAt ? new Date(leftAt) : null }),
        ...(role && { role }),
        ...(joinedAt && { joinedAt: new Date(joinedAt) }),
      },
      include: { user: { select: USER_SELECT } },
    });

    res.json({ member });
  } catch (err) {
    next(err);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;

    // Soft-remove by setting leftAt
    const member = await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { leftAt: new Date() },
    });

    res.json({ message: 'Member marked as left', member });
  } catch (err) {
    next(err);
  }
};
