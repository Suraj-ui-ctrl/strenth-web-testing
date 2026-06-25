# Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `LoginPage.tsx` from a single dark card to a split-panel (dark-left + white-right) card matching the Strenth.ai design reference, across all 8 auth steps.

**Architecture:** Two changes only — replace `auth-*` CSS in `index.css` (lines 5648–5755) with new two-panel styles, then restructure the JSX in `LoginPage.tsx` to wrap content in `auth-left` (fixed branding) and `auth-right` (step content). Auth logic is untouched.

**Tech Stack:** React 18, TypeScript, plain CSS (no Tailwind), Vite 5

---

## File Map

| File | Change |
|------|--------|
| `src/index.css` | Replace lines 5648–5755 (all `auth-*` classes) with new two-panel CSS |
| `src/components/LoginPage.tsx` | Add `showPassword` state; restructure `return` block into `auth-left` + `auth-right`; restyle `renderContent()` per step |

No new files. No new dependencies.

---

### Task 1: Replace auth CSS in index.css

**Files:**
- Modify: `src/index.css` lines 5648–5755

- [ ] **Step 1: Delete the old auth CSS block**

Open `src/index.css`. Find and delete everything from line 5648 (`.auth-shell {`) through line 5755 (the closing `}` of `.auth-success`). Leave the blank line at 5756.

- [ ] **Step 2: Paste new auth CSS at that position**

Insert this block where the old CSS was (starting at line 5648):

```css
/* ── Auth shell ─────────────────────────────────────────── */
.auth-shell {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: #f0f2f5;
  font-family: 'Inter', sans-serif;
}
.auth-card {
  display: flex; flex-direction: row;
  width: 900px; min-height: 560px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 40px rgba(0,0,0,0.12);
  overflow: hidden;
}

/* ── Left panel ─────────────────────────────────────────── */
.auth-left {
  width: 400px; flex-shrink: 0;
  background: linear-gradient(160deg, #0d1f44 0%, #0f2a6e 50%, #1a3fa0 100%);
  padding: 36px 40px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.auth-brand {
  display: flex; align-items: center; gap: 12px;
}
.auth-logo {
  width: 36px; height: 36px; border-radius: 10px;
  background: #1a2d5a;
  color: #fff; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.auth-brand-text h1 {
  font-size: 15px; font-weight: 700; color: #fff; margin: 0;
}
.auth-brand-text p {
  font-size: 11px; color: #8ba3cc; margin: 0;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.auth-tagline h2 {
  font-size: 32px; font-weight: 800; color: #fff;
  line-height: 1.2; margin: 0 0 14px;
}
.auth-tagline p {
  font-size: 14px; color: #8ba3cc; line-height: 1.6; margin: 0;
}

/* ── Right panel ─────────────────────────────────────────── */
.auth-right {
  flex: 1; padding: 40px 48px;
  display: flex; flex-direction: column; gap: 18px;
  background: #fff;
}

/* Tab bar */
.auth-tabs {
  display: flex; align-items: center; gap: 4px;
}
.auth-tab {
  background: none; border: 1px solid transparent;
  border-radius: 20px; padding: 7px 18px;
  font-size: 14px; font-weight: 600;
  cursor: pointer; color: #64748b;
  transition: all 0.15s;
}
.auth-tab--active {
  background: #fff; border-color: #e2e8f0; color: #0f172a;
}
.auth-skip {
  margin-left: auto; font-size: 13px; color: #64748b;
  background: none; border: none; cursor: pointer; padding: 0;
}
.auth-skip:hover { color: #0f172a; }

/* Heading */
.auth-heading { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
.auth-sub { font-size: 13px; color: #64748b; margin: 0; }

/* Input fields */
.auth-field { display: flex; flex-direction: column; gap: 5px; }
.auth-field-label { font-size: 12px; color: #475569; font-weight: 500; }
.auth-field-wrap { position: relative; display: flex; align-items: center; }
.auth-field-icon {
  position: absolute; left: 12px;
  color: #94a3b8; font-size: 15px; pointer-events: none;
  line-height: 1;
}
.auth-field-icon-right {
  position: absolute; right: 12px;
  color: #94a3b8; font-size: 15px;
  cursor: pointer; background: none; border: none; padding: 0;
  line-height: 1;
}
.auth-field-wrap input {
  width: 100%; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 10px 12px 10px 38px;
  font-size: 14px; color: #0f172a; outline: none;
  box-sizing: border-box; transition: border-color 0.15s;
}
.auth-field-wrap input.no-icon { padding-left: 12px; }
.auth-field-wrap input:focus { border-color: #2563eb; }

/* Remember-me row */
.auth-remember-row {
  display: flex; align-items: center; justify-content: space-between;
}
.auth-remember {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #475569; cursor: pointer;
}
.auth-forgot {
  font-size: 13px; color: #2563eb;
  background: none; border: none; cursor: pointer; padding: 0;
}
.auth-forgot:hover { text-decoration: underline; }

/* Buttons */
.auth-primary-btn {
  width: 100%; background: #2563eb; color: #fff;
  border: none; border-radius: 8px;
  padding: 12px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.auth-primary-btn:hover { background: #1d4ed8; }
.auth-ghost-btn {
  width: 100%; background: #fff; color: #0f172a;
  border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 11px; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: background 0.15s;
}
.auth-ghost-btn:hover { background: #f8fafc; }
.auth-link-btn {
  background: none; border: none; color: #2563eb;
  font-size: 13px; cursor: pointer; padding: 2px 0; text-align: left;
}
.auth-link-btn:hover { text-decoration: underline; }

/* Divider */
.auth-divider {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: #94a3b8;
}
.auth-divider::before, .auth-divider::after {
  content: ''; flex: 1; height: 1px; background: #e2e8f0;
}

/* Social buttons */
.auth-social-row { display: flex; gap: 12px; }
.auth-social-btn {
  flex: 1; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 10px;
  font-size: 14px; font-weight: 500; color: #0f172a;
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; gap: 8px; transition: background 0.15s;
}
.auth-social-btn:hover { background: #f8fafc; }
.auth-social-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Google GSI slot (inside social row) */
.auth-google-slot {
  flex: 1; display: flex; align-items: center; justify-content: center;
  min-height: 44px;
}

/* Error */
.auth-error {
  font-size: 12.5px; color: #dc2626;
  background: rgba(220,38,38,0.08); border-radius: 6px;
  padding: 8px 10px;
}

/* Footer */
.auth-footer {
  font-size: 11px; color: #94a3b8;
  text-align: center; margin-top: auto;
}
.auth-footer a { color: #475569; text-decoration: underline; }

/* Org step choice */
.auth-choice-row { display: flex; gap: 8px; }
.auth-choice {
  flex: 1; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 8px; color: #64748b;
  font-size: 13px; padding: 9px 8px;
  cursor: pointer; text-align: center; transition: all 0.15s;
}
.auth-choice--on {
  background: rgba(37,99,235,0.08);
  border-color: #2563eb; color: #2563eb;
}

/* Success */
.auth-success {
  color: #16a34a; font-size: 14px; font-weight: 500;
  text-align: center; padding: 12px;
  background: rgba(22,163,74,0.08); border-radius: 8px;
}
/* ── End auth ────────────────────────────────────────────── */
```

- [ ] **Step 3: Verify CSS file is valid**

Run:
```bash
npm run build 2>&1 | head -30
```
Expected: build completes with no CSS parse errors. (TS errors from other files are fine.)

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "style: replace auth CSS with two-panel split design"
```

---

### Task 2: Restructure LoginPage.tsx — shell + left panel

**Files:**
- Modify: `src/components/LoginPage.tsx` lines 34–46 (state declarations) and lines 280–298 (return block)

- [ ] **Step 1: Add `showPassword` state**

In `LoginPage.tsx`, find the existing state declarations block (lines 35–46). Add one line after `const [password, setPassword] = useState('')`:

```tsx
const [showPassword, setShowPassword] = useState(false)
```

- [ ] **Step 2: Replace the return block**

Replace lines 280–298 (the entire `return (...)` block) with:

```tsx
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
```

- [ ] **Step 3: Verify it compiles**

```bash
npm run build 2>&1 | head -30
```
Expected: no errors related to `LoginPage.tsx`. The `showPassword` variable will show "declared but never used" warning — that's fine, we wire it up in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "refactor: add split-panel shell to LoginPage (left + right panels)"
```

---

### Task 3: Restyle signin step content

**Files:**
- Modify: `src/components/LoginPage.tsx` — the `step === 'signin'` branch inside `renderContent()`

- [ ] **Step 1: Replace the signin branch**

Find this block in `renderContent()`:
```tsx
    if (step === 'signin') {
      return (
        <>
          <div>
            <h2>Sign in</h2>
            <p>Continue with your Strenth Google account.</p>
          </div>
          <div className="auth-google-slot" ref={googleButtonRef} />
          <div className="auth-action-stack">
            <button className="auth-secondary-btn" type="button" onClick={() => go('signup-choice')}>Sign up</button>
            <button className="auth-guest-btn" type="button" onClick={() => onLogin(signInAsGuest())}>Continue as a guest</button>
          </div>
          <p className="auth-note">Any verified Google account can access the workspace during testing.</p>
        </>
      )
    }
```

Replace it with:
```tsx
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
```

- [ ] **Step 2: Update `renderButton` width to be conditional per step**

Find the `renderButton` call inside the `useEffect` (around line 77):
```tsx
              width: 376,
```
Change it to:
```tsx
              width: step === 'signin' ? 195 : 376,
```
This renders a half-width Google button on the signin social row, and full-width on signup-choice.

- [ ] **Step 3: Run dev server and check visually**

```bash
npm run dev
```
Open `http://localhost:5173`. You should see:
- Light gray page background
- Large split card: dark blue left panel with "Hardware at the speed of software." + white right panel
- Right panel: Log in / Sign up tabs, "Welcome back" heading, email + password fields with icons, Remember me row, blue Log in button, divider, Google GSI button + disabled Apple button

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "style: restyle signin step with email/password fields and social row"
```

---

### Task 4: Restyle all remaining steps

**Files:**
- Modify: `src/components/LoginPage.tsx` — all remaining branches in `renderContent()`

- [ ] **Step 1: Replace `signup-choice` branch**

Find:
```tsx
    if (step === 'signup-choice') {
      return (
        <>
          <div>
            <h2>Create account</h2>
            <p>Choose how you want to sign up.</p>
          </div>
          <div className="auth-google-slot" ref={googleButtonRef} />
          <button className="auth-secondary-btn" type="button" onClick={handleSignupGoogle}>Sign up with SSO</button>
          <button className="auth-guest-btn" type="button" onClick={() => go('signup-email')}>Email + password</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signin')}>Already registered? Login</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 2: Replace `signup-email` branch**

Find:
```tsx
    if (step === 'signup-email') {
      return (
        <>
          <div>
            <h2>Email signup</h2>
            <p>Use any email for testing. We will verify it with an OTP.</p>
          </div>
          <label className="auth-field"><span>Email</span><input value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" /></label>
          <label className="auth-field"><span>Password</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Create password" /></label>
          <button className="auth-secondary-btn" type="button" onClick={handleEmailSignup}>Send email OTP</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signup-choice')}>Back</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 3: Replace `email-otp` branch**

Find:
```tsx
    if (step === 'email-otp') {
      return (
        <>
          <div>
            <h2>Verify email</h2>
            <p>OTP sent to {email || 'your email'}.</p>
          </div>
          <label className="auth-field"><span>Email OTP</span><input value={emailOtp} onChange={event => setEmailOtp(event.target.value)} placeholder="Enter OTP" /></label>
          <button className="auth-secondary-btn" type="button" onClick={verifyEmailOtp}>Verify email</button>
          <button className="auth-link-btn" type="button" onClick={() => go('signup-email')}>Edit email</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 4: Replace `mobile-otp` branch**

Find:
```tsx
    if (step === 'mobile-otp') {
      return (
        <>
          <div>
            <h2>Verify mobile</h2>
            <p>Confirm your mobile number with OTP.</p>
          </div>
          <label className="auth-field"><span>Mobile number</span><input value={mobile} onChange={event => setMobile(event.target.value)} placeholder="+91 98765 43210" /></label>
          <label className="auth-field"><span>Mobile OTP</span><input value={mobileOtp} onChange={event => setMobileOtp(event.target.value)} placeholder="Enter OTP" /></label>
          <button className="auth-secondary-btn" type="button" onClick={verifyMobileOtp}>Verify mobile</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 5: Replace `profile` branch**

Find:
```tsx
    if (step === 'profile') {
      return (
        <>
          <div>
            <h2>Profile setup</h2>
            <p>Add your name and company before entering the workspace.</p>
          </div>
          <label className="auth-field"><span>Full name</span><input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Full name" /></label>
          <label className="auth-field"><span>Company</span><input value={company} onChange={event => setCompany(event.target.value)} placeholder="Company / organization" /></label>
          <button className="auth-secondary-btn" type="button" onClick={saveProfile}>Continue</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 6: Replace `org` branch**

Find:
```tsx
    if (step === 'org') {
      return (
        <>
          <div>
            <h2>Organization</h2>
            <p>Email domain matched an existing organization. Join it or create a new org.</p>
          </div>
          <div className="auth-choice-row">
            <button className={`auth-choice${orgChoice === 'join' ? ' auth-choice--on' : ''}`} type="button" onClick={() => setOrgChoice('join')}>Join existing org</button>
            <button className={`auth-choice${orgChoice === 'create' ? ' auth-choice--on' : ''}`} type="button" onClick={() => setOrgChoice('create')}>Create new org</button>
          </div>
          <p className="auth-note">{orgChoice === 'join' ? 'Admin approval may be required.' : 'You can invite teammates later.'}</p>
          <button className="auth-secondary-btn" type="button" onClick={finishSignup}>Finish signup</button>
        </>
      )
    }
```

Replace with:
```tsx
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
```

- [ ] **Step 7: Replace `success` (final return)**

Find the final return at the bottom of `renderContent()`:
```tsx
    return (
      <>
        <div>
          <h2>Signup success</h2>
          <p>Welcome to Strenth. Creating your workspace.</p>
        </div>
        <div className="auth-success">Workspace is almost ready...</div>
      </>
    )
```

Replace with:
```tsx
    return (
      <>
        <h2 className="auth-heading">All done!</h2>
        <p className="auth-sub">Welcome to Strenth. Creating your workspace.</p>
        <div className="auth-success">Workspace is almost ready...</div>
      </>
    )
```

- [ ] **Step 8: Verify all steps visually**

```bash
npm run dev
```

Open `http://localhost:5173`. Click through every step:
1. Sign in (default) — email + password fields, Google GSI + Apple buttons
2. Click "Sign up" tab — Create account step
3. Click "Email + password" — email signup form
4. Submit with dummy email → email OTP step
5. Enter any 4-char OTP → mobile OTP step
6. Enter mobile + OTP → profile step
7. Enter name + company → org step
8. Click "Finish signup" → success

All steps should show: dark-left brand panel (unchanged) + white-right panel with consistent input/button styles.

- [ ] **Step 9: Build check**

```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "style: restyle all auth steps to match split-panel design"
```

---

### Task 5: Final verification + push

- [ ] **Step 1: Run dev server one final time**

```bash
npm run dev
```

Check:
- [ ] Page background is light gray `#f0f2f5`
- [ ] Card is wide (900px), rounded corners, white shadow
- [ ] Left panel: dark blue gradient, ✦ logo, "Strenth.ai" + "Connected Manufacturing", big bold headline + body text
- [ ] Right panel: Log in / Sign up tab pills, step content, blue primary button, footer terms text
- [ ] Tab switching between Log in ↔ Sign up works
- [ ] "Skip for now →" enters the app as guest
- [ ] Password show/hide toggle works on signin and signup-email steps
- [ ] Google GSI button renders in the social row slot on the signin step

- [ ] **Step 2: Push to master**

```bash
git push origin master
```

GitHub Actions will auto-deploy. Monitor at your repo → Actions tab. Live URL: `https://strenth-web.jollyfield-91f54af9.centralindia.azurecontainerapps.io`
