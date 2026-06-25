import { useEffect, useRef, useState } from 'react'
import { ChatMessage } from '../types'
import { PaperclipIcon, MicIcon, SendIcon } from './Icons'

interface Props {
  messages:          ChatMessage[]
  onAction:          () => void
  onChatAction?:     (key: string) => void
  onFormSubmit?:     (formType: string) => void
  onUserMessage?:    (text: string) => void
  agentName?:        string
  atAgentsEnabled?:  boolean
}

/* ── @mention agent list ── */
const AT_AGENTS = [
  { key: 'agent-dfm',          icon: '🔬', bg: '#f5f3ff', color: '#7c3aed', name: 'DFM Agent',          desc: 'Manufacturability analysis & design flagging', tag: 'Live' },
  { key: 'cost-start-yes',     icon: '📊', bg: '#f0fdf4', color: '#059669', name: 'Cost Benchmarking',  desc: 'Live market prices with BCD landed cost',        tag: 'Live' },
  { key: 'agent-sourcing',     icon: '📦', bg: '#eff6ff', color: '#2563eb', name: 'Sourcing Agent',     desc: 'RFQs & vendor quotes — 15–20% savings',          tag: 'Live' },
  { key: 'agent-manufacturing', icon: '🏭', bg: '#fef3c7', color: '#d97706', name: 'Manufacturing Agent', desc: 'Production planning & capacity scheduling',      tag: 'Live' },
] as const

/* ── Upload icon ── */
const UploadArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

/* ── XLS badge icon ── */
const XlsBadge = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

/* ── DFM Product detail form ── */
const MATERIALS = [
  'Plastics', 'Metal', 'Sheet Metal', 'PCB fab', 'Cable Harness', 'Painting / Post Processing',
]

function DFMForm({ onSubmit }: { onSubmit: () => void }) {
  const [selectedMats, setSelectedMats] = useState<string[]>([])

  const toggle = (m: string) =>
    setSelectedMats(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  return (
    <div className="dfm-form">
      <div className="dfm-form__title">🔬 What product are you building?</div>

      <input
        className="dfm-form__input"
        type="text"
        placeholder="e.g. Electric Skateboard Controller, Drone Body…"
      />

      <div className="dfm-form__row">
        <div className="dfm-form__field">
          <label className="dfm-form__label">Budget ($)</label>
          <input className="dfm-form__input dfm-form__input--sm" type="number" placeholder="e.g. 500000" />
        </div>
        <div className="dfm-form__field">
          <label className="dfm-form__label">Volume (pcs/year)</label>
          <input className="dfm-form__input dfm-form__input--sm" type="number" placeholder="e.g. 10000" />
        </div>
        <div className="dfm-form__field">
          <label className="dfm-form__label">Weight target (g)</label>
          <input className="dfm-form__input dfm-form__input--sm" type="number" placeholder="e.g. 850" />
        </div>
      </div>

      <div className="dfm-form__label" style={{ marginTop: 10 }}>Material (select all that apply)</div>
      <div className="dfm-form__mats">
        {MATERIALS.map(m => (
          <button
            key={m}
            type="button"
            className={`dfm-mat-chip${selectedMats.includes(m) ? ' dfm-mat-chip--on' : ''}`}
            onClick={() => toggle(m)}
          >
            {selectedMats.includes(m) && <span className="dfm-mat-chip__check">✓</span>}
            {m}
          </button>
        ))}
      </div>

      <button className="dfm-form__submit" onClick={onSubmit}>
        Start DFM Analysis
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
          <line x1="3" y1="8" x2="13" y2="8"/>
          <polyline points="9,4 13,8 9,12"/>
        </svg>
      </button>
    </div>
  )
}

/* ── CM Onboard Form ── */
function CmOnboardForm({ onSubmit }: { onSubmit: () => void }) {
  const [email,     setEmail]     = useState('')
  const [expertise, setExpertise] = useState('')
  const [contact,   setContact]   = useState('')
  return (
    <div className="dfm-form">
      <div className="dfm-form__title">🏭 Your Contract Manufacturer Details</div>
      <input
        className="dfm-form__input"
        type="email"
        placeholder="CM email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <div className="dfm-form__row">
        <div className="dfm-form__field">
          <label className="dfm-form__label">Expertise</label>
          <select
            className="dfm-form__input dfm-form__input--sm"
            value={expertise}
            onChange={e => setExpertise(e.target.value)}
          >
            <option value="">Select expertise…</option>
            <option>CNC Machining</option>
            <option>PCB Fabrication</option>
            <option>Sheet Metal</option>
            <option>Full Assembly</option>
            <option>Injection Moulding</option>
            <option>Winding &amp; Assembly</option>
          </select>
        </div>
        <div className="dfm-form__field">
          <label className="dfm-form__label">Contact Number</label>
          <input
            className="dfm-form__input dfm-form__input--sm"
            type="tel"
            placeholder="+91 98xxx xxxxx"
            value={contact}
            onChange={e => setContact(e.target.value)}
          />
        </div>
      </div>
      <button className="dfm-form__submit" onClick={onSubmit}>
        Connect CM
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
          <line x1="3" y1="8" x2="13" y2="8"/>
          <polyline points="9,4 13,8 9,12"/>
        </svg>
      </button>
    </div>
  )
}

/* Strenth agent avatar — gradient circle matching design */
const AgentAvatar = () => (
  <div className="chat-av">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      {/* robot face */}
      <rect x="3" y="5"  width="14" height="10" rx="3"  fill="rgba(255,255,255,0.15)" />
      <rect x="3" y="5"  width="14" height="10" rx="3"  stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <circle cx="7.5"  cy="10" r="1.5" fill="white" />
      <circle cx="12.5" cy="10" r="1.5" fill="white" />
      <rect x="8.5" y="13" width="3"   height="1"   rx=".5" fill="rgba(255,255,255,0.7)" />
      <rect x="8.5" y="2"  width="3"   height="3"   rx="1"  fill="rgba(255,255,255,0.5)" />
      <rect x="1"   y="8"  width="2"   height="4"   rx="1"  fill="rgba(255,255,255,0.4)" />
      <rect x="17"  y="8"  width="2"   height="4"   rx="1"  fill="rgba(255,255,255,0.4)" />
    </svg>
  </div>
)

export default function ChatPanel({ messages, onAction, onChatAction, onFormSubmit, onUserMessage, agentName = 'Strenth AI Agent', atAgentsEnabled = false }: Props) {
  const listRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [inputVal,    setInputVal]    = useState('')
  const [showAtMenu,  setShowAtMenu]  = useState(false)
  const [atFilter,    setAtFilter]    = useState('')
  const [atHighlight, setAtHighlight] = useState(0)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  /* ── @mention is disabled when a form card is actively shown in the last message ── */
  const lastMsg      = messages[messages.length - 1]
  const hasActiveForm = !!(lastMsg?.form)
  const atEnabled     = atAgentsEnabled && !hasActiveForm

  /* ── @mention input logic ── */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputVal(val)
    if (!atEnabled) { setShowAtMenu(false); return }
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1)
      if (!after.includes(' ')) {
        setAtFilter(after.toLowerCase())
        setAtHighlight(0)
        setShowAtMenu(true)
        return
      }
    }
    setShowAtMenu(false)
  }

  const filteredAgents = AT_AGENTS.filter(a =>
    a.name.toLowerCase().includes(atFilter) || a.desc.toLowerCase().includes(atFilter)
  )

  const selectAtAgent = (key: string, name: string) => {
    setInputVal('')
    setShowAtMenu(false)
    onUserMessage?.(`@${name}`)
    onChatAction?.(key)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAtMenu) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtHighlight(v => Math.min(v + 1, filteredAgents.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtHighlight(v => Math.max(v - 1, 0))
    } else if (e.key === 'Enter' && filteredAgents[atHighlight]) {
      e.preventDefault()
      selectAtAgent(filteredAgents[atHighlight].key, filteredAgents[atHighlight].name)
    } else if (e.key === 'Escape') {
      setShowAtMenu(false)
    }
  }

  const handleInputBlur = () => {
    /* delay so click on menu item fires before blur hides it */
    setTimeout(() => setShowAtMenu(false), 160)
  }

  return (
    <div className="chat-panel">

      {/* ── Header ── */}
      <div className="chat-head">
        <div className="chat-head__title">
          <span className="chat-head__dot" />
          {agentName}
        </div>
        <div className="chat-head__sub">Active</div>
      </div>

      {/* ── Message stream ── */}
      <div className="chat-msgs" ref={listRef}>
        <div className="chat-date">Wed 8:21 AM</div>

        {messages.map(msg => (
          <div key={msg.id} className={`chat-entry${msg.sender === 'user' ? ' chat-entry--user' : ''}`}>

            {/* User bubble */}
            {msg.sender === 'user' ? (
              <div className="chat-row chat-row--user">
                <div className="chat-bubble chat-bubble--user">{msg.html}</div>
              </div>
            ) : (
              /* Agent row: avatar + bubble */
              <div className="chat-row">
                <AgentAvatar />
                <div
                  className="chat-bubble"
                  dangerouslySetInnerHTML={{ __html: msg.html }}
                />
              </div>
            )}

            {/* Gemini-style chip action buttons */}
            {msg.actions && (
              <div className="chat-chips">
                {msg.actions.map(a => (
                  <button
                    key={a.label}
                    className={`chip-btn chip-btn--${a.variant}`}
                    onClick={() => {
                      onUserMessage?.(a.label)
                      if (a.key && onChatAction) onChatAction(a.key)
                      else if (a.variant === 'primary') onAction()
                    }}
                  >
                    {a.variant === 'primary' && !a.key && (
                      <span className="chip-btn__icon">
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
                          <polyline points="5,6 8,3 11,6"/>
                          <line x1="8" y1="3" x2="8" y2="11"/>
                        </svg>
                      </span>
                    )}
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Agent selection cards ── */}
            {msg.form === 'agent-select' && (
              <div className="chat-agent-grid">
                {[
                  { key: 'agent-dfm',           icon: '🔬', color: '#7c3aed', bg: '#f3f0ff', name: 'DFM Agent',               tag: 'Live', desc: 'Manufacturability analysis & design flagging' },
                  { key: 'cost-start-yes',       icon: '📊', color: '#059669', bg: '#dcfce7', name: 'Cost Benchmarking',         tag: 'Live', desc: 'Live market prices with BCD landed cost'    },
                  { key: 'agent-sourcing',       icon: '📦', color: '#2563eb', bg: '#dbeafe', name: 'Sourcing Agent',            tag: 'Live', desc: 'RFQs & vendor quotes — 15–20% savings'     },
                  { key: 'agent-manufacturing',  icon: '🏭', color: '#d97706', bg: '#fef3c7', name: 'Manufacturing Agent',       tag: 'Live', desc: 'Production planning & capacity scheduling' },
                ].map(a => (
                  <button
                    key={a.key}
                    className="chat-agent-card"
                    onClick={() => { onUserMessage?.(a.name); onChatAction?.(a.key) }}
                  >
                    <div className="chat-agent-icon-wrap" style={{ background: a.bg }}>
                      <span className="chat-agent-emoji">{a.icon}</span>
                    </div>
                    <div className="chat-agent-body">
                      <div className="chat-agent-row">
                        <span className="chat-agent-name">{a.name}</span>
                        <span
                          className="chat-agent-tag"
                          style={{
                            background: a.tag === 'Live' ? '#dcfce7' : '#f3f4f6',
                            color:      a.tag === 'Live' ? '#15803d' : '#6b7280',
                          }}
                        >{a.tag}</span>
                      </div>
                      <span className="chat-agent-desc">{a.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── DFM Product Detail Form ── */}
            {msg.form === 'dfm-form' && (
              <DFMForm onSubmit={() => { onUserMessage?.('Start DFM Analysis'); onFormSubmit?.('dfm-form') }} />
            )}

            {/* ── CM Onboard Form ── */}
            {msg.form === 'cm-onboard' && (
              <CmOnboardForm onSubmit={() => { onUserMessage?.('Connect CM'); onFormSubmit?.('cm-onboard') }} />
            )}

            {/* Inline quantity + upload form */}
            {msg.form === 'quantity-upload' && (
              <div className="chat-form">
                <label className="chat-form-label">What is the target quantity?</label>
                <input
                  type="number"
                  className="chat-form-qty"
                  placeholder="e.g. 10,000 pcs / year"
                  min="1"
                />
                <label className="chat-form-label">Target BOM cost ($)</label>
                <input
                  type="number"
                  className="chat-form-qty"
                  placeholder="e.g. $ 2,500"
                  min="0"
                />
                <label className="chat-upload-btn">
                  <XlsBadge />
                  Upload Excel Custom / Standard Parts Classification
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={() => {}} />
                </label>
                <button className="chat-form-submit" onClick={() => { onUserMessage?.('Submit'); onFormSubmit?.('quantity-upload') }}>
                  Submit
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 5 }}>
                    <line x1="3" y1="8" x2="13" y2="8"/>
                    <polyline points="9,4 13,8 9,12"/>
                  </svg>
                </button>
              </div>
            )}

          </div>
        ))}
      </div>

      {/* ── @mention popup — normal flow, sits above pill in chat-bar ── */}
      {showAtMenu && filteredAgents.length > 0 && (
        <div className="at-menu">
          <div className="at-menu__header">Agents</div>
          {filteredAgents.map((a, i) => (
            <button
              key={a.key}
              className={`at-menu__item${i === atHighlight ? ' at-menu__item--hi' : ''}`}
              onMouseDown={e => { e.preventDefault(); selectAtAgent(a.key, a.name) }}
              onMouseEnter={() => setAtHighlight(i)}
            >
              <span className="at-menu__icon" style={{ background: a.bg }}>{a.icon}</span>
              <div className="at-menu__body">
                <div className="at-menu__name">
                  {a.name}
                  <span
                    className="at-menu__tag"
                    style={{
                      background: a.tag === 'Live' ? '#dcfce7' : '#f3f4f6',
                      color:      a.tag === 'Live' ? '#15803d' : '#9ca3af',
                    }}
                  >{a.tag}</span>
                </div>
                <div className="at-menu__desc">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Gemini-style pill input ── */}
      <div className="chat-bar">

        <div className="chat-pill">
          {/* Left: attach */}
          <button className="chat-pill__btn" title="Attach files" onClick={onAction}>
            <PaperclipIcon />
          </button>

          {/* Centre: text input */}
          <input
            ref={inputRef}
            className="chat-pill__input"
            type="text"
            value={inputVal}
            placeholder={atEnabled ? 'Type @ to mention an agent…' : 'Type your message here…'}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
          />

          {/* Right group: mic + send */}
          <div className="chat-pill__actions">
            <button className="chat-pill__btn" title="Voice input">
              <MicIcon />
            </button>
            <button className="chat-pill__send" title="Send">
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
