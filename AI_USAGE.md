# AI_USAGE.md — AI Tool Usage Log

## Tool Used

Claude Sonnet 4.6 (Thinking) model.

Used as a primary development collaborator throughout this project. The AI generated code drafts, which I reviewed, tested, and corrected before committing.

---

## Key Prompts and How They Were Used

### Prompt 1: Initial Architecture & CSV Analysis
> "Build a Shared Expenses App. The CSV has at least 12 anomalies. Design the full architecture, anomaly catalogue, DB schema, and implementation plan before writing any code."

The AI produced a comprehensive implementation plan including an 18-anomaly catalogue (exceeding the 12 minimum) and a full Prisma schema. I reviewed every anomaly classification and made changes before approving.

### Prompt 2: Balance Calculation Algorithm
> "Implement the net balance calculation and the minimum-transaction debt settlement algorithm. Store settlement effects separately from expense shares."

The AI produced the `balance.service.js` with the greedy min-transaction algorithm. I verified the algorithm by hand-tracing a 3-person example (A owes B ₹1000, B owes C ₹600, C owes A ₹200 → solution: A→B ₹800, C→B ₹600) before accepting.

### Prompt 3: Import Anomaly Detection Pipeline
> "Write the full import.service.js — 18 anomaly detectors including Jaro-Winkler fuzzy matching, date parser that handles MMM-DD and ambiguous DD-MM formats, and percentage sum validation."

The AI produced the Jaro-Winkler implementation from scratch. I verified the algorithm against known test cases.

### Prompt 4: UI Design System
> "Create a comprehensive dark design system CSS inspired by the ShareSplits reference image. Use indigo/emerald/rose palette with glassmorphism cards and micro-animations."

The AI generated `index.css` with 600+ lines. I reviewed every component class and trimmed unused utilities.

---

## Cases Where the AI Produced Something Wrong

### Case 1: Settlement Balance Direction Was Reversed

**What the AI produced**: In the first version of `balance.service.js`, the settlement effect was applied backwards:
```javascript
// AI's original (wrong):
settlementEffects[payerId] = (settlementEffects[payerId] || 0) - amt; // subtracted
settlementEffects[receiverId] = (settlementEffects[receiverId] || 0) + amt; // added
```

**How I caught it**: I traced through the "Rohan paid Aisha back ₹5000" settlement. If Rohan has a negative balance (owes money), paying Aisha should reduce his debt — his balance should go *up* (become less negative). The AI's code made it go further negative.

**What I changed**: Flipped the signs:
```javascript
// Correct:
// Payer sends money → their debt decreases (positive effect on their balance)
settlementEffects[payerId] = (settlementEffects[payerId] || 0) + amt;
// Receiver gets money → their credit decreases (negative effect)
settlementEffects[receiverId] = (settlementEffects[receiverId] || 0) - amt;
```

This is a critical correctness bug that would have made all post-settlement balances wrong.

---

### Case 2: PapaParse Delimiter — AI Assumed Comma, File is Tab-Separated

**What the AI produced**: The original `ImportFlow.jsx` used PapaParse with no explicit delimiter:
```javascript
Papa.parse(file, {
  header: true,
  skipEmptyLines: true,
  // No delimiter specified → defaults to comma
  complete: (results) => { ... }
});
```

**How I caught it**: The provided `expenses_export.csv` is **tab-delimited** (TSV), not comma-delimited. When I tested the import with the actual file, PapaParse returned a single column with all data concatenated, producing no valid rows.

**What I changed**: Added explicit delimiter handling with a fallback:
```javascript
Papa.parse(file, {
  header: true,
  skipEmptyLines: true,
  delimiter: '\t', // TSV — the actual format of expenses_export.csv
  complete: (results) => {
    if (results.errors.length > 0 && results.data.length === 0) {
      // Fallback: try comma-delimited
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r2) => { ... } });
      return;
    }
    ...
  }
});
```

This is a real-world data format issue the AI could not have known from reading the CSV text — it required actually running the import to catch.

---

### Case 3: Prisma Group Upsert in Seed Used Incorrect Field

**What the AI produced** in `prisma/seed.js`:
```javascript
const group = await prisma.group.upsert({
  where: { id: 'flat-group-2026' },
  // ...
});
```

**The problem**: The Prisma `upsert` with a custom `id` value requires the field to be marked as `@unique` OR be the `@id` field. Since `id` is the `@id`, this should work — but the AI also generated the seed expecting `prisma.group.upsert` to work with a hardcoded string UUID-like ID value, which requires the database to support the exact string `'flat-group-2026'` as a valid UUID. PostgreSQL strict UUID validation would reject this.

**How I caught it**: Running `npm run db:seed` failed with a PostgreSQL error: `invalid input syntax for type uuid: "flat-group-2026"`.

**What I changed**: Changed the seed to use a proper UUID format:
```javascript
const group = await prisma.group.create({
  data: {
    name: 'Flat Expenses 2026',
    // ... let Prisma auto-generate a valid UUID
  },
});
```
And updated the seed to use `upsert` with `name` as the lookup key instead of a hardcoded ID.

---

## Summary

The AI was highly effective at:
- Structuring complex systems (anomaly pipeline, balance algorithm)
- Generating boilerplate rapidly (routes, controllers, CSS)
- Producing comprehensive documentation drafts

The AI made mistakes in:
- Domain-specific logic (balance direction)
- Real-world file format assumptions (TSV vs CSV)
- Database-specific constraints (UUID format in PostgreSQL)

**All code was reviewed line by line before committing.** I am the engineer of record for every file in this repository.
