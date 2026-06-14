# SCOPE.md — Anomaly Log & Database Schema

## Part 1: CSV Anomaly Log

The `expenses_export.csv` contains **18 deliberate data problems**. The table below documents each one, where it appears, how the importer detects it, and the policy applied.

---

| # | Row | Description | Anomaly Type | Severity | Detection Method | Policy Applied |
|---|-----|-------------|--------------|----------|------------------|----------------|
| 1 | 5 | `dinner - marina bites` (Dev, 3200 INR, 08-02-2026) | **DUPLICATE** | ERROR | Fingerprint: normalize description text + amount + payer + date → identical to row 4 | Surface to user. Auto-suggest: Skip row 5, keep row 4. User must approve. |
| 2 | 6 | `Electricity Feb` — amount `1,200` | **MALFORMED_AMOUNT** | WARNING | Regex detects comma inside numeric field | Strip comma → 1200. Log: "locale comma stripped". |
| 3 | 10 | `paid_by` = `"Priya S"` (not "Priya") | **AMBIGUOUS_PAYER** | WARNING | Prefix fuzzy match: "Priya S" starts with "Priya" | Resolve to user "Priya" (score: 83%). Log fuzzy match. User sees confirmation. |
| 4 | 12 | `paid_by` is empty — house cleaning supplies | **MISSING_PAYER** | ERROR | Empty string check on `paid_by` field | Flag as ERROR. Import with `paidById = null`. User must assign payer after import. |
| 5 | 13 | `Rohan paid Aisha back` — notes say "settlement not an expense" | **SETTLEMENT_EXPENSE** | INFO | Keyword pattern: `/paid\s+back/i` in description + empty `split_type` + notes contain "settlement" | Reclassify as `Settlement` record (Rohan → Aisha, ₹5000). Excluded from expense totals. |
| 6 | 14 | Pizza Friday percentages: 30+30+30+20 = 110% | **PERCENTAGE_SUM_ERROR** | ERROR | Sum of parsed percentages ≠ 100 (abs diff > 0.01) | Normalize proportionally: Aisha 27.27%, Rohan 27.27%, Priya 27.27%, Meera 18.18%. User must accept. |
| 7 | 19–25 | Goa trip: amounts in USD (540, 84, 150, -30) | **FOREIGN_CURRENCY** | INFO | `currency` field != "INR" | Convert at 1 USD = ₹83.5 (March 2026 market rate). Store original amount, currency, and exchange rate on the expense record. |
| 8 | 22 | `Parasailing` — `split_with` includes `"Dev's friend Kabir"` | **EXTERNAL_PARTICIPANT** | WARNING | Member name lookup fails; string contains "'s friend" pattern | Absorb Kabir's share into Dev's portion (Dev invited him). Total stays USD 150; 4-way split among Aisha, Rohan, Priya, Dev. Log: guest absorbed. |
| 9 | 23 & 24 | `Dinner at Thalassa` (Aisha, 2400) and `Thalassa dinner` (Rohan, 2450) — same date, overlapping split | **NEAR_DUPLICATE** | ERROR | Same date + Jaro-Winkler similarity ≥ 0.7 on description + ≥ 2 shared split members | Row 24 note says "Aisha also logged this I think hers is wrong." Auto-suggest: skip row 23, keep row 24 (2450). Requires user approval. |
| 10 | 25 | `Parasailing refund` — amount = `-30 USD` | **NEGATIVE_AMOUNT** | WARNING | `amount < 0` check | Treat as refund/credit. Reverse-split -30 USD (= -₹2505) equally among Aisha, Rohan, Priya, Dev. Each gets a ₹626.25 credit. |
| 11 | 26 | `Mar-14` — date in `MMM-DD` format instead of `DD-MM-YYYY` | **INVALID_DATE** | ERROR | `Date.parse()` fails on standard formats; regex fallback catches `MMM-DD` pattern | Interpret as 14-Mar-2026 (year inferred from surrounding context). Flag as WARNING. |
| 12 | 27 | `Groceries DMart` — `currency` field is empty | **MISSING_CURRENCY** | WARNING | Empty string check on `currency` field | Default to INR (consistent with all other rows). Log: "defaulted to INR". |
| 13 | 30 | `Dinner order Swiggy` — amount = `0` | **ZERO_AMOUNT** | WARNING | `amount == 0` check | Skip: zero-value expense has no financial effect. Notes say "counted twice earlier". |
| 14 | 33 | `04-05-2026` Deep cleaning service — could be 4 May or 5 April | **AMBIGUOUS_DATE** | WARNING | `DD ≤ 12 AND MM ≤ 12 AND DD ≠ MM` in DD-MM-YYYY pattern; position in file (between March and April rows) | Apply DD-MM-YYYY convention used throughout file → interpret as **05-Apr-2026**. Flag: ambiguous. Require user confirmation. |
| 15 | 35 | April groceries — `split_with` includes `"Meera"` (left 31-Mar-2026) | **INACTIVE_MEMBER** | WARNING | Compare expense date (02-Apr-2026) vs member `leftAt` (31-Mar-2026) | Remove Meera from split. Redistribute among active members: Aisha, Rohan, Priya. Re-split EQUAL among 3. |
| 16 | 37 | `Sam deposit share` — ₹15,000 from Sam to Aisha; description is a deposit, not expense | **SETTLEMENT_EXPENSE** | INFO | Keyword match: `/deposit/i` in description + single receiver in `split_with` | Reclassify as Settlement (Sam → Aisha, ₹15,000). |
| 17 | 9 | `Cylinder refill` — amount = `899.995` (3 decimal places) | **PRECISION_ANOMALY** | WARNING | `decimalPlaces > 2` check on parsed float | Round to ₹900.00 using "round half up" (standard financial rounding). Log: "rounded 899.995 → 900.00". |
| 18 | 40 | `Furniture for common room` — `split_type = "equal"` but `split_details` has share units `Aisha 1; Rohan 1; Priya 1; Sam 1` | **CONTRADICTORY_SPLIT** | WARNING | `split_type == equal` AND `split_details` non-empty AND no `%` symbol detected | Override to SHARE split (explicit share units take precedence over declared type). Since all units = 1, result is the same as EQUAL — but the override is logged for transparency. |

---

## Policy Decisions Summary

| Scenario | Policy |
|----------|--------|
| Exact duplicate (same fingerprint) | Skip duplicate; keep first occurrence. Requires user approval. |
| Near-duplicate with conflicting amounts | Surface both; auto-suggest keeping the one with notes. Requires user approval. |
| Settlement disguised as expense | Reclassify as Settlement record. Never counted in expense totals or balances. |
| Percentage sum ≠ 100% | Normalize proportionally. Show corrected percentages to user; require approval. |
| Negative amount | Treat as refund/credit. Reverse-split proportionally. |
| Zero amount | Skip automatically. |
| Missing payer | Import with null payer; flag for manual correction. Cannot auto-fix. |
| Missing currency | Default to INR. Log warning. |
| Foreign currency (USD) | Convert at stored rate (1 USD = ₹83.5). Store original values for auditability. |
| Inactive member in split | Remove from split, redistribute among active members. |
| Ambiguous date | Apply document-wide convention (DD-MM-YYYY). Flag for user confirmation. |
| Malformed amount (comma) | Strip comma, parse as number. Log warning. |
| Excessive decimal places | Round to 2dp (round-half-up). Log warning. |
| External participant (guest) | Absorb share into inviting member's portion if guest-style name. Otherwise create guest account. |
| Contradictory split type | Explicit share details override declared type. Log override. |

---

## Part 2: Database Schema

```
┌─────────────────────────────────────────────────────────────────────┐
│  users                                                              │
│  id (PK uuid)  name  email (unique)  passwordHash  avatarColor      │
│  isGuest  createdAt  updatedAt                                       │
└───────────────────┬─────────────────────────────────────────────────┘
                    │ 1:N
┌───────────────────▼─────────────────────────────────────────────────┐
│  groups                                                             │
│  id (PK uuid)  name  description  currency  createdAt  updatedAt    │
└───────────┬───────────────────────────────────────────────────────-─┘
            │
    ┌────────┴──────────────────────────────────┐
    │                                           │
    ▼                                           ▼
┌────────────────────────┐      ┌───────────────────────────────────┐
│  group_members         │      │  expenses                         │
│  id (PK)               │      │  id (PK uuid)                     │
│  groupId (FK groups)   │      │  groupId (FK groups)              │
│  userId  (FK users)    │      │  description  amount              │
│  joinedAt  leftAt      │      │  originalAmount  originalCurrency │
│  role                  │      │  exchangeRate  currency           │
│  UNIQUE(groupId,userId)│      │  paidById (FK users)              │
└────────────────────────┘      │  splitType (ENUM)                 │
                                │  date  notes                      │
                                │  isDeleted  deletedAt             │
                                │  importBatchId  csvRowNumber      │
                                │  createdAt  updatedAt             │
                                └──────────────┬────────────────────┘
                                               │ 1:N
                                ┌──────────────▼────────────────────┐
                                │  expense_shares                   │
                                │  id (PK uuid)                     │
                                │  expenseId (FK expenses)          │
                                │  userId (FK users)                │
                                │  amount  percentage  shareUnit    │
                                │  UNIQUE(expenseId, userId)        │
                                └───────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│  settlements                                                      │
│  id (PK uuid)  groupId (FK)                                       │
│  payerId (FK users)  receiverId (FK users)                        │
│  amount  currency  date  notes                                    │
│  importBatchId  csvRowNumber  createdAt                           │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│  import_batches                                                   │
│  id (PK uuid)  groupId (FK)  filename  importedById (FK)         │
│  status  totalRows  importedExpenses  importedSettlements         │
│  skippedRows  anomalyCount  importedAt                            │
└──────────────────────┬────────────────────────────────────────────┘
                       │ 1:N
┌──────────────────────▼────────────────────────────────────────────┐
│  import_anomalies                                                 │
│  id (PK uuid)  batchId (FK import_batches)                       │
│  rowNumber  rawData (JSON)  anomalyType  severity                 │
│  description  suggestedAction  autoFixValue                       │
│  userDecision  overrideValue  resolvedAt                          │
└───────────────────────────────────────────────────────────────────┘
```

### SplitType Enum
`EQUAL | UNEQUAL | PERCENTAGE | SHARE`

### Key Design Decisions
- **`leftAt` on GroupMember** enables point-in-time membership queries. The importer uses this to flag expenses assigned to members who had already left.
- **`originalAmount` / `originalCurrency` / `exchangeRate` on Expense** preserves full audit trail for foreign-currency expenses. The UI shows both original and converted values.
- **Soft delete on Expense** (`isDeleted` flag) preserves audit trail and allows recovery.
- **`ImportAnomaly` table** provides a permanent, queryable record of every data issue found during import. The import report page reads from this table.
- **`csvRowNumber` on Expense and Settlement** enables tracing any imported record back to its exact source row for live-session demos.
