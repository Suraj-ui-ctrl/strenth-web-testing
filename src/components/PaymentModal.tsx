import { useRef, useState } from 'react'

interface Props {
  amount:            number
  onClose:           () => void
  onDetailsSubmit:   () => void
  onPaymentComplete: () => void
}

type Step = 'details' | 'otp'
type Method = 'netbanking' | 'card'

export default function PaymentModal({ amount, onClose, onDetailsSubmit, onPaymentComplete }: Props) {
  const AMT = '$' + Math.round(amount).toLocaleString('en-US')
  const [step,   setStep]   = useState<Step>('details')
  const [method, setMethod] = useState<Method>('netbanking')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleDetailsSubmit = () => {
    onDetailsSubmit()
    setStep('otp')
  }

  const handleOtpKeyUp = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
    if (e.key === 'Backspace' && !val && i > 0) otpRefs.current[i - 1]?.focus()
  }

  return (
    <div className="pm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-card">

        {/* ── Header ── */}
        <div className="pm-head">
          <div className="pm-head__brand">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span>Razorpay</span>
          </div>
          <div className="pm-head__mid">
            <div className="pm-head__company">Strenth.ai Pvt. Ltd.</div>
            <div className="pm-head__amount">{AMT}</div>
          </div>
          <button className="pm-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="14" y2="14"/>
              <line x1="14" y1="2" x2="2" y2="14"/>
            </svg>
          </button>
        </div>

        {/* ════ STEP 1 — DETAILS ════ */}
        {step === 'details' && (
          <div className="pm-body">

            {/* Payment method */}
            <div className="pm-section">
              <div className="pm-section__label">Payment Method</div>
              <div className="pm-methods">
                <button
                  className={`pm-method${method === 'netbanking' ? ' pm-method--active' : ''}`}
                  onClick={() => setMethod('netbanking')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"/>
                    <path d="M2 10h20"/>
                  </svg>
                  Net Banking
                </button>
                <button
                  className={`pm-method${method === 'card' ? ' pm-method--active' : ''}`}
                  onClick={() => setMethod('card')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  Credit Card
                </button>
              </div>
            </div>

            {/* Personal */}
            <div className="pm-section">
              <div className="pm-section__label">Personal Details</div>
              <div className="pm-fields">
                <div className="pm-field">
                  <label className="pm-label">Full Name</label>
                  <input className="pm-input" type="text" defaultValue="Pratibha Singh"/>
                </div>
                <div className="pm-field">
                  <label className="pm-label">Mobile Number</label>
                  <input className="pm-input" type="tel" defaultValue="+91 98765 43210"/>
                </div>
                <div className="pm-field pm-field--full">
                  <label className="pm-label">Email ID</label>
                  <input className="pm-input" type="email" defaultValue="pratibha@strenth.ai"/>
                </div>
              </div>
            </div>

            {/* Card Details — only for credit card method */}
            {method === 'card' && (
              <div className="pm-section">
                <div className="pm-section__label">Card Details</div>
                <div className="pm-fields">
                  <div className="pm-field pm-field--full">
                    <label className="pm-label">Card Number</label>
                    <input className="pm-input" type="text" defaultValue="4111 1111 1111 4242"
                           maxLength={19} placeholder="XXXX XXXX XXXX XXXX"/>
                  </div>
                  <div className="pm-field pm-field--full">
                    <label className="pm-label">Name on Card</label>
                    <input className="pm-input" type="text" defaultValue="Pratibha Singh" placeholder="As printed on card"/>
                  </div>
                  <div className="pm-field">
                    <label className="pm-label">Expiry Date</label>
                    <input className="pm-input" type="text" defaultValue="12/27" placeholder="MM / YY"/>
                  </div>
                  <div className="pm-field">
                    <label className="pm-label">CVV</label>
                    <input className="pm-input" type="password" defaultValue="123" placeholder="•••" maxLength={4}/>
                  </div>
                </div>
              </div>
            )}

            {/* Company & Tax */}
            <div className="pm-section">
              <div className="pm-section__label">Company &amp; Tax Details</div>
              <div className="pm-fields">
                <div className="pm-field">
                  <label className="pm-label">Company Name</label>
                  <input className="pm-input" type="text" defaultValue="Strenth.ai Pvt. Ltd."/>
                </div>
                <div className="pm-field">
                  <label className="pm-label">GST Number</label>
                  <input className="pm-input" type="text" defaultValue="27STRNT0000A1Z5"/>
                </div>
                <div className="pm-field pm-field--full">
                  <label className="pm-label">Billing Address</label>
                  <input className="pm-input" type="text" defaultValue="Strenth.ai, Baner, Pune – 411045, Maharashtra, India"/>
                </div>
              </div>
            </div>

            <div className="pm-footer">
              <button className="pm-pay-btn" onClick={handleDetailsSubmit}>
                Proceed to Payment &nbsp;·&nbsp; {AMT}
              </button>
              <p className="pm-secure">🔒 Secured by Razorpay · 256-bit SSL</p>
            </div>
          </div>
        )}

        {/* ════ STEP 2 — OTP ════ */}
        {step === 'otp' && (
          <div className="pm-body pm-body--otp">
            <div className="pm-otp-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2"/>
                <path d="M8 11V7a4 4 0 018 0v4"/>
              </svg>
            </div>
            <div className="pm-otp-title">OTP Verification</div>
            <div className="pm-otp-sub">
              6-digit code sent to <strong>+91 98765 43210</strong>
            </div>
            <div className="pm-otp-boxes">
              {[4,2,8,1,9,3].map((d, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el }}
                  className="pm-otp-box"
                  type="text"
                  maxLength={1}
                  inputMode="numeric"
                  defaultValue={String(d)}
                  onKeyUp={e => handleOtpKeyUp(i, e)}
                />
              ))}
            </div>
            <button className="pm-pay-btn" style={{ width: '100%' }} onClick={onPaymentComplete}>
              Verify &amp; Pay &nbsp;·&nbsp; {AMT}
            </button>
            <p className="pm-secure">🔒 Secured by Razorpay · Resend OTP in 30s</p>
          </div>
        )}

      </div>
    </div>
  )
}
