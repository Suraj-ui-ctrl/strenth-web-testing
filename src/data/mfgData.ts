export const MFG_STEPS = [
  { label: 'RFQ Preview Creation',               estSec: 3  },
  { label: 'Parsing BOM & DFM report',           estSec: 4  },
  { label: 'Mapping production methods',          estSec: 6  },
  { label: 'Capacity planning & machine alloc.',  estSec: 8  },
  { label: 'Build schedule optimisation',         estSec: 10 },
  { label: 'Critical path & lead time calc.',     estSec: 6  },
  { label: 'Shop-floor WIP plan',                estSec: 5  },
]

export const MFG_TOTAL_EST_SEC = MFG_STEPS.reduce((s, x) => s + x.estSec, 0) // 39 s

export interface MfgRow {
  id:          number
  partNo:      string
  description: string
  process:     string
  line:        string
  qty:         number
  unit:        string
  cycleDays:   number
  startDay:    number
  endDay:      number
  status:      'Ready' | 'In Queue' | 'Planned'
  partType:    'Standard' | 'Custom'
}

export const MFG_ROWS: MfgRow[] = [
  /* ── Standard Parts (BOP) — procurement only ── */
  { id: 7,  partNo: 'ELC-005', description: 'BLDC Motor Controller IC — TMC2209',    process: 'Procurement',              line: 'DigiKey India',         qty: 10,  unit: 'pcs',  cycleDays: 7,  startDay: 0, endDay: 7,  status: 'Ready',    partType: 'Standard' },
  { id: 8,  partNo: 'ELC-006', description: 'USB Type-C Connector — SMD Vertical',   process: 'Procurement',              line: 'DigiKey India',         qty: 5,   unit: 'pcs',  cycleDays: 5,  startDay: 0, endDay: 5,  status: 'Ready',    partType: 'Standard' },
  { id: 9,  partNo: 'MCH-003', description: 'M5×20 SS Hex Socket Head Bolt + Nut',  process: 'Procurement',              line: 'Atul Fasteners',        qty: 50,  unit: 'sets', cycleDays: 3,  startDay: 0, endDay: 3,  status: 'Ready',    partType: 'Standard' },
  { id: 10, partNo: 'CBL-001', description: 'Nylon Cable Tie — 200mm × 4.8mm',       process: 'Procurement',              line: 'Allied Products India', qty: 100, unit: 'pcs',  cycleDays: 2,  startDay: 0, endDay: 2,  status: 'Ready',    partType: 'Standard' },
  { id: 11, partNo: 'ELC-007', description: '10µF 50V Electrolytic Capacitor',        process: 'Procurement',              line: 'LCSC India',            qty: 100, unit: 'pcs',  cycleDays: 5,  startDay: 0, endDay: 5,  status: 'Ready',    partType: 'Standard' },
  /* ── Custom Parts (CDP) — manufacturing ── */
  { id: 1,  partNo: 'MCH-001', description: 'Aluminium Housing — Main Assembly',      process: 'CNC Machining',            line: 'Line A – CNC',          qty: 10,  unit: 'pcs',  cycleDays: 21, startDay: 0, endDay: 21, status: 'In Queue', partType: 'Custom' },
  { id: 2,  partNo: 'MCH-002', description: 'Stainless Steel Bracket — Mounting',    process: 'Sheet Metal Fabrication',  line: 'Line B – Sheet Metal',  qty: 25,  unit: 'pcs',  cycleDays: 10, startDay: 0, endDay: 10, status: 'Ready',    partType: 'Custom' },
  { id: 3,  partNo: 'MCH-004', description: 'Precision Gear Set — 1:4 Ratio',        process: 'Gear Hobbing + Heat Treat',line: 'Line A – CNC',          qty: 5,   unit: 'sets', cycleDays: 25, startDay: 0, endDay: 25, status: 'In Queue', partType: 'Custom' },
  { id: 4,  partNo: 'MCH-005', description: 'Drive Shaft — 12mm dia, 250mm L',       process: 'CNC Turning + Grinding',   line: 'Line A – CNC',          qty: 5,   unit: 'pcs',  cycleDays: 14, startDay: 5, endDay: 19, status: 'Planned',  partType: 'Custom' },
  { id: 5,  partNo: 'ELC-001', description: 'Control PCB — Motor Driver (4-layer)',   process: 'PCB Fabrication + SMT',    line: 'Line C – PCB',          qty: 10,  unit: 'pcs',  cycleDays: 18, startDay: 7, endDay: 25, status: 'Planned',  partType: 'Custom' },
  { id: 6,  partNo: 'ELC-003', description: '24V DC Power Transformer — 5A',          process: 'Winding + Assembly',       line: 'Line C – PCB',          qty: 3,   unit: 'pcs',  cycleDays: 20, startDay: 3, endDay: 23, status: 'Planned',  partType: 'Custom' },
]

export const MFG_TOTAL_DAYS   = Math.max(...MFG_ROWS.map(r => r.endDay))
export const MFG_CUSTOM_COUNT = MFG_ROWS.filter(r => r.partType === 'Custom').length
export const MFG_STD_COUNT    = MFG_ROWS.filter(r => r.partType === 'Standard').length
