import { MockFile } from '../types'

export const MOCK_FILES: MockFile[] = [
  { id: 0, name: 'BOM_Assembly_v3.xlsx',       size: '2.4 MB',  fileType: 'XLSX', durationMs: 1600, category: 'Electrical' },
  { id: 1, name: 'Schematic_MainBoard_R4.pdf', size: '4.8 MB',  fileType: 'PDF',  durationMs: 2600, category: 'Electrical' },
  { id: 2, name: 'Pick_Place_Top.csv',          size: '0.9 MB',  fileType: 'CSV',  durationMs: 1100, category: 'Electrical' },
  { id: 3, name: 'Enclosure_Top_v2.step',       size: '12.4 MB', fileType: 'STEP', durationMs: 3400, category: 'Mechanical' },
  { id: 4, name: 'Motor_Mount_A3.dxf',          size: '3.2 MB',  fileType: 'DXF',  durationMs: 2100, category: 'Mechanical' },
  { id: 5, name: 'Chassis_v4.dwg',              size: '15.1 MB', fileType: 'DWG',  durationMs: 3800, category: 'Mechanical' },
  { id: 6, name: 'Camera_PCB_v1.pdf',           size: '8.7 MB',  fileType: 'PDF',  durationMs: 2900, category: 'Electrical' },
  { id: 7, name: 'Lens_Housing.step',           size: '9.3 MB',  fileType: 'STEP', durationMs: 3100, category: 'Mechanical' },
  { id: 8, name: 'Circuit_Layout_R3.pdf',       size: '6.5 MB',  fileType: 'PDF',  durationMs: 2400, category: 'Electrical' },
  { id: 9, name: 'Enclosure_Base.dwg',          size: '7.8 MB',  fileType: 'DWG',  durationMs: 2700, category: 'Mechanical' },
]

export const MECHANICAL_FILES = [
  'Enclosure_Top_v2.step',
  'Motor_Mount_A3.dxf',
  'Chassis_v4.dwg',
  'Lens_Housing.step',
  'Enclosure_Base.dwg',
]

export const ELECTRICAL_FILES = [
  'BOM_Assembly_v3.xlsx',
  'Schematic_MainBoard_R4.pdf',
  'Pick_Place_Top.csv',
  'Circuit_Layout_R3.pdf',
  'Camera_PCB_v1.pdf',
]
