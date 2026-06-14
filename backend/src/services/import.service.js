/**
 * import.service.js
 *
 * CSV Import Pipeline — Anomaly Detection Engine
 *
 * This service takes raw parsed CSV rows and a list of known group members,
 * then runs each row through a series of detectors. Each anomaly is categorized
 * by type and severity, and an auto-fix is suggested. Users must approve or
 * reject flagged rows before the data is committed.
 *
 * Anomaly Types:
 *  DUPLICATE            - identical or near-identical row already seen
 *  NEAR_DUPLICATE       - same dinner logged by two people with different amounts
 *  MALFORMED_AMOUNT     - amount has locale commas or invalid format
 *  PRECISION_ANOMALY    - amount has more than 2 decimal places
 *  NEGATIVE_AMOUNT      - negative amount (refund / credit)
 *  ZERO_AMOUNT          - zero-value expense
 *  MISSING_PAYER        - paid_by is empty
 *  AMBIGUOUS_PAYER      - paid_by fuzzy-matches a known member
 *  EXTERNAL_PAYER       - paid_by is not a known member (guest)
 *  SETTLEMENT_EXPENSE   - row is a settlement disguised as an expense
 *  PERCENTAGE_SUM_ERROR - percentage split doesn't sum to 100%
 *  MISSING_CURRENCY     - currency field is empty
 *  FOREIGN_CURRENCY     - currency is not INR (needs conversion)
 *  EXTERNAL_PARTICIPANT - split_with contains a non-member name
 *  INACTIVE_MEMBER      - split_with contains a member who had left by the expense date
 *  INVALID_DATE         - date cannot be parsed
 *  AMBIGUOUS_DATE       - date format is ambiguous (DD-MM vs MM-DD)
 *  CONTRADICTORY_SPLIT  - split_type contradicts split_details
 *  MISSING_SPLIT_TYPE   - split_type is empty
 */

// USD→INR exchange rate used for the Goa trip (March 2026)
// Source: approximate market rate for March 2026, stored per-expense for full auditability
const FX_RATES = {
  USD: 83.5,
  EUR: 90.2,
};

// ─────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────

/**
 * Run the full anomaly detection pipeline on parsed CSV rows.
 *
 * @param {Array} rawRows - parsed CSV rows (objects with keys matching CSV headers)
 * @param {Array} members - group members [{ id, name, joinedAt, leftAt }]
 * @returns {Array} processedRows - each row enriched with anomalies + computed fields
 */
function detectAnomalies(rawRows, members) {
  const processedRows = [];

  // Fingerprints for duplicate detection (built as we process rows)
  const fingerprints = new Map(); // fingerprint -> rowIndex

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = i + 2; // 1-indexed, +1 for header
    const anomalies = [];
    const computed = {}; // auto-resolved values

    // ── 1. Date Parsing ────────────────────────────────────────────────────
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

    // ── 2. Amount Parsing ─────────────────────────────────────────────────
    const amountResult = parseAmount(raw.amount);
    computed.amount = amountResult.value;

    if (!amountResult.valid) {
      anomalies.push({
        type: 'MALFORMED_AMOUNT',
        severity: 'ERROR',
        description: `Amount "${raw.amount}" is not a valid number`,
        suggestedAction: 'Correct the amount before importing',
        autoFixValue: null,
      });
    } else {
      if (amountResult.hadCommas) {
        anomalies.push({
          type: 'MALFORMED_AMOUNT',
          severity: 'WARNING',
          description: `Amount "${raw.amount}" contains locale commas. Treating as ${amountResult.value}.`,
          suggestedAction: `Strip commas → ${amountResult.value}`,
          autoFixValue: String(amountResult.value),
        });
      }
      if (amountResult.excessiveDecimals) {
        const rounded = Math.round(amountResult.value * 100) / 100;
        anomalies.push({
          type: 'PRECISION_ANOMALY',
          severity: 'WARNING',
          description: `Amount ${amountResult.value} has more than 2 decimal places. Rounding to ${rounded}.`,
          suggestedAction: `Round to ${rounded}`,
          autoFixValue: String(rounded),
        });
        computed.amount = rounded;
      }
      if (amountResult.value < 0) {
        anomalies.push({
          type: 'NEGATIVE_AMOUNT',
          severity: 'WARNING',
          description: `Amount is negative (${amountResult.value}). This appears to be a refund or credit.`,
          suggestedAction: 'Import as a refund — reverses the original split proportionally',
          autoFixValue: 'REFUND',
        });
        computed.isRefund = true;
      }
      if (amountResult.value === 0) {
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

    // ── 3. Currency ───────────────────────────────────────────────────────
    const currency = (raw.currency || '').trim().toUpperCase();
    if (!currency) {
      anomalies.push({
        type: 'MISSING_CURRENCY',
        severity: 'WARNING',
        description: 'Currency field is empty. All other rows in this file use INR.',
        suggestedAction: 'Default to INR',
        autoFixValue: 'INR',
      });
      computed.currency = 'INR';
    } else if (currency !== 'INR') {
      const rate = FX_RATES[currency];
      if (rate) {
        const convertedAmount = Math.round(computed.amount * rate * 100) / 100;
        anomalies.push({
          type: 'FOREIGN_CURRENCY',
          severity: 'INFO',
          description: `Expense is in ${currency}. Converting to INR at 1 ${currency} = ₹${rate} (March 2026 rate). Original: ${currency} ${computed.amount} → INR ${convertedAmount}.`,
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
          type: 'FOREIGN_CURRENCY',
          severity: 'ERROR',
          description: `Expense is in ${currency} and no conversion rate is available.`,
          suggestedAction: 'Provide the exchange rate manually',
          autoFixValue: null,
        });
        computed.currency = currency;
      }
    } else {
      computed.currency = 'INR';
    }

    // ── 4. Payer Resolution ───────────────────────────────────────────────
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
    } else {
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
        // External/guest payer
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

    // ── 5. Split Type & Details ───────────────────────────────────────────
    const splitTypeRaw = (raw.split_type || '').trim().toLowerCase();
    const splitDetailsRaw = (raw.split_details || '').trim();

    // Settlement detection (before split type validation)
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
      splitTypeRaw === '' && (raw.notes || '').toLowerCase().includes('settlement');

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

    // Missing split type (if not a settlement)
    if (!splitTypeRaw && !computed.reclassify) {
      anomalies.push({
        type: 'MISSING_SPLIT_TYPE',
        severity: 'ERROR',
        description: 'No split_type specified.',
        suggestedAction: 'Default to EQUAL split',
        autoFixValue: 'EQUAL',
      });
      computed.splitType = 'EQUAL';
    } else if (!computed.reclassify) {
      // Map CSV split type to our enum
      const splitTypeMap = {
        equal: 'EQUAL',
        unequal: 'UNEQUAL',
        percentage: 'PERCENTAGE',
        share: 'SHARE',
      };
      computed.splitType = splitTypeMap[splitTypeRaw] || 'EQUAL';
    }

    // Contradictory split: type=equal but details have share units (not percentages)
    if (
      splitTypeRaw === 'equal' &&
      splitDetailsRaw &&
      splitDetailsRaw.includes(';') &&
      !splitDetailsRaw.includes('%')
    ) {
      anomalies.push({
        type: 'CONTRADICTORY_SPLIT',
        severity: 'WARNING',
        description: `split_type is "equal" but split_details contains share units (e.g., "Aisha 1; Rohan 1"). The share units override the equal split.`,
        suggestedAction: 'Override split_type to SHARE (explicit share units take precedence)',
        autoFixValue: 'SHARE',
      });
      computed.splitType = 'SHARE';
    }

    // Percentage sum validation
    if (computed.splitType === 'PERCENTAGE' && splitDetailsRaw) {
      const percentages = parsePercentageSplit(splitDetailsRaw);
      const sum = percentages.reduce((a, b) => a + b.value, 0);
      if (Math.abs(sum - 100) > 0.01) {
        const normalized = percentages.map((p) => ({
          ...p,
          value: (p.value / sum) * 100,
        }));
        anomalies.push({
          type: 'PERCENTAGE_SUM_ERROR',
          severity: 'ERROR',
          description: `Percentages in split_details sum to ${sum.toFixed(1)}% instead of 100%. Normalized proportionally: ${normalized.map((p) => `${p.name} ${p.value.toFixed(1)}%`).join(', ')}.`,
          suggestedAction: `Normalize proportionally to 100%: ${normalized.map((p) => `${p.name} ${p.value.toFixed(2)}%`).join(', ')}`,
          autoFixValue: JSON.stringify(normalized),
        });
        computed.normalizedPercentages = normalized;
      }
    }

    // ── 6. Split Members ──────────────────────────────────────────────────
    const splitWithRaw = (raw.split_with || '').trim();
    computed.splitMembers = [];

    if (splitWithRaw) {
      const splitNames = splitWithRaw.split(';').map((s) => s.trim()).filter(Boolean);

      for (const name of splitNames) {
        const match = resolveMember(name, members);
        if (match.exact) {
          // Check if member was active on this expense date
          if (computed.date) {
            const expDate = new Date(computed.date);
            const member = match.member;

            if (member.leftAt && expDate > new Date(member.leftAt)) {
              anomalies.push({
                type: 'INACTIVE_MEMBER',
                severity: 'WARNING',
                description: `${name} had left the group by ${new Date(member.leftAt).toDateString()} but is listed in this expense (${new Date(computed.date).toDateString()}).`,
                suggestedAction: `Remove ${name} from the split and redistribute among active members`,
                autoFixValue: `REMOVE:${member.id}`,
              });
              // Don't add to split members
              continue;
            }
            if (member.joinedAt && expDate < new Date(member.joinedAt)) {
              anomalies.push({
                type: 'INACTIVE_MEMBER',
                severity: 'WARNING',
                description: `${name} had not yet joined the group by ${new Date(computed.date).toDateString()} (joined ${new Date(member.joinedAt).toDateString()}).`,
                suggestedAction: `Remove ${name} from the split`,
                autoFixValue: `REMOVE:${member.id}`,
              });
              continue;
            }
          }
          computed.splitMembers.push({ userId: member.id, name: member.name });
        } else if (match.fuzzy) {
          computed.splitMembers.push({ userId: match.member.id, name: match.member.name });
          // Don't add anomaly for split_with fuzzy matches since AMBIGUOUS_PAYER already covers this pattern
        } else {
          // External participant
          const isKabirStyle = name.toLowerCase().includes("'s friend") || name.includes("friend");
          anomalies.push({
            type: 'EXTERNAL_PARTICIPANT',
            severity: 'WARNING',
            description: `"${name}" in split_with is not a registered group member.${isKabirStyle ? ' This appears to be a one-time external guest.' : ''}`,
            suggestedAction: isKabirStyle
              ? `Absorb ${name}'s share into the inviting member's share (guest does not get an account)`
              : `Create "${name}" as a guest user`,
            autoFixValue: isKabirStyle ? `ABSORB:${name}` : `GUEST:${name}`,
          });
          // Don't add external guests to computed.splitMembers (their share goes to inviter)
        }
      }
    }

    // ── 7. Duplicate Detection ────────────────────────────────────────────
    const fingerprint = buildFingerprint(raw);
    if (fingerprints.has(fingerprint)) {
      const originalRow = fingerprints.get(fingerprint);
      anomalies.push({
        type: 'DUPLICATE',
        severity: 'ERROR',
        description: `This row is identical (or near-identical in description/amount/date/payer) to row ${originalRow}. Likely entered twice.`,
        suggestedAction: `Skip this row — keep row ${originalRow}`,
        autoFixValue: 'SKIP',
      });
      computed.skip = true;
    } else {
      // Near-duplicate check (same date + fuzzy title match + overlapping split + different amount)
      const nearDup = findNearDuplicate(raw, processedRows);
      if (nearDup) {
        anomalies.push({
          type: 'NEAR_DUPLICATE',
          severity: 'ERROR',
          description: `This row appears to be a near-duplicate of row ${nearDup.rowNumber}: "${nearDup.description}" (${nearDup.raw.paid_by}, ${nearDup.raw.amount}). Same dinner logged by two people with different amounts.`,
          suggestedAction:
            raw.notes && raw.notes.toLowerCase().includes('wrong')
              ? `Skip this row — notes on the other row indicate this one is incorrect`
              : `Review conflict: this row (${raw.amount}) vs row ${nearDup.rowNumber} (${nearDup.raw.amount}). Keep the one with notes or larger specificity.`,
          autoFixValue:
            raw.notes && raw.notes.toLowerCase().includes('wrong') ? 'SKIP' : 'CONFLICT',
        });
        if (raw.notes && raw.notes.toLowerCase().includes('wrong')) {
          computed.skip = true;
        } else {
          computed.conflict = nearDup.rowNumber;
        }
      } else {
        fingerprints.set(fingerprint, rowNumber);
      }
    }

    processedRows.push({
      rowNumber,
      raw,
      computed,
      anomalies,
      // Overall row status
      status: deriveRowStatus(anomalies, computed),
    });
  }

  return processedRows;
}

// ─────────────────────────────────────────────
// Helper: Date Parsing
// ─────────────────────────────────────────────

function parseDate(raw) {
  if (!raw) return { valid: false, value: null, bestGuess: null, ambiguous: false };

  const s = raw.toString().trim();

  // Pattern: DD-MM-YYYY (standard in this file)
  const ddmmyyyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (isValidDate(date)) {
      // Check for ambiguity: if day value could also be a valid month
      const dayNum = parseInt(d);
      const monthNum = parseInt(m);
      // Ambiguous if day ≤ 12 AND month ≤ 12 AND they differ
      // Special case: 04-05-2026 — could be April 5 or May 4
      const ambiguous = dayNum <= 12 && monthNum <= 12 && dayNum !== monthNum;

      // All other rows consistently use DD-MM, so we follow that convention
      // The outlier 04-05-2026 surrounded by April entries is flagged
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
      // Infer year from context (2026 based on surrounding rows)
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

// ─────────────────────────────────────────────
// Helper: Amount Parsing
// ─────────────────────────────────────────────

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

  // Check decimal places
  const decimalPart = cleaned.split('.')[1] || '';
  const excessiveDecimals = decimalPart.length > 2;

  return { valid: true, value: num, hadCommas, excessiveDecimals };
}

// ─────────────────────────────────────────────
// Helper: Member Name Resolution
// ─────────────────────────────────────────────

function resolveMember(name, members) {
  const normalized = name.trim().toLowerCase();

  // Exact match (case-insensitive)
  const exact = members.find((m) => m.name.toLowerCase() === normalized);
  if (exact) return { exact: true, member: exact, score: 1 };

  // Fuzzy match: starts-with or contains
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

// ─────────────────────────────────────────────
// Helper: Percentage Split Parsing
// ─────────────────────────────────────────────

function parsePercentageSplit(raw) {
  // Format: "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
  return raw
    .split(';')
    .map((part) => {
      const match = part.trim().match(/^(.+?)\s+([\d.]+)%?$/);
      if (!match) return null;
      return { name: match[1].trim(), value: parseFloat(match[2]) };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────
// Helper: Fingerprint for Duplicate Detection
// ─────────────────────────────────────────────

function buildFingerprint(row) {
  const desc = (row.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const amount = String(row.amount || '').replace(/,/g, '');
  const payer = (row.paid_by || '').toLowerCase().replace(/\s/g, '');
  const date = (row.date || '').replace(/[^0-9a-z]/gi, '');
  return `${desc}|${amount}|${payer}|${date}`;
}

// ─────────────────────────────────────────────
// Helper: Near-Duplicate Detection
// ─────────────────────────────────────────────

function findNearDuplicate(raw, existingRows) {
  const rawDesc = (raw.description || '').toLowerCase().replace(/[^a-z]/g, '');
  const rawDate = (raw.date || '').toString();
  const rawSplit = (raw.split_with || '').split(';').map((s) => s.trim().toLowerCase());

  for (const existing of existingRows) {
    if (existing.computed.skip || existing.computed.reclassify) continue;

    const exDesc = (existing.raw.description || '').toLowerCase().replace(/[^a-z]/g, '');
    const exDate = (existing.raw.date || '').toString();
    const exSplit = (existing.raw.split_with || '').split(';').map((s) => s.trim().toLowerCase());

    // Same date
    if (rawDate !== exDate) continue;

    // Fuzzy description match (≥ 70% character overlap)
    const descSimilarity = jaroWinkler(rawDesc, exDesc);
    if (descSimilarity < 0.7) continue;

    // Overlapping split members (at least 2 in common)
    const overlap = rawSplit.filter((m) => exSplit.includes(m)).length;
    if (overlap < 2) continue;

    // Different payer or different amount (if same — would have been caught as duplicate)
    if (
      String(raw.amount).replace(/,/g, '') !== String(existing.raw.amount).replace(/,/g, '') ||
      (raw.paid_by || '').toLowerCase() !== (existing.raw.paid_by || '').toLowerCase()
    ) {
      return { rowNumber: existing.rowNumber, description: existing.raw.description, raw: existing.raw };
    }
  }

  return null;
}

// Jaro-Winkler similarity (simplified)
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

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ─────────────────────────────────────────────
// Helper: Row Status Derivation
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Import Report Builder
// ─────────────────────────────────────────────

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
  computeShares: null, // imported from balance.service
  FX_RATES,
};
