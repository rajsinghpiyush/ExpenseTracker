# DECISIONS.md — Engineering & Product Decision Log

Each decision below documents the problem, the options considered, and the rationale for the choice made.

---

## 1. Database: Supabase (PostgreSQL) over Vercel Postgres or PlanetScale

**Problem**: The assignment requires a relational database and Vercel deployment.

**Options considered**:
| Option | Pros | Cons |
|--------|------|------|
| Vercel Postgres (Neon) | Native Vercel integration | Requires credit card even on free tier |
| Supabase | Free PostgreSQL, excellent dashboard, connection pooling via PgBouncer, no card required | Slight cold-start latency on free tier |
| PlanetScale | Good MySQL support | MySQL not Postgres; foreign key constraints disabled by default |

**Decision**: **Supabase**. Free, persistent, real PostgreSQL with connection pooling — everything the assignment needs without billing friction.

---

## 2. ORM: Prisma over raw SQL or Sequelize

**Problem**: Need type-safe, migration-tracked database access.

**Options considered**:
| Option | Pros | Cons |
|--------|------|------|
| Raw SQL (pg) | Full control, no overhead | Error-prone, no migration tracking, no type safety |
| Sequelize | Mature, widely known | Verbose, poor TypeScript/inference story |
| Prisma | Type-safe client generation, declarative schema, migration files | Slightly heavier cold start in serverless |

**Decision**: **Prisma**. The schema file (`schema.prisma`) serves as living documentation of the data model — useful for live sessions. Migration history proves the schema evolved intentionally.

---

## 3. Import Flow: Two-Phase (Preview → Confirm) vs. Single-Pass

**Problem**: Meera's requirement — "I want to approve anything the app deletes or changes." This rules out a silent single-pass import.

**Options considered**:
- **Single-pass with auto-fix**: Fast, but silently mutates data. Fails Meera's requirement.
- **Preview-only with user decisions**: User reviews all anomalies, then clicks Confirm. Nothing written until confirmed.
- **Row-by-row interactive**: Surface one anomaly at a time. Too slow for 41 rows.

**Decision**: **Two-phase flow** (preview → confirm). The `/import/preview` endpoint runs the full anomaly pipeline and returns a structured report — no DB writes. The user sees every flagged row, makes ACCEPT/REJECT decisions, then submits all decisions in `/import/confirm`. This satisfies Meera's requirement exactly.

---

## 4. Anomaly Detection: 18 Types, User Approval Required

**Problem**: The CSV has 12+ deliberate problems. A crashed import fails; a silent guess fails. Every anomaly must be detected, surfaced, and handled with a documented policy.

**Key sub-decisions**:

### 4a. Duplicate Detection: Fingerprint vs. Full-Row Hash
- **Full-row hash**: Too strict — a description with different casing would not match.
- **Fingerprint** (normalize description + amount + payer + date): Catches case-insensitive duplicates like "Dinner at Marina Bites" vs "dinner - marina bites".
- **Decision**: Fingerprint. More practical for real-world messy data.

### 4b. Near-Duplicate (Thalassa): Which Row Wins?
- Aisha logged 2400, Rohan logged 2450, Rohan's note says "Aisha's is wrong."
- Options: keep higher, keep lower, keep the one with notes.
- **Decision**: Keep the row whose **sibling has a note explicitly saying the other is wrong**. The note `"Aisha also logged this I think hers is wrong"` is on row 24 (Rohan's), pointing at row 23 (Aisha's). So row 23 is auto-suggested for rejection. User still must approve.

### 4c. Percentage Sum ≠ 100% (Pizza Friday: 110%): Error or Warning?
- 110% is clearly a data error — the numbers don't make financial sense as-is.
- Options: reject the row; normalize proportionally; default to equal.
- **Decision**: **Normalize proportionally** and surface as ERROR requiring user approval. Proportional normalization preserves the relative intent (Aisha/Rohan/Priya each pay more than Meera) while making the math work.

### 4d. Negative Amount (Parasailing Refund -30 USD): Error or Refund?
- A negative amount could mean: data entry error, refund, or credit.
- The notes say "one slot got cancelled" — clearly a refund.
- **Decision**: Treat as **REFUND/credit**. Reverse-split the negative amount proportionally. This reduces each member's share of the original parasailing expense.

### 4e. Settlement Detection: Keywords vs. Empty Split Type
- "Rohan paid Aisha back" and "Sam deposit share" are settlements, not expenses.
- Detection approach: regex on description + notes + empty split_type.
- **Decision**: Multi-signal detection — match any of: `/paid\s+back/i`, `/deposit\s+share/i`, `/settlement/i` in description or notes; OR split_type is empty AND notes mention settlement. Reclassify as `Settlement` record.

---

## 5. Kabir (External Guest): Absorb into Dev vs. Create Guest Account

**Problem**: "Dev's friend Kabir" joined parasailing for one day. Kabir has no user account.

**Options**:
- Create a guest `User` record for Kabir, give him a ₹2507.50 share → he appears in group balances forever with no way to settle.
- Absorb Kabir's share into Dev's portion: Dev paid, Dev invited him, Dev is responsible.
- Leave it as a memo note with no financial effect.

**Decision**: **Absorb into Dev**. Kabir has no ongoing relationship with the group. His share goes into Dev's column. The absorption is logged in the import anomaly record for traceability. This produces cleaner group balances with no dangling accounts.

---

## 6. Currency Conversion Rate: Hard-coded vs. Live API

**Problem**: USD expenses appear during the Goa trip (March 2026). "The sheet pretends a dollar is a rupee. That can't be right." — Priya.

**Options**:
- Live API (exchangerate.host / Fixer.io): accurate, but requires API key, network call, may fail.
- Historical rate lookup: need a paid API for historical data.
- Hard-coded rate for March 2026 (₹83.5/USD): approximate but stable and transparent.

**Decision**: **Hard-code ₹83.5/USD** (approximate mid-market rate, March 2026). The rate is stored on each converted expense record in `exchangeRate` column, so it's fully auditable — anyone can see exactly which rate was applied. The import report shows the rate explicitly. This is more reliable than a live API in a demo context and satisfies Priya's requirement.

---

## 7. Balance Calculation: Contribution-Share Model vs. Pairwise IOU Tracking

**Problem**: Need accurate, auditable per-person balances.

**Options**:
- **Pairwise IOU**: Track who-owes-whom directly for each expense. Produces many bilateral debts, complex to settle.
- **Net balance per person**: `net = sum(paid) - sum(owed_in_shares) ± settlement_effects`. Single number per person.
- **Matrix approach**: N×N matrix of debts. Accurate but hard to display and settle.

**Decision**: **Net balance per person**, then apply the **greedy minimum-transactions algorithm** to produce the minimum set of payments to clear all debts. This gives Aisha "one number per person, who pays whom, done" and gives Rohan a drill-down to see exactly which expenses contribute.

---

## 8. Meera's Exit and Sam's Entry: Hard Dates vs. Soft Rules

**Problem**: 
- Meera moved out end of March. The CSV has a Feb-April groceries entry still including Meera.
- Sam moved in mid-April. The CSV correctly starts including Sam from his housewarming date.

**Options**:
- Soft rule: "only include members who are in `split_with`" — ignore membership dates entirely.
- Hard dates: Store `joinedAt`/`leftAt` on `GroupMember`. Importer cross-checks expense date vs. membership dates.

**Decision**: **Hard dates + importer check**. Both `joinedAt` and `leftAt` are stored on `GroupMember`. The import pipeline checks every name in `split_with` against the expense date — if a member had already left by that date, it's flagged as `INACTIVE_MEMBER`. This satisfies Sam's requirement ("Why would March electricity affect my balance?") — it doesn't, because Sam is not in the `split_with` of March expenses, and his `joinedAt` is April 10.

---

## 9. Rounding: Round-Half-Up vs. Banker's Rounding

**Problem**: When dividing ₹48,000 equally among 4 people, each pays exactly ₹12,000 — no rounding issue. But ₹1199 / 4 = ₹299.75, and ₹899.995 rounded to 2dp needs a rule.

**Decision**: **Round-half-up** (standard financial/commercial rounding: 0.5 rounds up). This is what users expect. Any rounding remainder is added to the first person's share (consistent, deterministic). This is different from "banker's rounding" (round half to even) which is statistically unbiased but produces surprising results for users.

---

## 10. Frontend: Vanilla CSS vs. Tailwind vs. MUI

**Problem**: Need a premium-looking, responsive UI.

**Options**:
- **Tailwind CSS**: utility-first, fast to prototype, but class bloat on complex components.
- **Material UI / Chakra**: pre-built components, but heavy and harder to customize for a unique dark theme.
- **Vanilla CSS with custom properties**: full control over the design system, no framework overhead, perfectly matches dark glassmorphism aesthetic.

**Decision**: **Vanilla CSS** with a comprehensive design system in `index.css` (custom properties for colors, spacing, shadows, animations). Every visual element is intentional and explainable. No dependency on a framework that might release a breaking version.

---

## 11. Auth: JWT vs. Session Cookies vs. Supabase Auth

**Options**:
- Supabase Auth: free, integrated, but couples auth to the DB provider.
- Session cookies: stateful, requires sticky sessions (incompatible with serverless).
- JWT in localStorage: stateless, works on serverless, simple to implement.

**Decision**: **JWT in localStorage**. Stateless tokens work perfectly with Vercel serverless. The 401 interceptor in `api/client.js` handles expiry globally. For production hardening, moving to httpOnly cookies would be the next step.
