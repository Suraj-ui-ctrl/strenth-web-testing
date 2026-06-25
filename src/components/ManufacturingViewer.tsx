import { MFG_ROWS, MfgRow, MFG_TOTAL_DAYS, MFG_CUSTOM_COUNT, MFG_STD_COUNT } from '../data/mfgData'

interface Props {
  onClose: () => void
}

const STATUS_STYLE: Record<MfgRow['status'], { bg: string; color: string; border: string }> = {
  Ready:    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'In Queue': { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  Planned:  { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
}

const TYPE_STYLE: Record<MfgRow['partType'], { bg: string; color: string; border: string }> = {
  Custom:   { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' },
  Standard: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
}

function estDelivery(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days + 2)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ManufacturingViewer({ onClose }: Props) {
  return (
    <div className="qv-viewer">

      {/* ── Header ── */}
      <div className="qv-header">
        <div className="qv-header__left">
          <button className="bom-close-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
            <span>Close</span>
          </button>
          <div className="qv-icon" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
              <line x1="12" y1="12" x2="12" y2="17"/>
              <line x1="9" y1="14.5" x2="15" y2="14.5"/>
            </svg>
          </div>
          <div>
            <div className="qv-title">Manufacturing Plan — Standard + Custom Parts</div>
            <div className="qv-subtitle">
              <span className="qv-saving-badge" style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}>
                {MFG_CUSTOM_COUNT} custom · {MFG_STD_COUNT} standard parts
              </span>
              <span className="qv-saving-badge" style={{ marginLeft: 6, background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                {MFG_TOTAL_DAYS}-day production cycle
              </span>
            </div>
          </div>
        </div>
        <div className="qv-header__right">
          <button className="cb-dl-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Export Plan
          </button>
          <button className="rfq-send-btn" style={{ background: '#d97706', borderColor: '#d97706' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            Confirm Plan
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="qv-wrap">
        <table className="qv-table" style={{ minWidth: 1100, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 30 }}/>   {/* # */}
            <col style={{ width: 80 }}/>   {/* Part No. */}
            <col style={{ width: 200 }}/>  {/* Description */}
            <col style={{ width: 74 }}/>   {/* Type */}
            <col style={{ width: 195 }}/>  {/* Process */}
            <col style={{ width: 175 }}/>  {/* Line / Vendor */}
            <col style={{ width: 52 }}/>   {/* Qty */}
            <col style={{ width: 68 }}/>   {/* Cycle */}
            <col style={{ width: 62 }}/>   {/* Start */}
            <col style={{ width: 62 }}/>   {/* End */}
            <col style={{ width: 84 }}/>   {/* Status */}
          </colgroup>
          <thead>
            <tr>
              <th className="qv-th qv-th--c">#</th>
              <th className="qv-th">Part No.</th>
              <th className="qv-th">Description</th>
              <th className="qv-th qv-th--c">Type</th>
              <th className="qv-th">Process</th>
              <th className="qv-th">Line / Vendor</th>
              <th className="qv-th qv-th--r">Qty</th>
              <th className="qv-th qv-th--c">Cycle</th>
              <th className="qv-th qv-th--c">Start</th>
              <th className="qv-th qv-th--c">End</th>
              <th className="qv-th qv-th--c">Status</th>
            </tr>
          </thead>
          <tbody>
            {MFG_ROWS.map((row, idx) => {
              const ss = STATUS_STYLE[row.status]
              const ts = TYPE_STYLE[row.partType]
              return (
                <tr key={row.id} className="qv-row">
                  <td className="qv-td qv-td--c qv-td--muted">{idx + 1}</td>
                  <td className="qv-td qv-td--mono">{row.partNo}</td>
                  <td className="qv-td qv-td--strong" title={row.description}>{row.description}</td>
                  <td className="qv-td qv-td--c">
                    <span className="qv-type-tag" style={{ background: ts.bg, color: ts.color, borderColor: ts.border }}>
                      {row.partType}
                    </span>
                  </td>
                  <td className="qv-td rfq-td--method">{row.process}</td>
                  <td className="qv-td qv-td--strong" title={row.line} style={{ fontSize: 11, color: '#6b7280' }}>{row.line}</td>
                  <td className="qv-td qv-td--r qv-td--muted">
                    {row.qty} <span className="qv-unit">{row.unit}</span>
                  </td>
                  <td className="qv-td qv-td--c qv-td--muted">{row.cycleDays}d</td>
                  <td className="qv-td qv-td--c qv-td--muted">Day {row.startDay}</td>
                  <td className="qv-td qv-td--c qv-td--muted">Day {row.endDay}</td>
                  <td className="qv-td qv-td--c">
                    <span className="qv-lead-badge" style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}>
                      <span className="qv-lead-dot" style={{ background: ss.color }}/>
                      {row.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="qv-tfoot-row">
              <td colSpan={6} className="qv-tfoot-label">Production Summary</td>
              <td className="qv-td qv-td--r qv-tfoot-total" style={{ color: '#d97706' }}>
                {MFG_ROWS.reduce((s, r) => s + r.qty, 0)} pcs
              </td>
              <td colSpan={4}/>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Summary bar ── */}
      <div className="qv-summary-bar">
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Total Parts</span>
          <span className="qv-summary-val" style={{ color: '#d97706' }}>{MFG_ROWS.length}</span>
        </div>
        <div className="qv-summary-sep"/>
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Production Cycle</span>
          <span className="qv-summary-val" style={{ color: '#c2410c' }}>{MFG_TOTAL_DAYS} days</span>
        </div>
        <div className="qv-summary-sep"/>
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Est. Completion</span>
          <span className="qv-summary-val">{estDelivery(MFG_TOTAL_DAYS)}</span>
        </div>
        <div className="qv-summary-sep"/>
        <div className="qv-summary-item">
          <span className="qv-summary-lbl">Lines Active</span>
          <span className="qv-summary-val">3</span>
        </div>
      </div>

      {/* ── CTA bar ── */}
      <div className="qv-cta-bar">
        <button className="qv-cta-btn" style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          View Schedule
        </button>
        <button className="qv-cta-btn" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Optimise Sequence
        </button>
        <button className="qv-cta-btn qv-cta-btn--expert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Connect with Plant
        </button>
      </div>

    </div>
  )
}
