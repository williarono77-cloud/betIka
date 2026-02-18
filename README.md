# Game Platform (React + Vite + Supabase)

Frontend-only web app for a real-money game platform. Uses Supabase for authentication and data. Deposits are initiated via STK Push (Edge Function); withdrawals are requests only—admin pays manually.

## Safety (frontend)

- The app **never** updates wallet balance in the database. Wallet changes happen only from:
  - Supabase Edge Functions (e.g. STK callback)
  - Admin actions
- The frontend can: read wallet balance, initiate deposit (Edge Function), create withdrawal request (insert), read public game data.

## Setup

1. **Clone and install**
   ```bash
   cd "Ellie king"
   npm install
   ```

2. **Environment variables**
   - Copy `.env.example` to `.env`
   - Fill in:
     - `VITE_SUPABASE_URL` — Supabase project URL (Project Settings > API)
     - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
     - `VITE_EDGE_BASE_URL` — Base URL for Edge Functions (e.g. `https://YOUR_PROJECT_REF.supabase.co/functions/v1`)

3. **Run locally**
   ```bash
   npm run dev
   ```
   Open the URL shown (e.g. http://localhost:5173).

## Supabase setup (assumptions)

You need a Supabase project with:

- **Auth**: Email/password enabled.
- **Tables** (names can be adjusted in code if different):
  - **Public read**: `rounds` (or `games`), `winners`, `round_history` — readable by anon or authenticated users.
  - **Private**:  
    - `wallets` — one row per user; columns e.g. `user_id`, `balance`. RLS: `SELECT` where `user_id = auth.uid()`; no client `UPDATE`/`INSERT`.  
    - `deposits` — `SELECT` for own user; inserts typically from Edge/callback only.  
    - `withdrawal_requests` — `SELECT` and `INSERT` where `user_id = auth.uid()`; `UPDATE` for admin only.
- **Edge Functions** (implemented by you, not in this repo):
  - `POST /stk/initiate` — body `{ amount, phone }`; starts STK Push; returns e.g. `{ reference }` or `{ CheckoutRequestID }`. Requires valid JWT (Bearer token from frontend).
  - `POST /stk/status` (optional) — check status of a deposit.

Create a wallet row when a user first signs up (e.g. DB trigger on `auth.users` insert, or Edge Function that creates wallet on first login).

## Redirect URLs (Supabase Auth)

For local dev: add `http://localhost:5173` to Redirect URLs in Supabase Dashboard (Authentication > URL Configuration).

For GitHub Pages: add your site URL, e.g.:
- `https://YOUR_USERNAME.github.io/Ellie-king/`
- `https://YOUR_USERNAME.github.io/Ellie-king/**`

Set **Site URL** to the same GitHub Pages URL when deploying there.

## GitHub Pages deployment

1. **Repo name**
   - In `vite.config.js`, set `REPO_NAME` to your GitHub repo name (e.g. `Ellie-king`). The production build uses `base: '/REPO_NAME/'` so assets load correctly on GitHub Pages.

2. **Build and deploy**
   ```bash
   npm run build
   npm run deploy
   ```
   This runs `vite build` then publishes the `dist` folder to the `gh-pages` branch. Configure the repo to serve from that branch (Settings > Pages > Source: gh-pages branch).

3. **Auth**
   - In Supabase, set Site URL and Redirect URLs to `https://YOUR_USERNAME.github.io/REPO_NAME/` (and `/REPO_NAME/**` if needed).

## Troubleshooting

- **RLS / "row-level security"**: If wallet or deposits don’t load, check RLS policies. Wallet must allow `SELECT` where `user_id = auth.uid()`. No policy should allow client to `UPDATE` wallets.
- **Missing wallet row**: If the dashboard shows no balance and you get "no rows", ensure a row in `wallets` is created for the user (e.g. trigger on signup or first login in Edge Function).
- **Edge Function 401**: The frontend sends `Authorization: Bearer <access_token>`. Ensure the Edge Function validates the Supabase JWT and that the user is logged in when calling `/stk/initiate`.
- **CORS**: Edge Functions must allow the frontend origin (e.g. `https://YOUR_USERNAME.github.io` or `http://localhost:5173`). Configure CORS in the Edge Function or Supabase project.
- **Blank page on GitHub Pages**: Confirm `base` in `vite.config.js` matches the repo name and that you deployed after `npm run build`.

## Seed Data (Local Development Only)

For full UI testing without production data, seed the database:

1. **Apply schema**: Run all migrations in `db/` including `db/schema/22_game_rounds.sql`.
2. **Run seed** (choose one):
   - **Option A**: Supabase SQL Editor → paste and run `db/seed/seed-local.sql`
   - **Option B**: `npm run seed` (creates auth users via Admin API), then run the data section of `db/seed/seed-local.sql` in SQL Editor

**Required env for Option B**: `SUPABASE_SERVICE_ROLE_KEY` + `VITE_SUPABASE_URL`

**Seeded users** (password: `password123`):

| Email          | Balance | Notes                     |
|----------------|---------|---------------------------|
| user@test.com  | KSh 1,200 | Normal user, 1 pending withdrawal |
| low@test.com   | KSh 80  | Edge case: below min withdraw     |
| whale@test.com | KSh 50,000 | High balance                |
| admin@test.com | KSh 1,000 | Admin role (?admin=true)   |

**Seeded data**: 50 game rounds (burst 0–50x), bets (win/loss mix), deposits (success/failed), withdrawals (pending/completed/rejected), ledger entries. Never seed production.

## Scripts

| Command       | Description                    |
|---------------|--------------------------------|
| `npm run dev` | Start dev server               |
| `npm run build` | Production build             |
| `npm run preview` | Preview production build   |
| `npm run deploy` | Build and push to gh-pages |
| `npm run seed` | Seed auth users (local dev)  |
