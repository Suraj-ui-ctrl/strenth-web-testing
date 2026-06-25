// ── bom-tool /api/v2/boms ──────────────────────────────────────────────────

export type BomJobStatus =
  | 'PENDING'
  | 'PARSING'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'CLASSIFYING'
  | 'HITL_REVIEW'
  | 'READY'
  | 'FAILED'

export interface BomJobSummary {
  job_id: string
  filename: string
  status: BomJobStatus
  version: number
  project_name: string | null
  pcb_qty: number
  total_items: number | null
  valid_items: number | null
  error_count: number
  needs_review_count: number
  created_at: string
  updated_at: string
  completed_at: string | null
  context: Record<string, unknown>
}

export type ItemClassification = 'BOP' | 'CDP' | 'MECHANICAL' | 'ASSEMBLY' | 'AMBIGUOUS' | 'UNCLASSIFIED'
export type ItemStatus = 'PENDING' | 'VALIDATED' | 'ERROR' | 'CLASSIFIED' | 'APPROVED' | 'REJECTED'

export interface BomItemOut {
  id: string
  row_index: number
  mpn: string | null
  description: string | null
  quantity: number | null
  unit: string
  reference_designator: string | null
  manufacturer: string | null
  classification: ItemClassification
  classification_confidence: number | null
  classification_method: string | null
  classification_reason: string | null
  status: ItemStatus
  is_duplicate: boolean
  needs_review: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
}

// ── bom-tool /api/fetch-prices-bulk ───────────────────────────────────────

export interface PricePart {
  mpn: string
  qty: number
}

export interface DistributorPrice {
  supplier: string
  unit_price: number | null
  currency: string
  stock: number | null
  lead_time: string | null
  url: string | null
}

export interface PartPriceResult {
  mpn: string
  distributor_prices: DistributorPrice[]
  indian_prices: DistributorPrice[]
  best_price: number | null
  best_supplier: string | null
  hsn_code: string
  manufacturer: string
  basic_duty_rate: number | null  /* BCD % from CBIC, e.g. 10 means 10% */
}

export interface BulkPriceResponse {
  results: PartPriceResult[]
}

// ── bom-tool /api/all-rfqs ────────────────────────────────────────────────

export interface RfqRecord {
  id: number | string
  rfq_code: string
  vendor_name: string
  vendor_email: string
  status: 'sent' | 'replied' | 'pending' | string
  sent_at: string | null
  replied_at: string | null
  part_names: string[]
}

// ── bom-tool /api/vendor-quote-prices ────────────────────────────────────

export interface VendorQuote {
  unit_price: number
  lead_time: string
  moq: number
  currency: string
  notes: string | null
}

export type VendorQuotePricesResponse = Record<string, VendorQuote[]>
