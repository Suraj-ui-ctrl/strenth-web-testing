/* ─── Cost Benchmarking Mock Data ─── */

export interface SupplierPrice {
  price:     number   /* USD */
  stock:     number
  leadTime:  string
  available: boolean
}

export interface IndianPrice {
  platform: string
  price:    number   /* INR */
  url:      string
}

export interface BopCostRow {
  id:           number
  partNo:       string
  description:  string
  qty:          number
  mpn:          string
  manufacturer: string
  hsnCode:      string
  /* International distributors */
  digikey?:     SupplierPrice
  mouser?:      SupplierPrice
  element14?:   SupplierPrice
  lcsc?:        SupplierPrice
  arrow?:       SupplierPrice
  /* Indian platforms (INR per unit) */
  indianPrices: IndianPrice[]
  /* Customs & landed */
  bcd:              number    /* Basic Customs Duty % */
  landedCostInr:    number    /* best landed cost in INR */
  landedBasis:      string    /* "LCSC + BCD" or "robu (local)" */
  unavailable:      boolean   /* no international stock → highlight red */
  llmNote?:         string
}

export interface CdpCostRow {
  id:               number
  partNo:           string
  description:      string
  qty:              number
  tentativeMaterial:  string
  productionMethod:   string
  tolerance?:         string
  surfaceFinish?:     string
  historicalCostPerUnit: number   /* INR */
  totalCost:             number   /* INR */
  vendor?:               string
  leadTime?:             string
}

/* ── USD → INR rate ── */
export const USD_INR = 83.5

/* ══════════════════════════════════════════
   BOP ROWS  (IDs: 9, 11, 12, 13, 15)
══════════════════════════════════════════ */
export const BOP_COST_ROWS: BopCostRow[] = [
  {
    id: 9,
    partNo: 'ELC-004',
    description: 'SMD Components — Pick & Place',
    qty: 47,
    mpn: 'Various (Reel)',
    manufacturer: 'Multiple',
    hsnCode: '8542.31',
    digikey:  { price: 0.15, stock: 10000, leadTime: '1–2 days',  available: true  },
    mouser:   { price: 0.17, stock:  8500, leadTime: '1–2 days',  available: true  },
    element14:{ price: 0.16, stock: 12000, leadTime: '3–5 days',  available: true  },
    lcsc:     { price: 0.08, stock: 50000, leadTime: '7–14 days', available: true  },   /* best */
    arrow:    { price: 0.14, stock:  5000, leadTime: '2–3 days',  available: true  },
    indianPrices: [
      { platform: 'robu',          price:  12, url: 'https://robu.in' },
      { platform: 'robocraze',     price:  14, url: 'https://robocraze.com' },
      { platform: 'evelta',        price:  11, url: 'https://evelta.com' },
    ],
    bcd: 10,
    landedCostInr: Math.round(0.08 * 1.10 * USD_INR * 10) / 10,  /* ≈ ₹7.3 */
    landedBasis: 'LCSC + 10% BCD',
    unavailable: false,
  },
  {
    id: 11,
    partNo: 'FAS-001',
    description: 'M3 × 8 Cap Head Screw',
    qty: 24,
    mpn: 'DIN912-M3x8-A2',
    manufacturer: 'Bossard / Generic',
    hsnCode: '7318.15',
    digikey:  { price: 0.08, stock:  5000, leadTime: '1–2 days',  available: true  },
    mouser:   { price: 0.09, stock:  3200, leadTime: '1–2 days',  available: true  },
    element14:{ price: 0.07, stock:  8000, leadTime: '2–3 days',  available: true  },
    lcsc:     { price: 0.04, stock: 20000, leadTime: '7–14 days', available: true  },   /* best */
    arrow:    { price: 0,    stock:  0,    leadTime: '—',         available: false },
    indianPrices: [
      { platform: 'robu',          price: 3.0, url: 'https://robu.in' },
      { platform: 'electronicscomp', price: 2.5, url: 'https://electronicscomp.com' },
      { platform: 'evelta',        price: 3.5, url: 'https://evelta.com' },
    ],
    bcd: 7.5,
    landedCostInr: Math.round(0.04 * 1.075 * USD_INR * 10) / 10,  /* ≈ ₹3.6 */
    landedBasis: 'LCSC + 7.5% BCD',
    unavailable: false,
  },
  {
    id: 12,
    partNo: 'FAS-002',
    description: 'M3 Hex Nut — Stainless',
    qty: 24,
    mpn: 'DIN934-M3-A2',
    manufacturer: 'Generic',
    hsnCode: '7318.16',
    digikey:  { price: 0.06, stock: 10000, leadTime: '1–2 days',  available: true  },
    mouser:   { price: 0.07, stock:  8000, leadTime: '1–2 days',  available: true  },
    element14:{ price: 0.06, stock: 12000, leadTime: '2–3 days',  available: true  },
    lcsc:     { price: 0.03, stock: 50000, leadTime: '7–14 days', available: true  },   /* best */
    arrow:    { price: 0,    stock:  0,    leadTime: '—',         available: false },
    indianPrices: [
      { platform: 'robu',    price: 2.0, url: 'https://robu.in' },
      { platform: 'robokits',price: 1.8, url: 'https://robokits.co.in' },
    ],
    bcd: 7.5,
    landedCostInr: Math.round(0.03 * 1.075 * USD_INR * 10) / 10,  /* ≈ ₹2.7 */
    landedBasis: 'LCSC + 7.5% BCD',
    unavailable: false,
  },
  {
    id: 13,
    partNo: 'FAS-003',
    description: 'M4 × 12 Socket Head Screw',
    qty: 8,
    mpn: 'DIN912-M4x12-A2',
    manufacturer: 'Generic',
    hsnCode: '7318.15',
    digikey:  { price: 0.10, stock:  4000, leadTime: '1–2 days',  available: true  },
    mouser:   { price: 0.11, stock:  2500, leadTime: '1–2 days',  available: true  },
    element14:{ price: 0.09, stock:  6000, leadTime: '2–3 days',  available: true  },
    lcsc:     { price: 0.05, stock: 15000, leadTime: '7–14 days', available: true  },   /* best */
    arrow:    { price: 0,    stock:  0,    leadTime: '—',         available: false },
    indianPrices: [
      { platform: 'robu',          price: 4.0, url: 'https://robu.in' },
      { platform: 'electronicscomp', price: 3.5, url: 'https://electronicscomp.com' },
    ],
    bcd: 7.5,
    landedCostInr: Math.round(0.05 * 1.075 * USD_INR * 10) / 10,  /* ≈ ₹4.5 */
    landedBasis: 'LCSC + 7.5% BCD',
    unavailable: false,
  },
  {
    id: 15,
    partNo: 'CBL-002',
    description: 'DC Power Cable 24 V 0.5 m',
    qty: 1,
    mpn: 'CBL-24V-500-3P',
    manufacturer: 'Custom / Local',
    hsnCode: '8544.42',
    digikey:  { price: 0, stock: 0, leadTime: '—', available: false },
    mouser:   { price: 0, stock: 0, leadTime: '—', available: false },
    element14:{ price: 0, stock: 0, leadTime: '—', available: false },
    lcsc:     { price: 0, stock: 0, leadTime: '—', available: false },
    arrow:    { price: 0, stock: 0, leadTime: '—', available: false },
    indianPrices: [
      { platform: 'robu',     price: 185, url: 'https://robu.in' },
      { platform: 'robokits', price: 175, url: 'https://robokits.co.in' },
      { platform: 'flyrobo',  price: 195, url: 'https://flyrobo.in' },
    ],
    bcd: 10,
    landedCostInr: 175,
    landedBasis: 'robokits (local — not internationally available)',
    unavailable: true,
    llmNote: 'LLM: Not listed on any international distributor. Sourced from Indian platforms only.',
  },
]

/* ══════════════════════════════════════════
   CDP ROWS  (IDs: 1, 2, 4, 5, 6, 8)
══════════════════════════════════════════ */
export const CDP_COST_ROWS: CdpCostRow[] = [
  {
    id: 1,
    partNo: 'MCH-001',
    description: 'Enclosure Top Panel',
    qty: 1,
    tentativeMaterial: 'Aluminium 6061-T6, 3 mm sheet',
    productionMethod: 'CNC Milling',
    tolerance: '±0.1 mm',
    surfaceFinish: 'Clear Anodize',
    historicalCostPerUnit: 1200,
    totalCost: 1200,
    vendor: 'Local CNC Vendor, Pune',
    leadTime: '2–3 weeks',
  },
  {
    id: 2,
    partNo: 'MCH-002',
    description: 'Motor Mount Bracket',
    qty: 2,
    tentativeMaterial: 'Mild Steel IS2062, 2 mm',
    productionMethod: 'Sheet Metal — Laser Cut + Bend',
    tolerance: '±0.2 mm',
    surfaceFinish: 'Zinc Phosphate + Powder Coat',
    historicalCostPerUnit: 450,
    totalCost: 900,
    vendor: 'Sheet Metal Fab, Bangalore',
    leadTime: '1–2 weeks',
  },
  {
    id: 4,
    partNo: 'MCH-004',
    description: 'Lens Housing Assembly',
    qty: 1,
    tentativeMaterial: 'Aluminium 6061-T6 billet',
    productionMethod: 'CNC Turning + Milling',
    tolerance: '±0.05 mm',
    surfaceFinish: 'Black Anodize',
    historicalCostPerUnit: 2800,
    totalCost: 2800,
    vendor: 'Precision Parts, Hyderabad',
    leadTime: '3–4 weeks',
  },
  {
    id: 5,
    partNo: 'MCH-005',
    description: 'Enclosure Base Panel',
    qty: 1,
    tentativeMaterial: 'Aluminium 5052-H32, 3 mm sheet',
    productionMethod: 'CNC Milling',
    tolerance: '±0.1 mm',
    surfaceFinish: 'Clear Anodize',
    historicalCostPerUnit: 950,
    totalCost: 950,
    vendor: 'Local CNC Vendor, Pune',
    leadTime: '2–3 weeks',
  },
  {
    id: 6,
    partNo: 'ELC-001',
    description: 'Main PCB Board Rev 4',
    qty: 1,
    tentativeMaterial: 'FR4 1.6 mm, 4-layer, HASL finish',
    productionMethod: 'PCB Fabrication + SMT Assembly',
    tolerance: 'IPC Class 2',
    surfaceFinish: 'HASL Lead-Free',
    historicalCostPerUnit: 3500,
    totalCost: 3500,
    vendor: 'PCB Power, Mumbai',
    leadTime: '2–3 weeks',
  },
  {
    id: 8,
    partNo: 'ELC-003',
    description: 'Circuit Layout Rev 3',
    qty: 1,
    tentativeMaterial: 'FR4 1.6 mm, 2-layer',
    productionMethod: 'PCB Fabrication',
    tolerance: 'IPC Class 2',
    surfaceFinish: 'ENIG',
    historicalCostPerUnit: 850,
    totalCost: 850,
    vendor: 'PCB Power, Mumbai',
    leadTime: '1–2 weeks',
  },
]

/* ── Summary totals ── */
export const BOP_LANDED_TOTAL = BOP_COST_ROWS.reduce(
  (sum, r) => sum + r.landedCostInr * r.qty, 0,
)
export const CDP_TOTAL = CDP_COST_ROWS.reduce((sum, r) => sum + r.totalCost, 0)
export const GRAND_TOTAL = BOP_LANDED_TOTAL + CDP_TOTAL
