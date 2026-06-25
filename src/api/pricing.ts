import { post } from './client'
import type { DistributorPrice, PartPriceResult, PricePart } from './types'

const INDIAN_KEYS = ['indian', 'robu', 'evelta', 'tenettech', 'ktron', 'rarecomponents', 'sunrom', 'vyoauto']

export async function fetchBulkPrices(parts: PricePart[]): Promise<PartPriceResult[]> {
  const components = parts.map(p => ({ MPN: p.mpn, Quantity: p.qty }))
  /* fast_pricing=true: backend cuts timeout from 22s→14s, skips slow enrichment */
  const raw = await post<unknown>(
    '/api/fetch-prices-bulk',
    { components, fast_pricing: true },
    60_000,
  )
  /* API returns [...] directly */
  const rawList: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : Array.isArray((raw as { results?: unknown }).results)
      ? ((raw as { results: Record<string, unknown>[] }).results)
      : []
  if (rawList.length === 0) return []

  return rawList.map(item => {
    const vendorMap = (item.results as Record<string, Record<string, unknown>>) ?? {}
    const distributor_prices: DistributorPrice[] = []
    const indian_prices: DistributorPrice[] = []

    for (const [supplier, info] of Object.entries(vendorMap)) {
      if (!info) continue
      const entry: DistributorPrice = {
        supplier,
        unit_price: typeof info.price === 'number' ? info.price : null,
        currency: 'USD',
        stock: info.stock != null ? (parseInt(String(info.stock)) || null) : null,
        lead_time: typeof info.lead_time === 'string' ? info.lead_time : null,
        url: typeof info.url === 'string' ? info.url : null,
      }
      if (INDIAN_KEYS.some(k => supplier.toLowerCase().includes(k))) {
        indian_prices.push(entry)
      } else {
        distributor_prices.push(entry)
      }
    }

    const bcdRaw = item.basic_duty_rate
    return {
      mpn:              String(item.mpn ?? ''),
      manufacturer:     String(item.manufacturer ?? ''),
      hsn_code:         String(item.hsn_code ?? ''),
      basic_duty_rate:  typeof bcdRaw === 'number' ? bcdRaw : null,
      distributor_prices,
      indian_prices,
      best_price:       typeof item.best_price === 'number' ? item.best_price : null,
      best_supplier:    typeof item.best_supplier === 'string' ? item.best_supplier : null,
    }
  })
}

export function bestPriceLabel(result: PartPriceResult): string {
  if (result.best_price == null) return 'N/A'
  const supplier = result.best_supplier ? ` (${result.best_supplier})` : ''
  return `₹${result.best_price.toFixed(2)}${supplier}`
}

import type { BomRow } from '../types'
import type { BopCostRow, IndianPrice, SupplierPrice } from '../data/costData'
import { USD_INR } from '../data/costData'

export function mapPriceResultsToBopRows(
  results: PartPriceResult[],
  bomRows: BomRow[],
): BopCostRow[] {
  const out: BopCostRow[] = []
  for (const result of results) {
    const bomRow = bomRows.find(r => r.partNo === result.mpn)
    if (!bomRow) continue

    const findDist = (name: string): SupplierPrice | undefined => {
      const p = result.distributor_prices.find(
        d => d.supplier.toLowerCase().includes(name.toLowerCase()),
      )
      if (!p || p.unit_price == null || p.unit_price <= 0) return undefined
      return { price: p.unit_price, stock: p.stock ?? 0, leadTime: p.lead_time ?? '—', available: true }
    }

    const indianPrices: IndianPrice[] = result.indian_prices
      .filter(p => p.unit_price != null && p.unit_price > 0)
      .map(p => ({ platform: p.supplier, price: (p.unit_price ?? 0) * USD_INR, url: p.url ?? '' }))

    const hasIntl   = result.distributor_prices.some(d => (d.unit_price ?? 0) > 0)
    const bestUsd   = result.best_price ?? 0
    const bestSup   = result.best_supplier ?? ''
    const bcdRate   = result.basic_duty_rate ?? 10   /* fallback 10% BCD */
    const hsnCode   = result.hsn_code || bomRow.hsnCode || ''
    const mfr       = result.manufacturer || ''

    /* Landed = best_price_USD × (1 + BCD/100) × USD_INR */
    const landedInr = bestUsd > 0
      ? Math.round(bestUsd * (1 + bcdRate / 100) * USD_INR * 10) / 10
      : indianPrices.length > 0 ? indianPrices[0].price : 0

    const landedBasis = bestUsd > 0
      ? `${bestSup} + ${bcdRate}% BCD`
      : indianPrices.length > 0 ? `${indianPrices[0].platform} (local)` : '—'

    out.push({
      id:            bomRow.id,
      partNo:        bomRow.partNo,
      description:   bomRow.description,
      qty:           bomRow.qty,
      mpn:           bomRow.partNo,
      manufacturer:  mfr,
      hsnCode,
      digikey:       findDist('digikey'),
      mouser:        findDist('mouser'),
      element14:     findDist('element14'),
      lcsc:          findDist('lcsc'),
      arrow:         findDist('arrow'),
      indianPrices,
      bcd:           bcdRate,
      landedCostInr: landedInr,
      landedBasis,
      unavailable:   !hasIntl && indianPrices.length === 0,
    })
  }
  return out
}
