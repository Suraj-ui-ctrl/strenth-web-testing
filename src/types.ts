export type AppState =
  | 'upload'
  | 'uploading'
  | 'analyzing'
  | 'organized'
  | 'bom-parsing'
  | 'bom-complete'
  | 'bom-classifying'
  | 'cost-processing'
  | 'cost-complete'
  | 'sourcing-rfq'
  | 'rfq-tracking'
  | 'quotes-received'
  | 'payment-success'
  | 'dfm-analyzing'
  | 'dfm-complete'
  | 'mfg-planning'
  | 'mfg-complete'
  | 'mfg-rfq'
  | 'mfg-quotes'
  | 'mfg-vendor-list'
  | 'mfg-order-preview'
  | 'dem-assessing'
  | 'dem-cm-rfq'
  | 'dem-factory'
  | 'dem-scheduling'
  | 'dem-ai-scoring'
  | 'dem-complete'
  | 'neg-assessing'
  | 'neg-master'
  | 'neg-closure'
  | 'neg-cancelled'

export interface BomRow {
  id:            number
  partNo:        string
  description:   string
  qty:           number
  unit:          string
  category:      'Mechanical' | 'Electrical' | 'Fastener' | 'Cable'
  status:        'Approved' | 'Pending' | 'Review'
  sourceFile:    string
  hsnCode?:      string
  isDuplicate?:  boolean
  classification?: 'BOP' | 'CDP' | 'Ambiguous' | 'Flagged'
}

export interface MockFile {
  id: number
  name: string
  size: string
  fileType: string
  durationMs: number
  category: 'Mechanical' | 'Electrical'
}

export interface FileProgress extends MockFile {
  progress: number
  status: 'waiting' | 'uploading' | 'complete'
}

export interface ChatMessage {
  id:      number
  html:    string
  sender?: 'agent' | 'user'
  actions?: { label: string; variant: 'primary' | 'secondary'; key?: string }[]
  form?:   'quantity-upload' | 'payment-details' | 'payment-otp' | 'agent-select' | 'dfm-form' | 'cm-onboard'
}
