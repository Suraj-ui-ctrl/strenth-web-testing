import { useState, useEffect, useRef } from 'react'
import { DFM_PARTS, DFMPart, DFM_TOOLING_TOTAL, DFM_EST_TOTAL } from '../data/dfmData'

/* ── Process badge color map ── */
const PROCESS_COLORS: Record<string, { bg: string; color: string }> = {
  'CNC Machining':    { bg: '#dbeafe', color: '#1d4ed8' },
  'Laser Cutting':    { bg: '#fce7f3', color: '#be185d' },
  'Water Jet Cutting':{ bg: '#e0e7ff', color: '#4338ca' },
  'Injection Molding':{ bg: '#dcfce7', color: '#15803d' },
  '3D Printing':      { bg: '#fef9c3', color: '#a16207' },
  'Vacuum Casting':   { bg: '#ffedd5', color: '#c2410c' },
  'Extrusion':        { bg: '#f3f4f6', color: '#374151' },
  'Casting':          { bg: '#fef3c7', color: '#b45309' },
  'PCB Fabrication':  { bg: '#d1fae5', color: '#065f46' },
  'Cable Assembly':   { bg: '#ede9fe', color: '#6d28d9' },
}

const ProcessBadge = ({ label }: { label: string }) => {
  const c = PROCESS_COLORS[label] ?? { bg: '#f3f4f6', color: '#374151' }
  return <span className="dfm-badge" style={{ background: c.bg, color: c.color }}>{label}</span>
}

const FeasBar = ({ score }: { score: number }) => {
  const color = score >= 95 ? '#16a34a' : score >= 85 ? '#2563eb' : score >= 75 ? '#d97706' : '#dc2626'
  return (
    <div className="dfm-feas">
      <div className="dfm-feas__bar" style={{ width: `${score}%`, background: color }} />
      <span className="dfm-feas__num" style={{ color }}>{score}</span>
    </div>
  )
}

const ComplexChip = ({ c }: { c: DFMPart['complexity'] }) => {
  const map = { Low: '#dcfce7|#15803d', Medium: '#fef3c7|#b45309', High: '#fee2e2|#dc2626' }
  const [bg, col] = map[c].split('|')
  return <span className="dfm-complex" style={{ background: bg, color: col }}>{c}</span>
}

const INR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

type Category = 'All' | 'Mechanical' | 'Electrical' | 'Fastener' | 'Cable'
const CATS: Category[] = ['All', 'Mechanical', 'Electrical', 'Fastener', 'Cable']

/* All flag keys in the dataset — computed once outside the component */
const ALL_FLAG_KEYS = DFM_PARTS.flatMap(p => p.dfmFlags.map((_, i) => `${p.id}-${i}`))
const TOTAL_FLAGS   = ALL_FLAG_KEYS.length

interface Props {
  onClose:         () => void
  onAllResolved?:  () => void
  /* ── lifted state — keeps counts alive across split/full-view switches ── */
  resolvedFlags:   string[]
  onResolveFlag:   (key: string) => void
}

export default function DFMViewer({ onClose, onAllResolved, resolvedFlags, onResolveFlag }: Props) {
  const [cat,      setCat]      = useState<Category>('All')
  const [flagOnly, setFlagOnly] = useState(false)
  const notifiedRef = useRef(false)

  /* Derive a Set for O(1) lookups — recomputed only when resolvedFlags changes */
  const resolvedSet   = new Set(resolvedFlags)
  const openFlagCount = TOTAL_FLAGS - resolvedFlags.length
  const allClear      = openFlagCount === 0
  const flaggedParts  = DFM_PARTS.filter(p => p.dfmFlags.some((_, i) => !resolvedSet.has(`${p.id}-${i}`))).length

  /* Fire onAllResolved exactly once */
  useEffect(() => {
    if (notifiedRef.current || !allClear || TOTAL_FLAGS === 0) return
    notifiedRef.current = true
    onAllResolved?.()
  }, [allClear]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = DFM_PARTS.filter(p => {
    if (cat !== 'All' && p.category !== cat) return false
    if (flagOnly && p.dfmFlags.every((_, i) => resolvedSet.has(`${p.id}-${i}`))) return false
    return true
  })

  return (
    <div className="dfm-viewer">

      {/* ── Header ── */}
      <div className={`dfm-hdr${allClear ? ' dfm-hdr--clear' : ''}`}>
        <div className="dfm-hdr__left">
          <div className="dfm-hdr__icon">{allClear ? '✅' : '🔬'}</div>
          <div>
            <div className="dfm-hdr__title">
              {allClear ? 'All Issues Resolved — Ready for Manufacturing' : 'DFM Analysis Report'}
            </div>
            <div className="dfm-hdr__sub">
              {allClear
                ? `${DFM_PARTS.length} parts verified · No open DFM flags · Cleared for production`
                : `${DFM_PARTS.length} parts · ${openFlagCount} open issues · ${flaggedParts} parts need attention`}
            </div>
          </div>
        </div>
        <div className="dfm-hdr__actions">
          {allClear && (
            <span className="dfm-ready-tag">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.5"/><polyline points="5,8.5 7,10.5 11,6"/>
              </svg>
              Ready for Mfg.
            </span>
          )}
          <button className="dfm-dl-btn">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
              <polyline points="5,7 8,10 11,7"/><line x1="8" y1="3" x2="8" y2="10"/>
            </svg>
            Download PDF
          </button>
          <button className="dfm-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div className="dfm-tiles">
        <div className="dfm-tile dfm-tile--purple">
          <span className="dfm-tile__val">{DFM_PARTS.length}</span>
          <span className="dfm-tile__lbl">Parts Analysed</span>
        </div>

        {/* Live countdown tile — key forces spring pop on every change */}
        <div className={`dfm-tile${allClear ? ' dfm-tile--green' : ' dfm-tile--red'}`}>
          <span className="dfm-tile__val dfm-tile__val--live" key={openFlagCount}>{openFlagCount}</span>
          <span className="dfm-tile__lbl">{allClear ? '✓ All Cleared' : 'Open Issues'}</span>
        </div>

        {/* Resolved tile — live count up */}
        <div className="dfm-tile dfm-tile--green">
          <span className="dfm-tile__val dfm-tile__val--live" key={resolvedFlags.length}>{resolvedFlags.length}</span>
          <span className="dfm-tile__lbl">Resolved</span>
        </div>

        <div className="dfm-tile dfm-tile--blue">
          <span className="dfm-tile__val">{INR(DFM_TOOLING_TOTAL)}</span>
          <span className="dfm-tile__lbl">Tooling Cost</span>
        </div>
      </div>

      {/* ── All-clear banner ── */}
      {allClear && (
        <div className="dfm-clear-banner">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/>
          </svg>
          All DFM issues resolved — this product is <strong>Ready for Manufacturing</strong>. Tag updated in the project panel.
        </div>
      )}

      {/* ── Filters ── */}
      <div className="dfm-filters">
        <div className="dfm-tabs">
          {CATS.map(c => (
            <button key={c} className={`dfm-tab${cat === c ? ' dfm-tab--active' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        {!allClear && (
          <button
            className={`dfm-flag-toggle${flagOnly ? ' dfm-flag-toggle--on' : ''}`}
            onClick={() => setFlagOnly(v => !v)}
          >
            {flagOnly ? '⚠️ Flagged only' : '⚠️ Show flagged'}
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="dfm-tbl-wrap">
        <table className="dfm-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Part No</th>
              <th>Description</th>
              <th>Material</th>
              <th>Recommended Process</th>
              <th>Alt Process</th>
              <th>Feasibility</th>
              <th>Est. ₹/unit</th>
              <th>Tooling ₹</th>
              <th>Lead</th>
              <th>Complexity</th>
              <th>DFM Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const partResolved = p.dfmFlags.length > 0 && p.dfmFlags.every((_, i) => resolvedSet.has(`${p.id}-${i}`))
              const hasOpen      = p.dfmFlags.length > 0 && !partResolved
              return (
                <tr key={p.id} className={hasOpen ? 'dfm-row--flagged' : partResolved ? 'dfm-row--resolved' : ''}>
                  <td className="dfm-td--num">{p.id}</td>
                  <td><code className="dfm-code">{p.partNo}</code></td>
                  <td className="dfm-td--desc">{p.description}</td>
                  <td className="dfm-td--mat">{p.material}</td>
                  <td><ProcessBadge label={p.recommendedProcess} /></td>
                  <td>
                    {p.alternateProcess
                      ? <ProcessBadge label={p.alternateProcess} />
                      : <span className="dfm-none">—</span>}
                  </td>
                  <td><FeasBar score={p.feasibilityScore} /></td>
                  <td className="dfm-td--cost">{INR(p.unitCostEst)}</td>
                  <td className="dfm-td--cost">
                    {p.toolingCost > 0 ? INR(p.toolingCost) : <span className="dfm-none">—</span>}
                  </td>
                  <td className="dfm-td--lead">{p.leadTimeDays}d</td>
                  <td><ComplexChip c={p.complexity} /></td>
                  <td className="dfm-td--flags">
                    {p.dfmFlags.length === 0 ? (
                      <span className="dfm-ok">✓ Clear</span>
                    ) : (
                      <ul className="dfm-flag-list">
                        {p.dfmFlags.map((f, i) => {
                          const key  = `${p.id}-${i}`
                          const done = resolvedSet.has(key)
                          return (
                            <li key={i} className={`dfm-flag-item${done ? ' dfm-flag-item--done' : ''}`}>
                              {done ? (
                                <span className="dfm-flag-resolved">✓ Resolved</span>
                              ) : (
                                <>
                                  <span className="dfm-flag-text">⚠ {f}</span>
                                  <button
                                    className="dfm-resolve-btn"
                                    onClick={() => onResolveFlag(key)}
                                    title="Mark as resolved"
                                  >
                                    ✓ Resolve
                                  </button>
                                </>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="dfm-empty">No parts match the current filter.</div>}
      </div>

      {/* ── Process legend ── */}
      <div className="dfm-legend">
        {Object.entries(PROCESS_COLORS).map(([label, c]) => (
          <span key={label} className="dfm-legend__item">
            <span className="dfm-legend__dot" style={{ background: c.color }} />
            {label}
          </span>
        ))}
      </div>

    </div>
  )
}
