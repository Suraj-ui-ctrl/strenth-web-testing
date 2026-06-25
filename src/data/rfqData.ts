export interface RFQRow {
  id:                  number
  rfqNo:               string
  partNo:              string
  description:         string
  qty:                 number
  unit:                string
  tentativeMaterial:   string
  productionMethod:    string
  targetPricePerUnit:  number   /* ₹ — 15-20% below benchmark */
  totalTarget:         number
  vendors:             string[]
  leadTimeWeeks:       string
  status:              'Draft'
}

export const RFQ_ROWS: RFQRow[] = [
  {
    id: 1,
    rfqNo: 'RFQ-2026-001',
    partNo: 'MCH-001',
    description: 'Aluminium Housing — Main Assembly',
    qty: 10,
    unit: 'pcs',
    tentativeMaterial: 'Aluminium 6061-T6',
    productionMethod: 'CNC Machining',
    targetPricePerUnit: 2380,
    totalTarget: 23800,
    vendors: ['TechMach Pune', 'Precision Parts India', 'Ace Machining Works'],
    leadTimeWeeks: '3–4 wks',
    status: 'Draft',
  },
  {
    id: 2,
    rfqNo: 'RFQ-2026-002',
    partNo: 'MCH-002',
    description: 'Stainless Steel Bracket — Mounting',
    qty: 25,
    unit: 'pcs',
    tentativeMaterial: 'CRCA Steel IS 513',
    productionMethod: 'Sheet Metal Fabrication',
    targetPricePerUnit: 310,
    totalTarget: 7750,
    vendors: ['SheetFab Industries', 'MetalWorks Chennai', 'Bharat Engineering'],
    leadTimeWeeks: '2–3 wks',
    status: 'Draft',
  },
  {
    id: 3,
    rfqNo: 'RFQ-2026-003',
    partNo: 'MCH-004',
    description: 'Precision Gear Set — 1:4 Ratio',
    qty: 5,
    unit: 'sets',
    tentativeMaterial: 'Alloy Steel 20MnCr5',
    productionMethod: 'Gear Hobbing + Heat Treatment',
    targetPricePerUnit: 1400,
    totalTarget: 7000,
    vendors: ['Gear India Pvt Ltd', 'Power Transmission Co.', 'HMT Machining'],
    leadTimeWeeks: '4–6 wks',
    status: 'Draft',
  },
  {
    id: 4,
    rfqNo: 'RFQ-2026-004',
    partNo: 'MCH-005',
    description: 'Drive Shaft — 12mm dia, 250mm L',
    qty: 5,
    unit: 'pcs',
    tentativeMaterial: 'Stainless Steel 316L',
    productionMethod: 'CNC Turning + Grinding',
    targetPricePerUnit: 1780,
    totalTarget: 8900,
    vendors: ['Shaft Precision Works', 'Turn-All Engineering', 'Rotary Parts India'],
    leadTimeWeeks: '2–3 wks',
    status: 'Draft',
  },
  {
    id: 5,
    rfqNo: 'RFQ-2026-005',
    partNo: 'ELC-001',
    description: 'Control PCB — Motor Driver (4-layer)',
    qty: 10,
    unit: 'pcs',
    tentativeMaterial: 'FR4 (1.6mm, HASL finish)',
    productionMethod: 'PCB Fabrication + SMT Assembly',
    targetPricePerUnit: 3570,
    totalTarget: 35700,
    vendors: ['PCB Power India', 'PCBGOGO India', 'Circuits@24 Mumbai'],
    leadTimeWeeks: '3–4 wks',
    status: 'Draft',
  },
  {
    id: 6,
    rfqNo: 'RFQ-2026-006',
    partNo: 'ELC-003',
    description: '24V DC Power Transformer — 5A',
    qty: 3,
    unit: 'pcs',
    tentativeMaterial: 'CRGO Lamination + Epoxy Resin',
    productionMethod: 'Wound Core + Epoxy Potting',
    targetPricePerUnit: 6375,
    totalTarget: 19125,
    vendors: ['Transformers India Ltd', 'Magnetics Pvt Ltd', 'ElectroMag Solutions'],
    leadTimeWeeks: '4–5 wks',
    status: 'Draft',
  },
]

export const RFQ_GRAND_TARGET = RFQ_ROWS.reduce((s, r) => s + r.totalTarget, 0)
