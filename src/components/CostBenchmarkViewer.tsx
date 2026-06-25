import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  BOP_COST_ROWS, USD_INR,
  BopCostRow, CdpCostRow,
} from '../data/costData'

/* ─── Vendor option ─── */
interface VendorOpt {
  key:        string
  name:       string
  priceUsd:   number
  leadTime:   string
  isCheapest: boolean
}

const ORIGIN_MAP: Record<string, string> = {
  digikey:   'USA',
  mouser:    'USA',
  element14: 'UK',
  lcsc:      'China',
  arrow:     'USA',
}

function getOrigin(key: string): string {
  if (key.startsWith('in_')) return 'India'
  return ORIGIN_MAP[key] ?? 'International'
}

function buildVendorOpts(row: BopCostRow): VendorOpt[] {
  const list: VendorOpt[] = []

  const addIntl = (key: string, name: string, s?: { price: number; leadTime: string; available: boolean }) => {
    if (s?.available) list.push({ key, name, priceUsd: s.price, leadTime: s.leadTime, isCheapest: false })
  }
  addIntl('digikey',   'DigiKey',   row.digikey)
  addIntl('mouser',    'Mouser',    row.mouser)
  addIntl('element14', 'element14', row.element14)
  addIntl('lcsc',      'LCSC',      row.lcsc)
  addIntl('arrow',     'Arrow',     row.arrow)

  row.indianPrices.forEach(ip =>
    list.push({ key: `in_${ip.platform}`, name: ip.platform, priceUsd: ip.price / USD_INR, leadTime: '1–3 days', isCheapest: false })
  )

  list.sort((a, b) => b.priceUsd - a.priceUsd)
  if (list.length) list[list.length - 1].isCheapest = true
  return list
}

function defaultKey(row: BopCostRow): string | undefined {
  const opts = buildVendorOpts(row)
  return opts.length ? opts[opts.length - 1].key : undefined
}

function computeBopRow(row: BopCostRow, selKey: string | undefined) {
  const opts = buildVendorOpts(row)
  if (!opts.length) return { name: '—', unit: 0, lead: '—', duty: 0, total: 0, origin: '—' }
  const opt    = (selKey ? opts.find(o => o.key === selKey) : undefined) ?? opts[opts.length - 1]
  const origin = getOrigin(opt.key)
  const duty   = origin === 'India' ? 0 : row.bcd
  const unit   = opt.priceUsd * (1 + duty / 100)
  return { name: opt.name, unit, lead: opt.leadTime, duty, total: unit * row.qty, origin }
}

const $f  = (n: number) => '$' + n.toFixed(2)
const inr = (n: number) => n > 0 ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'

/* ─── Icons ─── */
const CartIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.54l1.65-7.46H6"/>
  </svg>
)
const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)
const ChevronIcon = () => (
  <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,6 8,10 12,6"/>
  </svg>
)

interface Props {
  isProcessing:  boolean
  onClose?:      () => void
  onPlaceOrder?: (total: number) => void
  orderPlaced?:  boolean
  bopRows?:      BopCostRow[]
  cdpRows?:      CdpCostRow[]
  fileName?:     string
}

const POPUP_W = 340

export default function CostBenchmarkViewer({ isProcessing, onClose, onPlaceOrder, orderPlaced, bopRows, cdpRows, fileName }: Props) {
  const activeBopRows = bopRows ?? BOP_COST_ROWS
  /* CDP rows are only shown when the caller explicitly provides them.
     Never fall back to mock mechanical parts for a real uploaded BOM. */
  const activeCdpRows = cdpRows ?? []

  const [selectedVendors, setSelectedVendors] = useState<Record<number, string>>(() => {
    const rows = bopRows ?? BOP_COST_ROWS
    const init: Record<number, string> = {}
    rows.forEach(r => { const k = defaultKey(r); if (k) init[r.id] = k })
    return init
  })

  useEffect(() => {
    const init: Record<number, string> = {}
    activeBopRows.forEach(r => { const k = defaultKey(r); if (k) init[r.id] = k })
    setSelectedVendors(init)
  }, [bopRows])

  const [openRowId,   setOpenRowId]   = useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openRowId === null) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpenRowId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openRowId, bopRows])

  const openDropdown = useCallback((rowId: number, cellEl: HTMLElement) => {
    if (openRowId === rowId) { setOpenRowId(null); return }

    const rect  = cellEl.getBoundingClientRect()
    const row   = activeBopRows.find(r => r.id === rowId)!
    const count = buildVendorOpts(row).length
    const estH  = count * 38 + 56

    const left = Math.min(rect.left, window.innerWidth - POPUP_W - 8)
    const top  = (window.innerHeight - rect.bottom > estH)
      ? rect.bottom + 3
      : Math.max(8, rect.top - estH - 3)

    setDropdownPos({ top, left: Math.max(8, left) })
    setOpenRowId(rowId)
  }, [openRowId])

  const selectVendor = (rowId: number, key: string) => {
    setSelectedVendors(prev => ({ ...prev, [rowId]: key }))
    setOpenRowId(null)
  }

  /* Totals */
  const bopTotal   = activeBopRows.reduce((s, r) => s + computeBopRow(r, selectedVendors[r.id]).total, 0)
  const cdpTotal   = activeCdpRows.reduce((s, r) => s + r.totalCost / USD_INR, 0)
  const grandTotal = bopTotal + cdpTotal

  const openRow = openRowId !== null ? activeBopRows.find(r => r.id === openRowId) : null

  const totalParts = activeBopRows.length + activeCdpRows.length
  let rowIndex = 0

  return (
    <div className="cb-viewer">

      {/* ── Header ── */}
      <div className="cb-header">
        <div className="cb-header__left">
          {onClose && (
            <button className="bom-close-btn" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5"/>
              </svg>
              <span>Close</span>
            </button>
          )}
          <div className="cb-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          </div>
          <div>
            <div className="cb-title">Cost Benchmark Report</div>
            <div className="cb-subtitle">
              {fileName ?? 'BOM_Assembly_v3.xlsx'} · Strenth.ai
              {isProcessing ? ' · Fetching prices…' : ` · ${totalParts} parts`}
            </div>
          </div>
        </div>

        <div className="cb-header__right">
          {isProcessing ? (
            <div className="bom-badge bom-badge--parsing"><span className="bom-badge__dot"/>Fetching…</div>
          ) : (
            <>
              {/* ── Grand total summary ── */}
              <div className="cb-total-summary">
                <div className="cb-total-summary__item">
                  <span className="cb-total-summary__lbl">Standard</span>
                  <span className="cb-total-summary__val">{inr(bopTotal * USD_INR)}</span>
                </div>
                <div className="cb-total-summary__sep"/>
                <div className="cb-total-summary__item">
                  <span className="cb-total-summary__lbl">Custom</span>
                  <span className="cb-total-summary__val">{inr(cdpTotal * USD_INR)}</span>
                </div>
                <div className="cb-total-summary__sep"/>
                <div className="cb-total-summary__item cb-total-summary__item--grand">
                  <span className="cb-total-summary__lbl">Grand Total</span>
                  <span className="cb-total-summary__val cb-total-summary__val--grand">{inr(grandTotal * USD_INR)}</span>
                </div>
              </div>
              <button className="cb-dl-btn"><DownloadIcon /> Download Excel</button>
              {!orderPlaced
                ? <button className="cb-order-btn" onClick={() => onPlaceOrder?.(grandTotal)}><CartIcon /> Place Order</button>
                : <div className="cb-order-done">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/>
                    </svg>
                    Order Placed
                  </div>
              }
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {isProcessing && (
        <div className="cb-loading">
          <div className="cb-loading__spin"/>
          <div className="cb-loading__msg">Fetching live prices from distributors…</div>
          <div className="cb-loading__sub">DigiKey · Mouser · element14 · LCSC · Arrow · Indian platforms</div>
        </div>
      )}

      {/* ══ MERGED TABLE ══ */}
      {!isProcessing && (
        <div className="cb-wrap">
          <table className="cb-table" style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 32 }}/>   {/* # */}
              <col style={{ width: 88 }}/>   {/* Part No. */}
              <col/>                          {/* Description */}
              <col style={{ width: 70 }}/>   {/* Type */}
              <col style={{ width: 42 }}/>   {/* Qty */}
              <col style={{ width: 72 }}/>   {/* Origin */}
              <col style={{ width: 110 }}/> {/* Landed */}
              <col style={{ width: 50 }}/>   {/* Duty */}
              <col style={{ width: 140 }}/> {/* Vendor */}
              <col style={{ width: 84 }}/>   {/* Total */}
            </colgroup>
            <thead>
              <tr>
                <th className="cb-th cb-th--c">#</th>
                <th className="cb-th">Part No.</th>
                <th className="cb-th">Description</th>
                <th className="cb-th cb-th--c">Type</th>
                <th className="cb-th cb-th--r">Qty</th>
                <th className="cb-th">Origin</th>
                <th className="cb-th cb-th--r">Landed (₹)</th>
                <th className="cb-th cb-th--c">Duty</th>
                <th className="cb-th">Vendor</th>
                <th className="cb-th cb-th--r">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {/* ── Standard Parts (BOP) ── */}
              {activeBopRows.map(row => {
                rowIndex++
                const d      = computeBopRow(row, selectedVendors[row.id])
                const isOpen = openRowId === row.id
                return (
                  <tr key={`bop-${row.id}`} className={`cb-row${row.unavailable ? ' cb-row--na' : ''}`}>
                    <td className="cb-td cb-td--c cb-td--muted">{rowIndex}</td>
                    <td className="cb-td cb-td--partno">
                      {row.partNo}
                      {row.hsnCode && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
                          HSN {row.hsnCode}
                        </div>
                      )}
                      {row.unavailable && <span className="cb-na-tag">⚠ N/A</span>}
                    </td>
                    <td className="cb-td cb-td--strong">{row.description}</td>
                    <td className="cb-td cb-td--c">
                      <span className="cb-type-badge cb-type-badge--bop">Standard</span>
                    </td>
                    <td className="cb-td cb-td--r">{row.qty}</td>
                    <td className="cb-td">
                      <span className={`cb-origin-badge cb-origin-badge--${d.origin === 'India' ? 'india' : 'intl'}`}>
                        {d.origin}
                      </span>
                    </td>
                    <td className="cb-td cb-td--r">
                      <div className="cb-landed-cell">
                        <span className="cb-landed-price">{inr(d.unit * USD_INR)}</span>
                        <span className="cb-lead-chip">{d.lead}</span>
                      </div>
                      {d.unit > 0 && (
                        <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>
                          {$f(d.unit)}
                        </div>
                      )}
                    </td>
                    <td className="cb-td cb-td--c cb-td--muted">{d.duty > 0 ? `${d.duty}%` : '—'}</td>
                    <td className="cb-td">
                      <div
                        className={`cb-vendor-cell${isOpen ? ' cb-vendor-cell--open' : ''}`}
                        onClick={e => openDropdown(row.id, e.currentTarget)}
                      >
                        <span className="cb-vendor-name">{d.name}</span>
                        <ChevronIcon/>
                      </div>
                    </td>
                    <td className="cb-td cb-td--r cb-td--total">
                      {inr(d.total * USD_INR)}
                      {d.total > 0 && <div style={{ fontSize: 10, color: '#94a3b8' }}>{$f(d.total)}</div>}
                    </td>
                  </tr>
                )
              })}

              {/* ── Custom Parts (CDP) ── */}
              {activeCdpRows.map(row => {
                rowIndex++
                const unitUsd  = row.historicalCostPerUnit / USD_INR
                const totalUsd = row.totalCost / USD_INR
                return (
                  <tr key={`cdp-${row.id}`} className="cb-row">
                    <td className="cb-td cb-td--c cb-td--muted">{rowIndex}</td>
                    <td className="cb-td cb-td--partno">{row.partNo}</td>
                    <td className="cb-td cb-td--strong">{row.description}</td>
                    <td className="cb-td cb-td--c">
                      <span className="cb-type-badge cb-type-badge--cdp">Custom</span>
                    </td>
                    <td className="cb-td cb-td--r">{row.qty}</td>
                    <td className="cb-td">
                      <span className="cb-origin-badge cb-origin-badge--india">India</span>
                    </td>
                    <td className="cb-td cb-td--r">
                      <div className="cb-landed-cell">
                        <span className="cb-landed-price">{inr(row.historicalCostPerUnit)}</span>
                        <span className="cb-lead-chip">{row.leadTime ?? '3–4 wks'}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>
                        {$f(unitUsd)}
                      </div>
                    </td>
                    <td className="cb-td cb-td--c cb-td--muted">—</td>
                    <td className="cb-td cb-td--small">{row.vendor ?? '—'}</td>
                    <td className="cb-td cb-td--r cb-td--total">
                      {inr(row.totalCost)}
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{$f(totalUsd)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="cb-tfoot-row">
                <td className="cb-td" colSpan={9}/>
                <td className="cb-td cb-td--r cb-tfoot-total">
                  {inr(grandTotal * USD_INR)}
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{$f(grandTotal)}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ══ VENDOR DROPDOWN ══ */}
      {openRow && createPortal(
        <div
          ref={popupRef}
          className="cb-vendor-popup"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: POPUP_W }}
        >
          <div className="cb-popup-hd">
            <span className="cb-popup-hd__title">Select Vendor</span>
            <span className="cb-popup-hd__sub">{openRow.description}</span>
          </div>

          <div className="cb-pop-labels">
            <span/>
            <span>Vendor</span>
            <span style={{ textAlign: 'right' }}>Unit ₹ ($)</span>
            <span>Lead time</span>
            <span style={{ textAlign: 'right' }}>Total ₹</span>
          </div>

          {buildVendorOpts(openRow).map(opt => {
            const isSel   = (selectedVendors[openRow.id] ?? defaultKey(openRow)) === opt.key
            const origin  = getOrigin(opt.key)
            const duty    = origin === 'India' ? 0 : openRow.bcd
            const landed  = opt.priceUsd * (1 + duty / 100)
            const total   = landed * openRow.qty
            return (
              <div
                key={opt.key}
                className={[
                  'cb-pop-row',
                  isSel          ? 'cb-pop-row--sel'   : '',
                  opt.isCheapest ? 'cb-pop-row--cheap' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => selectVendor(openRow.id, opt.key)}
              >
                <span className="cb-pop-icon">
                  {isSel
                    ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 6.5,11.5 13,5"/></svg>
                    : opt.isCheapest
                    ? <span className="cb-pop-best">BEST</span>
                    : null}
                </span>
                <span className="cb-pop-name">{opt.name}</span>
                <span className="cb-pop-price">
                  {inr(opt.priceUsd * USD_INR)}
                  <span style={{ display: 'block', fontSize: 9, color: '#94a3b8' }}>
                    {$f(opt.priceUsd)}
                  </span>
                </span>
                <span className="cb-pop-lead">{opt.leadTime}</span>
                <span className="cb-pop-total">₹{Math.round(total * USD_INR).toLocaleString('en-IN')}</span>
              </div>
            )
          })}

          {openRow.bcd > 0 && (
            <div className="cb-popup-hint">BCD {openRow.bcd}% applied on international imports · landed = unit × (1+BCD%)</div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
