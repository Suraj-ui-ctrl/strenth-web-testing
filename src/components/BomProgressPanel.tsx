import { CheckCircleIcon } from './Icons'

interface Props {
  visibleRows:     number
  classifiedRows:  number
  isComplete:      boolean
  isClassifying:   boolean
  bomSelected:     boolean
  dupFilterActive: boolean
  onBomSelect:     () => void
  onDupFilter:     () => void
  totalRows?:      number
  fileName?:       string
}

export default function BomProgressPanel({
  visibleRows, classifiedRows, isComplete, isClassifying, totalRows, fileName, onBomSelect,
}: Props) {
  const total    = totalRows ?? 0
  const progress = total > 0 ? Math.min(100, Math.round((visibleRows / total) * 100)) : 0

  const classProgress = total > 0 ? Math.min(100, Math.round((classifiedRows / total) * 100)) : 0

  const headerLabel = isClassifying
    ? 'Parts Classification in Progress'
    : isComplete
    ? 'BOM Parsed'
    : 'BOM Parsing in Progress'

  const subLabel = isClassifying
    ? (classifiedRows >= total ? 'Complete' : 'Active')
    : isComplete
    ? 'Complete'
    : 'Active'

  const isDone = isComplete || (isClassifying && classifiedRows >= total)
  const subColor = isDone ? '#16a34a' : undefined

  return (
    <div className="pp pp--slim">
      <div className="pp__header">
        <span className="pp__dot" style={subColor ? { background: subColor } : undefined} />
        <span className="pp__title">{headerLabel}</span>
      </div>
      <div className="pp__sub" style={subColor ? { color: subColor } : undefined}>{subLabel}</div>

      <div className="pp__list">
        {/* ── Single progress bar — no data cards ── */}
        <div className="pf" onClick={onBomSelect} style={onBomSelect ? { cursor: 'pointer' } : undefined}>
          <div className="pf__meta">
            <span className="pf__name">{fileName ?? 'BOM file'}</span>
            <span className="pf__size">
              {isClassifying
                ? (total > 0 ? `${classifiedRows}/${total} classified` : `${classifiedRows} classified`)
                : isComplete
                ? (total > 0 ? `${total} parts` : 'complete')
                : (total > 0 ? `${visibleRows}/${total}` : '…')}
            </span>
          </div>
          <div className="pf__track">
            <div
              className={`pf__fill${!isDone ? ' pf__fill--blue' : ''}`}
              style={{ width: `${isClassifying ? classProgress : progress}%` }}
            />
          </div>
          <div className={`pf__status ${isDone ? 'pf__status--done' : 'pf__status--prog'}`}>
            {isDone
              ? <><CheckCircleIcon /> {isClassifying ? 'Parts classified' : 'Parsed complete'}</>
              : isClassifying
              ? (total > 0 ? `Classifying… ${classifiedRows} of ${total}` : `Classifying…`)
              : (total > 0 ? `Extracting… ${visibleRows} of ${total} parts` : 'Extracting…')}
          </div>
        </div>
      </div>
    </div>
  )
}
