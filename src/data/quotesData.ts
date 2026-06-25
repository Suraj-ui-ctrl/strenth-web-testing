export interface QuoteRow {
  id:              number
  partNo:          string
  description:     string
  qty:             number
  unit:            string
  bomCostPerUnit:  number
  benchmarkPerUnit:number
  l1PerUnit:       number
  l2PerUnit:       number
  l3PerUnit:       number
  l1Vendor:        string
  l2Vendor:        string
  l3Vendor:        string
  l1Lead:          string   /* per-tier lead times */
  l2Lead:          string
  l3Lead:          string
  score:           number
}

export const QUOTE_ROWS: QuoteRow[] = [
  {
    id: 1, partNo: 'MCH-001', description: 'Aluminium Housing — Main Assembly',
    qty: 10, unit: 'pcs',
    bomCostPerUnit: 2800, benchmarkPerUnit: 2380,
    l1PerUnit: 2250, l2PerUnit: 2395, l3PerUnit: 2520,
    l1Vendor: 'TechMach Pune', l2Vendor: 'Precision Parts India', l3Vendor: 'Ace Machining Works',
    l1Lead: '5–6 wks', l2Lead: '3–4 wks', l3Lead: '2–3 wks',
    score: 91,
  },
  {
    id: 2, partNo: 'MCH-002', description: 'Stainless Steel Bracket — Mounting',
    qty: 25, unit: 'pcs',
    bomCostPerUnit: 375, benchmarkPerUnit: 310,
    l1PerUnit: 285, l2PerUnit: 320, l3PerUnit: 348,
    l1Vendor: 'SheetFab Industries', l2Vendor: 'MetalWorks Chennai', l3Vendor: 'Bharat Engineering',
    l1Lead: '3–4 wks', l2Lead: '2–3 wks', l3Lead: '1–2 wks',
    score: 88,
  },
  {
    id: 3, partNo: 'MCH-004', description: 'Precision Gear Set — 1:4 Ratio',
    qty: 5, unit: 'sets',
    bomCostPerUnit: 1680, benchmarkPerUnit: 1400,
    l1PerUnit: 1320, l2PerUnit: 1455, l3PerUnit: 1590,
    l1Vendor: 'Gear India Pvt Ltd', l2Vendor: 'Power Transmission Co.', l3Vendor: 'HMT Machining',
    l1Lead: '6–7 wks', l2Lead: '4–5 wks', l3Lead: '3–4 wks',
    score: 85,
  },
  {
    id: 4, partNo: 'MCH-005', description: 'Drive Shaft — 12mm dia, 250mm L',
    qty: 5, unit: 'pcs',
    bomCostPerUnit: 2100, benchmarkPerUnit: 1780,
    l1PerUnit: 1690, l2PerUnit: 1810, l3PerUnit: 1960,
    l1Vendor: 'Shaft Precision Works', l2Vendor: 'Turn-All Engineering', l3Vendor: 'Rotary Parts India',
    l1Lead: '4–5 wks', l2Lead: '2–3 wks', l3Lead: '2 wks',
    score: 89,
  },
  {
    id: 5, partNo: 'ELC-001', description: 'Control PCB — Motor Driver (4-layer)',
    qty: 10, unit: 'pcs',
    bomCostPerUnit: 4200, benchmarkPerUnit: 3570,
    l1PerUnit: 3380, l2PerUnit: 3620, l3PerUnit: 3900,
    l1Vendor: 'PCB Power India', l2Vendor: 'PCBGOGO India', l3Vendor: 'Circuits@24 Mumbai',
    l1Lead: '5–6 wks', l2Lead: '3–4 wks', l3Lead: '2–3 wks',
    score: 87,
  },
  {
    id: 6, partNo: 'ELC-003', description: '24V DC Power Transformer — 5A',
    qty: 3, unit: 'pcs',
    bomCostPerUnit: 7500, benchmarkPerUnit: 6375,
    l1PerUnit: 6100, l2PerUnit: 6480, l3PerUnit: 6850,
    l1Vendor: 'Transformers India Ltd', l2Vendor: 'Magnetics Pvt Ltd', l3Vendor: 'ElectroMag Solutions',
    l1Lead: '5–6 wks', l2Lead: '4–5 wks', l3Lead: '3–4 wks',
    score: 83,
  },
]

export const QUOTE_GRAND_L1  = QUOTE_ROWS.reduce((s, r) => s + r.l1PerUnit  * r.qty, 0)
export const QUOTE_GRAND_BOM = QUOTE_ROWS.reduce((s, r) => s + r.bomCostPerUnit * r.qty, 0)
export const QUOTE_AVG_SCORE = Math.round(QUOTE_ROWS.reduce((s, r) => s + r.score, 0) / QUOTE_ROWS.length)
