import { BOP_COST_ROWS, CDP_COST_ROWS } from '../data/costData'

interface Props {
  amount?:  number
  onClose?: () => void
}

const USD = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

const today = new Date()
const orderId = `ORD-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}-0042`
const txnId   = 'rzp_live_' + Math.random().toString(36).slice(2,10).toUpperCase()

const NEXT_STEPS = [
  { icon: '📧', text: 'Invoice emailed to pratibha@strenth.ai' },
  { icon: '📦', text: 'Parts dispatched within 2–3 working days' },
  { icon: '🚚', text: 'Est. delivery: 14–21 working days' },
  { icon: '📂', text: 'Order saved under BOM Files → Order History' },
  { icon: '📊', text: 'Download your BOM Excel anytime from the panel' },
]

export default function PaymentSuccess({ amount = 0, onClose }: Props) {
  return (
    <div className="pay-success">

      {/* ── Fixed topbar — always visible, never scrolls ── */}
      <div className="pay-success__topbar">
        {onClose && (
          <button className="pay-success__close" onClick={onClose} title="Back to Cost Report">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="14" y2="14"/>
              <line x1="14" y1="2" x2="2" y2="14"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="pay-success__body">

        {/* Tick animation */}
        <div className="pay-success__circle">
          <svg className="pay-success__check" viewBox="0 0 52 52">
            <circle className="pay-success__ring"  cx="26" cy="26" r="25" fill="none"/>
            <polyline className="pay-success__tick" points="14,27 22,35 38,17" fill="none"/>
          </svg>
        </div>

        <h2 className="pay-success__title">Payment Successful</h2>
        <p className="pay-success__amount">{USD(amount)}</p>
        <p className="pay-success__sub">Your order has been placed successfully</p>

        {/* Details card */}
        <div className="pay-success__card">
          <div className="pay-success__row">
            <span className="pay-success__lbl">Order ID</span>
            <span className="pay-success__val pay-success__val--mono">{orderId}</span>
          </div>
          <div className="pay-success__row">
            <span className="pay-success__lbl">Transaction ID</span>
            <span className="pay-success__val pay-success__val--mono">{txnId}</span>
          </div>
          <div className="pay-success__row">
            <span className="pay-success__lbl">Payment Method</span>
            <span className="pay-success__val">Net Banking · HDFC</span>
          </div>
          <div className="pay-success__row">
            <span className="pay-success__lbl">Parts Ordered</span>
            <span className="pay-success__val">{BOP_COST_ROWS.length} Standard + {CDP_COST_ROWS.length} Custom parts</span>
          </div>
          <div className="pay-success__row">
            <span className="pay-success__lbl">Est. Delivery</span>
            <span className="pay-success__val">14 – 21 working days</span>
          </div>
          <div className="pay-success__row">
            <span className="pay-success__lbl">Invoice</span>
            <span className="pay-success__val">Sent to pratibha@strenth.ai</span>
          </div>
        </div>

        {/* What's Next */}
        <div className="pay-success__nextsteps">
          <div className="pay-success__nextsteps-title">What's Next</div>
          {NEXT_STEPS.map((s, i) => (
            <div key={i} className="pay-success__nextstep">
              <span className="pay-success__nextstep-icon">{s.icon}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="pay-success__actions">
          <button className="pay-success__btn pay-success__btn--primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Download Invoice
          </button>
          <button className="pay-success__btn pay-success__btn--secondary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Track Order
          </button>
        </div>

      </div>
    </div>
  )
}
