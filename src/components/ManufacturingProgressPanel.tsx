import { CheckCircleIcon } from './Icons'
import { MFG_STEPS, MFG_ROWS, MFG_TOTAL_DAYS, MFG_TOTAL_EST_SEC } from '../data/mfgData'

const TOTAL_STEPS = MFG_STEPS.length
const MFG_COLOR   = '#d97706'

interface Props {
  mfgStep:    number
  isComplete: boolean
}

export default function ManufacturingProgressPanel({ mfgStep, isComplete }: Props) {
  const pct = isComplete ? 100 : Math.round((mfgStep / TOTAL_STEPS) * 100)

  const headerLabel = isComplete ? 'Manufacturing Plan Ready' : 'Manufacturing Agent in Progress'
  const subLabel    = isComplete ? 'Complete' : mfgStep > 0 ? `Active · ~${MFG_TOTAL_EST_SEC}s est.` : 'Starting…'
  const subColor    = isComplete ? '#16a34a' : MFG_COLOR

  return (
    <div className="pp pp--slim">

      <div className="pp__header">
        <span className="pp__dot" style={{ background: subColor }} />
        <span className="pp__title">{headerLabel}</span>
      </div>
      <div className="pp__sub" style={{ color: subColor }}>{subLabel}</div>

      <div className="pp__list">
        <div className="pf">
          <div className="pf__meta">
            <span className="pf__name">MFG_Plan_v1.xlsx</span>
            <span className="pf__size">
              {isComplete
                ? `${MFG_ROWS.length} parts · ${MFG_TOTAL_DAYS}-day cycle`
                : `${mfgStep} / ${TOTAL_STEPS} steps`}
            </span>
          </div>
          <div className="pf__track">
            <div
              className={`pf__fill${!isComplete ? ' pf__fill--mfg' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`pf__status ${isComplete ? 'pf__status--done' : 'pf__status--prog'}`}
               style={!isComplete ? { color: MFG_COLOR } : undefined}>
            {isComplete
              ? <><CheckCircleIcon /> Plan ready</>
              : `Processing… step ${mfgStep} of ${TOTAL_STEPS}`}
          </div>
        </div>
      </div>

    </div>
  )
}
