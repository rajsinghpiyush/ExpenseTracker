const prisma = require('../config/database');
const { detectAnomalies, buildImportReport, FX_RATES } = require('../services/import.service');
const { computeShares, roundHalfUp } = require('../services/balance.service');

// ─────────────────────────────────────────────
// Step 1: Preview (no DB writes)
// ─────────────────────────────────────────────

/**
 * POST /api/groups/:groupId/import/preview
 * Body: { rows: [...parsed CSV rows...], filename: string }
 *
 * Runs the anomaly detection pipeline and returns a full report.
 * Nothing is written to the database at this stage.
 */
exports.preview = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { rows, filename } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    // Fetch group members (including historical members with leftAt dates)
    const memberships = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    });

    const members = memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarColor: m.user.avatarColor,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    }));

    // Run anomaly detection
    const processedRows = detectAnomalies(rows, members);
    const report = buildImportReport(processedRows);

    res.json({ report, members });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// Step 2: Confirm (DB writes)
// ─────────────────────────────────────────────

/**
 * POST /api/groups/:groupId/import/confirm
 * Body: { rows: [...processedRows with userDecision set...], filename: string }
 *
 * Commits approved rows to the database.
 * User decisions per row:
 *   'ACCEPT'  - use auto-fix and import as computed
 *   'REJECT'  - skip this row entirely
 *   'OVERRIDE' - use user-provided override value
 *
 * For rows with status 'OK', they are imported automatically.
 * For rows with status 'SKIP' or 'RECLASSIFY', they follow their computed action.
 * For rows with ERROR/WARNING anomalies, they MUST have a userDecision.
 */
exports.confirm = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { rows: processedRows, filename } = req.body;

    if (!processedRows || !Array.isArray(processedRows)) {
      return res.status(400).json({ error: 'processedRows is required' });
    }

    // Fetch members + create guest users as needed
    const memberships = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    });
    const memberMap = new Map(memberships.map((m) => [m.user.name.toLowerCase(), m.user]));

    // Create import batch record
    const batch = await prisma.importBatch.create({
      data: {
        groupId,
        filename: filename || 'import.csv',
        importedById: req.user.id,
        status: 'approved',
        totalRows: processedRows.length,
      },
    });

    let importedExpenses = 0;
    let importedSettlements = 0;
    let skippedRows = 0;
    let anomalyCount = 0;
    const anomalyRecords = [];

    for (const row of processedRows) {
      const { computed, anomalies, status, userDecision, raw, rowNumber } = row;

      anomalyCount += anomalies.length;

      // Store anomaly records
      for (const a of anomalies) {
        anomalyRecords.push({
          batchId: batch.id,
          rowNumber: rowNumber || 0,
          rawData: raw,
          anomalyType: a.type,
          severity: a.severity,
          description: a.description,
          suggestedAction: a.suggestedAction,
          autoFixValue: a.autoFixValue || null,
          userDecision: userDecision || null,
          resolvedAt: new Date(),
        });
      }

      // Determine final action
      const finalDecision = userDecision || (status === 'OK' ? 'ACCEPT' : status === 'SKIP' ? 'REJECT' : null);

      if (finalDecision === 'REJECT' || computed.skip) {
        skippedRows++;
        continue;
      }

      // Reclassify as settlement
      if (computed.reclassify === 'SETTLEMENT' && finalDecision !== 'REJECT') {
        try {
          await createSettlementFromRow(raw, computed, memberMap, groupId, batch.id, rowNumber, req.user.id);
          importedSettlements++;
        } catch (e) {
          console.warn(`[IMPORT] Row ${rowNumber}: Failed to create settlement — ${e.message}`);
          skippedRows++;
        }
        continue;
      }

      // Import as expense
      if (finalDecision === 'ACCEPT' || finalDecision === 'OVERRIDE' || status === 'OK' || status === 'WARNING' || status === 'INFO') {
        try {
          await createExpenseFromRow(raw, computed, memberMap, groupId, batch.id, rowNumber, req.user.id);
          importedExpenses++;
        } catch (e) {
          console.warn(`[IMPORT] Row ${rowNumber}: Failed to import — ${e.message}`);
          skippedRows++;
        }
      } else {
        skippedRows++;
      }
    }

    // Bulk insert anomaly records
    if (anomalyRecords.length > 0) {
      await prisma.importAnomaly.createMany({ data: anomalyRecords });
    }

    // Update batch stats
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedExpenses,
        importedSettlements,
        skippedRows,
        anomalyCount,
      },
    });

    res.json({
      batchId: batch.id,
      importedExpenses,
      importedSettlements,
      skippedRows,
      anomalyCount,
      message: `Import complete. ${importedExpenses} expenses and ${importedSettlements} settlements imported. ${skippedRows} rows skipped.`,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// Batch List & Detail
// ─────────────────────────────────────────────

exports.listBatches = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const batches = await prisma.importBatch.findMany({
      where: { groupId },
      include: {
        importedBy: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { anomalies: true } },
      },
      orderBy: { importedAt: 'desc' },
    });
    res.json({ batches });
  } catch (err) {
    next(err);
  }
};

exports.getBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        importedBy: { select: { id: true, name: true, avatarColor: true } },
        anomalies: { orderBy: { rowNumber: 'asc' } },
        _count: { select: { expenses: true, settlements: true } },
      },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });
    res.json({ batch });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

async function resolveOrCreateGuest(name, memberMap) {
  const normalized = name.toLowerCase().trim();
  if (memberMap.has(normalized)) return memberMap.get(normalized);

  // Check DB for existing guest
  let user = await prisma.user.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isGuest: true },
  });

  if (!user) {
    const bcrypt = require('bcryptjs');
    const guestPassword = await bcrypt.hash('guest_' + name, 10);
    user = await prisma.user.create({
      data: {
        name,
        email: `guest_${name.toLowerCase().replace(/\s/g, '_')}@import.local`,
        passwordHash: guestPassword,
        avatarColor: '#94a3b8',
        isGuest: true,
      },
    });
  }

  memberMap.set(normalized, user);
  return user;
}

async function createExpenseFromRow(raw, computed, memberMap, groupId, batchId, rowNumber, importerId) {
  // Resolve payer
  let payerId = computed.payerId;
  if (!payerId && computed.payerGuestName) {
    const guest = await resolveOrCreateGuest(computed.payerGuestName, memberMap);
    payerId = guest.id;
    // Add guest to group if not already a member
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: payerId } },
      create: { groupId, userId: payerId, joinedAt: new Date(computed.date || new Date()), role: 'member' },
      update: {},
    });
  }

  if (!payerId) throw new Error('Cannot determine payer');

  // Resolve split members
  let splitMembers = computed.splitMembers || [];
  if (splitMembers.length === 0) {
    // Fall back: use all active members
    const activeMemberships = await prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });
    splitMembers = activeMemberships.map((m) => ({ userId: m.userId }));
  }

  // Ensure payer is in split if not already
  const payerInSplit = splitMembers.some((s) => s.userId === payerId);
  if (!payerInSplit && computed.splitType !== 'UNEQUAL') {
    splitMembers = [{ userId: payerId }, ...splitMembers];
  }

  const splitType = computed.splitType || 'EQUAL';
  const totalAmount = Number(computed.amount) || 0;

  // Build sharesInput for computeShares
  let sharesInput;
  if (splitType === 'PERCENTAGE') {
    // Parse from split_details, with normalization if flagged
    const details = computed.normalizedPercentages || parseSplitDetails(raw.split_details, splitType, splitMembers);
    sharesInput = buildSharesInput(splitType, details, splitMembers, memberMap);
  } else if (splitType === 'SHARE') {
    const details = parseSplitDetails(raw.split_details, splitType, splitMembers);
    sharesInput = buildSharesInput(splitType, details, splitMembers, memberMap);
  } else if (splitType === 'UNEQUAL') {
    const details = parseSplitDetails(raw.split_details, splitType, splitMembers);
    sharesInput = buildSharesInput(splitType, details, splitMembers, memberMap);
  } else {
    // EQUAL
    sharesInput = splitMembers.map((m) => ({ userId: m.userId }));
  }

  let computedSharesArr;
  try {
    computedSharesArr = computeShares(splitType, totalAmount, sharesInput);
  } catch (e) {
    // Fall back to equal split on computation error
    console.warn(`[IMPORT] Row ${rowNumber}: Share computation failed (${e.message}), falling back to EQUAL`);
    computedSharesArr = computeShares('EQUAL', totalAmount, splitMembers.map((m) => ({ userId: m.userId })));
  }

  const expenseDate = computed.date ? new Date(computed.date) : new Date();

  await prisma.expense.create({
    data: {
      groupId,
      description: (raw.description || '').trim(),
      amount: roundHalfUp(totalAmount, 2),
      currency: 'INR',
      originalAmount: computed.originalAmount ? roundHalfUp(computed.originalAmount, 4) : null,
      originalCurrency: computed.originalCurrency || null,
      exchangeRate: computed.exchangeRate || null,
      paidById: payerId,
      splitType,
      date: expenseDate,
      notes: (raw.notes || '').trim() || null,
      importBatchId: batchId,
      csvRowNumber: rowNumber,
      shares: {
        create: computedSharesArr.map((s) => ({
          userId: s.userId,
          amount: roundHalfUp(Number(s.amount), 2),
          percentage: s.percentage ? roundHalfUp(Number(s.percentage), 4) : null,
          shareUnit: s.shareUnit || null,
        })),
      },
    },
  });
}

async function createSettlementFromRow(raw, computed, memberMap, groupId, batchId, rowNumber, importerId) {
  const payerName = (raw.paid_by || '').trim();
  const payer = await resolveOrCreateGuest(payerName, memberMap);

  // Try to identify receiver from split_with or description
  let receiverName = null;
  const splitWith = (raw.split_with || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (splitWith.length === 1) {
    receiverName = splitWith[0];
  } else {
    // Try to find receiver name in description
    const descWords = (raw.description || '').split(/\s+/);
    for (const word of descWords) {
      if (memberMap.has(word.toLowerCase())) {
        receiverName = word;
        break;
      }
    }
  }

  if (!receiverName) throw new Error('Cannot determine settlement receiver');

  const receiver = await resolveOrCreateGuest(receiverName, memberMap);
  const settlementDate = computed.date ? new Date(computed.date) : new Date();

  await prisma.settlement.create({
    data: {
      groupId,
      payerId: payer.id,
      receiverId: receiver.id,
      amount: roundHalfUp(Math.abs(Number(computed.amount)), 2),
      currency: 'INR',
      date: settlementDate,
      notes: (raw.notes || '').trim() || `Imported from CSV row ${rowNumber}`,
      importBatchId: batchId,
      csvRowNumber: rowNumber,
    },
  });
}

function parseSplitDetails(detailsRaw, splitType, splitMembers) {
  if (!detailsRaw) return splitMembers.map((m) => ({ name: m.name, value: 1 }));

  return detailsRaw.split(';').map((part) => {
    const p = part.trim();
    if (splitType === 'PERCENTAGE') {
      const match = p.match(/^(.+?)\s+([\d.]+)%?$/);
      return match ? { name: match[1].trim(), value: parseFloat(match[2]) } : null;
    } else if (splitType === 'SHARE') {
      const match = p.match(/^(.+?)\s+(\d+)$/);
      return match ? { name: match[1].trim(), value: parseInt(match[2]) } : null;
    } else if (splitType === 'UNEQUAL') {
      const match = p.match(/^(.+?)\s+([\d.]+)$/);
      return match ? { name: match[1].trim(), value: parseFloat(match[2]) } : null;
    }
    return null;
  }).filter(Boolean);
}

function buildSharesInput(splitType, details, splitMembers, memberMap) {
  return details.map((d) => {
    const member = splitMembers.find((m) => m.name && m.name.toLowerCase() === d.name.toLowerCase())
      || { userId: memberMap.get(d.name.toLowerCase())?.id };

    if (!member || !member.userId) return null;

    if (splitType === 'PERCENTAGE') return { userId: member.userId, percentage: d.value };
    if (splitType === 'SHARE') return { userId: member.userId, shareUnit: d.value };
    if (splitType === 'UNEQUAL') return { userId: member.userId, amount: d.value };
    return { userId: member.userId };
  }).filter(Boolean);
}
