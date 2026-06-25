# Strenth Vite UI — Real Data Wiring (v0 Completion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every remaining mock data source in the Vite prototype with live bom-tool API calls, covering HITL review, cost benchmarking, RFQ tracker, and quotes viewer.

**Architecture:** App.tsx owns all state and API calls; components receive optional real-data props and fall back to mock when props are absent. No new states are added to the state machine — only the data fed into existing states changes.

**Tech Stack:** React 18, TypeScript strict, native fetch via `src/api/client.ts`, bom-tool FastAPI at `VITE_BOM_API_URL`.

**CLAUDE.md Golden Rule:** Do NOT change visual layout, CSS, or state-machine transitions. Only modify data sources (`src/data/`, `src/api/`) and the data-feeding parts of `App.tsx`. Component files may only be touched to add optional data props — no visual changes.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/App.tsx` | Store jobId in state; wire all real API calls |
| Modify | `src/api/bom.ts` | Already done ✅ |
| Modify | `src/api/pricing.ts` | Add `mapPricingResults` transform |
| Modify | `src/api/rfq.ts` | Add `pollRfqStatus` poller |
| Modify | `src/api/types.ts` | No changes needed |
| Modify | `src/components/CostBenchmarkViewer.tsx` | Add optional `bopRows?` prop |
| Modify | `src/components/RFQTracker.tsx` | Add optional `liveRecords?` prop |
| Modify | `src/components/QuotesViewer.tsx` | Add optional `liveQuotes?` prop |
| Modify | `src/data/costData.ts` | Export `BopCostRow` type (already exported — verify) |

---

## Task 1: Store job_id in React state after BOM upload

**Files:**
- Modify: `src/App.tsx` (lines ~63–68, ~122–130, ~258–292)

Currently `bomUploadRef` holds a `Promise<string | null>` — but once the job is done the `jobId` is only inside the closure. `handleSaveEdit` / `handleDeleteRow` have no access to it for HITL calls. Fix: persist `jobId` to a `useRef`.

- [ ] **Step 1: Add bomJobIdRef**

In `App.tsx`, after line 68 (`const pollAbortRef = useRef...`), add:

```typescript
const bomJobIdRef = useRef<string | null>(null)
```

- [ ] **Step 2: Populate bomJobIdRef in the bom-parsing effect**

Inside the `run()` async function in the `bom-parsing` effect (around line 257), immediately after `const jobId = await bomUploadRef.current`, add:

```typescript
if (jobId) bomJobIdRef.current = jobId
```

- [ ] **Step 3: Verify build is still clean**

```bash
cd "C:/Users/Suraj Tiwari/Music/ai-workspace-proto-master (2)/ai-workspace-proto-master"
npm run build
```

Expected: `✓ built in` with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: persist bomJobId to ref for HITL review wiring"
```

---

## Task 2: Wire HITL approve/reject to bom-tool API

**Files:**
- Modify: `src/App.tsx` (`handleSaveEdit`, `handleDeleteRow` callbacks)
- Read: `src/api/bom.ts` (`approveBomItem`, `rejectBomItem` already defined)

When the user edits a BOM row and saves, or deletes a row, fire a PATCH to `/api/v2/boms/{jobId}/items/{itemId}`. The UI already updates locally — the API call is fire-and-forget (don't block the UI on it).

- [ ] **Step 1: Add itemId lookup to BomRow**

`BomItemOut.id` is a string UUID. `BomRow.id` is `row_index` (a number). To call `approveBomItem(jobId, itemId)` we need the UUID. Add a `backendId?` field to `BomRow` in `src/types.ts`:

```typescript
export interface BomRow {
  id:            number
  backendId?:    string    // BomItemOut.id — needed for HITL approve/reject
  partNo:        string
  description:   string
  qty:           number
  unit:          string
  category:      'Mechanical' | 'Electrical' | 'Fastener' | 'Cable'
  status:        'Approved' | 'Pending' | 'Review'
  sourceFile:    string
  hsnCode?:      string
  isDuplicate?:  boolean
  classification?: 'BOP' | 'CDP' | 'Ambiguous' | 'Flagged'
}
```

- [ ] **Step 2: Populate backendId in mapItemsToBomRows**

In `src/api/bom.ts`, inside `mapItemsToBomRows`, add `backendId: item.id` to the mapped object:

```typescript
export function mapItemsToBomRows(items: BomItemOut[], sourceFilename: string): BomRow[] {
  return items.map((item, idx) => ({
    id: item.row_index ?? idx + 1,
    backendId: item.id,                      // ← add this line
    partNo: item.mpn ?? item.reference_designator ?? `ROW-${item.row_index ?? idx + 1}`,
    description: item.description ?? '',
    qty: Math.round(item.quantity ?? 1),
    unit: item.unit ?? 'pcs',
    category: deriveCategory(item.classification),
    status: deriveStatus(item.status),
    sourceFile: sourceFilename,
    hsnCode: undefined,
    isDuplicate: item.is_duplicate,
    classification: deriveClassification(item.classification),
  }))
}
```

- [ ] **Step 3: Wire handleSaveEdit to approveBomItem**

In `App.tsx`, update `handleSaveEdit`:

```typescript
const handleSaveEdit = useCallback((id: number, value: string) => {
  setEditedDescriptions(prev => ({ ...prev, [id]: value }))
  setEditingBomId(null)
  setResolvedDupIds(prev => [...prev, id])

  // Fire HITL approve — non-blocking
  const row = liveBomRows.find(r => r.id === id)
  const jobId = bomJobIdRef.current
  if (row?.backendId && jobId) {
    approveBomItem(jobId, row.backendId).catch(() => {})
  }
}, [liveBomRows])
```

Add `approveBomItem` to the import at the top of `App.tsx`:

```typescript
import { uploadBomFile, pollBomJob, fetchBomItems, mapItemsToBomRows, approveBomItem, rejectBomItem } from './api/bom'
```

- [ ] **Step 4: Wire handleDeleteRow to rejectBomItem**

```typescript
const handleDeleteRow = useCallback((id: number) => {
  setDeletedBomIds(prev => [...prev, id])
  setEditingBomId(null)

  const row = liveBomRows.find(r => r.id === id)
  const jobId = bomJobIdRef.current
  if (row?.backendId && jobId) {
    rejectBomItem(jobId, row.backendId).catch(() => {})
  }
}, [liveBomRows])
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/api/bom.ts src/App.tsx
git commit -m "feat: wire BOM HITL approve/reject to bom-tool PATCH API"
```

---

## Task 3: Fetch and store pricing results in App state

**Files:**
- Modify: `src/App.tsx` (add state, wire pricing fetch)
- Modify: `src/api/pricing.ts` (add transform function)

Currently `fetchBulkPrices` is called fire-and-forget. We need to store the result so `CostBenchmarkViewer` can use it.

- [ ] **Step 1: Add livePricingResults state**

In `App.tsx`, after the `liveRfqRows` state declaration, add:

```typescript
const [livePricingResults, setLivePricingResults] = useState<import('./api/types').PartPriceResult[]>([])
```

- [ ] **Step 2: Store pricing results when they arrive**

In the `bom-parsing` effect, replace the existing fire-and-forget pricing call:

```typescript
// was:
if (bopParts.length > 0) {
  fetchBulkPrices(bopParts).catch(() => {})
}
```

Replace with:

```typescript
if (bopParts.length > 0) {
  fetchBulkPrices(bopParts)
    .then(results => setLivePricingResults(results))
    .catch(() => {})
}
```

- [ ] **Step 3: Add mapToBopCostRows transform to src/api/pricing.ts**

Append to `src/api/pricing.ts`:

```typescript
import type { BopCostRow } from '../data/costData'

export function mapToBopCostRows(
  results: PartPriceResult[],
  bomRows: import('../types').BomRow[],
): BopCostRow[] {
  return results.map(r => {
    const bomRow = bomRows.find(b => b.partNo === r.mpn)
    const qty = bomRow?.qty ?? 1

    const digikey   = r.distributor_prices.find(d => /digikey/i.test(d.supplier))
    const mouser    = r.distributor_prices.find(d => /mouser/i.test(d.supplier))
    const element14 = r.distributor_prices.find(d => /element14|farnell/i.test(d.supplier))
    const lcsc      = r.distributor_prices.find(d => /lcsc/i.test(d.supplier))
    const arrow     = r.distributor_prices.find(d => /arrow/i.test(d.supplier))

    const toOpt = (d: typeof digikey) =>
      d?.unit_price != null
        ? { price: d.unit_price, leadTime: d.lead_time ?? '2–5 wks', available: true }
        : undefined

    const indianPrices = r.indian_prices
      .filter(d => d.unit_price != null)
      .map(d => ({ platform: d.supplier, price: d.unit_price! * qty }))

    return {
      id:         r.mpn,
      partNo:     r.mpn,
      desc:       bomRow?.description ?? r.mpn,
      qty,
      bcd:        10,            // default BCD; bom-tool does not return duty yet
      digikey:    toOpt(digikey),
      mouser:     toOpt(mouser),
      element14:  toOpt(element14),
      lcsc:       toOpt(lcsc),
      arrow:      toOpt(arrow),
      indianPrices,
    } satisfies BopCostRow
  })
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: 0 errors. If `satisfies BopCostRow` causes a type error because `BopCostRow` has additional required fields, open `src/data/costData.ts`, check the interface, and add any missing fields with sensible defaults.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/api/pricing.ts
git commit -m "feat: store pricing API results in state for cost benchmarking"
```

---

## Task 4: Wire real pricing rows into CostBenchmarkViewer

**Files:**
- Modify: `src/components/CostBenchmarkViewer.tsx` (add optional `bopRows?` prop — minimal change)
- Modify: `src/App.tsx` (pass prop)

- [ ] **Step 1: Open CostBenchmarkViewer and find the Props interface**

Read `src/components/CostBenchmarkViewer.tsx` lines 1–120 to locate the `Props` interface and the component function signature. The interface currently has:

```typescript
interface Props {
  isProcessing: boolean
  onClose:      () => void
  onPlaceOrder: (total: number) => void
  orderPlaced:  boolean
}
```

- [ ] **Step 2: Add optional bopRows prop**

Edit the `Props` interface to add:

```typescript
interface Props {
  isProcessing: boolean
  onClose:      () => void
  onPlaceOrder: (total: number) => void
  orderPlaced:  boolean
  bopRows?:     BopCostRow[]   // real rows; overrides BOP_COST_ROWS when provided
}
```

Add it to the component destructuring:

```typescript
function CostBenchmarkViewer({
  isProcessing,
  onClose,
  onPlaceOrder,
  orderPlaced,
  bopRows,          // ← add
}: Props) {
```

- [ ] **Step 3: Use bopRows when available**

Find the line where `BOP_COST_ROWS` is referenced (e.g., in the render or in a `useMemo`). Replace the usage so:

```typescript
const activeBopRows = bopRows && bopRows.length > 0 ? bopRows : BOP_COST_ROWS
```

Then replace all uses of `BOP_COST_ROWS` within the component body with `activeBopRows`.

- [ ] **Step 4: Pass bopRows from App.tsx**

In `App.tsx`, update both `CostBenchmarkViewer` usages (full-width and split-pane) to pass the prop:

```typescript
<CostBenchmarkViewer
  isProcessing={appState === 'cost-processing'}
  onClose={...}
  onPlaceOrder={handlePlaceOrder}
  orderPlaced={orderPlaced}
  bopRows={livePricingResults.length > 0
    ? mapToBopCostRows(livePricingResults, liveBomRows)
    : undefined}
/>
```

Import `mapToBopCostRows` at the top of `App.tsx`:

```typescript
import { fetchBulkPrices, mapToBopCostRows } from './api/pricing'
```

- [ ] **Step 5: Verify build and visual smoke-test**

```bash
npm run dev
```

Upload a real BOM Excel with BOP parts (e.g., STM32, capacitors). Navigate through to cost-processing state. The CostBenchmarkViewer should show real distributor prices instead of hardcoded mock data. If `livePricingResults` is empty (API unreachable), mock data still renders as fallback.

- [ ] **Step 6: Commit**

```bash
git add src/components/CostBenchmarkViewer.tsx src/App.tsx src/api/pricing.ts
git commit -m "feat: wire real BOP pricing results into CostBenchmarkViewer"
```

---

## Task 5: Wire real RFQ records into RFQTracker

**Files:**
- Modify: `src/api/rfq.ts` (add `pollRfqStatus`)
- Modify: `src/components/RFQTracker.tsx` (add optional `liveRecords?` prop)
- Modify: `src/App.tsx` (poll during rfq-tracking state)

The tracker shows a timeline of RFQ status changes. In real mode, we poll `GET /api/all-rfqs` every 5s and display the status. The animated timeline simulation keeps running as UX candy; real records overlay the status badges.

- [ ] **Step 1: Add pollRfqStatus to src/api/rfq.ts**

Append to `rfq.ts`:

```typescript
export function pollRfqStatus(
  onUpdate: (records: RfqRecord[]) => void,
  signal: AbortSignal,
  intervalMs = 5000,
): void {
  const tick = async () => {
    if (signal.aborted) return
    try {
      const records = await fetchAllRfqs()
      onUpdate(records)
    } catch {
      // silent — UI keeps showing last known state
    }
    if (!signal.aborted) setTimeout(tick, intervalMs)
  }
  tick()
}
```

- [ ] **Step 2: Add liveRecords state and rfq polling effect in App.tsx**

Add state after `liveRfqRows`:

```typescript
const [liveRfqRecords, setLiveRfqRecords] = useState<import('./api/types').RfqRecord[]>([])
const rfqPollAbortRef = useRef<AbortController | null>(null)
```

Add a new `useEffect` after the `handleSendAll` callback:

```typescript
useEffect(() => {
  if (appState !== 'rfq-tracking') return

  const abort = new AbortController()
  rfqPollAbortRef.current = abort
  pollRfqStatus(records => setLiveRfqRecords(records), abort.signal)

  return () => {
    abort.abort()
    rfqPollAbortRef.current = null
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [appState])
```

Add `pollRfqStatus` to the rfq import:

```typescript
import { sendRfq, pollRfqStatus } from './api/rfq'
```

- [ ] **Step 3: Add liveRecords prop to RFQTracker**

Open `src/components/RFQTracker.tsx`. Find the `Props` interface (currently just `{ mode: RFQMode; onComplete: () => void }`). Add:

```typescript
interface Props {
  mode:          RFQMode
  onComplete:    () => void
  liveRecords?:  import('../api/types').RfqRecord[]
}
```

Add to destructuring:

```typescript
function RFQTracker({ mode, onComplete, liveRecords }: Props) {
```

Inside the component, find where part status is displayed. When `liveRecords` is present and non-empty, derive the status for each part by matching `rfq_record.part_names` to `TrackPart.no`:

```typescript
// After the existing status simulation logic, add:
function resolveStatus(part: TrackPart, records: typeof liveRecords): VStatus | undefined {
  if (!records?.length) return undefined
  const rec = records.find(r => r.part_names?.includes(part.no))
  if (!rec) return undefined
  if (rec.status === 'replied') return 'quoted'
  if (rec.status === 'sent')    return 'read'
  return undefined
}
```

Use `resolveStatus` to override the simulated status badge when a real status is available.

- [ ] **Step 4: Pass liveRfqRecords from App.tsx to RFQTracker**

```typescript
{appState === 'rfq-tracking' && (
  <RFQTracker
    mode={rfqMode}
    onComplete={() => setAppState('quotes-received')}
    liveRecords={liveRfqRecords.length > 0 ? liveRfqRecords : undefined}
  />
)}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/api/rfq.ts src/components/RFQTracker.tsx src/App.tsx
git commit -m "feat: poll real RFQ status during rfq-tracking state"
```

---

## Task 6: Wire real vendor quotes into QuotesViewer

**Files:**
- Modify: `src/api/rfq.ts` (already has `fetchVendorQuotes`)
- Modify: `src/components/QuotesViewer.tsx` (add optional `liveQuotes?` prop)
- Modify: `src/App.tsx` (fetch quotes on transition to quotes-received)

`QuotesViewer` currently hardcodes `QUOTE_ROWS` from `quotesData.ts`. Real data comes from `GET /api/vendor-quote-prices?rfq_code=...`. We fetch all RFQ codes (from `liveRfqRecords`), get quotes for each, merge them.

- [ ] **Step 1: Add fetchAllVendorQuotes helper to src/api/rfq.ts**

```typescript
export async function fetchAllVendorQuotes(
  rfqCodes: string[],
): Promise<VendorQuotePricesResponse> {
  const merged: VendorQuotePricesResponse = {}
  await Promise.allSettled(
    rfqCodes.map(async code => {
      try {
        const result = await fetchVendorQuotes(code)
        Object.assign(merged, result)
      } catch {
        // skip failed codes
      }
    }),
  )
  return merged
}
```

- [ ] **Step 2: Add liveVendorQuotes state and fetch effect in App.tsx**

Add state:

```typescript
const [liveVendorQuotes, setLiveVendorQuotes] = useState<import('./api/types').VendorQuotePricesResponse>({})
```

Add effect that fires when `appState` becomes `quotes-received`:

```typescript
useEffect(() => {
  if (appState !== 'quotes-received') return
  const rfqCodes = liveRfqRecords.map(r => r.rfq_code).filter(Boolean)
  if (rfqCodes.length === 0) return

  fetchAllVendorQuotes(rfqCodes)
    .then(quotes => setLiveVendorQuotes(quotes))
    .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [appState])
```

Add import:

```typescript
import { sendRfq, pollRfqStatus, fetchAllVendorQuotes } from './api/rfq'
```

- [ ] **Step 3: Add liveQuotes prop to QuotesViewer**

Open `src/components/QuotesViewer.tsx`. The `Props` interface currently has `{ mode, onClose, onPlaceOrder }`. Add:

```typescript
interface Props {
  mode:         RFQMode
  onClose:      () => void
  onPlaceOrder: (total: number) => void
  liveQuotes?:  import('../api/types').VendorQuotePricesResponse
}
```

Add to destructuring:

```typescript
function QuotesViewer({ mode, onClose, onPlaceOrder, liveQuotes }: Props) {
```

Inside the component, find where `QUOTE_ROWS` is used to build the table rows. Add a transform that converts `liveQuotes` to `QuoteRow[]` shape when present:

```typescript
function buildLiveRows(quotes: typeof liveQuotes): QuoteRow[] | null {
  if (!quotes || Object.keys(quotes).length === 0) return null
  return Object.entries(quotes).map(([vendor, vendorQuotes], idx) => {
    const q = vendorQuotes
    const l1 = q[0]?.unit_price ?? 0
    const l2 = q[1]?.unit_price ?? l1 * 1.05
    const l3 = q[2]?.unit_price ?? l1 * 1.10
    return {
      id:       idx + 1,
      partNo:   vendor,
      desc:     vendor,
      qty:      q[0]?.moq ?? 1,
      l1PerUnit: l1,
      l2PerUnit: l2,
      l3PerUnit: l3,
      l1Lead:   q[0]?.lead_time ?? '—',
      l2Lead:   q[1]?.lead_time ?? '—',
      l3Lead:   q[2]?.lead_time ?? '—',
      l1Score:  88,
      l2Score:  79,
      l3Score:  72,
    } satisfies QuoteRow
  })
}
```

Then use:

```typescript
const activeRows = (liveQuotes && buildLiveRows(liveQuotes)) ?? QUOTE_ROWS
```

Replace `QUOTE_ROWS` with `activeRows` throughout the render.

- [ ] **Step 4: Pass liveVendorQuotes from App.tsx**

```typescript
{appState === 'quotes-received' && (
  <QuotesViewer
    mode={rfqMode}
    onClose={...}
    onPlaceOrder={handlePlaceOrder}
    liveQuotes={Object.keys(liveVendorQuotes).length > 0 ? liveVendorQuotes : undefined}
  />
)}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: 0 errors. If `satisfies QuoteRow` fails because of missing fields, check `QuoteRow` interface in `src/data/quotesData.ts` and fill in any required fields with defaults.

- [ ] **Step 6: Commit**

```bash
git add src/api/rfq.ts src/components/QuotesViewer.tsx src/App.tsx
git commit -m "feat: wire real vendor quote prices into QuotesViewer"
```

---

## Task 7: Error visibility for pricing and RFQ failures

**Files:**
- Modify: `src/App.tsx` (add error messages to chat)

Currently pricing and RFQ errors are silently swallowed. Per CLAUDE.md rule 7: use `addMsg` to surface errors in chat without crashing.

- [ ] **Step 1: Surface pricing API error in chat**

In the `bom-parsing` effect, replace:

```typescript
fetchBulkPrices(bopParts)
  .then(results => setLivePricingResults(results))
  .catch(() => {})
```

With:

```typescript
fetchBulkPrices(bopParts)
  .then(results => setLivePricingResults(results))
  .catch(() => {
    addMsg(
      `<b>Pricing service unavailable</b><br>
       <span class="msg-sub">Cost benchmark will show estimated data. Try again later.</span>`,
      0,
    )
  })
```

- [ ] **Step 2: Surface RFQ send error in handleSendAll**

In `handleSendAll`, replace the two fire-and-forget `sendRfq` calls:

```typescript
if ((mode === 'cdp' || mode === 'both') && cdpParts.length > 0) {
  sendRfq({ vendor_name: 'Strenth Vendor Network', vendor_email: '', parts: cdpParts })
    .catch(() => addMsg(`<b>RFQ send failed (Custom parts)</b><br><span class="msg-sub">Please retry from the RFQ panel.</span>`, 0))
}
if ((mode === 'bop' || mode === 'both') && bopParts.length > 0) {
  sendRfq({ vendor_name: 'Strenth Distributor Network', vendor_email: '', parts: bopParts })
    .catch(() => addMsg(`<b>RFQ send failed (Standard parts)</b><br><span class="msg-sub">Please retry from the RFQ panel.</span>`, 0))
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: surface pricing and RFQ API errors in chat panel"
```

---

## Task 8: Production environment & CORS

**Files:**
- Modify: `.env.local` (local only — never committed)
- Read: `Agents/bom-tool/main.py` or `Agents/bom-tool/app.py` for CORS config

The deployed Vite app at `strenth-web.jollyfield-91f54af9.centralindia.azurecontainerapps.io` makes direct API calls to `bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io`. The bom-tool must allow that origin.

- [ ] **Step 1: Verify current CORS config on bom-tool**

In the `Agents/bom-tool/` directory, find where `CORSMiddleware` is configured (usually `main.py` or `app.py`). Check `allow_origins`.

Expected to find something like:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # or a list
    ...
)
```

- [ ] **Step 2: Add production origin to bom-tool CORS if needed**

If `allow_origins` is not `["*"]`, add the deployed frontend URL:

```python
allow_origins=[
    "http://localhost:5173",
    "https://strenth-web.jollyfield-91f54af9.centralindia.azurecontainerapps.io",
],
```

- [ ] **Step 3: Set production VITE_BOM_API_URL**

In Azure Container Apps for the `strenth-web` app, set environment variable:

```
VITE_BOM_API_URL=https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io
```

This is set in the Azure portal under the Container App → Settings → Environment variables, or in the `.azure/` pipeline config.

Note: `VITE_BOM_API_URL` is baked into the JS bundle at build time. The Azure build pipeline must inject this env var during `npm run build`, not at runtime.

- [ ] **Step 4: Confirm production build uses the correct API URL**

```bash
VITE_BOM_API_URL=https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io npm run build
grep "jollyfield" dist/assets/*.js | head -5
```

Expected: the API URL appears in the built JS bundle.

- [ ] **Step 5: Commit any bom-tool CORS changes (separate repo)**

If bom-tool CORS was changed, commit and redeploy that service separately.

---

## Task 9: Final end-to-end smoke test (local)

No code changes. Verification only.

- [ ] **Step 1: Start bom-tool locally**

```bash
cd Agents/bom-tool
uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: Start Vite dev server**

```bash
cd "ai-workspace-proto-master (2)/ai-workspace-proto-master"
npm run dev
```

- [ ] **Step 3: Run the full happy path**

1. Open `http://localhost:5173`
2. Upload a real `.xlsx` BOM file
3. Confirm BOM parsing shows real part count (not 15 hardcoded)
4. Confirm classification shows BOP/CDP split from real data
5. Start cost benchmarking — confirm CostBenchmarkViewer shows at least one real distributor price
6. Send RFQs — confirm RFQ tracker shows real records from `/api/all-rfqs`
7. Navigate to quotes-received — confirm QuotesViewer shows real data or graceful fallback message if no replies yet

- [ ] **Step 4: Test error path**

Stop bom-tool. Upload a BOM file. Confirm the chat shows "Could not connect to BOM service" error message and the app does not crash.

---

## Summary of What Was Already Done vs This Plan

| Feature | Before This Plan | After This Plan |
|---------|-----------------|-----------------|
| BOM upload + polling | ✅ Real | ✅ Real |
| BOM item display | ✅ Real | ✅ Real |
| HITL approve/reject | ❌ No API call | ✅ Real (Task 2) |
| Cost benchmarking | ❌ Mock only | ✅ Real (Tasks 3–4) |
| RFQ generation (send) | ✅ Real (fire-and-forget) | ✅ Real |
| RFQ tracker status | ❌ Mock only | ✅ Real (Task 5) |
| Vendor quotes display | ❌ Mock only | ✅ Real (Task 6) |
| Error visibility | ⚠️ Partial | ✅ Full (Task 7) |
| Production CORS | ⚠️ Unchecked | ✅ Verified (Task 8) |
| DFM analysis | ❌ Mock (out of scope) | ❌ Mock (intentional) |
| Payment / Razorpay | ❌ Mock (out of scope) | ❌ Mock (intentional) |
