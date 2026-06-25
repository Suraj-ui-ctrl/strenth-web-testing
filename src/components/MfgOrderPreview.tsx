interface Props {
  vendorName:          string
  orderPlaced?:        boolean
  negotiatedTotalUSD?: number
  onPlaceOrder:        () => void
  onClose:             () => void
}

const USD = (n: number) => '$' + (n / 83).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const ORDER_LINES = [
  { partNo: 'MCH-001', desc: 'Aluminium Housing — Main Assembly',      qty: 10,  unit: 'pcs',  unitPrice: 18000,  total: 180000 },
  { partNo: 'MCH-002', desc: 'Stainless Steel Bracket — Mounting',     qty: 25,  unit: 'pcs',  unitPrice: 3100,   total: 77500  },
  { partNo: 'MCH-004', desc: 'Precision Gear Set — 1:4 Ratio',         qty: 5,   unit: 'sets', unitPrice: 14000,  total: 70000  },
  { partNo: 'MCH-005', desc: 'Drive Shaft — 12mm dia, 250mm L',        qty: 5,   unit: 'pcs',  unitPrice: 17800,  total: 89000  },
  { partNo: 'ELC-001', desc: 'Control PCB — Motor Driver (4-layer)',    qty: 10,  unit: 'pcs',  unitPrice: 30000,  total: 300000 },
  { partNo: 'ELC-003', desc: '24V DC Power Transformer — 5A',           qty: 4,   unit: 'pcs',  unitPrice: 40000,  total: 160000 },
  { partNo: 'ELC-005', desc: 'BLDC Motor Controller IC — TMC2209',     qty: 10,  unit: 'pcs',  unitPrice: 600,    total: 6000   },
  { partNo: 'ELC-006', desc: 'USB Type-C Connector — SMD Vertical',    qty: 5,   unit: 'pcs',  unitPrice: 120,    total: 600    },
  { partNo: 'MCH-003', desc: 'M5×20 SS Hex Socket Head Bolt + Nut',   qty: 50,  unit: 'sets', unitPrice: 27,     total: 1350   },
  { partNo: 'CBL-001', desc: 'Nylon Cable Tie — 200mm × 4.8mm',        qty: 100, unit: 'pcs',  unitPrice: 4,      total: 400    },
  { partNo: 'ELC-007', desc: '10µF 50V Electrolytic Capacitor',         qty: 100, unit: 'pcs',  unitPrice: 7,      total: 700    },
]

const GRAND_TOTAL = ORDER_LINES.reduce((s, r) => s + r.total, 0)
export const MFG_GRAND_TOTAL_INR = GRAND_TOTAL

const TODAY    = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
const DELIVERY = new Date(Date.now() + 25 * 86400000).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
const ORDER_NO = 'ORD-MFG-2026-0042'

const TC = [
  'Payment Terms: 30% advance payment due within 7 days of PO confirmation. Remaining 70% payable upon delivery and acceptance of goods.',
  'Delivery: Vendor shall deliver all line items within 25 working days from the date of this Purchase Order. Delays exceeding 5 days require written notice.',
  'Quality Inspection: All parts are subject to incoming quality inspection by Strenth.ai. Non-conforming items will be returned at the vendor\'s cost and must be replaced within 10 working days.',
  'Warranty: Vendor guarantees all supplied goods against manufacturing defects for a period of 12 months from the date of delivery.',
  'Intellectual Property: All designs, drawings and specifications provided by Strenth.ai remain the exclusive property of Strenth.ai and shall not be shared or reproduced.',
  'Cancellation: Purchase orders may be cancelled by the buyer within 24 hours of placement without penalty. Cancellations thereafter are subject to a 10% restocking/cancellation fee.',
  'Confidentiality: Both parties agree to keep the terms of this PO and all project details strictly confidential.',
  'Governing Law: This agreement shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Bengaluru, Karnataka.',
]

export default function MfgOrderPreview({ vendorName, orderPlaced, negotiatedTotalUSD, onPlaceOrder, onClose }: Props) {
  const placed   = !!orderPlaced
  const origUSD  = Math.round(GRAND_TOTAL * 1.18) / 83
  const savingUSD = negotiatedTotalUSD ? +(origUSD - negotiatedTotalUSD).toFixed(2) : 0
  const fmt = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return (
    <div className="mfg-pdf-viewer">

      {/* ── Top bar ── */}
      <div className="qv-header" style={{ flexShrink: 0 }}>
        <div className="qv-header__left">
          <button className="bom-close-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
            <span>Back</span>
          </button>
          <div className="qv-icon" style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <div className="qv-title">Order Preview — {ORDER_NO}</div>
            <div className="qv-subtitle">
              <span className="qv-saving-badge" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
                {ORDER_LINES.length} parts · 25-day cycle
              </span>
              <span className="qv-saving-badge" style={{ marginLeft: 6, background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                Delivery by {DELIVERY}
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
            Download PDF
          </button>
          <button
            className="rfq-send-btn"
            style={{ background: placed ? '#15803d' : '#059669', borderColor: placed ? '#15803d' : '#059669', opacity: placed ? 0.85 : 1 }}
            onClick={onPlaceOrder}
            disabled={placed}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {placed ? 'Order Placed ✓' : 'Place Order'}
          </button>
        </div>
      </div>

      {/* ── PDF paper area ── */}
      <div className="mfg-pdf-scroll">
        <div className="mfg-pdf-page">

          {placed && (
            <div className="mfg-pdf__placed-banner">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.5"/><polyline points="5,8 7,10.5 11,6"/>
              </svg>
              Order Placed Successfully — Confirmation sent to procurement@strenth.ai
            </div>
          )}

          {negotiatedTotalUSD && !placed && (
            <div className="mfg-pdf__placed-banner" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round">
                <path d="M8 2v4l2.5 2.5"/><circle cx="8" cy="9" r="6"/>
              </svg>
              Updated pricing received from vendor — Negotiated total: {fmt(negotiatedTotalUSD)} &nbsp;·&nbsp; Saving: {fmt(savingUSD)}
            </div>
          )}

          {/* Letterhead */}
          <div className="mfg-pdf__lh">
            <div className="mfg-pdf__lh-brand">
              <span className="mfg-pdf__logo">strenth.ai</span>
              <span className="mfg-pdf__tagline">Connected Manufacturing</span>
            </div>
            <div className="mfg-pdf__lh-info">
              <div>Strenth.ai Technologies Pvt. Ltd.</div>
              <div>Bengaluru, Karnataka — 560001, India</div>
              <div>pratibha@strenth.ai · strenth.ai</div>
              <div>GSTIN: 29AABCS1234F1ZS</div>
            </div>
          </div>
          <div className="mfg-pdf__lh-rule"/>

          {/* PO Title */}
          <div className="mfg-pdf__po-title">PURCHASE ORDER</div>

          {/* Order meta 2-col */}
          <div className="mfg-pdf__meta2">
            <div className="mfg-pdf__meta2-col">
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">PO Number</span>
                <span className="mfg-pdf__meta2-val mfg-pdf__meta2-val--bold">{ORDER_NO}</span>
              </div>
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">Issue Date</span>
                <span className="mfg-pdf__meta2-val">{TODAY}</span>
              </div>
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">Expected Delivery</span>
                <span className="mfg-pdf__meta2-val" style={{ color: '#059669' }}>{DELIVERY}</span>
              </div>
            </div>
            <div className="mfg-pdf__meta2-col">
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">Payment Terms</span>
                <span className="mfg-pdf__meta2-val">30% Advance · 70% on Delivery</span>
              </div>
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">Currency</span>
                <span className="mfg-pdf__meta2-val">USD ($)</span>
              </div>
              <div className="mfg-pdf__meta2-row">
                <span className="mfg-pdf__meta2-lbl">Incoterms</span>
                <span className="mfg-pdf__meta2-val">DDP — Delivered Duty Paid</span>
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="mfg-pdf__parties">
            <div className="mfg-pdf__party">
              <div className="mfg-pdf__party-lbl">BUYER</div>
              <div className="mfg-pdf__party-name">Strenth.ai Technologies Pvt. Ltd.</div>
              <div className="mfg-pdf__party-detail">Koramangala, Bengaluru — 560034</div>
              <div className="mfg-pdf__party-detail">Authorised by: Pratibha (Admin)</div>
            </div>
            <div className="mfg-pdf__party">
              <div className="mfg-pdf__party-lbl">VENDOR</div>
              <div className="mfg-pdf__party-name">{vendorName}</div>
              <div className="mfg-pdf__party-detail">Pune, Maharashtra — 411001</div>
              <div className="mfg-pdf__party-detail">Contact: vendor@techmach.in</div>
            </div>
          </div>

          {/* Line items table */}
          <table className="mfg-pdf__table">
            <thead>
              <tr>
                <th className="mfg-pdf__th mfg-pdf__th--c">#</th>
                <th className="mfg-pdf__th">Part No.</th>
                <th className="mfg-pdf__th">Description</th>
                <th className="mfg-pdf__th mfg-pdf__th--r">Qty</th>
                <th className="mfg-pdf__th mfg-pdf__th--c">Unit</th>
                <th className="mfg-pdf__th mfg-pdf__th--r">Unit Price (USD)</th>
                <th className="mfg-pdf__th mfg-pdf__th--r">Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              {ORDER_LINES.map((row, i) => (
                <tr key={row.partNo} className="mfg-pdf__tr">
                  <td className="mfg-pdf__td mfg-pdf__td--c mfg-pdf__td--muted">{i + 1}</td>
                  <td className="mfg-pdf__td mfg-pdf__td--mono">{row.partNo}</td>
                  <td className="mfg-pdf__td">{row.desc}</td>
                  <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--muted">{row.qty}</td>
                  <td className="mfg-pdf__td mfg-pdf__td--c mfg-pdf__td--muted">{row.unit}</td>
                  <td className="mfg-pdf__td mfg-pdf__td--r">{USD(row.unitPrice)}</td>
                  <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--bold">{USD(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="mfg-pdf__tfoot-subtotal">
                <td colSpan={5} className="mfg-pdf__td"/>
                <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--lbl">Subtotal</td>
                <td className="mfg-pdf__td mfg-pdf__td--r">{USD(GRAND_TOTAL)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="mfg-pdf__td"/>
                <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--lbl">Tax (GST 18%)</td>
                <td className="mfg-pdf__td mfg-pdf__td--r">{USD(Math.round(GRAND_TOTAL * 0.18))}</td>
              </tr>
              {negotiatedTotalUSD ? (
                <>
                  <tr>
                    <td colSpan={5} className="mfg-pdf__td"/>
                    <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--lbl" style={{ color:'#9ca3af', textDecoration:'line-through' }}>Original Total</td>
                    <td className="mfg-pdf__td mfg-pdf__td--r" style={{ color:'#9ca3af', textDecoration:'line-through' }}>{fmt(origUSD)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="mfg-pdf__td"/>
                    <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__td--lbl" style={{ color:'#059669' }}>Negotiated Discount</td>
                    <td className="mfg-pdf__td mfg-pdf__td--r" style={{ color:'#059669', fontWeight:600 }}>−{fmt(savingUSD)}</td>
                  </tr>
                  <tr className="mfg-pdf__tfoot-total">
                    <td colSpan={5} className="mfg-pdf__td"/>
                    <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__grand-lbl" style={{ color:'#059669' }}>NEGOTIATED TOTAL</td>
                    <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__grand-val" style={{ color:'#059669' }}>{fmt(negotiatedTotalUSD)}</td>
                  </tr>
                </>
              ) : (
                <tr className="mfg-pdf__tfoot-total">
                  <td colSpan={5} className="mfg-pdf__td"/>
                  <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__grand-lbl">GRAND TOTAL</td>
                  <td className="mfg-pdf__td mfg-pdf__td--r mfg-pdf__grand-val">{USD(Math.round(GRAND_TOTAL * 1.18))}</td>
                </tr>
              )}
            </tfoot>
          </table>

          {/* Payment schedule */}
          <div className="mfg-pdf__pay-sched">
            <div className="mfg-pdf__pay-title">Payment Schedule</div>
            <div className="mfg-pdf__pay-rows">
              <div className="mfg-pdf__pay-row">
                <span className="mfg-pdf__pay-lbl">Milestone 1 — Advance (30%)</span>
                <span className="mfg-pdf__pay-val">{negotiatedTotalUSD ? fmt(+(negotiatedTotalUSD * 0.30).toFixed(2)) : USD(Math.round(GRAND_TOTAL * 1.18 * 0.30))}</span>
                <span className="mfg-pdf__pay-when">Due within 7 days of PO</span>
              </div>
              <div className="mfg-pdf__pay-row">
                <span className="mfg-pdf__pay-lbl">Milestone 2 — On Delivery (70%)</span>
                <span className="mfg-pdf__pay-val">{negotiatedTotalUSD ? fmt(+(negotiatedTotalUSD * 0.70).toFixed(2)) : USD(Math.round(GRAND_TOTAL * 1.18 * 0.70))}</span>
                <span className="mfg-pdf__pay-when">Due on delivery by {DELIVERY}</span>
              </div>
            </div>
          </div>

          {/* T&C */}
          <div className="mfg-pdf__tc">
            <div className="mfg-pdf__tc-title">Terms &amp; Conditions</div>
            <ol className="mfg-pdf__tc-list">
              {TC.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </div>

          {/* Signatures */}
          <div className="mfg-pdf__sigs">
            <div className="mfg-pdf__sig">
              <div className="mfg-pdf__sig-line"/>
              <div className="mfg-pdf__sig-name">Pratibha</div>
              <div className="mfg-pdf__sig-role">Authorised Signatory — Strenth.ai</div>
            </div>
            <div className="mfg-pdf__sig">
              <div className="mfg-pdf__sig-line"/>
              <div className="mfg-pdf__sig-name">Vendor Representative</div>
              <div className="mfg-pdf__sig-role">{vendorName}</div>
            </div>
          </div>

          {/* Footer */}
          <div className="mfg-pdf__footer">
            <span>Confidential — Strenth.ai Technologies Pvt. Ltd.</span>
            <span>{ORDER_NO} · Generated {TODAY}</span>
          </div>

        </div>
      </div>

    </div>
  )
}
