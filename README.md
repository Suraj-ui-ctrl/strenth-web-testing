# Strenth.ai — AI Hardware Sourcing & Manufacturing Workspace

A prototype AI co-pilot for end-to-end hardware product development — from design file upload to supplier quotes and order placement. Built as a single-page React application simulating a multi-agent workflow with live progress tracking and real-time UI state transitions.

**Live:** https://file-organiser-react.vercel.app

---

## What It Does

Strenth flow walks a hardware engineer through the full pre-production sourcing journey in one workspace:

| Stage | What happens |
|---|---|
| **File Upload** | Drag-and-drop mechanical & electrical design files (STEP, DXF, Gerber, PDF). Animated upload with per-file progress. |
| **BOM Parsing** | Reads `BOM_Assembly_v3.xlsx`, extracts line items, flags duplicates and missing HSN codes, supports inline edit and delete. |
| **Parts Classification** | Classifies each part as Standard (BOP), Custom (CDP), Ambiguous, or Flagged. |
| **Agent Selection** | Choose from DFM Agent, Cost Benchmarking Agent, Sourcing Agent, or Manufacturing Agent. |
| **DFM Analysis** | Design-for-manufacturability check across 15 parts — evaluates geometry, tolerances, CNC/laser/moulding routes. Inline flag resolution with live progress. |
| **Cost Benchmarking** | Live market pricing with BCD landed cost. Vendor selection per part, BOP + CDP tabs, grand total, Place Order CTA. |
| **RFQ Generation** | Generates RFQ templates for Standard and/or Custom parts. Editable quantities and target prices, download and send actions. |
| **Live RFQ Tracker** | Simulates real-time vendor responses (Sent → Opened → Preparing → Quoted) with per-vendor progress and Remind follow-up. |
| **Quote Comparison** | Unified table of L1/L2/L3 vendor tiers. Select tier per row, live grand total, Type (Standard/Custom) tags. |
| **Order Placement** | Razorpay-style payment modal (net banking / credit card + OTP). Amount reflects actual selected quote total. |
| **Payment Success** | Order confirmation with live amount, order ID, transaction ID, next-steps checklist. |

---

## Agent Architecture

```
Strenth AI Agent (orchestrator)
├── DFM Agent          — manufacturability analysis & design flagging
├── Cost Benchmarking  — live market prices with BCD landed cost
├── Sourcing Agent     — RFQs, vendor matching, live quote tracking
└── Manufacturing Agent — production planning (coming soon)
```

Each agent is triggered from the chat panel via action buttons or `@mention`. Every CTA click echoes as a user message in the chat before the agent responds.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Plain CSS (no framework) — all component styles in `src/index.css` |
| State | React `useState` / `useCallback` / `useRef` lifted to `App.tsx` |
| Fonts | Inter (UI), JetBrains Mono (part numbers) |
| Deployment | Vercel |

No backend. All data is static mock data in `src/data/`. Animations and state transitions are driven by `setTimeout`/`setInterval` chains in `App.tsx`.

---

## Project Structure

```
src/
├── App.tsx                   # Root — all app state + flow orchestration
├── types.ts                  # Shared TypeScript interfaces
├── index.css                 # All styles (component-scoped by class prefix)
│
├── components/
│   ├── ChatPanel.tsx         # Right-side chat UI with @mention agents
│   ├── Sidebar.tsx           # Left sidebar — file tree, agent list, user
│   ├── BomViewer.tsx         # BOM table with inline edit/delete
│   ├── CostBenchmarkViewer.tsx  # Cost table with vendor popup
│   ├── RFQViewer.tsx         # RFQ preview with editable rows
│   ├── RFQTracker.tsx        # Live vendor response tracker
│   ├── QuotesViewer.tsx      # L1/L2/L3 quote comparison table
│   ├── DFMViewer.tsx         # DFM flags with resolve actions
│   ├── PaymentModal.tsx      # Razorpay-style checkout modal
│   ├── PaymentSuccess.tsx    # Order confirmation screen
│   ├── SourcingProgressPanel.tsx
│   ├── CostProgressPanel.tsx
│   ├── DFMProgressPanel.tsx
│   ├── BomProgressPanel.tsx
│   └── ...
│
└── data/
    ├── bomData.ts            # 15 BOM line items
    ├── costData.ts           # BOP + CDP cost rows with vendor options
    ├── rfqData.ts            # Custom parts RFQ rows
    ├── bopRfqData.ts         # Standard parts RFQ rows
    ├── quotesData.ts         # Custom parts quote comparison data
    └── bopQuotesData.ts      # Standard parts quote comparison data
```

---

## Getting Started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

```bash
npm run build   # production build → dist/
```

---

## Deployment

Hosted on Vercel under `pratibha-3012s-projects/file-organiser-react`.

```bash
npx vercel --prod
```

Branch `feat/main-screen-ui-updates` is the active development branch. `master` is the base.

---

## Key Design Decisions

- **All state in App.tsx** — single source of truth for `appState`, `rfqMode`, `orderTotal`, messages, and all panel visibility flags. Components are largely presentational.
- **Static mock data** — enables fast iteration without a backend. Real data integration would swap `src/data/` imports for API calls.
- **CSS by class prefix** — each component has a 3–4 letter prefix (e.g. `rft-` for RFQ Tracker, `qv-` for Quotes Viewer) to avoid collisions without CSS modules.
- **User message echo** — every CTA click (chat buttons, agent cards, screen CTAs) appends a right-aligned user bubble to the chat before the agent responds.
