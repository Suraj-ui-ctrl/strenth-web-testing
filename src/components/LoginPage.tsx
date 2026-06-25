import { useEffect, useRef, useState } from 'react'
import { createSession, signInAsGuest, signInWithGoogleCredential, AuthUser } from '../auth'

interface Props {
  onLogin: (user: AuthUser) => void
}

interface GoogleCredentialResponse {
  credential?: string
}

type AuthStep = 'signin' | 'signup-choice' | 'signup-email' | 'email-otp' | 'mobile-otp' | 'profile' | 'org' | 'success'

declare global {
  interface Window {
    __STRENTH_CONFIG__?: {
      googleClientId?: string
    }
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void
          prompt: () => void
        }
      }
    }
  }
}

export default function LoginPage({ onLogin }: Props) {
  const [step, setStep] = useState<AuthStep>('signin')
  const [error, setError] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailOtp, setEmailOtp] = useState('')
  const [mobile, setMobile] = useState('')
  const [mobileOtp, setMobileOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [orgChoice, setOrgChoice] = useState<'join' | 'create'>('join')
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const clientId = window.__STRENTH_CONFIG__?.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError('Google sign-in is not configured yet')
      return
    }

    const handleCredential = (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError('Google did not return a sign-in token')
        return
      }

      const user = signInWithGoogleCredential(response.credential)
      if (!user) {
        setError('Use a verified Google account')
        return
      }
      onLogin(user)
    }

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return

      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: step === 'signup-choice' ? 'signup_with' : 'continue_with',
        width: step === 'signin' ? 195 : 376,
      })
      setGoogleReady(true)
    }

    if (window.google) {
      renderGoogleButton()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    script.onerror = () => setError('Could not load Google sign-in')
    document.head.appendChild(script)
  }, [onLogin, step])

  const go = (nextStep: AuthStep) => {
    setError('')
    setStep(nextStep)
  }

  const handleEmailSignup = () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password')
      return
    }
    if (email.trim().toLowerCase().endsWith('@registered.strenth.ai')) {
      setError('Email already registered. Redirecting to login.')
      setTimeout(() => go('signin'), 900)
      return
    }
    go('email-otp')
  }

  const verifyEmailOtp = () => {
    if (emailOtp.trim().length < 4) {
      setError('Enter the email OTP')
      return
    }
    go('mobile-otp')
  }

  const verifyMobileOtp = () => {
    if (mobile.trim().length < 8 || mobileOtp.trim().length < 4) {
      setError('Enter mobile number and OTP')
      return
    }
    go('profile')
  }

  const saveProfile = () => {
    if (!fullName.trim() || !company.trim()) {
      setError('Enter full name and company')
      return
    }
    go('org')
  }

  const finishSignup = () => {
    go('success')
    const user = createSession({
      name: fullName.trim() || email.split('@')[0] || 'Strenth User',
      email: email.trim().toLowerCase() || 'new.user@strenth.ai',
      role: email.trim().toLowerCase() === 'suraj@strenth.ai' ? 'admin' : 'user',
    })
    setTimeout(() => onLogin(user), 850)
  }

  const handleSignupGoogle = () => {
    if (!window.google || !googleReady) {
      setError('Google sign-in is still loading')
      return
    }
    window.google.accounts.id.prompt()
  }

  const renderContent = () => {
    if (step === 'signin') {
      return (
        <>
          <h2 className="auth-heading">Welcome back</h2>

          <div className="auth-field">
            <span className="auth-field-label">Email address *</span>
            <div className="auth-field-wrap">
              <span className="auth-field-icon">✉</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="auth-field">
            <span className="auth-field-label">Password *</span>
            <div className="auth-field-wrap">
              <span className="auth-field-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                className="auth-field-icon-right"
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="auth-remember-row">
            <label className="auth-remember">
              <input type="checkbox" /> Remember me
            </label>
            <button className="auth-forgot" type="button">Forgot password?</button>
          </div>

          <button className="auth-primary-btn" type="button" onClick={() => setError('Email sign-in is not yet available. Please use Google sign-in below.')}>
            Log in →
          </button>

          <div className="auth-divider">or Continue with</div>

          <div className="auth-social-row">
            <div className="auth-google-slot" ref={googleButtonRef} />
            <button className="auth-social-btn" type="button" disabled>
              🍎 Apple
            </button>
          </div>
        </>
      )
    }

    if (step === 'signup-choice') {
      return (
        <>
          <h2 className="auth-heading">Create account</h2>
          <p className="auth-sub">Choose how you want to sign up.</p>
          <div className="auth-google-slot" ref={googleButtonRef} />
          <button className="auth-ghost-btn" type="button" onClick={handleSignupGoogle}>Sign up with SSO</button>
          <button className="auth-ghost-btn" type="button" onClick={() => go('signup-email')}>Email + password</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signin')}>Already registered? Login</button>
        </>
      )
    }

    if (step === 'signup-email') {
      return (
        <>
          <h2 className="auth-heading">Email signup</h2>
          <p className="auth-sub">Use any email for testing. We will verify it with an OTP.</p>

          <div className="auth-field">
            <span className="auth-field-label">Email</span>
            <div className="auth-field-wrap">
              <span className="auth-field-icon">✉</span>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
          </div>

          <div className="auth-field">
            <span className="auth-field-label">Password</span>
            <div className="auth-field-wrap">
              <span className="auth-field-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create password"
              />
              <button
                className="auth-field-icon-right"
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button className="auth-primary-btn" type="button" onClick={handleEmailSignup}>Send email OTP →</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signup-choice')}>← Back</button>
        </>
      )
    }

    if (step === 'email-otp') {
      return (
        <>
          <h2 className="auth-heading">Verify email</h2>
          <p className="auth-sub">OTP sent to {email || 'your email'}.</p>

          <div className="auth-field">
            <span className="auth-field-label">Email OTP</span>
            <div className="auth-field-wrap">
              <input className="no-icon" value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder="Enter OTP" />
            </div>
          </div>

          <button className="auth-primary-btn" type="button" onClick={verifyEmailOtp}>Verify email →</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signup-email')}>← Edit email</button>
        </>
      )
    }

    if (step === 'mobile-otp') {
      return (
        <>
          <h2 className="auth-heading">Verify mobile</h2>
          <p className="auth-sub">Confirm your mobile number with OTP.</p>

          <div className="auth-field">
            <span className="auth-field-label">Mobile number</span>
            <div className="auth-field-wrap">
              <input className="no-icon" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="auth-field">
            <span className="auth-field-label">Mobile OTP</span>
            <div className="auth-field-wrap">
              <input className="no-icon" value={mobileOtp} onChange={e => setMobileOtp(e.target.value)} placeholder="Enter OTP" />
            </div>
          </div>

          <button className="auth-primary-btn" type="button" onClick={verifyMobileOtp}>Verify mobile →</button>
        </>
      )
    }

    if (step === 'profile') {
      return (
        <>
          <h2 className="auth-heading">Profile setup</h2>
          <p className="auth-sub">Add your name and company before entering the workspace.</p>

          <div className="auth-field">
            <span className="auth-field-label">Full name</span>
            <div className="auth-field-wrap">
              <input className="no-icon" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" />
            </div>
          </div>

          <div className="auth-field">
            <span className="auth-field-label">Company</span>
            <div className="auth-field-wrap">
              <input className="no-icon" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company / organization" />
            </div>
          </div>

          <button className="auth-primary-btn" type="button" onClick={saveProfile}>Continue →</button>
        </>
      )
    }

    if (step === 'org') {
      return (
        <>
          <h2 className="auth-heading">Organization</h2>
          <p className="auth-sub">Email domain matched an existing organization. Join it or create a new org.</p>

          <div className="auth-choice-row">
            <button
              className={`auth-choice${orgChoice === 'join' ? ' auth-choice--on' : ''}`}
              type="button"
              onClick={() => setOrgChoice('join')}
            >
              Join existing org
            </button>
            <button
              className={`auth-choice${orgChoice === 'create' ? ' auth-choice--on' : ''}`}
              type="button"
              onClick={() => setOrgChoice('create')}
            >
              Create new org
            </button>
          </div>

          <p className="auth-sub">
            {orgChoice === 'join' ? 'Admin approval may be required.' : 'You can invite teammates later.'}
          </p>

          <button className="auth-primary-btn" type="button" onClick={finishSignup}>Finish signup →</button>
        </>
      )
    }

    return (
      <>
        <h2 className="auth-heading">All done!</h2>
        <p className="auth-sub">Welcome to Strenth. Creating your workspace.</p>
        <div className="auth-success">Workspace is almost ready...</div>
      </>
    )
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">

        {/* Left panel — fixed across all steps */}
        <div className="auth-left">
          <div className="auth-brand">
            <span className="auth-logo">✦</span>
            <div className="auth-brand-text">
              <h1>Strenth.ai</h1>
              <p>Connected Manufacturing</p>
            </div>
          </div>
          <div className="auth-tagline">
            <h2>Hardware at the speed of software.</h2>
            <p>One connected workspace for every vendor, machine and milestone from kickoff to PO.</p>
          </div>
        </div>

        {/* Right panel */}
        <div className="auth-right">
          {/* Tab bar */}
          <div className="auth-tabs">
            <button
              className={`auth-tab${step === 'signin' ? ' auth-tab--active' : ''}`}
              type="button"
              onClick={() => go('signin')}
            >
              Log in
            </button>
            <button
              className={`auth-tab${step !== 'signin' ? ' auth-tab--active' : ''}`}
              type="button"
              onClick={() => go('signup-choice')}
            >
              Sign up
            </button>
            <button className="auth-skip" type="button" onClick={() => onLogin(signInAsGuest())}>
              Skip for now →
            </button>
          </div>

          {/* Step content */}
          {renderContent()}

          {/* Error */}
          {error && <div className="auth-error">{error}</div>}

          {/* Footer */}
          <p className="auth-footer">
            By continuing you agree to our{' '}
            <a href="#" onClick={e => e.preventDefault()}>Terms</a>
            {' & '}
            <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>.
          </p>
        </div>

      </section>
    </main>
  )
}
