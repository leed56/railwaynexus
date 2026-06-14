# RailwayNexus — Nexus ERP Backend

Node.js API service for [Nexus ERP](https://github.com/leed56/nexus-erp). Runs on **Railway**; data and auth stay on **Supabase**; the React SPA stays on **Vercel**.

## What this service runs

| Route | Purpose |
|-------|---------|
| `GET /health` | Railway health check |
| `POST /api/stripe-webhook` | Stripe billing events → Inngest |
| `POST /api/create-checkout-session` | Stripe Checkout (authenticated) |
| `POST /api/create-portal-session` | Stripe Customer Portal |
| `POST /api/sso/sync` | SAML SSO provider sync |
| `POST/GET /api/inngest` | Inngest background jobs (10 functions) |
| `GET/POST /api/v1/contacts` | Tenant REST API |
| `GET/PATCH/DELETE /api/v1/contacts/:id` | |
| `GET/POST /api/v1/invoices` | |
| `GET/PATCH/DELETE /api/v1/invoices/:id` | |
| `GET/POST /api/v1/bills` | |
| `GET/PATCH/DELETE /api/v1/bills/:id` | |
| `GET/POST /api/v1/employees` | |
| `GET/PATCH/DELETE /api/v1/employees/:id` | |
| `GET/POST /api/v1/inventory-items` | |
| `GET/PATCH/DELETE /api/v1/inventory-items/:id` | |

Supabase Edge Functions (`nexus-mind`, `send-invite`, `ess-notify`) remain on Supabase.

## Local development

```bash
cp .env.example .env
# fill SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.

npm install
npm run dev
# → http://localhost:3001/health
```

## Deploy to Railway

### Option A — Monorepo (recommended until `railwaynexus` repo has code)

This folder lives in [nexus-erp](https://github.com/leed56/nexus-erp) at `railwaynexus/`.

1. Railway → **New Project** → Deploy from GitHub → **leed56/nexus-erp**
2. Set **Root Directory** = `railwaynexus`
3. Branch = `main`
4. Add variables from `.env.example`

### Option B — Standalone repo

Push this folder to [leed56/railwaynexus](https://github.com/leed56/railwaynexus) and connect Railway to that repo.

```bash
git clone https://github.com/leed56/railwaynexus.git
cp -r nexus-erp/railwaynexus/* railwaynexus/
cd railwaynexus && git add . && git commit -m "Initial backend" && git push -u origin main
```

### Variables & domains

### Inngest

In [Inngest dashboard](https://app.inngest.com), set the app serve URL to:

```
https://<your-railway-domain>/api/inngest
```

### Stripe

Update webhook endpoint to:

```
https://<your-railway-domain>/api/stripe-webhook
```

## Frontend (nexus-erp)

On Vercel, set:

```
VITE_API_URL=https://<your-railway-domain>
```

When unset, the SPA falls back to same-origin `/api/*` (legacy Vercel serverless).

## Syncing from nexus-erp

Server code originates in `nexus-erp` under `api/`, `inngest/`, and `lib/`. When those change, copy updated files into this repo and redeploy Railway.
