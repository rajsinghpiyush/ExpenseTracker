const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

/**
 * Middleware: verify JWT and attach req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, avatarColor: true, isGuest: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    next(err);
  }
};

/**
 * Middleware: verify the authenticated user is a member of the group
 * Attaches req.membership with joinedAt / leftAt
 */
const requireGroupMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.id } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware: verify the authenticated user is an admin of the group
 */
const requireGroupAdmin = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.id } },
    });

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, requireGroupMember, requireGroupAdmin };
