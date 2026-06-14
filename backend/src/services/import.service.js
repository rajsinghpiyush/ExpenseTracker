/**
 * import.service.js
 *
 * CSV Import Pipeline — Anomaly Detection Engine
 */

// USD→INR exchange rate used for the Goa trip (March 2026)
const FX_RATES = {
  USD: 83.5,
  EUR: 90.2,
};

class CSVParser {
  constructor() {
    this.fingerprints = new Map();
  }

  parse(rawRows, members) {
    const processedRows = [];
    this.fingerprints.clear();

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const rowNumber = i + 2; // +1 for 1-based index, +1 for header row
      const anomalies = [];
      const computed = {};

      // Detect empty rows
      if (this.detectEmptyRow(raw, anomalies, computed)) {
        processedRows.push({
          rowNumber,
          raw,
          computed,
          anomalies,
          status: 'SKIP',
        });
        continue;
      }

      // Date parsing & validation
      this.detectMalformedDate(raw, anomalies, computed);
      this.detectFutureDate(raw, anomalies, computed);

      // Amount parsing & validation
      const amountResult = parseAmount(raw.amount);
      computed.amount = amountResult.value;

      this.detectMissingPayer(raw, anomalies, computed);
      this.detectNegativeAmount(raw, anomalies, computed, amountResult);
      this.detectZeroAmount(raw, anomalies, computed, amountResult);

      // Currency conversion
      this.detectUSDCurrency(raw, anomalies, computed, amountResult);
      this.detectUnknownCurrency(raw, anomalies, computed);

      // Payer resolution
      const paidByRaw = (raw.paid_by || '').trim();
      if (paidByRaw && !anomalies.some((a) => a.type === 'MISSING_PAYER')) {
        const payerMatch = resolveMember(paidByRaw, members);
        if (payerMatch.exact) {
          computed.payerId = payerMatch.member.id;
          computed.payerName = payerMatch.member.name;
        } else if (payerMatch.fuzzy) {
          anomalies.push({
            type: 'AMBIGUOUS_PAYER',
            severity: 'WARNING',
            description: `Payer "${paidByRaw}" fuzzy-matched to "${payerMatch.member.name}" (${Math.round(payerMatch.score * 100)}% confidence).`,
            suggestedAction: `Resolve to "${payerMatch.member.name}"`,
            autoFixValue: payerMatch.member.id,
          });
          computed.payerId = payerMatch.member.id;
          computed.payerName = payerMatch.member.name;
        } else {
          anomalies.push({
            type: 'EXTERNAL_PAYER',
            severity: 'WARNING',
            description: `Payer "${paidByRaw}" is not a registered group member. Will be created as a guest account.`,
            suggestedAction: `Create guest user "${paidByRaw}"`,
            autoFixValue: `GUEST:${paidByRaw}`,
          });
          computed.payerId = null;
          computed.payerGuestName = paidByRaw;
        }
      }

      // Settlement detection
      this.detectSettlementEntry(raw, anomalies, computed);

      // Split type detection & details validation
      this.detectInvalidSplitType(raw, anomalies, computed);
      this.detectMismatchedSplitTotals(raw, anomalies, computed);

      // Split members validation
      this.detectSplitMembers(raw, anomalies, computed, members);

      // Duplicate checking
      this.detectDuplicate(raw, anomalies, computed, rowNumber, processedRows);

      processedRows.push({
        rowNumber,
        raw,
        computed,
        anomalies,
        status: deriveRowStatus(anomalies, computed),
      });
    }

    return processedRows;
  }

  detectEmptyRow(raw, anomalies, computed) {
    const vals = Object.values(raw).map((v) => (v || '').toString().trim()).filter(Boolean);
    if (vals.length === 0) {
      anomalies.push({
        type: 'EMPTY_ROW',
        severity: 'WARNING',
        description: 'Empty row detected in the CSV file.',
        suggestedAction: 'Skip empty row',
        autoFixValue: 'SKIP',
      });
      computed.skip = true;
      return true;
    }
    return false;
  }

  detectMalformedDate(raw, anomalies, computed) {
    const dateResult = parseDate(raw.date);
    computed.date = dateResult.value;

    if (!dateResult.valid) {
      anomalies.push({
        type: 'INVALID_DATE',
        severity: 'ERROR',
        description: `Date "${raw.date}" could not be parsed. Best guess: ${dateResult.bestGuess || 'unknown'}`,
        suggestedAction: dateResult.bestGuess
          ? `Interpret as ${dateResult.bestGuess}`
          : 'Manually correct the date',
        autoFixValue: dateResult.bestGuess || null,
      });
      computed.date = dateResult.bestGuess || null;
    } else if (dateResult.ambiguous) {
      anomalies.push({
        type: 'AMBIGUOUS_DATE',
        severity: 'WARNING',
        description: `Date "${raw.date}" is ambiguous (could be DD-MM or MM-DD). Interpreted as ${dateResult.value}.`,
        suggestedAction: `Using ${dateResult.value} based on DD-MM-YYYY convention used in the rest of the file`,
        autoFixValue: dateResult.value,
      });
    }
  }

  detectFutureDate(raw, anomalies, computed) {
    if (computed.date) {
      const expDate = new Date(computed.date);
      const now = new Date();
      if (expDate > now) {
        anomalies.push({
          type: 'FUTURE_DATE',
          severity: 'WARNING',
          description: `Date "${raw.date}" is in the future (${expDate.toDateString()}).`,
          suggestedAction: 'Verify date and import if correct',
          autoFixValue: computed.date,
        });
      }
    }
  }

  detectMissingPayer(raw, anomalies, computed) {
    const paidByRaw = (raw.paid_by || '').trim();
    if (!paidByRaw) {
      anomalies.push({
        type: 'MISSING_PAYER',
        severity: 'ERROR',
        description: 'No payer specified (paid_by is empty).',
        suggestedAction: 'Assign payer manually after import',
        autoFixValue: null,
      });
      computed.payerId = null;
    }
  }

  detectNegativeAmount(raw, anomalies, computed, amountResult) {
    if (amountResult.valid && amountResult.value < 0) {
      // Check if refund vs error based on description keywords
      const desc = (raw.description || '').toLowerCase();
      const isRefund = desc.includes('refund') || desc.includes('credit') || desc.includes('return') || desc.includes('cashback');
      
      anomalies.push({
        type: 'NEGATIVE_AMOUNT',
        severity: 'WARNING',
        description: `Amount is negative (${amountResult.value}). Classified as ${isRefund ? 'REFUND' : 'ERROR'} based on keywords.`,
        suggestedAction: isRefund
          ? 'Import as a refund — reverses the original split proportionally'
          : 'Correct negative sign error to positive amount',
        autoFixValue: isRefund ? 'REFUND' : 'CORRECT',
      });
      computed.isRefund = isRefund;
      if (!isRefund) {
        computed.amount = Math.abs(amountResult.value);
      }
    }
  }

  detectZeroAmount(raw, anomalies, computed, amountResult) {
    if (amountResult.valid && amountResult.value === 0) {
      anomalies.push({
        type: 'ZERO_AMOUNT',
        severity: 'WARNING',
        description: 'Amount is zero. This expense has no financial effect.',
        suggestedAction: 'Skip this row (zero-value expense is a no-op)',
        autoFixValue: 'SKIP',
      });
      computed.skip = true;
    }
  }

  detectUSDCurrency(raw, anomalies, computed, amountResult) {
    const currency = (raw.currency || '').trim().toUpperCase();
    if (currency === 'USD' && amountResult.valid) {
      const rate = FX_RATES.USD;
      const convertedAmount = Math.round(computed.amount * rate * 100) / 100;
      anomalies.push({
        type: 'FOREIGN_CURRENCY',
        severity: 'INFO',
        description: `Expense is in USD. Converting to INR at 1 USD = ₹${rate} (Goa trip rate). Converted: ₹${convertedAmount}.`,
        suggestedAction: `Convert at 1 USD = ₹${rate}`,
        autoFixValue: `${convertedAmount}`,
      });
      computed.originalAmount = computed.amount;
      computed.originalCurrency = 'USD';
      computed.exchangeRate = rate;
      computed.amount = convertedAmount;
      computed.currency = 'INR';
    }
  }

  detectUnknownCurrency(raw, anomalies, computed) {
    const currency = (raw.currency || '').trim().toUpperCase();
    if (!currency) {
      anomalies.push({
        type: 'MISSING_CURRENCY',
        severity: 'WARNING',
        description: 'Currency field is empty. Defaulting to INR.',
        suggestedAction: 'Default to INR',
        autoFixValue: 'INR',
      });
      computed.currency = 'INR';
    } else if (currency !== 'INR' && currency !== 'USD') {
      const rate = FX_RATES[currency];
      if (rate) {
        const convertedAmount = Math.round(computed.amount * rate * 100) / 100;
        anomalies.push({
          type: 'FOREIGN_CURRENCY',
          severity: 'INFO',
          description: `Expense is in ${currency}. Converted to INR: ₹${convertedAmount}.`,
          suggestedAction: `Convert at 1 ${currency} = ₹${rate}`,
          autoFixValue: `${convertedAmount}`,
        });
        computed.originalAmount = computed.amount;
        computed.originalCurrency = currency;
        computed.exchangeRate = rate;
        computed.amount = convertedAmount;
        computed.currency = 'INR';
      } else {
        anomalies.push({
          type: 'UNKNOWN_CURRENCY',
          severity: 'ERROR',
          description: `Expense is in "${currency}" and no exchange rate is available.`,
          suggestedAction: 'Provide rate manually or skip row',
          autoFixValue: null,
        });
        computed.currency = currency;
      }
    }
  }

  detectSettlementEntry(raw, anomalies, computed) {
    const splitTypeRaw = (raw.split_type || '').trim().toLowerCase();
    const settlementIndicators = [
      /paid\s+(back|aisha|rohan|priya|meera|sam|dev)/i,
      /settlement/i,
      /deposit\s+share/i,
      /repay/i,
      /returned/i,
    ];
    const isSettlement =
      settlementIndicators.some((r) => r.test(raw.description || '')) ||
      (raw.notes || '').toLowerCase().includes('settlement') ||
      (splitTypeRaw === '' && (raw.notes || '').toLowerCase().includes('settlement'));

    if (isSettlement) {
      anomalies.push({
        type: 'SETTLEMENT_EXPENSE',
        severity: 'INFO',
        description: `"${raw.description}" appears to be a settlement or payment transfer, not a shared expense.`,
        suggestedAction: 'Reclassify as a Settlement record (excluded from expense totals)',
        autoFixValue: 'SETTLEMENT',
      });
      computed.reclassify = 'SETTLEMENT';
    }
  }

  detectInvalidSplitType(raw, anomalies, computed) {
    const splitTypeRaw = (raw.split_type || '').trim().toLowerCase();
    if (!splitTypeRaw && !computed.reclassify) {
      anomalies.push({
        type: 'INVALID_SPLIT_TYPE',
        severity: 'ERROR',
        description: 'Split type is missing or invalid. Defaulting to EQUAL.',
        suggestedAction: 'Default to EQUAL split',
        autoFixValue: 'EQUAL',
      });
      computed.splitType = 'EQUAL';
    } else if (!computed.reclassify) {
      const splitTypeMap = {
        equal: 'EQUAL',
        unequal: 'UNEQUAL',
        percentage: 'PERCENTAGE',
        share: 'SHARE',
      };
      computed.splitType = splitTypeMap[splitTypeRaw] || 'EQUAL';
    }
  }

  detectMismatchedSplitTotals(raw, anomalies, computed) {
    const splitDetailsRaw = (raw.split_details || '').trim();
    if (computed.splitType === 'PERCENTAGE' && splitDetailsRaw) {
      const percentages = parsePercentageSplit(splitDetailsRaw);
      const sum = percentages.reduce((a, b) => a + b.value, 0);
      if (Math.abs(sum - 100) > 0.01) {
        const normalized = percentages.map((p) => ({
          ...p,
          value: (p.value / sum) * 100,
        }));
        anomalies.push({
          type: 'MISMATCHED_SPLIT_TOTALS',
          severity: 'ERROR',
          description: `Percentages in split_details sum to ${sum.toFixed(1)}% instead of 100%. Declared split total mismatch.`,
          suggestedAction: `Normalize percentages proportionally to 100%: ${normalized.map((p) => `${p.name} ${p.value.toFixed(2)}%`).join(', ')}`,
          autoFixValue: JSON.stringify(normalized),
        });
        computed.normalizedPercentages = normalized;
      }
    }
  }

  detectSplitMembers(raw, anomalies, computed, members) {
    const splitWithRaw = (raw.split_with || '').trim();
    computed.splitMembers = [];

    if (splitWithRaw) {
      const splitNames = splitWithRaw.split(';').map((s) => s.trim()).filter(Boolean);

      for (const name of splitNames) {
        const match = resolveMember(name, members);
        if (match.exact) {
          const member = match.member;
          if (computed.date) {
            this.detectMemberNotJoinedYet(raw, anomalies, computed, name, member);
            this.detectMemberAlreadyLeft(raw, anomalies, computed, name, member);
          }
          // Only add to active split if they are within valid stay dates
          const expDate = computed.date ? new Date(computed.date) : null;
          const leftDate = member.leftAt ? new Date(member.leftAt) : null;
          const joinedDate = member.joinedAt ? new Date(member.joinedAt) : null;

          const isInactive = expDate && (
            (leftDate && expDate > leftDate) ||
            (joinedDate && expDate < joinedDate)
          );

          if (!isInactive) {
            computed.splitMembers.push({ userId: member.id, name: member.name });
          }
        } else if (match.fuzzy) {
          computed.splitMembers.push({ userId: match.member.id, name: match.member.name });
        } else {
          const isKabirStyle = name.toLowerCase().includes("'s friend") || name.includes("friend");
          anomalies.push({
            type: 'EXTERNAL_PARTICIPANT',
            severity: 'WARNING',
            description: `"${name}" in split_with is not a registered group member.`,
            suggestedAction: isKabirStyle
              ? `Absorb ${name}'s share into the inviting member's share (guest does not get an account)`
              : `Create "${name}" as a guest user`,
            autoFixValue: isKabirStyle ? `ABSORB:${name}` : `GUEST:${name}`,
          });
        }
      }
    } else {
      // Missing participants check
      anomalies.push({
        type: 'MISSING_PARTICIPANTS',
        severity: 'WARNING',
        description: 'No participants specified in split_with.',
        suggestedAction: 'Default to all active group members at the expense date',
        autoFixValue: 'ALL_ACTIVE',
      });
    }
  }

  detectMemberNotJoinedYet(raw, anomalies, computed, name, member) {
    const expDate = new Date(computed.date);
    if (member.joinedAt && expDate < new Date(member.joinedAt)) {
      anomalies.push({
        type: 'MEMBER_NOT_JOINED_YET',
        severity: 'WARNING',
        description: `${name} had not yet joined the group by ${expDate.toDateString()} (joined ${new Date(member.joinedAt).toDateString()}).`,
        suggestedAction: `Exclude ${name} from split`,
        autoFixValue: `REMOVE:${member.id}`,
      });
    }
  }

  detectMemberAlreadyLeft(raw, anomalies, computed, name, member) {
    const expDate = new Date(computed.date);
    if (member.leftAt && expDate > new Date(member.leftAt)) {
      anomalies.push({
        type: 'MEMBER_ALREADY_LEFT',
        severity: 'WARNING',
        description: `${name} had already left the group by ${new Date(member.leftAt).toDateString()} (expense date: ${expDate.toDateString()}).`,
        suggestedAction: `Exclude ${name} from split and redistribute`,
        autoFixValue: `REMOVE:${member.id}`,
      });
    }
  }

  detectDuplicate(raw, anomalies, computed, rowNumber, processedRows) {
    const fingerprint = buildFingerprint(raw);
    if (this.fingerprints.has(fingerprint)) {
      const originalRow = this.fingerprints.get(fingerprint);
      anomalies.push({
        type: 'DUPLICATE',
        severity: 'ERROR',
        description: `This row is identical (or near-identical in description/amount/date/payer) to row ${originalRow}. Likely entered twice.`,
        suggestedAction: `Skip this row — keep row ${originalRow}`,
        autoFixValue: 'SKIP',
      });
      computed.skip = true;
    } else {
      const nearDup = findNearDuplicate(raw, processedRows);
      if (nearDup) {
        anomalies.push({
          type: 'NEAR_DUPLICATE',
          severity: 'ERROR',
          description: `This row appears to be a near-duplicate of row ${nearDup.rowNumber}: "${nearDup.description}" (${nearDup.raw.paid_by}, ${nearDup.raw.amount}).`,
          suggestedAction:
            raw.notes && raw.notes.toLowerCase().includes('wrong')
              ? `Skip this row — notes on the other row indicate this one is incorrect`
              : `Review conflict: keep the one with notes or larger specificity.`,
          autoFixValue:
            raw.notes && raw.notes.toLowerCase().includes('wrong') ? 'SKIP' : 'CONFLICT',
        });
        if (raw.notes && raw.notes.toLowerCase().includes('wrong')) {
          computed.skip = true;
        } else {
          computed.conflict = nearDup.rowNumber;
        }
      } else {
        this.fingerprints.set(fingerprint, rowNumber);
      }
    }
  }
}

// ─────────────────────────────────────────────
// Compatibility functions
// ─────────────────────────────────────────────

function detectAnomalies(rawRows, members) {
  const parser = new CSVParser();
  return parser.parse(rawRows, members);
}

function parseDate(raw) {
  if (!raw) return { valid: false, value: null, bestGuess: null, ambiguous: false };

  const s = raw.toString().trim();

  // Pattern: DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (isValidDate(date)) {
      const dayNum = parseInt(d);
      const monthNum = parseInt(m);
      const ambiguous = dayNum <= 12 && monthNum <= 12 && dayNum !== monthNum;
      return { valid: true, value: date.toISOString(), ambiguous, bestGuess: date.toISOString() };
    }
  }

  // Pattern: MMM-DD (e.g., "Mar-14")
  const mmmdd = s.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (mmmdd) {
    const monthNames = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const [, mon, d] = mmmdd;
    const m = monthNames[mon.toLowerCase()];
    if (m) {
      const date = new Date(`2026-${m}-${d.padStart(2, '0')}`);
      if (isValidDate(date)) {
        return {
          valid: false,
          ambiguous: false,
          value: date.toISOString(),
          bestGuess: date.toISOString(),
        };
      }
    }
  }

  return { valid: false, value: null, bestGuess: null, ambiguous: false };
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: false, value: null, hadCommas: false, excessiveDecimals: false };
  }
  const s = raw.toString().trim();
  const hadCommas = s.includes(',');
  const cleaned = s.replace(/,/g, '');
  const num = parseFloat(cleaned);

  if (isNaN(num)) {
    return { valid: false, value: null, hadCommas, excessiveDecimals: false };
  }

  const decimalPart = cleaned.split('.')[1] || '';
  const excessiveDecimals = decimalPart.length > 2;

  return { valid: true, value: num, hadCommas, excessiveDecimals };
}

function resolveMember(name, members) {
  const normalized = name.trim().toLowerCase();

  const exact = members.find((m) => m.name.toLowerCase() === normalized);
  if (exact) return { exact: true, member: exact, score: 1 };

  const fuzzy = members.find(
    (m) =>
      normalized.startsWith(m.name.toLowerCase()) ||
      m.name.toLowerCase().startsWith(normalized)
  );
  if (fuzzy) {
    const score = longestCommonPrefixScore(normalized, fuzzy.name.toLowerCase());
    return { fuzzy: true, member: fuzzy, score };
  }

  return { exact: false, fuzzy: false, member: null, score: 0 };
}

function longestCommonPrefixScore(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i / Math.max(a.length, b.length);
}

function parsePercentageSplit(raw) {
  return raw
    .split(';')
    .map((part) => {
      const match = part.trim().match(/^(.+?)\s+([\d.]+)%?$/);
      if (!match) return null;
      return { name: match[1].trim(), value: parseFloat(match[2]) };
    })
    .filter(Boolean);
}

function buildFingerprint(row) {
  const desc = (row.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const amount = String(row.amount || '').replace(/,/g, '');
  const payer = (row.paid_by || '').toLowerCase().replace(/\s/g, '');
  const date = (row.date || '').replace(/[^0-9a-z]/gi, '');
  return `${desc}|${amount}|${payer}|${date}`;
}

function findNearDuplicate(raw, existingRows) {
  const rawDesc = (raw.description || '').toLowerCase().replace(/[^a-z]/g, '');
  const rawDate = (raw.date || '').toString();
  const rawSplit = (raw.split_with || '').split(';').map((s) => s.trim().toLowerCase());

  for (const existing of existingRows) {
    if (existing.computed.skip || existing.computed.reclassify) continue;

    const exDesc = (existing.raw.description || '').toLowerCase().replace(/[^a-z]/g, '');
    const exDate = (existing.raw.date || '').toString();
    const exSplit = (existing.raw.split_with || '').split(';').map((s) => s.trim().toLowerCase());

    if (rawDate !== exDate) continue;

    const descSimilarity = jaroWinkler(rawDesc, exDesc);
    if (descSimilarity < 0.7) continue;

    const overlap = rawSplit.filter((m) => exSplit.includes(m)).length;
    if (overlap < 2) continue;

    if (
      String(raw.amount).replace(/,/g, '') !== String(existing.raw.amount).replace(/,/g, '') ||
      (raw.paid_by || '').toLowerCase() !== (existing.raw.paid_by || '').toLowerCase()
    ) {
      return { rowNumber: existing.rowNumber, description: existing.raw.description, raw: existing.raw };
    }
  }

  return null;
}

function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function deriveRowStatus(anomalies, computed) {
  if (computed.skip) return 'SKIP';
  if (computed.reclassify) return 'RECLASSIFY';
  if (anomalies.some((a) => a.severity === 'ERROR')) return 'ERROR';
  if (anomalies.some((a) => a.severity === 'WARNING')) return 'WARNING';
  if (anomalies.length > 0) return 'INFO';
  return 'OK';
}

function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}

function buildImportReport(processedRows) {
  const statusCounts = { OK: 0, WARNING: 0, ERROR: 0, INFO: 0, SKIP: 0, RECLASSIFY: 0 };
  const anomalyCounts = {};
  const allAnomalies = [];

  for (const row of processedRows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    for (const a of row.anomalies) {
      anomalyCounts[a.type] = (anomalyCounts[a.type] || 0) + 1;
      allAnomalies.push({ rowNumber: row.rowNumber, ...a });
    }
  }

  return {
    totalRows: processedRows.length,
    statusCounts,
    anomalyCounts,
    anomalies: allAnomalies,
    processedRows,
  };
}

module.exports = {
  detectAnomalies,
  buildImportReport,
  parseDate,
  parseAmount,
  resolveMember,
  parsePercentageSplit,
  computeShares: null,
  FX_RATES,
  CSVParser,
};
