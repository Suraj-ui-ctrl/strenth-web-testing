import { CheckCircleIcon } from './Icons'

type RfqPhase = 'sourcing-rfq' | 'rfq-tracking' | 'quotes-received'
type RfqMode  = 'cdp' | 'bop' | 'both'

interface Props {
  phase:   RfqPhase
  rfqMode: RfqMode
}

export default function SourcingProgressPanel({ phase, rfqMode }: Props) {
  const isComplete = phase === 'quotes-received'
  const isTracking = phase === 'rfq-tracking'

  const modeLabel =
    rfqMode === 'both' ? 'Standard + Custom' :
    rfqMode === 'bop'  ? 'Standard Parts' : 'Custom Parts'

  const headerLabel =
    isComplete ? 'Quotes Received' :
    isTracking ? 'RFQs Dispatched — Tracking' :
    'Sourcing — RFQ Ready'

  const subLabel = isComplete ? 'Complete' : 'Active'
  const subColor = isComplete ? '#16a34a' : undefined

  const progress =
    isComplete ? 100 :
    isTracking  ? 60  : 30

  const countText =
    rfqMode === 'both' ? '11 RFQs' :
    rfqMode === 'bop'  ? '5 RFQs'  : '6 RFQs'

  const statusText: React.ReactNode =
    isComplete ? <><CheckCircleIcon /> All quotes in</> :
    isTracking  ? 'Live tracking · Awaiting responses'  :
    'Preview ready — review & send'

  return (
    <div className="pp pp--slim">

      {/* ── Header ── */}
      <div className="pp__header">
        <span className="pp__dot" style={subColor ? { background: subColor } : undefined} />
        <span className="pp__title">{headerLabel}</span>
      </div>
      <div className="pp__sub" style={subColor ? { color: subColor } : undefined}>
        {subLabel}
      </div>

      <div className="pp__list">
        <div className="pf">
          <div className="pf__meta">
            <span className="pf__name">RFQ_{modeLabel.replace(/ /g, '_')}.xlsx</span>
            <span className="pf__size">{countText}</span>
          </div>
          <div className="pf__track">
            <div
              className={`pf__fill${!isComplete ? ' pf__fill--blue' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`pf__status ${isComplete ? 'pf__status--done' : 'pf__status--prog'}`}>
            {statusText}
          </div>
        </div>
      </div>

    </div>
  )
}
