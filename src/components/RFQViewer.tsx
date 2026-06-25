import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { RFQ_ROWS, RFQRow } from '../data/rfqData'
import { BOP_RFQ_ROWS } from '../data/bopRfqData'

export type RFQMode = 'cdp' | 'bop' | 'both'

type RowType = 'bop' | 'cdp'
type MergedRow = RFQRow & { rowType: RowType }

interface Props {
  mode?:      RFQMode
  onClose?:   () => void
  onSendAll?: () => void
}

const USD = (n: number) => '$' + (Number.isInteger(n)
  ? Math.round(n).toLocaleString('en-US')
  : n.toFixed(1))

const TODAY       = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
const VALID_UNTIL = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })

/* ── Icons ── */
const SendIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)
const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const SaveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const EyeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)

/* ── RFQ Document Modal ── */
function RFQModal({
  row,
  onClose,
  onUpdate,
}: {
  row:      MergedRow
  onClose:  () => void
  onUpdate: (id: number, type: RowType, qty: number, targetPricePerUnit: number) => void
}) {
  const [qty,    setQty]    = useState(row.qty)
  const [price,  setPrice]  = useState(row.targetPricePerUnit)
  const [editing, setEditing] = useState(false)

  const handleSave = () => {
    onUpdate(row.id, row.rowType, qty, price)
    setEditing(false)
  }
  const handleCancel = () => {
    setQty(row.qty)
    setPrice(row.targetPricePerUnit)
    setEditing(false)
  }

  return createPortal(
    <div className="rfq-modal-backdrop" onClick={onClose}>
      <div className="rfq-modal" onClick={e => e.stopPropagation()}>

        {/* ── Modal top bar (outside indigo header) ── */}
        <div className="rfq-modal__topbar">
          <div className="rfq-modal__topbar-info">
            <span className="rfq-modal__topbar-rfqno">{row.rfqNo}</span>
            <span className="rfq-modal__topbar-sep">·</span>
            <span className="rfq-modal__topbar-part">{row.partNo}</span>
            <span className={`rfq-type-badge rfq-type-badge--${row.rowType}`} style={{ marginLeft: 6 }}>
              {row.rowType === 'bop' ? 'Standard' : 'Custom'}
            </span>
          </div>
          <button className="rfq-modal-close" onClick={onClose} title="Close">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
            </svg>
          </button>
        </div>

        {/* ── Document ── */}
        <div className="rfq-doc">

          {/* Indigo header */}
          <div className="rfq-doc__header">
            <div className="rfq-doc__brand">
              <span className="rfq-doc__brand-name">strenth.ai</span>
              <span className="rfq-doc__brand-tag">AI Hardware Sourcing</span>
            </div>
            <div className="rfq-doc__meta">
              <div className="rfq-doc__rfqno">{row.rfqNo}</div>
              <div className="rfq-doc__date">Date: {TODAY}</div>
              <div className="rfq-doc__date">Valid until: {VALID_UNTIL}</div>
            </div>
          </div>

          {/* To vendors */}
          <div className="rfq-doc__section">
            <div className="rfq-doc__section-label">To Vendors</div>
            <div className="rfq-doc__vendors">
              {row.vendors.map((v, i) => <span key={i} className="rfq-doc__vendor-chip">{v}</span>)}
            </div>
          </div>

          {/* Subject */}
          <div className="rfq-doc__subject">
            Request for Quotation: <strong>{row.description}</strong>
          </div>

          {/* Two-column body */}
          <div className="rfq-doc__two-col">
            {/* Part specs */}
            <div className="rfq-doc__section">
              <div className="rfq-doc__section-label">Part Specifications</div>
              <table className="rfq-doc__spec-table">
                <tbody>
                  <tr><td>Part No.</td><td><strong>{row.partNo}</strong></td></tr>
                  <tr><td>Description</td><td>{row.description}</td></tr>
                  <tr><td>Material / Spec</td><td>{row.tentativeMaterial}</td></tr>
                  <tr><td>Production Method</td><td>{row.productionMethod}</td></tr>
                  <tr>
                    <td>Quantity</td>
                    <td>
                      {editing
                        ? <input className="rfq-doc__qty-input" type="number" min={1}
                            value={qty} onChange={e => setQty(Math.max(1, +e.target.value))} autoFocus/>
                        : <strong>{row.qty} {row.unit}</strong>
                      }
                    </td>
                  </tr>
                  <tr><td>Lead Time</td><td>{row.leadTimeWeeks}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Pricing */}
            <div className="rfq-doc__section">
              <div className="rfq-doc__section-label">Pricing Terms</div>
              <table className="rfq-doc__spec-table">
                <tbody>
                  <tr>
                    <td>Target Price / Unit</td>
                    <td>
                      {editing
                        ? <input className="rfq-doc__qty-input" type="number" min={0.01} step={0.01}
                            value={price} onChange={e => setPrice(Math.max(0.01, +e.target.value))}/>
                        : <strong className="rfq-doc__target">{USD(row.targetPricePerUnit)}</strong>
                      }
                    </td>
                  </tr>
                  <tr><td>Total Target</td><td><strong>{USD((editing ? qty : row.qty) * (editing ? price : row.targetPricePerUnit))}</strong></td></tr>
                  <tr><td>Currency</td><td>USD</td></tr>
                  <tr><td>Type</td><td>{row.rowType === 'bop' ? 'Standard Purchase' : 'Custom Fabrication'}</td></tr>
                </tbody>
              </table>

              <div style={{ marginTop: 12 }}>
                {editing ? (
                  <div className="rfq-doc__edit-actions">
                    <button className="rfq-doc__qty-save" onClick={handleSave}><SaveIcon/> Save Changes</button>
                    <button className="rfq-doc__qty-cancel" onClick={handleCancel}>Cancel</button>
                  </div>
                ) : (
                  <button className="rfq-doc__qty-edit-btn" onClick={() => setEditing(true)}>
                    <EditIcon/> Edit Qty &amp; Price
                  </button>
                )}
              </div>

              <div className="rfq-doc__section-label" style={{ marginTop: 14 }}>Terms &amp; Conditions</div>
              <ul className="rfq-doc__tc">
                <li>Quote FOB / Ex-Works pricing with lead time.</li>
                <li>Samples required before bulk order confirmation.</li>
                <li>Quote validity: 14 days from this RFQ date.</li>
                <li>Payment: 30% advance, 70% on delivery.</li>
                <li>Strenth.ai reserves the right to split or cancel.</li>
              </ul>
            </div>
          </div>

          {/* Signature */}
          <div className="rfq-doc__footer">
            <div className="rfq-doc__sig-name">Strenth.ai Procurement</div>
            <div className="rfq-doc__sig-email">procurement@strenth.ai</div>
          </div>
        </div>

        {/* Actions */}
        <div className="rfq-modal__actions">
          <button className="cb-dl-btn"><DownloadIcon/> Download PDF</button>
          <button className="rfq-send-btn"><SendIcon/> Send RFQ</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── Main component ── */
export default function RFQViewer({ mode = 'cdp', onClose, onSendAll }: Props) {
  const [isEditing,   setIsEditing]   = useState(false)
  const [cdpRows,     setCdpRows]     = useState<RFQRow[]>(() => RFQ_ROWS.map(r => ({ ...r })))
  const [bopRows,     setBopRows]     = useState<RFQRow[]>(() => BOP_RFQ_ROWS.map(r => ({ ...r })))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewRow,  setPreviewRow]  = useState<MergedRow | null>(null)

  const allRows = useMemo<MergedRow[]>(() => {
    const bop = bopRows.map(r => ({ ...r, rowType: 'bop' as RowType }))
    const cdp = cdpRows.map(r => ({ ...r, rowType: 'cdp' as RowType }))
    if (mode === 'bop') return bop
    if (mode === 'cdp') return cdp
    return [...bop, ...cdp]
  }, [bopRows, cdpRows, mode])

  const rowKey = (r: MergedRow) => `${r.rowType}-${r.id}`

  /* Update qty and/or target price, recompute totalTarget */
  const updateRow = (id: number, type: RowType, qty: number, targetPricePerUnit: number) => {
    const update = (prev: RFQRow[]) => prev.map(r =>
      r.id !== id ? r : { ...r, qty, targetPricePerUnit, totalTarget: qty * targetPricePerUnit }
    )
    if (type === 'bop') setBopRows(update)
    else                setCdpRows(update)
  }

  /* Qty-only helper for table inline edit */
  const updateQtyOnly = (id: number, type: RowType, qty: number) => {
    const update = (prev: RFQRow[]) => prev.map(r =>
      r.id !== id ? r : { ...r, qty, totalTarget: qty * r.targetPricePerUnit }
    )
    if (type === 'bop') setBopRows(update)
    else                setCdpRows(update)
  }

  /* Price-only helper for table inline edit */
  const updatePriceOnly = (id: number, type: RowType, targetPricePerUnit: number) => {
    const update = (prev: RFQRow[]) => prev.map(r =>
      r.id !== id ? r : { ...r, targetPricePerUnit, totalTarget: r.qty * targetPricePerUnit }
    )
    if (type === 'bop') setBopRows(update)
    else                setCdpRows(update)
  }

  const toggleSelect = (key: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleSelectAll = () =>
    setSelectedIds(selectedIds.size === allRows.length ? new Set() : new Set(allRows.map(rowKey)))

  const allSelected  = allRows.length > 0 && selectedIds.size === allRows.length
  const someSelected = selectedIds.size > 0

  const bopTotal   = bopRows.reduce((s, r) => s + r.totalTarget, 0)
  const cdpTotal   = cdpRows.reduce((s, r) => s + r.totalTarget, 0)
  const grandTotal = allRows.reduce((s, r) => s + r.totalTarget, 0)

  const titleLabel = mode === 'both' ? 'RFQ Preview — Standard + Custom Parts'
    : mode === 'bop' ? 'RFQ Preview — Standard Parts'
    : 'RFQ Preview — Custom Parts'

  const syncedPreview = previewRow
    ? allRows.find(r => r.id === previewRow.id && r.rowType === previewRow.rowType) ?? previewRow
    : null

  /* 12 columns: ☐ # RFQ PartNo Desc Type Qty Method Target$ Total$ Lead Status */
  const TOTAL_COLS = 12

  return (
    <div className="rfq-viewer">

      {/* Header */}
      <div className="rfq-header">
        <div className="rfq-header__left">
          {onClose && (
            <button className="bom-close-btn" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5"/>
              </svg>
              <span>Close</span>
            </button>
          )}
          <div className="rfq-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <div className="rfq-title">{titleLabel}</div>
            <div className="rfq-subtitle">
              {isEditing
                ? <span className="rfq-editing-badge">Edit mode — Qty &amp; Target price editable</span>
                : <span className="rfq-discount-badge">Click RFQ No. to preview · hover row to select</span>
              }
            </div>
          </div>
        </div>

        <div className="rfq-header__right">
          {someSelected && (
            <button className="rfq-dl-sel-btn">
              <DownloadIcon/> Download ({selectedIds.size})
            </button>
          )}
          {isEditing ? (
            <button className="rfq-save-btn" onClick={() => setIsEditing(false)}>
              <SaveIcon/> Save Changes
            </button>
          ) : (
            <button className="rfq-edit-btn" onClick={() => setIsEditing(true)}>
              <EditIcon/> Edit
            </button>
          )}
          <button className="cb-dl-btn"><DownloadIcon/> Download All</button>
          {!isEditing && (
            <button className="rfq-send-btn" onClick={onSendAll}>
              <SendIcon/> {someSelected ? `Send RFQs (${selectedIds.size})` : 'Send All RFQs'}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rfq-wrap">
        <table className="rfq-table" style={{ minWidth: 1020, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 36 }}/>   {/* ☐ */}
            <col style={{ width: 32 }}/>   {/* # */}
            <col style={{ width: 130 }}/>  {/* RFQ No. */}
            <col style={{ width: 86 }}/>   {/* Part No. */}
            <col/>                          {/* Description */}
            <col style={{ width: 78 }}/>   {/* Type */}
            <col style={{ width: 70 }}/>   {/* Qty */}
            <col style={{ width: 190 }}/> {/* Method */}
            <col style={{ width: 90 }}/>   {/* Target $/unit */}
            <col style={{ width: 84 }}/>   {/* Total $ */}
            <col style={{ width: 64 }}/>   {/* Lead */}
            <col style={{ width: 58 }}/>   {/* Status */}
          </colgroup>
          <thead>
            <tr>
              <th className="rfq-th rfq-th--c">
                <input type="checkbox" className="rfq-checkbox rfq-checkbox--header" checked={allSelected} onChange={toggleSelectAll}/>
              </th>
              <th className="rfq-th rfq-th--c">#</th>
              <th className="rfq-th">RFQ No.</th>
              <th className="rfq-th">Part No.</th>
              <th className="rfq-th">Description</th>
              <th className="rfq-th rfq-th--c">Type</th>
              <th className="rfq-th rfq-th--r">Qty</th>
              <th className="rfq-th">Method</th>
              <th className="rfq-th rfq-th--r">Target $/unit</th>
              <th className="rfq-th rfq-th--r">Total $</th>
              <th className="rfq-th rfq-th--c">Lead</th>
              <th className="rfq-th rfq-th--c">Status</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, idx) => {
              const key   = rowKey(row)
              const isSel = selectedIds.has(key)
              return (
                <tr
                  key={key}
                  className={[
                    'rfq-row',
                    isEditing   ? 'rfq-row--editing'  : '',
                    isSel       ? 'rfq-row--selected'  : '',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Checkbox — hidden by default, revealed on row hover or when selected */}
                  <td className="rfq-td rfq-td--c rfq-td-check">
                    <input type="checkbox" className="rfq-checkbox" checked={isSel} onChange={() => toggleSelect(key)}/>
                  </td>

                  <td className="rfq-td rfq-td--c rfq-td--muted">{idx + 1}</td>

                  {/* RFQ No. — opens modal overlay */}
                  <td className="rfq-td">
                    <button className="rfq-rfqno-btn" onClick={() => setPreviewRow(row)} title="Click to preview RFQ">
                      <EyeIcon/>{row.rfqNo}
                    </button>
                  </td>

                  <td className="rfq-td rfq-td--mono">{row.partNo}</td>
                  <td className="rfq-td rfq-td--strong" title={row.description}>{row.description}</td>

                  <td className="rfq-td rfq-td--c">
                    <span className={`rfq-type-badge rfq-type-badge--${row.rowType}`}>
                      {row.rowType === 'bop' ? 'Standard' : 'Custom'}
                    </span>
                  </td>

                  {/* Qty — editable in edit mode */}
                  <td className="rfq-td rfq-td--r">
                    {isEditing
                      ? <input className="rfq-edit-input" type="number" min={1} value={row.qty}
                          onChange={e => updateQtyOnly(row.id, row.rowType, Math.max(1, +e.target.value))}/>
                      : <>{row.qty} <span className="rfq-unit">{row.unit}</span></>
                    }
                  </td>

                  {/* Method — full text, wraps if needed */}
                  <td className="rfq-td rfq-td--method">{row.productionMethod}</td>

                  {/* Target price — editable in edit mode */}
                  <td className="rfq-td rfq-td--r rfq-td--num">
                    {isEditing
                      ? <input className="rfq-edit-input rfq-edit-input--price" type="number" min={0.01} step={0.01}
                          value={row.targetPricePerUnit}
                          onChange={e => updatePriceOnly(row.id, row.rowType, Math.max(0.01, +e.target.value))}/>
                      : USD(row.targetPricePerUnit)
                    }
                  </td>

                  <td className="rfq-td rfq-td--r rfq-td--num rfq-td--total">{USD(row.totalTarget)}</td>
                  <td className="rfq-td rfq-td--c rfq-td--muted" title={row.leadTimeWeeks}>{row.leadTimeWeeks}</td>
                  <td className="rfq-td rfq-td--c">
                    <span className={`rfq-status-badge${isEditing ? ' rfq-status-badge--editing' : ''}`}>
                      {isEditing ? '✏' : 'Draft'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="rfq-tfoot-row">
              <td colSpan={TOTAL_COLS - 3} className="rfq-td rfq-tfoot-label">
                {mode === 'both' ? (
                  <>Standard <strong>{USD(bopTotal)}</strong>
                  <span className="rfq-tfoot-sep"/>
                  Custom <strong>{USD(cdpTotal)}</strong></>
                ) : 'Grand Total Target'}
              </td>
              <td className="rfq-td rfq-td--r rfq-tfoot-total">{USD(grandTotal)}</td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="rfq-footer-bar">
        <div className="rfq-footer-note">
          {mode === 'both'
            ? 'Standard parts from distributors · Custom parts from verified manufacturers.'
            : mode === 'bop'
            ? 'Standard catalog parts sourced from verified distributors.'
            : 'Parts matched by type & production method.'}
        </div>
        <div className="rfq-footer-sum">
          {isEditing && (
            <button className="rfq-save-btn rfq-save-btn--footer" onClick={() => setIsEditing(false)}>
              <SaveIcon/> Save Changes
            </button>
          )}
        </div>
      </div>

      {/* Modal overlay */}
      {syncedPreview && (
        <RFQModal
          row={syncedPreview}
          onClose={() => setPreviewRow(null)}
          onUpdate={updateRow}
        />
      )}
    </div>
  )
}
