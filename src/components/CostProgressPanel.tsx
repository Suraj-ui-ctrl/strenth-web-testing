import { CheckCircleIcon } from './Icons'
import { BOP_COST_ROWS, CDP_COST_ROWS } from '../data/costData'

const TOTAL_STEPS = 6

interface Props {
  costStep:         number   /* 0 = not started, 1-6 = steps done, 6 = complete */
  isComplete:       boolean
  costFileSelected: boolean
  onCostFileSelect: () => void
}

export default function CostProgressPanel({
  costStep, isComplete,
}: Props) {
  const total    = BOP_COST_ROWS.length + CDP_COST_ROWS.length
  const progress = isComplete
    ? 100
    : Math.min(99, Math.round((costStep / TOTAL_STEPS) * 100))

  const headerLabel = isComplete ? 'Cost Benchmark Complete' : 'Cost Benchmarking in Progress'
  const subLabel    = isComplete ? 'Complete' : 'Active'
  const subColor    = isComplete ? '#16a34a' : undefined

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
            <span className="pf__name">Cost_Benchmark_v1.xlsx</span>
            <span className="pf__size">
              {isComplete
                ? `${total} parts priced`
                : `${costStep} / ${TOTAL_STEPS} steps`}
            </span>
          </div>
          <div className="pf__track">
            <div
              className={`pf__fill${!isComplete ? ' pf__fill--blue' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`pf__status ${isComplete ? 'pf__status--done' : 'pf__status--prog'}`}>
            {isComplete
              ? <><CheckCircleIcon /> Benchmark complete</>
              : `Processing… step ${costStep} of ${TOTAL_STEPS}`}
          </div>
        </div>
      </div>

    </div>
  )
}
