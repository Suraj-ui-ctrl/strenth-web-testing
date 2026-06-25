import { useRef } from 'react'
import { BOM_ROWS } from '../data/bomData'
import { BomRow } from '../types'

interface Props {
  rows?:              BomRow[]
  fileName?:          string
  visibleRows:        number
  classifiedRows:     number
  isComplete:         boolean
  dupFilterActive:    boolean
  editingBomId:       number | null
  deletedBomIds:      number[]
  resolvedDupIds:     number[]   /* dupes that have been renamed/resolved — no longer highlighted */
  editedDescriptions: Record<number, string>
  onClose?:           () => void
  onEditRow:          (id: number) => void
  onSaveEdit:         (id: number, value: string) => void
  onDeleteRow:        (id: number) => void
}

/* ── Icons ── */
const XlsIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="7" fill="#16a34a" />
    <rect x="6" y="9"  width="20" height="14" rx="2" fill="rgba(255,255,255,0.18)" />
    <line x1="6"  y1="13.5" x2="26" y2="13.5" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
    <line x1="6"  y1="17.5" x2="26" y2="17.5" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
    <line x1="13" y1="9"    x2="13" y2="23"   stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
    <line x1="20" y1="9"    x2="20" y2="23"   stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
    <text x="16" y="7.5" textAnchor="middle" fill="white" fontSize="3.8" fontWeight="700" fontFamily="'SF Mono',monospace">XLS</text>
  </svg>
)

const CAT_CLASS: Record<BomRow['category'], string> = {
  Mechanical: 'bom-cat--mechanical',
  Electrical: 'bom-cat--electrical',
  Fastener:   'bom-cat--mechanical',
  Cable:      'bom-cat--electrical',
}
const CAT_LABEL: Record<BomRow['category'], string> = {
  Mechanical: 'Mechanical',
  Electrical: 'Electronics',
  Fastener:   'Mechanical',
  Cable:      'Electronic',
}
const STATUS_CLASS: Record<BomRow['status'], string> = {
  Approved: 'bom-status--approved',
  Pending:  'bom-status--pending',
  Review:   'bom-status--review',
}
const CLASS_STYLE: Record<NonNullable<BomRow['classification']>, string> = {
  BOP:       'bom-class--bop',
  CDP:       'bom-class--cdp',
  Ambiguous: 'bom-class--amb',
  Flagged:   'bom-class--flag',
}
const CLASS_LABEL: Record<NonNullable<BomRow['classification']>, string> = {
  BOP:       'BOP',
  CDP:       'CDP',
  Ambiguous: 'Ambiguous',
  Flagged:   'Flagged',
}

export default function BomViewer({
  rows: sourceRows = BOM_ROWS,
  fileName = 'BOM_Assembly_v3.xlsx',
  visibleRows, classifiedRows, isComplete,
  dupFilterActive, editingBomId, deletedBomIds, resolvedDupIds, editedDescriptions,
  onClose, onEditRow, onSaveEdit, onDeleteRow,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const rows     = sourceRows
    .slice(0, visibleRows)
    .filter(r => !deletedBomIds.includes(r.id))
    /* resolved duplicates are fully removed from the table */
    .filter(r => !(r.isDuplicate && resolvedDupIds.includes(r.id)))

  const approved   = rows.filter(r => r.status === 'Approved').length
  const flagged    = rows.filter(r => r.status !== 'Approved').length
  const dups       = rows.filter(r => r.isDuplicate && !resolvedDupIds.includes(r.id)).length
  const showClass  = classifiedRows > 0
  const stdParts   = rows.filter(r => r.classification === 'BOP').length
  const custParts  = rows.filter(r => r.classification === 'CDP').length

  return (
    <div className="bom-viewer">

      {/* ── Header ── */}
      <div className="bom-header">
        <div className="bom-header__left">
          {/* Close button */}
          {onClose && (
            <button className="bom-close-btn" onClick={onClose} title="Close BOM view">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5" />
              </svg>
              <span>Close</span>
            </button>
          )}
          <XlsIcon />
          <div>
            <div className="bom-filename">{fileName}</div>
            <div className="bom-filemeta">Strenth.ai · Design BOM{dupFilterActive ? ' · Showing duplicates' : ''}</div>
          </div>
        </div>

        <div className="bom-header__right">
          <div className="bom-stats">
            <div className="bom-stat">
              <span className="bom-stat__val">{rows.length}</span>
              <span className="bom-stat__lbl">of {sourceRows.length} Parts</span>
            </div>
            <div className="bom-stat-div" />
            <div className="bom-stat bom-stat--green">
              <span className="bom-stat__val">{approved}</span>
              <span className="bom-stat__lbl">Approved</span>
            </div>
            {flagged > 0 && <>
              <div className="bom-stat-div" />
              <div className="bom-stat bom-stat--amber">
                <span className="bom-stat__val">{flagged}</span>
                <span className="bom-stat__lbl">Flagged</span>
              </div>
            </>}
            {dups > 0 && <>
              <div className="bom-stat-div" />
              <div className="bom-stat bom-stat--dup">
                <span className="bom-stat__val">{dups}</span>
                <span className="bom-stat__lbl">Duplicates</span>
              </div>
            </>}
          </div>

          {showClass && stdParts > 0 && (
            <>
              <div className="bom-stat bom-stat--teal">
                <span className="bom-stat__val">{stdParts}</span>
                <span className="bom-stat__lbl">BOP</span>
              </div>
              <div className="bom-stat-div" />
              <div className="bom-stat bom-stat--purple">
                <span className="bom-stat__val">{custParts}</span>
                <span className="bom-stat__lbl">CDP</span>
              </div>
              <div className="bom-stat-div" />
            </>
          )}
          {!isComplete ? (
            <div className="bom-badge bom-badge--parsing">
              <span className="bom-badge__dot" />
              Parsing…
            </div>
          ) : showClass ? (
            <div className="bom-badge bom-badge--class">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.5" /><polyline points="5,8 7,10.5 11,6" />
              </svg>
              Parts Classified
            </div>
          ) : (
            <div className="bom-badge bom-badge--done">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.5" /><polyline points="5,8 7,10.5 11,6" />
              </svg>
              Complete
            </div>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bom-table-wrap">
        {visibleRows === 0 ? (
          <div className="bom-empty">
            <div className="bom-empty__spinner" />
            <span>Reading BOM file…</span>
          </div>
        ) : (
          <table className="bom-table">
            <thead>
              <tr>
                <th className="bom-th bom-th--num">#</th>
                <th className="bom-th bom-th--pno">Part No.</th>
                <th className="bom-th bom-th--desc">Description</th>
                <th className="bom-th bom-th--qty">Qty</th>
                <th className="bom-th bom-th--cat">Category</th>
                <th className="bom-th bom-th--sta">Status</th>
                <th className="bom-th bom-th--hsn">HSN Code</th>
                {showClass && <th className="bom-th bom-th--cls">Class</th>}
                <th className="bom-th bom-th--src">Source</th>
                {dupFilterActive && <th className="bom-th bom-th--act">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                /* resolved = user saved a rename → no longer treated as duplicate */
              const isDupRow     = !!row.isDuplicate && !resolvedDupIds.includes(row.id)
                const isEditing    = editingBomId === row.id
                const isDimmed     = dupFilterActive && !isDupRow
                const desc         = editedDescriptions[row.id] ?? row.description
                const isClassified = idx < classifiedRows

                return (
                  <tr
                    key={row.id}
                    className={[
                      'bom-row',
                      isDupRow          ? 'bom-row--dup'    : '',
                      isDimmed          ? 'bom-row--dimmed' : '',
                      dupFilterActive && isDupRow ? 'bom-row--focus' : '',
                    ].filter(Boolean).join(' ')}
                    title={isDupRow ? 'Possible duplicate — review required' : undefined}
                  >
                    <td className="bom-td bom-td--num">{row.id}</td>

                    {/* Part No + DUP badge */}
                    <td className="bom-td bom-td--pno">
                      {row.partNo}
                      {isDupRow && <span className="bom-dup-badge">DUP</span>}
                    </td>

                    {/* Description — editable when in edit mode */}
                    <td className="bom-td bom-td--desc">
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="bom-edit-input"
                          defaultValue={desc}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') onSaveEdit(row.id, (e.target as HTMLInputElement).value)
                            if (e.key === 'Escape') onSaveEdit(row.id, desc)
                          }}
                          onBlur={e => onSaveEdit(row.id, e.target.value)}
                        />
                      ) : desc}
                    </td>

                    <td className="bom-td bom-td--qty">
                      {row.qty} <span className="bom-unit">{row.unit}</span>
                    </td>

                    <td className="bom-td">
                      <span className={`bom-cat ${CAT_CLASS[row.category]}`}>{CAT_LABEL[row.category]}</span>
                    </td>

                    <td className="bom-td">
                      <span className={`bom-status ${STATUS_CLASS[row.status]}`}>{row.status}</span>
                    </td>

                    <td className="bom-td bom-td--hsn">
                      {row.hsnCode
                        ? <span className="bom-hsn">{row.hsnCode}</span>
                        : <span className="bom-hsn bom-hsn--missing">Missing</span>}
                    </td>

                    {/* Classification badge — animates in per row */}
                    {showClass && (
                      <td className="bom-td bom-td--cls">
                        {isClassified && row.classification ? (
                          <span className={`bom-class ${CLASS_STYLE[row.classification]}`}>
                            {CLASS_LABEL[row.classification]}
                          </span>
                        ) : (
                          <span className="bom-class-pending">…</span>
                        )}
                      </td>
                    )}

                    <td className="bom-td bom-td--src" title={row.sourceFile}>{row.sourceFile}</td>

                    {/* Inline actions — only for dup rows when filter is active */}
                    {dupFilterActive && (
                      <td className="bom-td bom-td--act">
                        {isDupRow && (
                          <div className="bom-row-actions">
                            <button
                              className="bom-act-btn bom-act-btn--edit"
                              onClick={() => isEditing
                                ? onSaveEdit(row.id, inputRef.current?.value ?? desc)
                                : onEditRow(row.id)
                              }
                            >
                              {isEditing ? 'Save' : 'Rename'}
                            </button>
                            <button
                              className="bom-act-btn bom-act-btn--del"
                              onClick={() => onDeleteRow(row.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
