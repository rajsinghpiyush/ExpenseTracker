# SplitSmart — Shared Expense Tracker

A full-stack shared expenses app built for a group of flatmates, featuring group expense tracking, multiple split types, debt simplification, and a robust CSV import pipeline that detects and surfaces data anomalies.

---

## 🚀 Live App

- **Frontend**: [https://splitsmart-frontend.vercel.app](https://splitsmart-frontend.vercel.app)
- **Backend API**: [https://splitsmart-backend.vercel.app](https://splitsmart-backend.vercel.app)

**Demo accounts** (password: `password123`):
| Name  | Email               | Role   |
|-------|---------------------|--------|
| Aisha | aisha@flat.com      | Admin  |
| Rohan | rohan@flat.com      | Member |
| Priya | priya@flat.com      | Member |
| Meera | meera@flat.com      | Member (left Mar 2026) |
| Sam   | sam@flat.com        | Member (joined Apr 2026) |
| Dev   | dev@guest.com       | Guest (Goa trip only) |

---

## 🛠 Tech Stack

| Layer     | Technology                        | Reason                                            |
|-----------|-----------------------------------|---------------------------------------------------|
| Frontend  | React 18 + Vite                   | Fast HMR, lightweight, Vercel-native deploy       |
| Backend   | Node.js + Express                 | API-first, works as Vercel serverless function    |
| Database  | PostgreSQL via Supabase            | Relational DB (required), free hosted tier        |
| ORM       | Prisma                            | Type-safe schema, migration support               |
| Auth      | JWT + bcrypt                      | Stateless, works on serverless                    |
| CSV Parse | PapaParse (browser-side)          | Streaming parse before API call                   |
| Styling   | Vanilla CSS (custom design system)| Full control, no framework overhead               |

**AI Tool used**: Google DeepMind Antigravity (Claude Sonnet 4.6 Thinking) — see [AI_USAGE.md](./AI_USAGE.md)

---

## 📁 Project Structure

```
/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (7 models)
│   │   └── seed.js              # Seed flatmate accounts + group
│   ├── src/
│   │   ├── server.js            # Express app entry point
│   │   ├── config/database.js   # Prisma singleton
│   │   ├── middleware/          # auth.js, errorHandler.js
│   │   ├── routes/              # auth, groups, expenses, settlements, balances, import
│   │   ├── controllers/         # One controller per route module
│   │   └── services/
│   │       ├── balance.service.js   # Core financial calculations
│   │       └── import.service.js    # 18-anomaly CSV detection pipeline
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
│
└── frontend/
    ├── public/
    │   └── expenses_export.csv  # Sample CSV for import demo
    ├── src/
    │   ├── api/client.js        # Axios with JWT interceptor
    │   ├── context/AuthContext.jsx
    │   ├── pages/               # Login, Register, Dashboard, GroupDetail,
    │   │                        # ExpenseForm, ImportFlow, ImportReport,
    │   │                        # Balances, SettlementForm
    │   ├── components/          # Sidebar, MemberAvatar
    │   ├── App.jsx              # Router with protected routes
    │   └── index.css            # Full design system (dark theme)
    ├── index.html
    ├── package.json
    └── vercel.json
```

---

## 🔧 Local Setup

### Prerequisites
- Node.js ≥ 18
- A Supabase project (free tier) → get `DATABASE_URL` and `DIRECT_URL`

### Backend

```bash
cd backend
npm install

# Copy env template and fill in your values
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://...  (connection pooling URL from Supabase)
#   DIRECT_URL=postgresql://...    (direct URL from Supabase)
#   JWT_SECRET=your_secret_here
#   FRONTEND_URL=http://localhost:5173

# Push schema to database
npm run db:push

# Seed flatmate accounts and group
npm run db:seed

# Start dev server
npm run dev
# → http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install

# Copy env template
cp .env.example .env
# Edit .env:
#   VITE_API_URL=http://localhost:3001/api

npm run dev
# → http://localhost:5173
```

---

## 🗂 Database Schema

See [SCOPE.md](./SCOPE.md) for the full schema diagram.

Key models: `User`, `Group`, `GroupMember` (with `joinedAt`/`leftAt` dates), `Expense`, `ExpenseShare`, `Settlement`, `ImportBatch`, `ImportAnomaly`.

---

## 📥 CSV Import

1. Go to any group → **Import CSV**
2. Upload `expenses_export.csv` (tab-delimited)
3. Review every flagged anomaly — accept or reject each row
4. Confirm import → expenses + settlements are created
5. Download the full **Import Report** as JSON

---

## 📊 Features

- **Login / Register** with JWT auth
- **Groups**: create, manage members with join/leave date tracking
- **Expenses**: EQUAL, UNEQUAL, PERCENTAGE, SHARE split types
- **Balances**: net balance per member + minimum-transaction debt simplification
- **Drill-down**: click any member's balance to see exactly which expenses contribute
- **Settlements**: record payments, affects balances immediately
- **CSV Import**: 18-anomaly detection pipeline with user approval flow
- **Import Report**: full audit log of every anomaly detected and action taken

---

## 🚢 Deployment

Both apps are deployed on **Vercel**:

**Backend** (Vercel + Supabase PostgreSQL):
```bash
cd backend
vercel --prod
# Set env vars in Vercel dashboard:
#   DATABASE_URL, DIRECT_URL, JWT_SECRET, FRONTEND_URL
```

**Frontend** (Vercel static):
```bash
cd frontend
vercel --prod
# Set env var:
#   VITE_API_URL=https://your-backend.vercel.app/api
```
