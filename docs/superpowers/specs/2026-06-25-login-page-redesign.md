# Login Page Redesign Spec
**Date:** 2026-06-25  
**Scope:** Visual redesign of `src/components/LoginPage.tsx` + `auth-*` CSS in `src/index.css`  
**Auth logic:** Unchanged — only markup structure and styles change

---

## Goal

Replace the current single dark-card login UI with a split-panel card matching the Strenth.ai design reference. All 8 existing auth steps (`signin`, `signup-choice`, `signup-email`, `email-otp`, `mobile-otp`, `profile`, `org`, `success`) get the new design language.

---

## Layout & Shell

- **Page background:** `#f0f2f5` (light gray)
- **Card:** centered, `900px` wide, `560px` min-height, `border-radius: 20px`, white, `box-shadow: 0 8px 40px rgba(0,0,0,0.12)`
- **Structure:** horizontal flex row — left panel (`400px` fixed) + right panel (`500px` flex-grow)

```
┌─────────────────────────┬───────────────────────────────┐
│   auth-left (400px)     │   auth-right (500px)          │
│   dark blue gradient    │   white                       │
│   brand + tagline       │   tab bar + form + social     │
└─────────────────────────┴───────────────────────────────┘
```

**CSS class changes:**
- `.auth-shell` — keeps `position:fixed; inset:0; display:flex; align-items:center; justify-content:center;` — background changes to `#f0f2f5`
- `.auth-card` — becomes horizontal flex, `900px` wide, `border-radius: 20px`
- New `.auth-left` — left panel styles
- New `.auth-right` — right panel styles
- All existing `.auth-brand`, `.auth-form`, `.auth-*` classes rewritten

---

## Left Panel (`auth-left`)

Fixed across all steps. Never changes content.

**Background:** `linear-gradient(160deg, #0d1f44 0%, #0f2a6e 50%, #1a3fa0 100%)`  
**Border-radius:** `20px 0 0 20px`  
**Padding:** `36px 40px`  
**Layout:** `display:flex; flex-direction:column; justify-content:space-between`

### Logo block (top)
```
[ ✦ ]  Strenth.ai
       Connected Manufacturing
```
- Icon: `36×36px` rounded square, `background: #1a2d5a`, `border-radius: 10px`, `✦` char white `20px`
- "Strenth.ai": `15px`, `700` weight, white
- "Connected Manufacturing": `11px`, `#8ba3cc`, uppercase, `letter-spacing: 0.05em`

### Headline (bottom area)
- **"Hardware at the speed of software."** — `32px`, `800` weight, white, `line-height: 1.2`
- Body: `"One connected workspace for every vendor, machine and milestone from kickoff to PO."` — `14px`, `#8ba3cc`, `line-height: 1.6`, `margin-top: 14px`

---

## Right Panel (`auth-right`)

Background: white. `border-radius: 0 20px 20px 0`. `padding: 40px 48px`. `display:flex; flex-direction:column; gap:20px`.

### Tab Bar (always visible)
```
[ Log in ]  [ Sign up ]               Skip for now →
```
- Container: `display:flex; align-items:center; gap:4px`
- Active tab: white bg, `border: 1px solid #e2e8f0`, `border-radius: 20px`, `padding: 7px 18px`, `14px 600` dark text `#0f172a`
- Inactive tab: no bg, no border, gray `#64748b`, same padding
- "Skip for now →": `margin-left: auto`, `13px`, `#64748b`, no underline, cursor pointer

Tab active state is driven by step:
- `signin` → Log in tab active
- all other steps → Sign up tab active

Clicking "Log in" tab calls `go('signin')`. Clicking "Sign up" tab calls `go('signup-choice')`.  
"Skip for now →" calls `onLogin(signInAsGuest())`.

### Step Content (per step)

**signin:**
- Heading: "Welcome back" `24px 700 #0f172a`
- Email field: label `"Email address *"`, envelope icon left, placeholder `"you@company.com"`
- Password field: label `"Password *"`, lock icon left, eye toggle right (show/hide password state)
- Row: `☐ Remember me` (visual only) + `"Forgot password?"` blue link (visual only)
- Primary button: `"Log in →"` full-width `#2563eb`
- Divider: `"or Continue with"` centered
- Social row: `[ G Google ]  [ 🍎 Apple ]` half-width each, white bg, border `#e2e8f0` (Apple is visual placeholder — no Apple auth)
- Footer: `"By continuing you agree to our Terms & Privacy Policy."` `11px #94a3b8` centered

Google button slot: renders the real Google GSI button via `renderButton()` into `ref={googleButtonRef}`. We do NOT overlay a custom-styled Google button — Google's OAuth policy requires using their official button UI. The GSI button renders inline in the social row at full container width; it controls its own appearance.

**signup-choice:**
- Heading: "Create account" 
- Subtext: "Choose how you want to sign up."
- Google button (full-width, same style as social row button but full-width)
- "Sign up with SSO" secondary btn
- "Email + password →" ghost btn → `go('signup-email')`
- "Already registered? Login" link → `go('signin')`

**signup-email:**
- Heading: "Email signup"
- Email + Password fields (same style as signin)
- "Send email OTP →" primary btn
- "Back" link

**email-otp:**
- Heading: "Verify email"
- Subtext: "OTP sent to {email}"
- OTP input field
- "Verify email →" primary btn
- "Edit email" link

**mobile-otp:**
- Heading: "Verify mobile"
- Mobile number field + OTP field
- "Verify mobile →" primary btn

**profile:**
- Heading: "Profile setup"
- Full name field + Company field
- "Continue →" primary btn

**org:**
- Heading: "Organization"
- Join/Create toggle (existing `.auth-choice-row` style, reskinned to white bg)
- Note text
- "Finish signup →" primary btn

**success:**
- Heading: "All done!"
- Green success box: "Workspace is almost ready..."

### Input Field Style (all steps)
- Background: `#f8fafc`
- Border: `1px solid #e2e8f0`
- Border-radius: `8px`
- Padding: `10px 12px 10px 38px` (when has left icon) or `10px 12px` (no icon)
- Font: `14px #0f172a`
- Focus: `border-color: #2563eb`, `outline: none`
- Icon: positioned absolute left `12px`, `#94a3b8`

### Button Styles
- **Primary** (`.auth-primary-btn`): `background: #2563eb`, white text, `border-radius: 8px`, `padding: 12px`, full-width, `font-size: 14px 600`
- **Social** (`.auth-social-btn`): white bg, `border: 1px solid #e2e8f0`, `border-radius: 8px`, `padding: 10px`, half-width, `14px 500 #0f172a`, icon + label
- **Ghost** (`.auth-ghost-btn`): white bg, `border: 1px solid #e2e8f0`, `border-radius: 8px`, `padding: 10px`, full-width
- **Link** (`.auth-link-btn`): kept as-is, `color: #2563eb`

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/LoginPage.tsx` | Restructure JSX: add `auth-left` + `auth-right` wrapper divs, add tab bar, add icons, add Remember me row |
| `src/index.css` | Replace all `auth-*` classes (lines 5648–5754) with new two-panel styles |

No new files. No new dependencies. Auth logic in `LoginPage.tsx` unchanged.

---

## Out of Scope

- Apple Sign-In backend — Apple button is visual placeholder only
- "Remember me" persistence — checkbox is visual only
- "Forgot password?" flow — link is visual only
- Responsive/mobile layout — desktop only for now
