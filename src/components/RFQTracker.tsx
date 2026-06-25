import { useState, useEffect, useRef } from 'react'
import { RFQMode } from './RFQViewer'

type VStatus = 'sent' | 'read' | 'quoting' | 'quoted'

interface TrackPart {
  id:   number
  no:   string
  desc: string
  type: 'bop' | 'cdp'
  v:    string[]                          /* vendor names */
  t:    [number, number, number][]        /* [read_s, quoting_s, quoted_s] per vendor */
}

/* ── Timeline data — BOP fast (1 day sim), CDP slow (5 day sim) ── */
const ALL_PARTS: TrackPart[] = [
  /* BOP */
  { id: 101, no: 'ELC-005', desc: 'BLDC Motor Controller — TMC2209',  type: 'bop',
    v: ['DigiKey India', 'Mouser Electronics', 'element14 India'],
    t: [[2.0,4.0,7.5],[3.2,5.5,9.0],[4.8,7.2,11.5]] },
  { id: 102, no: 'ELC-006', desc: 'USB Type-C Connector (SMD)',         type: 'bop',
    v: ['DigiKey India', 'robu.in', 'electronicscomp.in'],
    t: [[2.5,4.2,6.5],[3.8,5.8,8.5],[5.5,7.5,12.0]] },
  { id: 103, no: 'MCH-003', desc: 'M5×20 SS Hex Socket Bolt + Nut',    type: 'bop',
    v: ['Atul Fasteners', 'Fastenware India', 'SteelFast Pvt Ltd'],
    t: [[1.5,3.0,5.5],[3.0,5.0,7.5],[4.5,6.5,10.5]] },
  { id: 104, no: 'CBL-001', desc: 'Nylon Cable Tie 200mm × 4.8mm',     type: 'bop',
    v: ['Allied Products India', 'Cable Corp India', 'Fastfix Industrial'],
    t: [[2.0,3.5,5.5],[3.2,5.0,7.5],[4.8,6.5,10.0]] },
  { id: 105, no: 'ELC-007', desc: '10µF 50V Electrolytic Capacitor',   type: 'bop',
    v: ['LCSC India', 'DigiKey India', 'Mouser Electronics'],
    t: [[1.8,3.2,5.5],[2.8,4.5,7.0],[5.2,7.5,11.5]] },
  /* CDP */
  { id: 1, no: 'MCH-001', desc: 'Aluminium Housing — Main Assembly',   type: 'cdp',
    v: ['TechMach Pune', 'Precision Parts India', 'Ace Machining Works'],
    t: [[4.0,8.0,15.0],[6.0,11.0,18.5],[8.5,13.5,22.0]] },
  { id: 2, no: 'MCH-002', desc: 'Stainless Steel Bracket — Mounting',  type: 'cdp',
    v: ['SheetFab Industries', 'MetalWorks Chennai', 'Bharat Engineering'],
    t: [[5.0,9.5,16.0],[7.0,12.0,19.5],[9.5,14.5,23.0]] },
  { id: 3, no: 'MCH-004', desc: 'Precision Gear Set — 1:4 Ratio',      type: 'cdp',
    v: ['Gear India Pvt Ltd', 'Power Transmission Co.', 'HMT Machining'],
    t: [[5.5,10.0,17.5],[7.5,12.5,20.5],[10.5,15.5,24.5]] },
  { id: 4, no: 'MCH-005', desc: 'Drive Shaft — 12mm dia, 250mm L',     type: 'cdp',
    v: ['Shaft Precision Works', 'Turn-All Engineering', 'Rotary Parts India'],
    t: [[4.5,9.0,16.5],[6.5,11.5,19.5],[9.0,14.0,22.5]] },
  { id: 5, no: 'ELC-001', desc: 'Control PCB — Motor Driver (4-layer)', type: 'cdp',
    v: ['PCB Power India', 'PCBGOGO India', 'Circuits@24 Mumbai'],
    t: [[5.0,9.5,17.5],[7.0,12.5,21.0],[10.5,15.5,25.0]] },
  { id: 6, no: 'ELC-003', desc: '24V DC Power Transformer — 5A',       type: 'cdp',
    v: ['Transformers India Ltd', 'Magnetics Pvt Ltd', 'ElectroMag Solutions'],
    t: [[6.0,11.5,18.5],[8.5,13.5,21.5],[11.5,16.5,26.0]] },
]

const S_COLOR: Record<VStatus, string>  = {
  sent:    '#9ca3af',
  read:    '#3b82f6',
  quoting: '#d97706',
  quoted:  '#16a34a',
}
const S_LABEL: Record<VStatus, string>  = {
  sent:    'Sent',
  read:    'Opened',
  quoting: 'Preparing',
  quoted:  'Quoted ✓',
}
const S_ICON: Record<VStatus, string>   = {
  sent:    '📧',
  read:    '👁',
  quoting: '⏳',
  quoted:  '✅',
}

interface Props {
  mode:       RFQMode
  onComplete: () => void
}

export default function RFQTracker({ mode, onComplete }: Props) {
  /* Status state: key = `${partId}-${vendorIdx}` */
  const [statuses, setStatuses] = useState<Record<string, VStatus>>(() => {
    const s: Record<string, VStatus> = {}
    ALL_PARTS.forEach(p => p.v.forEach((_, vi) => { s[`${p.id}-${vi}`] = 'sent' }))
    return s
  })
  const [reminded, setReminded] = useState<Record<string, boolean>>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const done    = useRef(false)

  /* Filter parts by mode */
  const parts = ALL_PARTS.filter(p => mode === 'both' || p.type === mode)
  const bopParts = parts.filter(p => p.type === 'bop')
  const cdpParts = parts.filter(p => p.type === 'cdp')

  const isFullyQuoted = (p: TrackPart) =>
    p.v.every((_, vi) => statuses[`${p.id}-${vi}`] === 'quoted')

  const bopDone   = bopParts.filter(isFullyQuoted).length
  const cdpDone   = cdpParts.filter(isFullyQuoted).length
  const totalDone = bopDone + cdpDone

  /* Schedule all status transitions */
  useEffect(() => {
    parts.forEach(p => {
      p.v.forEach((_, vi) => {
        const [r, q, d] = p.t[vi]
        const key = `${p.id}-${vi}`
        timers.current.push(
          setTimeout(() => setStatuses(prev => ({ ...prev, [key]: 'read' })),    r * 1000),
          setTimeout(() => setStatuses(prev => ({ ...prev, [key]: 'quoting' })), q * 1000),
          setTimeout(() => setStatuses(prev => ({ ...prev, [key]: 'quoted' })),  d * 1000),
        )
      })
    })
    return () => timers.current.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Detect completion and fire callback once */
  useEffect(() => {
    if (done.current) return
    if (totalDone === parts.length && parts.length > 0) {
      done.current = true
      setTimeout(onComplete, 600)
    }
  }, [totalDone, parts.length, onComplete])

  const handleRemind = (key: string) => {
    setReminded(prev => ({ ...prev, [key]: true }))
    alert('Reminder sent!')
  }

  const pct = (n: number, d: number) => Math.round((n / Math.max(1, d)) * 100)

  return (
    <div className="rft-viewer">

      {/* ── Header ── */}
      <div className="rft-header">
        <div className="rft-header__left">
          <div className="rft-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div>
            <div className="rft-title">
              RFQ Tracker — Live Vendor Responses
              <span className="rft-live-pill">
                <span className="rft-live-dot"/>LIVE
              </span>
            </div>
            <div className="rft-subtitle">
              {mode === 'both'
                ? <>Standard {bopDone}/{bopParts.length} · Custom {cdpDone}/{cdpParts.length} parts fully quoted</>
                : <>{totalDone}/{parts.length} parts fully quoted</>
              }
            </div>
          </div>
        </div>

        <div className="rft-header__right">
          <button className="rft-alert-btn" title="Get notified when any quote beats your target">
            🎯 Set Price Alert
          </button>
          <button className="rft-skip-btn" onClick={onComplete}>
            Skip → View Quotes
          </button>
        </div>
      </div>

      {/* ── Progress bars ── */}
      <div className="rft-progress-section">
        {mode === 'both' ? (
          <>
            <div className="rft-progress-row">
              <span className="rft-progress-label rft-progress-label--green">Standard</span>
              <div className="rft-progress-track">
                <div className="rft-progress-fill rft-progress-fill--green"
                     style={{ width: `${pct(bopDone, bopParts.length)}%` }}/>
              </div>
              <span className="rft-progress-count">{bopDone}/{bopParts.length}</span>
              {bopDone === bopParts.length && bopParts.length > 0 && (
                <span className="rft-progress-done-badge">✅ Quotes ready</span>
              )}
            </div>
            <div className="rft-progress-row">
              <span className="rft-progress-label rft-progress-label--amber">Custom</span>
              <div className="rft-progress-track">
                <div className="rft-progress-fill rft-progress-fill--amber"
                     style={{ width: `${pct(cdpDone, cdpParts.length)}%` }}/>
              </div>
              <span className="rft-progress-count">{cdpDone}/{cdpParts.length}</span>
              {cdpDone === cdpParts.length && cdpParts.length > 0 && (
                <span className="rft-progress-done-badge">✅ Quotes ready</span>
              )}
            </div>
          </>
        ) : (
          <div className="rft-progress-row">
            <span className={`rft-progress-label rft-progress-label--${mode === 'bop' ? 'green' : 'amber'}`}>
              {mode === 'bop' ? 'Standard' : 'Custom'}
            </span>
            <div className="rft-progress-track">
              <div className={`rft-progress-fill rft-progress-fill--${mode === 'bop' ? 'green' : 'amber'}`}
                   style={{ width: `${pct(totalDone, parts.length)}%` }}/>
            </div>
            <span className="rft-progress-count">{totalDone}/{parts.length} parts quoted</span>
            {totalDone === parts.length && parts.length > 0 && (
              <span className="rft-progress-done-badge">✅ All quotes received!</span>
            )}
          </div>
        )}
      </div>

      {/* ── Status legend ── */}
      <div className="rft-legend">
        {(['sent','read','quoting','quoted'] as VStatus[]).map(s => (
          <span key={s} className="rft-legend-item">
            <span style={{ color: S_COLOR[s] }}>{S_ICON[s]}</span>
            <span>{S_LABEL[s]}</span>
          </span>
        ))}
        <span className="rft-legend-sep"/>
        <span className="rft-legend-item rft-legend-item--note">
          Click <strong>Remind</strong> to follow up with slow vendors
        </span>
      </div>

      {/* ── Tracker table ── */}
      <div className="rft-wrap">
        <table className="rft-table" style={{ minWidth: mode === 'both' ? 960 : 880, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }}/>
            <col style={{ width: 80 }}/>
            <col style={{ width: mode === 'both' ? 160 : 190 }}/>
            {mode === 'both' && <col style={{ width: 60 }}/>}
            <col/>
            <col/>
            <col/>
            <col style={{ width: 90 }}/>
          </colgroup>
          <thead>
            <tr>
              <th className="rft-th rft-th--c">#</th>
              <th className="rft-th">Part No.</th>
              <th className="rft-th">Description</th>
              {mode === 'both' && <th className="rft-th rft-th--c">Type</th>}
              <th className="rft-th rft-th--c">Quote 1</th>
              <th className="rft-th rft-th--c">Quote 2</th>
              <th className="rft-th rft-th--c">Quote 3</th>
              <th className="rft-th rft-th--c">Progress</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, idx) => {
              const vStates = p.v.map((_, vi) => statuses[`${p.id}-${vi}`] ?? 'sent')
              const quotedN = vStates.filter(s => s === 'quoted').length
              const allDone = quotedN === 3

              return (
                <tr key={p.id} className={`rft-row${allDone ? ' rft-row--done' : ''}`}>
                  <td className="rft-td rft-td--c rft-td--muted">{idx + 1}</td>
                  <td className="rft-td rft-td--mono">{p.no}</td>
                  <td className="rft-td rft-td--strong">{p.desc}</td>

                  {mode === 'both' && (
                    <td className="rft-td rft-td--c">
                      <span className={`rft-type-badge rft-type-badge--${p.type}`}>
                        {p.type === 'bop' ? 'Standard' : 'Custom'}
                      </span>
                    </td>
                  )}

                  {vStates.map((s, vi) => {
                    const k = `${p.id}-${vi}`
                    const canRemind = (s === 'sent' || s === 'read') && !reminded[k]
                    return (
                      <td key={vi} className="rft-td rft-td--c">
                        <div className="rft-vendor-cell">
                          <span className="rft-vendor-icon" style={{ color: S_COLOR[s] }}>
                            {S_ICON[s]}
                          </span>
                          <div className="rft-vendor-info">
                            <span className="rft-vendor-status" style={{ color: S_COLOR[s] }}>
                              {S_LABEL[s]}
                            </span>
                          </div>
                          {canRemind && (
                            <button
                              className="rft-remind-btn"
                              onClick={() => handleRemind(k)}
                              title="Send follow-up reminder"
                            >
                              Remind
                            </button>
                          )}
                          {reminded[k] && (
                            <span className="rft-reminded-badge">Reminded ✓</span>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  <td className="rft-td rft-td--c">
                    {allDone
                      ? <span className="rft-prog-done">All quoted ✅</span>
                      : <span className="rft-prog-wait">{quotedN}/3 quoted</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="rft-footer">
        <span className="rft-footer-note">
          Status updates in real time · Quotes arrive directly in your workspace · You'll be notified when all responses are in
        </span>
        <span className="rft-footer-status">
          {totalDone === parts.length && parts.length > 0
            ? <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ All quotes in — loading comparison report…</span>
            : <>{parts.length - totalDone} part{parts.length - totalDone !== 1 ? 's' : ''} still awaiting quotes · Or click <strong>Skip → View Quotes</strong> above</>
          }
        </span>
      </div>

    </div>
  )
}
