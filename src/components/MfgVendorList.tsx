interface Props {
  onBookVisit: (vendorName: string) => void
  onClose:     () => void
}

const VENDORS = [
  {
    id:            1,
    name:          'TechMach Pvt. Ltd.',
    location:      'Pune, Maharashtra',
    capabilities:  ['CNC Machining', 'Sheet Metal Fab', 'Full Assembly', 'Anodising'],
    score:         94,
    scoreLabel:    'Excellent',
    bestCustomers: ['Tata Motors', 'Bosch India', 'Mahindra'],
    domain:        'Precision Engineering',
    tag:           'Strenth #1 Pick',
    featured:      true,
  },
  {
    id:            2,
    name:          'PCB Power India',
    location:      'Bengaluru, Karnataka',
    capabilities:  ['PCB Fabrication', 'SMT Assembly', 'Box Build'],
    score:         89,
    scoreLabel:    'Very Good',
    bestCustomers: ['Wipro GE', 'Honeywell India', 'DRDO'],
    domain:        'Electronics Manufacturing',
    tag:           'Strenth #2 Pick',
    featured:      false,
  },
  {
    id:            3,
    name:          'Bharat Precision Works',
    location:      'Chennai, Tamil Nadu',
    capabilities:  ['CNC Turning', 'Gear Hobbing', 'Heat Treatment'],
    score:         91,
    scoreLabel:    'Excellent',
    bestCustomers: ['Lucas TVS', 'Sundaram Clayton', 'Ashok Leyland'],
    domain:        'Automotive Components',
    tag:           'Strenth #3 Pick',
    featured:      false,
  },
  {
    id:            4,
    name:          'IndoForge Components',
    location:      'Rajkot, Gujarat',
    capabilities:  ['Die Casting', 'Investment Casting', 'CNC Milling', 'Surface Grinding'],
    score:         87,
    scoreLabel:    'Very Good',
    bestCustomers: ['Larsen & Toubro', 'Kirloskar Brothers', 'ONGC'],
    domain:        'Metal Casting & Forging',
    tag:           'Strenth #4 Pick',
    featured:      false,
  },
  {
    id:            5,
    name:          'Nexus Plastomech',
    location:      'Noida, Uttar Pradesh',
    capabilities:  ['Injection Moulding', 'Blow Moulding', 'Tooling & Fixtures', 'Painting'],
    score:         85,
    scoreLabel:    'Good',
    bestCustomers: ['Maruti Suzuki', 'Hero MotoCorp', 'Havells India'],
    domain:        'Plastics & Polymer Parts',
    tag:           'Strenth #5 Pick',
    featured:      false,
  },
]

export default function MfgVendorList({ onBookVisit, onClose }: Props) {
  return (
    <div className="mfg-vl">

      {/* ── Header ── */}
      <div className="qv-header">
        <div className="qv-header__left">
          <button className="bom-close-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
            <span>Close</span>
          </button>
          <div className="qv-icon" style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div>
            <div className="qv-title">AI-Recommended Vendor List</div>
            <div className="qv-subtitle">
              <span className="qv-saving-badge" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                5 vendors shortlisted
              </span>
              <span className="qv-saving-badge" style={{ marginLeft: 6, background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' }}>
                Matched to your BOM profile
              </span>
            </div>
          </div>
        </div>
        <div className="qv-header__right">
          <button className="cb-dl-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Download List
          </button>
        </div>
      </div>

      {/* ── Vendor Cards — vertical stack, horizontal layout inside ── */}
      <div className="mfg-vl__list">
        {VENDORS.map((v, idx) => (
          <div key={v.id} className={`mfg-vc${v.featured ? ' mfg-vc--featured' : ''}`}>

            {/* Score column */}
            <div className="mfg-vc__col-score">
              <div className="mfg-vc__pick-tag">{v.tag}</div>
              {v.featured && (
                <div className="mfg-vc__rec-badge">
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/>
                  </svg>
                  Recommended
                </div>
              )}
              <div className="mfg-vc__score-num">{v.score}</div>
              <div className="mfg-vc__score-sub">/100 · {v.scoreLabel}</div>
            </div>

            {/* Info column */}
            <div className="mfg-vc__col-info">
              <div className="mfg-vc__name">{v.name}</div>
              <div className="mfg-vc__domain">{v.domain}</div>
              <div className="mfg-vc__loc">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {v.location}
              </div>
            </div>

            {/* Capabilities column */}
            <div className="mfg-vc__col-cap">
              <div className="mfg-vc__col-lbl">Capabilities</div>
              <div className="mfg-vc__tags">
                {v.capabilities.map(c => (
                  <span key={c} className="mfg-vc__cap">{c}</span>
                ))}
              </div>
            </div>

            {/* Customers column */}
            <div className="mfg-vc__col-cust">
              <div className="mfg-vc__col-lbl">Best Customers</div>
              <div className="mfg-vc__customers">
                {v.bestCustomers.map(c => (
                  <span key={c} className="mfg-vc__customer">{c}</span>
                ))}
              </div>
            </div>

            {/* CTA column */}
            <div className="mfg-vc__col-cta">
              <button
                className={`mfg-vc__cta${idx === 0 ? ' mfg-vc__cta--active' : ' mfg-vc__cta--dim'}`}
                onClick={() => onBookVisit(v.name)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8"  y1="2" x2="8"  y2="6"/>
                  <line x1="3"  y1="10" x2="21" y2="10"/>
                </svg>
                Book Factory Visit
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  )
}
