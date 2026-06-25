import { useState, useRef } from 'react'
import { AppState } from '../types'
import type { AuthUser } from '../auth'
import { MECHANICAL_FILES, ELECTRICAL_FILES } from '../data/mockData'
import {
  LogoDots, GridIcon, PlusIcon, DocIcon,
  UploadIcon, GearIcon, FolderIcon,
} from './Icons'

const MECH_EXTS = new Set(['.step', '.stp', '.dxf', '.dwg', '.iges', '.igs', '.stl', '.f3d', '.obj'])

function splitFiles(files: File[]): { mech: string[]; elec: string[] } {
  const mech: string[] = []
  const elec: string[] = []
  for (const f of files) {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (MECH_EXTS.has(ext)) mech.push(f.name)
    else elec.push(f.name)
  }
  return { mech, elec }
}

interface Props {
  open:                   boolean
  onToggle:               () => void
  appState:               AppState
  user?:                  AuthUser
  onSignOut?:             () => void
  uploadedFiles?:         File[]
  uploadedFileName?:      string
  onFileSelect?:          () => void
  onBomFileSelect?:       () => void
  onCostFileSelect?:      () => void
  onOrderFileSelect?:     () => void
  onMfgOrderFileSelect?:  () => void
  onDfmAgentSelect?:      () => void
  onSourcingAgentSelect?: () => void
  onMfgAgentSelect?:      () => void
  onDemAgentSelect?:      () => void
  orderPlaced?:           boolean
  mfgOrderPlaced?:        boolean
  dfmReady?:              boolean
  costStarted?:           boolean
  mfgStarted?:            boolean
  demStarted?:            boolean
}

export default function Sidebar({
  open, onToggle, appState,
  onFileSelect, onBomFileSelect, onCostFileSelect, onOrderFileSelect, onMfgOrderFileSelect,
  onDfmAgentSelect, onSourcingAgentSelect, onMfgAgentSelect, onDemAgentSelect,
  orderPlaced, mfgOrderPlaced, dfmReady, costStarted, mfgStarted, demStarted,
  user, onSignOut,
  uploadedFiles, uploadedFileName,
}: Props) {
  const [treeExpanded, setTreeExpanded] = useState(true)
  const [mechOpen,     setMechOpen]     = useState(true)
  const [elecOpen,     setElecOpen]     = useState(true)
  const [bomOpen,      setBomOpen]      = useState(true)

  /* ── Hover-peek ── */
  const [hoverOpen, setHoverOpen] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    if (!open) setHoverOpen(true)
  }
  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => setHoverOpen(false), 120)
  }

  const panelVisible = open || hoverOpen
  const showProject  = appState !== 'upload'
  const showTree     = appState === 'organized'
    || appState === 'bom-parsing'     || appState === 'bom-complete'    || appState === 'bom-classifying'
    || appState === 'cost-processing' || appState === 'cost-complete'
    || appState === 'sourcing-rfq'    || appState === 'rfq-tracking'    || appState === 'quotes-received'
    || appState === 'payment-success'
    || appState === 'dfm-analyzing'   || appState === 'dfm-complete'
    || appState === 'mfg-planning'    || appState === 'mfg-complete'    || appState === 'mfg-rfq'    || appState === 'mfg-quotes'    || appState === 'mfg-vendor-list'   || appState === 'mfg-order-preview'

  const showBomFolder = appState === 'bom-parsing'     || appState === 'bom-complete'    || appState === 'bom-classifying'
    || appState === 'cost-processing' || appState === 'cost-complete'
    || appState === 'sourcing-rfq'    || appState === 'rfq-tracking'    || appState === 'quotes-received'
    || appState === 'payment-success'
    || appState === 'dfm-analyzing'   || appState === 'dfm-complete'
    || appState === 'mfg-planning'    || appState === 'mfg-complete'    || appState === 'mfg-rfq'    || appState === 'mfg-quotes'    || appState === 'mfg-vendor-list'   || appState === 'mfg-order-preview'

  const showCostFile  = appState === 'cost-complete' || appState === 'payment-success'

  /* ── Which AI agents to show ── */
  const showAgentsSection = showBomFolder            /* appears from bom-parsing onwards */
  const showDfmAgent      = appState === 'dfm-analyzing' || appState === 'dfm-complete'
  const showCostAgent     = !!costStarted
  const showSourcingAgent = appState === 'sourcing-rfq' || appState === 'rfq-tracking' || appState === 'quotes-received'
  const showMfgAgent      = !!mfgStarted
  const showDemAgent      = !!demStarted

  /* ── Agent statuses ── */
  const bomStatus =
    (appState === 'bom-parsing' || appState === 'bom-complete') ? 'active' : 'done'

  const dfmStatus =
    appState === 'dfm-analyzing' ? 'active' : 'done'

  const costStatus =
    appState === 'cost-processing' ? 'active' : 'done'

  const sourcingStatus =
    (appState === 'sourcing-rfq' || appState === 'rfq-tracking') ? 'active' : 'done'

  const mfgStatus =
    appState === 'mfg-planning' ? 'active' : 'done'

  const demStatus =
    appState === 'dem-assessing' ? 'active'
    : (appState === 'dem-cm-rfq' || appState === 'dem-factory' || appState === 'dem-scheduling' || appState === 'dem-ai-scoring') ? 'active'
    : 'done'

  /* helper for status pill */
  const StatusPill = ({ s }: { s: 'active' | 'done' | 'pending' }) => (
    <span className={`sb-ai-status sb-ai-status--${s}`}>
      {s === 'active' ? 'Running' : s === 'done' ? 'Done' : 'Pending'}
    </span>
  )

  return (
    <aside
      className="sidebar"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ alignItems: 'stretch' }}
    >

      {/* ── Icon Strip ── */}
      <div className="sb-strip">
        <div className="sb-strip__top">
          <button className="sb-strip__logo-btn" onClick={onToggle}
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}>
            <LogoDots />
          </button>
          <nav className="sb-strip__nav">
            <button className="sb-icon sb-icon--active" title="Dashboard"><GridIcon /></button>
            <button className="sb-icon" title="New">      <PlusIcon />   </button>
            <button className="sb-icon" title="Files">    <DocIcon />    </button>
            <button className="sb-icon" title="Upload">   <UploadIcon /> </button>
            <button className="sb-icon" title="Settings"> <GearIcon />   </button>
          </nav>
        </div>
        <div className="sb-strip__bottom">
          <div className="sb-avatar" title={user?.name ?? 'User'}>
            {user ? user.name.slice(0, 2).toUpperCase() : 'U'}
          </div>
        </div>
      </div>

      {/* ── Content Panel ── */}
      <div className={`sb-panel${panelVisible ? ' sb-panel--open' : ''}`}>

        <div className="sb-panel__head">
          <span className="sb-brand">strenth.ai</span>
          <span className="sb-tagline">Connected Manufacturing</span>
        </div>

        <div className="sb-panel__body">
          <button className="sb-new-proj">
            <span className="sb-new-proj__plus">+</span>
            <span>New Project</span>
          </button>

          {/* ══ Project + File Tree ══ */}
          {showProject && (
            <div className="sb-project">
              <button className="sb-proj-row" onClick={() => setTreeExpanded(v => !v)}>
                <span className={`sb-proj-chev${treeExpanded && showTree ? ' open' : ''}`}>›</span>
                <span className="sb-proj-name">Project Strenth.ai</span>
                {dfmReady ? (
                  <span className="sb-badge sb-badge--mfg">
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/>
                    </svg>
                    Mfg. Ready
                  </span>
                ) : (
                  <span className="sb-badge">Active</span>
                )}
              </button>

              {showTree && treeExpanded && (
                <div className="sb-tree">

                  {/* ── Mechanical folder ── */}
                  {(() => {
                    const mechFiles = uploadedFiles && uploadedFiles.length > 0
                      ? splitFiles(uploadedFiles).mech
                      : MECHANICAL_FILES
                    return mechFiles.length > 0 ? (
                      <>
                        <div className="sb-folder sb-folder--toggle" onClick={() => setMechOpen(v => !v)}>
                          <span className={`sb-folder__chev${mechOpen ? ' open' : ''}`}>›</span>
                          <FolderIcon />
                          <span>Mechanical</span>
                        </div>
                        {mechOpen && mechFiles.map(f => (
                          <div key={f} className="sb-file" onClick={onFileSelect}>› {f}</div>
                        ))}
                      </>
                    ) : null
                  })()}

                  {/* ── Electronics folder ── */}
                  {(() => {
                    const elecFiles = uploadedFiles && uploadedFiles.length > 0
                      ? splitFiles(uploadedFiles).elec
                      : ELECTRICAL_FILES
                    return elecFiles.length > 0 ? (
                      <>
                        <div className="sb-folder sb-folder--gap sb-folder--toggle" onClick={() => setElecOpen(v => !v)}>
                          <span className={`sb-folder__chev${elecOpen ? ' open' : ''}`}>›</span>
                          <FolderIcon />
                          <span>Electronics</span>
                        </div>
                        {elecOpen && elecFiles.map(f => (
                          <div key={f} className="sb-file" onClick={onFileSelect}>› {f}</div>
                        ))}
                      </>
                    ) : null
                  })()}

                  {/* ── BOM Files folder ── */}
                  {showBomFolder && (
                    <>
                      <div className="sb-folder sb-folder--gap sb-folder--bom sb-folder--toggle"
                           onClick={() => setBomOpen(v => !v)}>
                        <span className={`sb-folder__chev${bomOpen ? ' open' : ''}`}>›</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <line x1="3" y1="9"  x2="21" y2="9"/>
                          <line x1="3" y1="15" x2="21" y2="15"/>
                          <line x1="9" y1="3"  x2="9"  y2="21"/>
                          <line x1="15" y1="3" x2="15" y2="21"/>
                        </svg>
                        <span>BOM Files</span>
                      </div>

                      {bomOpen && (
                        <>
                          <div className="sb-file sb-file--bom" onClick={onBomFileSelect}
                               title={`${uploadedFileName || 'BOM'} — Parsed BOM`}>
                            <span className="sb-file__dot sb-file__dot--green"/>
                            {uploadedFileName || 'BOM file'}
                          </div>

                          {showCostFile && (
                            <div className="sb-file sb-file--cost" onClick={onCostFileSelect}
                                 title="Cost_Benchmark_v1.xlsx — Cost Benchmarking Report">
                              <span className="sb-file__dot sb-file__dot--blue"/>
                              Cost_Benchmark_v1.xlsx
                            </div>
                          )}

                          {orderPlaced && (
                            <>
                              <div className="sb-folder sb-folder--gap sb-folder--order">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                                  <polyline points="12 11 12 17"/><polyline points="9 14 12 17 15 14"/>
                                </svg>
                                <span>Order History</span>
                              </div>
                              <div className="sb-file sb-file--order"
                                   title="ORD-20260528-0042 — Confirmed · Click to view"
                                   onClick={onOrderFileSelect}>
                                <span className="sb-file__dot sb-file__dot--green"/>
                                ORD-20260528-0042.pdf
                              </div>
                            </>
                          )}

                          {mfgOrderPlaced && (
                            <>
                              <div className="sb-folder sb-folder--gap sb-folder--mfg-order">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                                  <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                                  <line x1="12" y1="12" x2="12" y2="16"/>
                                  <line x1="10" y1="14" x2="14" y2="14"/>
                                </svg>
                                <span>Mfg. Orders</span>
                              </div>
                              <div className="sb-file sb-file--mfg-order"
                                   title="ORD-MFG-2026-0042 — Confirmed · Click to view"
                                   onClick={onMfgOrderFileSelect}>
                                <span className="sb-file__dot sb-file__dot--amber"/>
                                ORD-MFG-2026-0042.pdf
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                </div>
              )}
            </div>
          )}

          {/* ══ AI Agent section — always visible from BOM parsing onwards ══ */}
          {showAgentsSection && (
            <div className="sb-agents-section">

              {/* Section header */}
              <div className="sb-agents-hd">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="8" width="18" height="11" rx="3"/>
                  <circle cx="8.5"  cy="13.5" r="1.5"/>
                  <circle cx="15.5" cy="13.5" r="1.5"/>
                  <path d="M9 19v2M15 19v2"/>
                  <path d="M8 8V5a4 4 0 018 0v3"/>
                </svg>
                <span>AI Agent</span>
              </div>

              {/* BOM Parsing — always shown in this section */}
              <div
                className={`sb-ai-row${bomStatus === 'active' ? ' sb-ai-row--active' : ''}`}
                onClick={onBomFileSelect}
                title="BOM Parsing Agent"
              >
                <span className={`sb-ai-dot sb-ai-dot--green${bomStatus === 'active' ? ' sb-ai-dot--pulse' : ''}`}/>
                <span className="sb-ai-icon">📋</span>
                <span className={`sb-ai-name sb-ai-name--${bomStatus}`}>BOM Parsing</span>
                <StatusPill s={bomStatus} />
              </div>

              {/* Cost Benchmarking */}
              {showCostAgent && (
                <div
                  className={`sb-ai-row${costStatus === 'active' ? ' sb-ai-row--active' : ''}`}
                  onClick={onCostFileSelect}
                  title="Cost Benchmarking Agent"
                >
                  <span className={`sb-ai-dot sb-ai-dot--blue${costStatus === 'active' ? ' sb-ai-dot--pulse' : ''}`}/>
                  <span className="sb-ai-icon">📊</span>
                  <span className={`sb-ai-name sb-ai-name--${costStatus}`}>Cost Benchmarking</span>
                  <StatusPill s={costStatus} />
                </div>
              )}

              {/* Sourcing Agent */}
              {showSourcingAgent && (
                <div
                  className={`sb-ai-row${sourcingStatus === 'active' ? ' sb-ai-row--active' : ''}`}
                  onClick={onSourcingAgentSelect}
                  title="Sourcing Agent"
                >
                  <span className={`sb-ai-dot sb-ai-dot--teal${sourcingStatus === 'active' ? ' sb-ai-dot--pulse' : ''}`}/>
                  <span className="sb-ai-icon">📦</span>
                  <span className={`sb-ai-name sb-ai-name--${sourcingStatus}`}>Sourcing</span>
                  <StatusPill s={sourcingStatus} />
                </div>
              )}

              {/* DFM Agent */}
              {showDfmAgent && (
                <div
                  className={`sb-ai-row${dfmStatus === 'active' ? ' sb-ai-row--active' : ''}`}
                  onClick={onDfmAgentSelect}
                  title="DFM Agent"
                >
                  <span className={`sb-ai-dot sb-ai-dot--purple${dfmStatus === 'active' ? ' sb-ai-dot--pulse' : ''}`}/>
                  <span className="sb-ai-icon">🔬</span>
                  <span className={`sb-ai-name sb-ai-name--${dfmStatus}`}>DFM Analysis</span>
                  <StatusPill s={dfmStatus} />
                </div>
              )}

              {/* Manufacturing Agent */}
              {showMfgAgent && (
                <div
                  className={`sb-ai-row${mfgStatus === 'active' ? ' sb-ai-row--active' : ''}`}
                  onClick={onMfgAgentSelect}
                  title="Manufacturing Agent"
                >
                  <span className={`sb-ai-dot sb-ai-dot--amber${mfgStatus === 'active' ? ' sb-ai-dot--pulse' : ''}`}/>
                  <span className="sb-ai-icon">🏭</span>
                  <span className={`sb-ai-name sb-ai-name--${mfgStatus}`}>Manufacturing</span>
                  <StatusPill s={mfgStatus} />
                </div>
              )}


            </div>
          )}

        </div>

        <div className="sb-panel__foot">
          <div className="sb-user">
            <span className="sb-user__name">{user?.name ?? 'User'}</span>
            <span className="sb-user__role">{user ? `${user.role === 'admin' ? 'Admin' : 'Member'} · Strenth.ai` : 'Strenth.ai'}</span>
          </div>
          {onSignOut && (
            <button
              className="sb-signout-btn"
              onClick={onSignOut}
              title="Sign out"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
