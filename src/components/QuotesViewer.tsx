import { useState } from 'react'
import { QUOTE_ROWS, QUOTE_GRAND_BOM, QuoteRow } from '../data/quotesData'
import { BOP_QUOTE_ROWS, BOP_QUOTE_GRAND_BOM } from '../data/bopQuotesData'
import { RFQMode } from './RFQViewer'

interface Props {
  mode:         RFQMode
  onClose:      () => void
  onPlaceOrder: (total: number) => void
}

const USD = (n: number) => '$' + (n % 1 === 0
  ? Math.round(n).toLocaleString('en-US')
  : n.toFixed(1))

type Tier      = 'l1' | 'l2' | 'l3'
type MergedRow = QuoteRow & { partType: 'standard' | 'custom' }
type OptMode   = 'cost' | 'lead' | null

const TIER_COLOR: Record<Tier, { bg: string; color: string; border: string }> = {
  l1: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  l2: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  l3: { bg: '#fef9c3', color: '#a16207', border: '#fde68a' },
}
const TYPE_STYLE = {
  standard: { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', label: 'Standard' },
  custom:   { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe', label: 'Custom'   },
}

/* ── Parse lead time string to days (upper bound) ── */
function parseLeadDays(s: string): number {
  const m = s.match(/(\d+)(?:[–\-](\d+))?\s*(wks?|days?)/)
  if (!m) return 0
  const hi = m[2] ? +m[2] : +m[1]
  return m[3].startsWith('w') ? hi * 7 : hi
}

function getTierLead(row: QuoteRow, t: Tier): string {
  return t === 'l1' ? row.l1Lead : t === 'l2' ? row.l2Lead : row.l3Lead
}

/* ── Lead time color on absolute 1–12 week scale ── */
function leadColor(days: number): { bg: string; color: string; border: string; dot: string } {
  const MAX_DAYS = 84  // 12 weeks
  const pct = Math.min(days / MAX_DAYS, 1)
  if (pct >= 0.75) return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' } // red   9–12 wks
  if (pct >= 0.5)  return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' } // orange 6–9 wks
  if (pct >= 0.25) return { bg: '#fefce8', color: '#a16207', border: '#fef08a', dot: '#eab308' } // yellow 3–6 wks
  return              { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e' }    // green  < 3 wks
}

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n + 2)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Quote table ── */
function QuoteTable({
  rows, selected, setSelected,
}: {
  rows:        MergedRow[]
  selected:    Record<number, Tier>
  setSelected: React.Dispatch<React.SetStateAction<Record<number, Tier>>>
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  const pick = (row: QuoteRow, t: Tier) =>
    t === 'l1' ? row.l1PerUnit : t === 'l2' ? row.l2PerUnit : row.l3PerUnit

  /* No relative max needed — color uses absolute 1–12 week scale */

  return (
    <table className="qv-table" style={{ minWidth: 1160, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 30 }}/><col style={{ width: 78 }}/><col style={{ width: 160 }}/>
        <col style={{ width: 48 }}/><col style={{ width: 80 }}/><col style={{ width: 80 }}/>
        <col style={{ width: 118 }}/><col style={{ width: 118 }}/><col style={{ width: 118 }}/>
        <col style={{ width: 108 }}/><col style={{ width: 72 }}/><col style={{ width: 90 }}/>
      </colgroup>
      <thead>
        <tr>
          <th className="qv-th qv-th--c">#</th>
          <th className="qv-th">Part No.</th>
          <th className="qv-th">Description</th>
          <th className="qv-th qv-th--r">Qty</th>
          <th className="qv-th qv-th--r">BOM $/unit</th>
          <th className="qv-th qv-th--r">Benchmark $</th>
          <th className="qv-th qv-th--r qv-th--l1">L1</th>
          <th className="qv-th qv-th--r">L2</th>
          <th className="qv-th qv-th--r">L3</th>
          <th className="qv-th qv-th--r qv-th--shortlisted">Total</th>
          <th className="qv-th qv-th--c">Type</th>
          <th className="qv-th qv-th--c">Lead Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const tier   = selected[row.id] ?? 'l1'
          const isHov  = hovered === row.id
          const selLead   = getTierLead(row, tier)
          const selDays   = parseLeadDays(selLead)
          const lc        = leadColor(selDays)
          const tc        = TIER_COLOR[tier]
          const ts        = TYPE_STYLE[row.partType]
          const total     = pick(row, tier) * row.qty

          return (
            <tr
              key={row.id}
              className="qv-row"
              onMouseEnter={() => setHovered(row.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <td className="qv-td qv-td--c qv-td--muted">{idx + 1}</td>
              <td className="qv-td qv-td--mono">{row.partNo}</td>
              <td className="qv-td qv-td--strong" title={row.description}>{row.description}</td>
              <td className="qv-td qv-td--r qv-td--muted">{row.qty} <span className="qv-unit">{row.unit}</span></td>
              <td className="qv-td qv-td--r qv-td--num qv-td--bom">{USD(row.bomCostPerUnit)}</td>
              <td className="qv-td qv-td--r qv-td--num qv-td--bench">{USD(row.benchmarkPerUnit)}</td>

              {/* L1 / L2 / L3 selectable cells — each shows its own lead time chip */}
              {(['l1', 'l2', 'l3'] as Tier[]).map(t => {
                const isSel  = tier === t
                const tLead  = getTierLead(row, t)
                return (
                  <td
                    key={t}
                    className={`qv-td qv-td--r qv-td--tier${isSel ? ' qv-td--tier-sel' : ''}${t === 'l1' && !isSel ? ' qv-td--l1-dim' : ''}`}
                    onClick={() => setSelected(prev => ({ ...prev, [row.id]: t }))}
                    title={`${t.toUpperCase()}: ${t === 'l1' ? row.l1Vendor : t === 'l2' ? row.l2Vendor : row.l3Vendor} · ${tLead}`}
                  >
                    <div className="qv-tier-wrap">
                      {(isHov || isSel) && <span className={`qv-radio${isSel ? ' qv-radio--on' : ''}`}/>}
                      <span className={`qv-tier-price${isSel ? ' qv-tier-price--sel' : ''}`}>
                        {USD(pick(row, t))}
                      </span>
                      <span className="qv-lead-chip-sm">{tLead}</span>
                    </div>
                  </td>
                )
              })}

              {/* Total shortlisted */}
              <td className="qv-td qv-td--r qv-td--shortlisted">
                <span className="qv-total-sl">{USD(total)}</span>
                <span className="qv-tier-tag" style={{ background: tc.bg, color: tc.color, borderColor: tc.border }}>
                  {tier.toUpperCase()}
                </span>
              </td>

              {/* Type */}
              <td className="qv-td qv-td--c">
                <span className="qv-type-tag" style={{ background: ts.bg, color: ts.color, borderColor: ts.border }}>
                  {ts.label}
                </span>
              </td>

              {/* Lead time — color coded by relative rank */}
              <td className="qv-td qv-td--c">
                <span className="qv-lead-badge" style={{ background: lc.bg, color: lc.color, borderColor: lc.border }}>
                  <span className="qv-lead-dot" style={{ background: lc.dot }}/>
                  {selLead}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="qv-tfoot-row">
          <td colSpan={9} className="qv-tfoot-label">Grand Total (Shortlisted)</td>
          <td className="qv-td qv-td--r qv-tfoot-total">
            {USD(rows.reduce((s, r) => s + pick(r, selected[r.id] ?? 'l1') * r.qty, 0))}
          </td>
          <td colSpan={2}/>
        </tr>
      </tfoot>
    </table>
  )
}

/* ── Main component ── */
export default function QuotesViewer({ mode, onClose, onPlaceOrder }: Props) {

  const titleLabel = mode === 'both' ? 'Strenth Quotes — Standard + Custom Parts'
    : mode === 'bop' ? 'Strenth Quotes — Standard Parts'
    : 'Strenth Quotes — Custom Parts'

  const allRows: MergedRow[] = mode === 'both'
    ? [...BOP_QUOTE_ROWS.map(r => ({ ...r, partType: 'standard' as const })),
       ...QUOTE_ROWS.map(r     => ({ ...r, partType: 'custom'   as const }))]
    : mode === 'bop'
    ? BOP_QUOTE_ROWS.map(r => ({ ...r, partType: 'standard' as const }))
    : QUOTE_ROWS.map(r     => ({ ...r, partType: 'custom'   as const }))

  const [selected, setSelected] = useState<Record<number, Tier>>(
    () => Object.fromEntries(allRows.map(r => [r.id, 'l1' as Tier]))
  )
  const [optMode, setOptMode] = useState<OptMode>(null)

  const pick = (row: MergedRow, t: Tier) =>
    t === 'l1' ? row.l1PerUnit : t === 'l2' ? row.l2PerUnit : row.l3PerUnit

  const grandTotal = allRows.reduce((s, r) => s + pick(r, selected[r.id] ?? 'l1') * r.qty, 0)

  /* BOM cost for savings % */
  const activeBOM = (mode === 'bop'  ? BOP_QUOTE_GRAND_BOM : 0)
                  + (mode === 'cdp'  ? QUOTE_GRAND_BOM      : 0)
                  + (mode === 'both' ? BOP_QUOTE_GRAND_BOM + QUOTE_GRAND_BOM : 0)
  const activeL1  = allRows.reduce((s, r) => s + r.l1PerUnit * r.qty, 0)
  const savePct   = (((activeBOM - activeL1) / activeBOM) * 100).toFixed(1)

  /* ── Summary calculations for footer ── */
  const selectedLeadDays = allRows.map(r => parseLeadDays(getTierLead(r, selected[r.id] ?? 'l1')))
  const maxLeadDays      = Math.max(...selectedLeadDays, 1)
  const maxLeadRow       = allRows[selectedLeadDays.indexOf(maxLeadDays)]
  const maxLeadStr       = maxLeadRow ? getTierLead(maxLeadRow, selected[maxLeadRow.id] ?? 'l1') : '—'
  const estDelivery      = addDays(maxLeadDays)

  /* ── Optimize handlers ── */
  const optimizeForCost = () => {
    setSelected(Object.fromEntries(allRows.map(r => [r.id, 'l1' as Tier])))
    setOptMode('cost')
  }

  const optimizeForLeadTime = () => {
    const next: Record<number, Tier> = {}
    allRows.forEach(r => {
      const days: Record<Tier, number> = {
        l1: parseLeadDays(r.l1Lead),
        l2: parseLeadDays(r.l2Lead),
        l3: parseLeadDays(r.l3Lead),
      }
      const best = (Object.entries(days) as [Tier, number][])
        .reduce((a, b) => b[1] < a[1] ? b : a)[0]
      next[r.id] = best
    })
    setSelected(next)
    setOptMode('lead')
  }

  return (
    <div className="qv-viewer">

      {/* Header */}
      <div className="qv-header">
        <div className="qv-header__left">
          <button className="bom-close-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
            <span>Close</span>
          </button>
          <div className="qv-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div>
            <div className="qv-title">{titleLabel}</div>
            <div className="qv-subtitle">
              <span className="qv-saving-badge">Save {savePct}% vs BOM cost</span>
              <span className="qv-saving-badge" style={{ marginLeft: 6 }}>
                Click L1 / L2 / L3 to select vendor per row
              </span>
            </div>
          </div>
        </div>
        <div className="qv-header__right">
          <button className="qv-order-btn" onClick={() => onPlaceOrder(grandTotal)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Place Order — {USD(grandTotal)}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="qv-wrap">
        <QuoteTable rows={allRows} selected={selected} setSelected={setSelected}/>
      </div>

      {/* Summary bar */}
      <div className="qv-summary-bar">
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Total Cost</span>
          <span className="qv-summary-val qv-summary-val--total">{USD(grandTotal)}</span>
        </div>
        <div className="qv-summary-sep"/>
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Max Lead Time</span>
          <span className="qv-summary-val qv-summary-val--lead" style={{ color: leadColor(maxLeadDays).color }}>
            {maxLeadStr}
          </span>
        </div>
        <div className="qv-summary-sep"/>
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Est. Delivery</span>
          <span className="qv-summary-val">{estDelivery}</span>
        </div>
      </div>

      {/* CTA bar */}
      <div className="qv-cta-bar">
        <button
          className={`qv-cta-btn qv-cta-btn--cost${optMode === 'cost' ? ' qv-cta-btn--active' : ''}`}
          onClick={optimizeForCost}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
          </svg>
          {optMode === 'cost' ? '✓ Optimized for Cost' : 'Optimize for Cost'}
        </button>
        <button
          className={`qv-cta-btn qv-cta-btn--lead${optMode === 'lead' ? ' qv-cta-btn--active' : ''}`}
          onClick={optimizeForLeadTime}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {optMode === 'lead' ? '✓ Optimized for Lead Time' : 'Optimize for Lead Time'}
        </button>
        <button className="qv-cta-btn qv-cta-btn--expert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Connect with Expert
        </button>
      </div>

    </div>
  )
}
