import { AppState, FileProgress } from '../types'
import { CheckCircleIcon } from './Icons'

interface Props {
  appState:     AppState
  fileProgress: FileProgress[]
  moreProgress: number
  onFileSelect?: () => void
}

export default function ProgressPanel({ appState, fileProgress, moreProgress }: Props) {
  const isAnalyzing = appState === 'analyzing' || appState === 'organized'
  const isDone      = appState === 'organized' && moreProgress >= 100

  const title    = isAnalyzing ? 'Analysis in Progress' : 'Uploading in Progress'
  const subLabel = isDone ? 'Complete' : 'Active'
  const subColor = isDone ? '#16a34a' : undefined

  /* Aggregate progress across all files */
  const total    = fileProgress.length
  const done     = fileProgress.filter(f => f.status === 'complete').length
  const avgProg  = isDone
    ? 100
    : isAnalyzing
    ? Math.round(moreProgress)
    : Math.round(fileProgress.reduce((s, f) => s + f.progress, 0) / Math.max(total, 1))

  const statusText = isDone
    ? `${total} files analysed`
    : isAnalyzing
    ? `Analysing… ${Math.round(moreProgress)}%`
    : done === total
    ? `${total} files uploaded`
    : `Uploading… ${done} of ${total} files`

  return (
    <div className="pp pp--slim">
      <div className="pp__header">
        <span className="pp__dot" style={subColor ? { background: subColor } : undefined} />
        <span className="pp__title">{title}</span>
      </div>
      <div className="pp__sub" style={subColor ? { color: subColor } : undefined}>{subLabel}</div>

      <div className="pp__list">
        <div className="pf">
          <div className="pf__meta">
            <span className="pf__name">10 design files</span>
            <span className="pf__size">{done}/{total}</span>
          </div>
          <div className="pf__track">
            <div
              className={`pf__fill${!isDone ? ' pf__fill--blue' : ''}`}
              style={{ width: `${avgProg}%` }}
            />
          </div>
          <div className={`pf__status ${isDone ? 'pf__status--done' : 'pf__status--prog'}`}>
            {isDone
              ? <><CheckCircleIcon /> Analysis complete</>
              : statusText}
          </div>
        </div>
      </div>
    </div>
  )
}
