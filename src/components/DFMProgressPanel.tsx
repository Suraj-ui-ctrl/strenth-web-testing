import { DFM_STEPS, DFM_PARTS, DFM_FLAG_COUNT } from '../data/dfmData'

const TOTAL_STEPS = DFM_STEPS.length

interface Props {
  dfmStep:    number   // 0 = not started, 1-6 = steps done
  isComplete: boolean
}

export default function DFMProgressPanel({ dfmStep, isComplete }: Props) {
  const flagged  = DFM_PARTS.filter(p => p.dfmFlags.length > 0).length
  const lowCount = DFM_PARTS.filter(p => p.complexity === 'Low').length

  const headerLabel = isComplete ? 'DFM Analysis Complete' : 'DFM Analysis in Progress'

  return (
    <div className="pp">

      {/* ── Header ── */}
      <div className="pp__header">
        <span className="pp__dot" style={isComplete ? { background: '#7c3aed' } : undefined} />
        <span className="pp__title">{headerLabel}</span>
      </div>
      <div className="pp__sub" style={isComplete ? { color: '#7c3aed' } : undefined}>
        {isComplete ? 'Complete' : dfmStep > 0 ? 'Analysing…' : 'Ready'}
      </div>

      <div className="pp__list">

        {/* ── File row ── */}
        <div className="pf">
          <div className="pf__meta">
            <span className="pf__name">DFM_Analysis_v1.pdf</span>
            <span className="pf__size">
              {isComplete
                ? `${DFM_PARTS.length} parts · ${DFM_FLAG_COUNT} flags`
                : `${dfmStep} / ${TOTAL_STEPS} steps`}
            </span>
          </div>
          <div className={`pf__status ${isComplete ? 'pf__status--done' : 'pf__status--prog'}`}>
            {isComplete
              ? <><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/></svg> Analysis complete</>
              : `Processing… step ${dfmStep} of ${TOTAL_STEPS}`}
          </div>
        </div>

        {/* ── Step list (while processing) ── */}
        {!isComplete && dfmStep > 0 && (
          <div className="cost-steps">
            {DFM_STEPS.map((s, i) => {
              const done   = i < dfmStep
              const active = i === dfmStep
              return (
                <div
                  key={i}
                  className={`cost-step${done ? ' cost-step--done' : active ? ' cost-step--active' : ' cost-step--wait'}`}
                >
                  <span className="cost-step__icon">
                    {done
                      ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/></svg>
                      : active
                      ? <span className="cost-step__spinner dfm-spinner"/>
                      : <span className="cost-step__dot"/>}
                  </span>
                  <span className="cost-step__label">{s.label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Summary cards (when complete) ── */}
        {isComplete && (
          <div className="bom-insight-grid">

            <div className="bom-insight-card dfm-card--purple">
              <span className="bom-insight-val">{DFM_PARTS.length}</span>
              <span className="bom-insight-lbl">Parts Analysed</span>
            </div>

            <div className={`bom-insight-card${flagged > 0 ? ' bom-insight-card--red' : ''}`}>
              <span className="bom-insight-val">{flagged}</span>
              <span className="bom-insight-lbl">Parts Flagged</span>
            </div>

            <div className="bom-insight-card">
              <span className="bom-insight-val">{DFM_FLAG_COUNT}</span>
              <span className="bom-insight-lbl">DFM Issues</span>
            </div>

            <div className="bom-insight-card bom-insight-card--green">
              <span className="bom-insight-val">{lowCount}</span>
              <span className="bom-insight-lbl">Low Risk</span>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
