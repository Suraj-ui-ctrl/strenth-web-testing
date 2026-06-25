import { useState, useRef } from 'react'
import CadSvg from './CadSvg'

interface FileTab {
  id:   number
  name: string
  type: 'step' | 'pdf' | 'dxf'
}

const INITIAL_TABS: FileTab[] = [
  { id: 1, name: 'Enclosure_Top_v2.step',       type: 'step' },
  { id: 2, name: 'Schematic_MainBoard_R4.pdf',  type: 'pdf'  },
  { id: 3, name: 'Motor_Mount_A3.dxf',          type: 'dxf'  },
]

const THUMBS = [
  <svg key={0} width="38" height="32" viewBox="0 0 38 32" fill="none">
    <path d="M19 3L33 10 19 17 5 10Z"  stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" />
    <path d="M33 10L33 20 19 27 19 17Z" stroke="#3b82f6" strokeWidth=".9" fill="#dbeafe" />
    <path d="M5 10L5 20 19 27 19 17Z"  stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" />
  </svg>,
  <svg key={1} width="38" height="32" viewBox="0 0 38 32" fill="none">
    <path d="M19 3L33 10 19 17 5 10Z"  stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" opacity=".5" />
    <path d="M33 10L33 20 19 27 19 17Z" stroke="#3b82f6" strokeWidth=".9" fill="#dbeafe" opacity=".5" />
    <circle cx="28" cy="15" r="6" stroke="#3b82f6" strokeWidth=".9" fill="none" opacity=".7" />
  </svg>,
  <svg key={2} width="38" height="32" viewBox="0 0 38 32" fill="none">
    <rect x="7" y="7" width="24" height="16" rx="1.5" stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" />
    <line x1="7"  y1="13" x2="31" y2="13" stroke="#93c5fd" strokeWidth=".7" />
    <line x1="7"  y1="18" x2="31" y2="18" stroke="#93c5fd" strokeWidth=".7" />
  </svg>,
  <svg key={3} width="38" height="32" viewBox="0 0 38 32" fill="none">
    <path d="M19 4L31 11 19 18 7 11Z"   stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" />
    <path d="M31 11L31 20 19 27 19 18Z" stroke="#3b82f6" strokeWidth=".9" fill="#dbeafe" />
  </svg>,
  <svg key={4} width="38" height="32" viewBox="0 0 38 32" fill="none">
    <circle cx="19" cy="16" r="9" stroke="#3b82f6" strokeWidth=".9" fill="#eff6ff" />
    <circle cx="19" cy="16" r="5" stroke="#3b82f6" strokeWidth=".9" fill="#dbeafe" />
    <circle cx="19" cy="16" r="2" fill="#3b82f6" opacity=".7" />
  </svg>,
]

/* Placeholder views for PDF and DXF tabs */
function PdfPlaceholder({ name }: { name: string }) {
  return (
    <div className="fv-placeholder">
      <svg width="56" height="64" viewBox="0 0 56 64" fill="none">
        <rect x="4" y="4" width="48" height="56" rx="4" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5"/>
        <path d="M36 4v16h16" fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>
        <path d="M36 4l16 16" fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>
        <rect x="12" y="28" width="24" height="2" rx="1" fill="#e5e7eb"/>
        <rect x="12" y="34" width="32" height="2" rx="1" fill="#e5e7eb"/>
        <rect x="12" y="40" width="20" height="2" rx="1" fill="#e5e7eb"/>
        <rect x="12" y="46" width="28" height="2" rx="1" fill="#e5e7eb"/>
        <text x="10" y="22" fontSize="8" fill="#ef4444" fontWeight="700" fontFamily="monospace">PDF</text>
      </svg>
      <div className="fv-placeholder__name">{name}</div>
      <div className="fv-placeholder__sub">PDF document · Preview not available in sandbox</div>
    </div>
  )
}

function DxfPlaceholder({ name }: { name: string }) {
  return (
    <div className="fv-placeholder">
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
        <rect x="20" y="15" width="80" height="60" stroke="#6366f1" strokeWidth="1" fill="none" strokeDasharray="4 2"/>
        <line x1="20" y1="15" x2="100" y2="75" stroke="#c7d2fe" strokeWidth=".8" strokeDasharray="3 3"/>
        <line x1="100" y1="15" x2="20"  y2="75" stroke="#c7d2fe" strokeWidth=".8" strokeDasharray="3 3"/>
        <circle cx="60" cy="45" r="20" stroke="#6366f1" strokeWidth="1" fill="none"/>
        <line x1="10" y1="45" x2="110" y2="45" stroke="#a5b4fc" strokeWidth=".7"/>
        <line x1="60" y1="5"  x2="60"  y2="95" stroke="#a5b4fc" strokeWidth=".7"/>
        <text x="4" y="48" fontSize="7" fill="#6366f1" fontFamily="monospace">Y</text>
        <text x="112" y="48" fontSize="7" fill="#6366f1" fontFamily="monospace">X</text>
      </svg>
      <div className="fv-placeholder__name">{name}</div>
      <div className="fv-placeholder__sub">2D DXF drawing · AutoCAD format</div>
    </div>
  )
}

interface Props {
  onClose?: () => void
}

export default function FileViewer({ onClose }: Props) {
  const [tabs,        setTabs]        = useState<FileTab[]>(INITIAL_TABS)
  const [activeId,    setActiveId]    = useState<number>(1)
  const [activeThumb, setActiveThumb] = useState(0)
  const [zoom,        setZoom]        = useState(100)
  const [rotate,      setRotate]      = useState(0)

  const dragging   = useRef(false)
  const dragOrigin = useRef({ x: 0, rot: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current   = true
    dragOrigin.current = { x: e.clientX, rot: rotate }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    setRotate(dragOrigin.current.rot + (e.clientX - dragOrigin.current.x) * 0.55)
  }
  const onMouseUp = () => { dragging.current = false }

  const resetView = () => { setZoom(100); setRotate(0) }
  const displayDeg = Math.round(((rotate % 360) + 360) % 360)

  const closeTab = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const remaining = tabs.filter(t => t.id !== id)
    if (remaining.length === 0) {
      onClose?.()
      return
    }
    setTabs(remaining)
    if (activeId === id) setActiveId(remaining[0].id)
  }

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0]

  return (
    <div className="file-viewer">

      {/* ── Tab bar ── */}
      <div className="fv-tabs">
        <button className="fv-close-btn" onClick={onClose} title="Close preview">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5"/>
          </svg>
          <span>Close</span>
        </button>

        {tabs.map(t => (
          <button
            key={t.id}
            className={`fv-tab${activeId === t.id ? ' fv-tab--active' : ''}`}
            onClick={() => setActiveId(t.id)}
          >
            <span>{t.name}</span>
            <span
              className="fv-tab__x"
              title="Close tab"
              onClick={e => closeTab(e, t.id)}
            >×</span>
          </button>
        ))}
      </div>

      {/* ── Toolbar (only for 3D/DXF views) ── */}
      {activeTab?.type !== 'pdf' && (
        <div className="fv-toolbar">
          <div className="rotate-ctrl">
            <button className="zoom-btn" title="Rotate CCW 45°" onClick={() => setRotate(r => r - 45)}>↺</button>
            <span className="zoom-val">{displayDeg}°</span>
            <button className="zoom-btn" title="Rotate CW 45°"  onClick={() => setRotate(r => r + 45)}>↻</button>
          </div>
          <div className="fv-toolbar__sep"/>
          <div className="zoom-ctrl">
            <button className="zoom-btn" onClick={() => setZoom(z => Math.max(25,  z - 10))}>−</button>
            <span  className="zoom-val">~{zoom}%</span>
            <button className="zoom-btn" onClick={() => setZoom(z => Math.min(400, z + 10))}>+</button>
          </div>
          <div className="fv-toolbar__spacer"/>
          <button className="zoom-reset" onClick={resetView}>↺ Reset</button>
        </div>
      )}

      {/* ── Main content area ── */}
      {activeTab?.type === 'pdf' ? (
        <PdfPlaceholder name={activeTab.name} />
      ) : activeTab?.type === 'dxf' ? (
        <DxfPlaceholder name={activeTab.name} />
      ) : (
        <div
          className="fv-canvas"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div style={{
            transform: `scale(${zoom / 100}) rotate(${rotate}deg)`,
            transformOrigin: 'center',
            transition: dragging.current ? 'none' : 'transform .18s ease',
          }}>
            <CadSvg />
          </div>
        </div>
      )}

      {/* ── Thumbnail strip (only for STEP view) ── */}
      {activeTab?.type === 'step' && (
        <div className="fv-thumbs">
          {THUMBS.map((svg, i) => (
            <button
              key={i}
              className={`thumb${activeThumb === i ? ' thumb--active' : ''}`}
              onClick={() => setActiveThumb(i)}
            >
              {svg}
            </button>
          ))}
        </div>
      )}

    </div>
  )
}
