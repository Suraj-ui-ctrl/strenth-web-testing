import { QuoteRow } from './quotesData'

export const BOP_QUOTE_ROWS: QuoteRow[] = [
  {
    id: 101, partNo: 'ELC-005', description: 'BLDC Motor Controller IC — TMC2209',
    qty: 10, unit: 'pcs',
    bomCostPerUnit: 460, benchmarkPerUnit: 415,
    l1PerUnit: 398, l2PerUnit: 422, l3PerUnit: 448,
    l1Vendor: 'DigiKey India', l2Vendor: 'Mouser Electronics', l3Vendor: 'element14 India',
    l1Lead: '1 wk', l2Lead: '1–2 wks', l3Lead: '2 wks',
    score: 94,
  },
  {
    id: 102, partNo: 'ELC-006', description: 'USB Type-C Connector — SMD Vertical',
    qty: 5, unit: 'pcs',
    bomCostPerUnit: 105, benchmarkPerUnit: 87,
    l1PerUnit: 82, l2PerUnit: 90, l3PerUnit: 98,
    l1Vendor: 'DigiKey India', l2Vendor: 'robu.in', l3Vendor: 'electronicscomp.in',
    l1Lead: '3–5 days', l2Lead: '1 wk', l3Lead: '1–2 wks',
    score: 91,
  },
  {
    id: 103, partNo: 'MCH-003', description: 'M5×20 SS Hex Socket Head Bolt + Nut',
    qty: 50, unit: 'sets',
    bomCostPerUnit: 25, benchmarkPerUnit: 19,
    l1PerUnit: 17, l2PerUnit: 20, l3PerUnit: 24,
    l1Vendor: 'Atul Fasteners', l2Vendor: 'Fastenware India', l3Vendor: 'SteelFast Pvt Ltd',
    l1Lead: '2–3 days', l2Lead: '3–5 days', l3Lead: '5–7 days',
    score: 88,
  },
  {
    id: 104, partNo: 'CBL-001', description: 'Nylon Cable Tie — 200mm × 4.8mm',
    qty: 100, unit: 'pcs',
    bomCostPerUnit: 3.8, benchmarkPerUnit: 3.0,
    l1PerUnit: 2.8, l2PerUnit: 3.1, l3PerUnit: 3.5,
    l1Vendor: 'Allied Products India', l2Vendor: 'Cable Corp India', l3Vendor: 'Fastfix Industrial',
    l1Lead: '1–2 days', l2Lead: '2–4 days', l3Lead: '3–5 days',
    score: 86,
  },
  {
    id: 105, partNo: 'ELC-007', description: '10µF 50V Electrolytic Capacitor',
    qty: 100, unit: 'pcs',
    bomCostPerUnit: 6.0, benchmarkPerUnit: 4.8,
    l1PerUnit: 4.4, l2PerUnit: 5.0, l3PerUnit: 5.6,
    l1Vendor: 'LCSC India', l2Vendor: 'DigiKey India', l3Vendor: 'Mouser Electronics',
    l1Lead: '3–5 days', l2Lead: '5–7 days', l3Lead: '1–2 wks',
    score: 92,
  },
]

export const BOP_QUOTE_GRAND_L1  = BOP_QUOTE_ROWS.reduce((s, r) => s + r.l1PerUnit * r.qty, 0)
export const BOP_QUOTE_GRAND_BOM = BOP_QUOTE_ROWS.reduce((s, r) => s + r.bomCostPerUnit * r.qty, 0)
export const BOP_QUOTE_AVG_SCORE = Math.round(BOP_QUOTE_ROWS.reduce((s, r) => s + r.score, 0) / BOP_QUOTE_ROWS.length)
