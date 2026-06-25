import { get, patch, postForm } from './client'
import type { BomItemOut, BomJobSummary, ItemClassification, ItemStatus } from './types'
import type { BomRow } from '../types'

const POLL_INTERVAL_MS = 2000
const TERMINAL_STATUSES = new Set(['READY', 'HITL_REVIEW', 'FAILED'])

export async function uploadBomFile(
  file: File,
  projectName?: string,
  pcbQty = 1,
): Promise<BomJobSummary> {
  const form = new FormData()
  form.append('file', file)
  if (projectName) form.append('project_name', projectName)
  form.append('pcb_qty', String(pcbQty))
  return postForm<BomJobSummary>('/api/v2/boms/upload', form)
}

export function pollBomJob(
  jobId: string,
  onUpdate: (summary: BomJobSummary) => void,
  signal: AbortSignal,
): Promise<BomJobSummary> {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (signal.aborted) return reject(new Error('Polling aborted'))
      try {
        const summary = await get<BomJobSummary>(`/api/v2/boms/${jobId}`)
        onUpdate(summary)
        if (TERMINAL_STATUSES.has(summary.status)) {
          resolve(summary)
        } else {
          setTimeout(tick, POLL_INTERVAL_MS)
        }
      } catch (err) {
        reject(err)
      }
    }
    tick()
  })
}

export async function fetchBomItems(jobId: string): Promise<BomItemOut[]> {
  const data = await get<BomItemOut[] | { items: BomItemOut[] }>(
    `/api/v2/boms/${jobId}/items?page=1&page_size=500`,
  )
  return Array.isArray(data) ? data : data.items
}

export async function approveBomItem(
  jobId: string,
  itemId: string,
  classification?: ItemClassification,
): Promise<BomItemOut> {
  return patch<BomItemOut>(`/api/v2/boms/${jobId}/items/${itemId}`, {
    action: 'approve',
    ...(classification ? { classification } : {}),
  })
}

export async function rejectBomItem(
  jobId: string,
  itemId: string,
  notes?: string,
): Promise<BomItemOut> {
  return patch<BomItemOut>(`/api/v2/boms/${jobId}/items/${itemId}`, {
    action: 'reject',
    ...(notes ? { review_notes: notes } : {}),
  })
}

// ── Data mapping ──────────────────────────────────────────────────────────

function deriveCategory(c: ItemClassification): BomRow['category'] {
  if (c === 'MECHANICAL' || c === 'CDP') return 'Mechanical'
  return 'Electrical'
}

function deriveStatus(s: ItemStatus): BomRow['status'] {
  if (s === 'VALIDATED' || s === 'CLASSIFIED' || s === 'APPROVED') return 'Approved'
  if (s === 'ERROR' || s === 'REJECTED') return 'Review'
  return 'Pending'
}

function deriveClassification(c: ItemClassification): BomRow['classification'] {
  if (c === 'BOP') return 'BOP'
  if (c === 'CDP' || c === 'MECHANICAL' || c === 'ASSEMBLY') return 'CDP'
  return 'Ambiguous'
}

export function mapItemsToBomRows(items: BomItemOut[], sourceFilename: string): BomRow[] {
  return items.map((item, idx) => ({
    id: item.row_index ?? idx + 1,
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
