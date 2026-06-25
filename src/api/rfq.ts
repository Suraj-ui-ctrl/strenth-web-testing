import { get, post } from './client'
import type { RfqRecord, VendorQuotePricesResponse } from './types'

export interface SendRfqPayload {
  rfq_code?: string
  vendor_name: string
  vendor_email: string
  parts: { part_name: string; mpn: string; qty: number; classification: string }[]
  delivery_location?: string
  project_name?: string
}

export async function sendRfq(payload: SendRfqPayload): Promise<{ rfq_code: string }> {
  return post<{ rfq_code: string }>('/api/send-rfq', payload)
}

export async function fetchAllRfqs(): Promise<RfqRecord[]> {
  const data = await get<RfqRecord[] | { rfqs: RfqRecord[] }>('/api/all-rfqs')
  return Array.isArray(data) ? data : data.rfqs ?? []
}

export async function fetchVendorQuotes(rfqCode: string): Promise<VendorQuotePricesResponse> {
  return get<VendorQuotePricesResponse>(
    `/api/vendor-quote-prices?rfq_code=${encodeURIComponent(rfqCode)}`,
  )
}
