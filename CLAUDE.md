# CLAUDE.md — Strenth AI Workspace (Frontend)

This file gives any AI agent (Claude, Codex, Gemini, etc.) full context to work on this project
without needing a conversation history.

---

## Repo & Deployment Map (read this first — prevents confusion)

| What | Where |
|---|---|
| **This repo** | `https://github.com/strenth-ai/ai-workspace-proto` |
| **This repo deploys to** | Azure Container App `strenth-web` |
| **Live URL** | `https://strenth-web.jollyfield-91f54af9.centralindia.azurecontainerapps.io` |
| **Backend repo** | `https://github.com/strenth-ai/Agents` |
| **Backend deploys to** | `bom-tool-api`, `bom-tool-worker`, `whatsapp-agent`, `baileys-agent`, `schematic-ai-agent` |
| **Deploy trigger** | Push to `master` → GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys |

**Never run `az containerapp update` manually.** Push to `master` and let GitHub Actions handle it.

**Secrets:** Never stored in code. All secrets live in GitHub → Settings → Secrets and variables → Actions.
Required secrets: `AZURE_CREDENTIALS`, `VITE_GOOGLE_CLIENT_ID`, `VITE_ADMIN_EMAILS`

---

## Project Overview

**What it is:** A React + Vite + TypeScript frontend for the Strenth hardware-sourcing copilot.
The UI lets a user upload design files, parse and classify a BOM, benchmark costs across
distributors, generate RFQs, and track vendor quotes.

**What it is NOT:** This is not the Next.js web app in the `Agents/web/` directory. That is a
separate product. This Vite app is the senior-designed prototype UI — the visual design is fixed;
only the data layer is being changed from mock to real.

**Golden rule: do not change component files, CSS, or the state-machine logic in App.tsx unless
explicitly instructed. Only change the data sources (src/data/, src/api/) and the parts of
App.tsx that feed data into state.**

---

## Repository Location

```
C:\Users\Suraj Tiwari\Music\ai-workspace-proto-master (2)\ai-workspace-proto-master\
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 |
| Language | TypeScript (strict) |
| Styling | Plain CSS (`src/index.css`) — no Tailwind |
| State | useState / useEffect in App.tsx (no Redux/Zustand) |
| HTTP | native `fetch` via `src/api/client.ts` |
| Build | `npm run dev` (port 5173), `npm run build` |

---

## Directory Structure

```
src/
  App.tsx             — root component, all app state, state machine
  types.ts            — shared TypeScript interfaces
  main.tsx            — entry point
  index.css           — all styles (DO NOT EDIT)

  components/         — UI components (DO NOT EDIT VISUALS)
    ChatPanel.tsx
    Sidebar.tsx
    UploadZone.tsx
    BomViewer.tsx
    CostBenchmarkViewer.tsx
    RFQViewer.tsx
    RFQTracker.tsx
    QuotesViewer.tsx
    DFMViewer.tsx
    DFMProgressPanel.tsx
    BomProgressPanel.tsx
    CostProgressPanel.tsx
    SourcingProgressPanel.tsx
    FileViewer.tsx
    PaymentModal.tsx
    PaymentSuccess.tsx
    ProgressPanel.tsx
    CadSvg.tsx
    Icons.tsx

  data/               — mock data (being replaced with real API)
    mockData.ts       — 10 mock design files (REPLACED by real File[] from user)
    bomData.ts        — 15 mock BOM rows (REPLACED by bom-tool API)
    costData.ts       — mock distributor pricing (REPLACED by pricing API)
    rfqData.ts        — mock CDP RFQ templates (REPLACED by RFQ API)
    bopRfqData.ts     — mock BOP RFQ templates (REPLACED by RFQ API)
    quotesData.ts     — mock CDP vendor quotes (REPLACED by quote API)
    bopQuotesData.ts  — mock BOP vendor quotes (REPLACED by quote API)
    dfmData.ts        — mock DFM analysis (KEEP AS MOCK — out of scope v0)

  api/                — real backend integration (created during integration)
    client.ts         — base fetch wrapper (timeout, error handling)
    types.ts          — TypeScript interfaces matching bom-tool response schemas
    bom.ts            — BOM upload, job poll, items fetch
    pricing.ts        — bulk price lookup
    rfq.ts            — RFQ send + list
```

---

## App State Machine

`AppState` in `src/types.ts` drives the entire UI. Transitions happen in App.tsx.

```
upload → uploading → analyzing → organized
                                     ↓
                               bom-parsing → bom-complete → bom-classifying
                                                                   ↓
                                              [agent-select form shown in chat]
                                              ↙              ↓           ↘
                                    dfm-analyzing   cost-processing   sourcing-rfq
                                    dfm-complete    cost-complete     rfq-tracking
                                                    payment-success   quotes-received
```

**Key rule:** state transitions remain the same after integration. Real API calls replace
`setTimeout` chains, but the same states fire in the same order.

---

## Backend Services

### 1. BOM-Tool (primary backend for this UI)

**Base URL:** configured via `VITE_BOM_API_URL` in `.env.local`
Default dev value: `http://localhost:8000`

All requests proxied through `/api` and `/api/v2` prefixes via `vite.config.ts` proxy.

#### BOM Processing Pipeline

```
POST /api/v2/boms/upload
  multipart/form-data: file (required), project_name (optional), pcb_qty (default 1), job_id (optional)
  → 202 { job_id, status: "PENDING", filename, ... }

GET /api/v2/boms/{job_id}
  → { job_id, status, total_items, valid_items, error_count, needs_review_count, ... }
  status values: PENDING | PARSING | NORMALIZING | VALIDATING | CLASSIFYING | HITL_REVIEW | READY | FAILED

GET /api/v2/boms/{job_id}/items?page=1&page_size=500
  → [ { id, row_index, mpn, description, quantity, unit, classification, status, is_duplicate, ... } ]

GET /api/v2/boms/{job_id}/review
  → items where needs_review=true

PATCH /api/v2/boms/{job_id}/items/{item_id}
  body: { action: "approve"|"reject", classification?, review_notes? }
  → updated item
```

**Status polling:** poll `GET /api/v2/boms/{job_id}` every 2 seconds until status is
`READY`, `HITL_REVIEW`, or `FAILED`.

#### Pricing

```
POST /api/fetch-prices-bulk
  body: { parts: [{ mpn: string, qty: number }] }
  → { results: [{ mpn, distributor_prices: [...], indian_prices: [...] }] }

POST /api/fetch-indian-vendors
  body: { mpn: string, qty: number }
  → { results: [...] }

GET /api/price-history/{mpn}?limit=50
GET /api/price-trend/{mpn}
GET /api/cheapest-ever/{mpn}
```

#### RFQ

```
POST /api/send-rfq
  body: { ... }   (see rfq_sender.py for exact schema)

POST /api/send-cdp-rfq
POST /api/send-mechanical-rfq
POST /api/send-assembly-rfq

GET /api/all-rfqs
  → list of all RFQ records with status

GET /api/check-replies?rfq_code=RFQ-XXXXXX
  → vendor replies scraped from Gmail

GET /api/vendor-quote-prices?rfq_code=RFQ-XXXXXX
  → { vendor_name: [{ unit_price, lead_time, moq, currency }] }
```

### 2. Gateway (NOT used by this Vite app directly)

The `Agents/gateway/` FastAPI service handles auth, projects, and the chat agent.
This Vite app does NOT call the gateway — it uses bom-tool directly.
The Next.js `web/` app uses the gateway.

---

## Data Mapping: bom-tool ItemOut → BomRow

The prototype's `BomRow` interface maps to bom-tool's `ItemOut` as follows:

| BomRow field | Source |
|---|---|
| `id` | `row_index` (cast to number) |
| `partNo` | `mpn ?? reference_designator ?? "ROW-${row_index}"` |
| `description` | `description ?? ""` |
| `qty` | `quantity ?? 1` |
| `unit` | `unit ?? "pcs"` |
| `category` | derived: BOP→Electrical, CDP/MECHANICAL→Mechanical, AMBIGUOUS→Electrical |
| `status` | VALIDATED/CLASSIFIED/APPROVED→"Approved", ERROR/REJECTED→"Review", PENDING→"Pending" |
| `sourceFile` | the uploaded filename (stored in state) |
| `hsnCode` | not in ItemOut — leave undefined |
| `isDuplicate` | `is_duplicate` |
| `classification` | BOP→"BOP", CDP→"CDP", MECHANICAL→"CDP", AMBIGUOUS→"Ambiguous", UNCLASSIFIED→"Ambiguous" |

---

## Mock vs Real — What Stays Mock

| Feature | Status | Reason |
|---|---|---|
| File upload | **REAL** | Real File[] from user drag-drop |
| BOM parsing | **REAL** | bom-tool pipeline |
| BOM classification | **REAL** | bom-tool classification |
| Cost benchmarking | **REAL** | bom-tool pricing API |
| RFQ generation | **REAL** | bom-tool RFQ API |
| Vendor quotes | **REAL** | bom-tool quote API |
| DFM analysis | **MOCK** | Out of scope v0 (STR-8 is Backlog) |
| Payment / Razorpay | **MOCK** | Out of scope v0 |

---

## Environment Variables

Create `.env.local` in the project root (never commit this file):

```
VITE_BOM_API_URL=http://localhost:8000
```

For production, set `VITE_BOM_API_URL` to the deployed bom-tool URL.

---

## Dev Server & Proxy

`vite.config.ts` proxies API calls in dev:

```typescript
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_BOM_API_URL ?? 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

This means: all `fetch('/api/...')` calls in the app go to the bom-tool without CORS issues in dev.
In production, the bom-tool must either serve the Vite build or have CORS configured.

---

## Coding Guidelines for AI Agents

1. **No Hinglish in code** — all code, comments, variable names must be in English.
2. **Do not change component files** (`src/components/*.tsx`) unless fixing a bug in the
   component itself. Visual design is owned by the senior developer.
3. **Do not add new npm dependencies** without checking if something built-in works.
4. **TypeScript strict** — no `any` unless absolutely unavoidable, add a comment explaining why.
5. **No comments explaining WHAT the code does** — only comments for non-obvious WHY.
6. **State machine is sacred** — `AppState` transitions must remain identical. Don't add new
   states, don't skip states. If a real API is slower than the mock, keep a minimum visual delay.
7. **Graceful fallback** — if the bom-tool API is unreachable, the app should show an error in
   chat (via `addMsg`) and not crash. Don't fall back silently to mock data in production.
8. **DFM and Payment are intentionally mock** — do not wire them to real APIs without a Linear
   issue authorizing the work.

---

## Linear Project Reference

Issues tracked at: https://linear.app/strenth/project/strenth-web-app-v0-204b8baf9429/issues

Key issues:
- STR-129: Web App v0 — main spec
- STR-8: DFM backend endpoint (Backlog — out of scope for this work)

---

## Related Projects

- `Agents/` — monorepo containing gateway, agent-core, bom-tool, web (Next.js)
- `Agents/bom-tool/` — the backend this Vite app calls
- `Agents/web/` — separate Next.js frontend (different product, do not confuse)
