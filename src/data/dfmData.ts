export interface DFMPart {
  id:                 number
  partNo:             string
  description:        string
  category:           'Mechanical' | 'Electrical' | 'Fastener' | 'Cable'
  material:           string
  recommendedProcess: string
  alternateProcess?:  string
  feasibilityScore:   number   // 0–100
  unitCostEst:        number   // ₹ per unit
  toolingCost:        number   // ₹ one-time
  leadTimeDays:       number
  dfmFlags:           string[]
  complexity:         'Low' | 'Medium' | 'High'
}

export const DFM_PARTS: DFMPart[] = [
  {
    id: 1, partNo: 'MCH-001', description: 'Aluminium Bracket',
    category: 'Mechanical', material: 'Metal (Al 6061)',
    recommendedProcess: 'CNC Machining', alternateProcess: 'Casting',
    feasibilityScore: 92, unitCostEst: 285, toolingCost: 0, leadTimeDays: 7,
    dfmFlags: ['Tight tolerance ±0.05 mm on slot', 'Add chamfer on inside edge to ease assembly'],
    complexity: 'High',
  },
  {
    id: 2, partNo: 'MCH-002', description: 'Steel Housing Shell',
    category: 'Mechanical', material: 'Sheet Metal (CRCA)',
    recommendedProcess: 'Laser Cutting', alternateProcess: 'Water Jet Cutting',
    feasibilityScore: 88, unitCostEst: 320, toolingCost: 8000, leadTimeDays: 5,
    dfmFlags: ['Bend radius min 2 mm required — current spec 1.2 mm'],
    complexity: 'Medium',
  },
  {
    id: 3, partNo: 'MCH-003', description: 'Motor Mount Plate',
    category: 'Mechanical', material: 'Sheet Metal (MS)',
    recommendedProcess: 'Laser Cutting', alternateProcess: 'CNC Machining',
    feasibilityScore: 95, unitCostEst: 145, toolingCost: 5000, leadTimeDays: 4,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 4, partNo: 'MCH-004', description: 'Gearbox Cover',
    category: 'Mechanical', material: 'Plastics (ABS)',
    recommendedProcess: 'Injection Molding', alternateProcess: '3D Printing',
    feasibilityScore: 85, unitCostEst: 95, toolingCost: 45000, leadTimeDays: 21,
    dfmFlags: ['Undercut on inner lip — add draft angle ≥ 1.5°', 'Wall thickness varies 1.2–4.8 mm (uneven)'],
    complexity: 'High',
  },
  {
    id: 5, partNo: 'MCH-005', description: 'Plastic Enclosure Base',
    category: 'Mechanical', material: 'Plastics (PP)',
    recommendedProcess: 'Injection Molding', alternateProcess: 'Vacuum Casting',
    feasibilityScore: 78, unitCostEst: 120, toolingCost: 55000, leadTimeDays: 25,
    dfmFlags: ['Thin wall at rib intersection 0.8 mm (min 1.5 mm)', 'No draft angle on side walls'],
    complexity: 'High',
  },
  {
    id: 6, partNo: 'ELC-001', description: 'ESP32 Dev Board',
    category: 'Electrical', material: 'PCB (FR4)',
    recommendedProcess: 'PCB Fabrication', alternateProcess: undefined,
    feasibilityScore: 97, unitCostEst: 380, toolingCost: 0, leadTimeDays: 3,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 7, partNo: 'ELC-002', description: 'BLDC Motor Controller',
    category: 'Electrical', material: 'PCB (FR4 — 4-layer)',
    recommendedProcess: 'PCB Fabrication', alternateProcess: undefined,
    feasibilityScore: 91, unitCostEst: 520, toolingCost: 12000, leadTimeDays: 7,
    dfmFlags: ['BGA pads — verify solder mask clearance ≥ 0.1 mm'],
    complexity: 'Medium',
  },
  {
    id: 8, partNo: 'ELC-003', description: 'Power Distribution PCB',
    category: 'Electrical', material: 'PCB (FR4)',
    recommendedProcess: 'PCB Fabrication', alternateProcess: undefined,
    feasibilityScore: 89, unitCostEst: 280, toolingCost: 8000, leadTimeDays: 5,
    dfmFlags: ['Trace width 0.1 mm near connector — borderline DFM for 2-layer'],
    complexity: 'Medium',
  },
  {
    id: 9, partNo: 'ELC-004', description: 'Hall Sensor Array',
    category: 'Electrical', material: 'PCB (FR4)',
    recommendedProcess: 'PCB Fabrication', alternateProcess: undefined,
    feasibilityScore: 94, unitCostEst: 185, toolingCost: 5000, leadTimeDays: 4,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 10, partNo: 'ELC-005', description: 'TMC2209 Stepper Driver',
    category: 'Electrical', material: 'PCB (FR4)',
    recommendedProcess: 'PCB Fabrication', alternateProcess: undefined,
    feasibilityScore: 96, unitCostEst: 210, toolingCost: 0, leadTimeDays: 2,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 11, partNo: 'FST-001', description: 'M5 × 16 Hex Bolt Gr8.8',
    category: 'Fastener', material: 'Metal (Steel)',
    recommendedProcess: 'Extrusion', alternateProcess: 'CNC Machining',
    feasibilityScore: 99, unitCostEst: 8, toolingCost: 0, leadTimeDays: 1,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 12, partNo: 'FST-002', description: 'M3 Self-locking Nut',
    category: 'Fastener', material: 'Metal (Steel)',
    recommendedProcess: 'Extrusion', alternateProcess: undefined,
    feasibilityScore: 99, unitCostEst: 3, toolingCost: 0, leadTimeDays: 1,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 13, partNo: 'FST-003', description: 'M4 Socket Head Cap Screw',
    category: 'Fastener', material: 'Metal (Steel)',
    recommendedProcess: 'Extrusion', alternateProcess: undefined,
    feasibilityScore: 99, unitCostEst: 5, toolingCost: 0, leadTimeDays: 1,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 14, partNo: 'CBL-001', description: '24AWG Ribbon Cable',
    category: 'Cable', material: 'Cable Harness',
    recommendedProcess: 'Cable Assembly', alternateProcess: undefined,
    feasibilityScore: 93, unitCostEst: 45, toolingCost: 0, leadTimeDays: 3,
    dfmFlags: [],
    complexity: 'Low',
  },
  {
    id: 15, partNo: 'CBL-002', description: 'USB-C Harness Assembly',
    category: 'Cable', material: 'Cable Harness',
    recommendedProcess: 'Cable Assembly', alternateProcess: undefined,
    feasibilityScore: 90, unitCostEst: 85, toolingCost: 2000, leadTimeDays: 4,
    dfmFlags: ['Strain relief spec required on connector end'],
    complexity: 'Medium',
  },
]

export const DFM_STEPS = [
  { label: 'Loading design geometry from uploaded files' },
  { label: 'Mapping BOM parts to material & process families' },
  { label: 'Evaluating manufacturing routes per part' },
  { label: 'Estimating tooling & cycle costs' },
  { label: 'Running DFM rule-check (tolerances, drafts, radii)' },
  { label: 'Compiling process recommendations & flags' },
]

export const DFM_FLAG_COUNT    = DFM_PARTS.reduce((acc, p) => acc + p.dfmFlags.length, 0)
export const DFM_TOOLING_TOTAL = DFM_PARTS.reduce((acc, p) => acc + p.toolingCost, 0)
export const DFM_EST_TOTAL     = DFM_PARTS.reduce((acc, p) => acc + p.unitCostEst, 0)
