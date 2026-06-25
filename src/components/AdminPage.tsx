import { AuthUser } from '../auth'

interface Props {
  user: AuthUser
  onBack: () => void
  onLogout: () => void
}

export default function AdminPage({ user, onBack, onLogout }: Props) {
  return (
    <main className="admin-shell">
      <section className="admin-panel">
        <header className="admin-header">
          <div>
            <span className="admin-eyebrow">Admin Console</span>
            <h1>Strenth.ai Control Center</h1>
            <p>Manage workspace access, deployment status, and backend connectivity.</p>
          </div>
          <div className="admin-actions">
            <button className="admin-btn admin-btn--secondary" onClick={onBack}>Workspace</button>
            <button className="admin-btn" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-grid">
          <article className="admin-card">
            <span className="admin-label">Signed in</span>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
          </article>
          <article className="admin-card">
            <span className="admin-label">Role</span>
            <strong>{user.role}</strong>
            <p>{user.role === 'admin' ? 'Full admin access enabled' : 'Workspace access only'}</p>
          </article>
          <article className="admin-card">
            <span className="admin-label">BOM API</span>
            <strong>{import.meta.env.VITE_BOM_API_URL ?? 'http://localhost:8000'}</strong>
            <p>Used by upload, parsing, pricing, and RFQ flows.</p>
          </article>
        </div>

        <section className="admin-table-card">
          <div className="admin-table-head">
            <h2>Access Rules</h2>
            <span>Google auth</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Value</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Admins</td>
                <td>{import.meta.env.VITE_ADMIN_EMAILS ?? 'admin@strenth.ai,suraj@strenth.ai'}</td>
                <td>admin</td>
                <td><span className="admin-status">Active</span></td>
              </tr>
              <tr>
                <td>Allowed domain</td>
                <td>{import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS ?? 'strenth.ai'}</td>
                <td>user</td>
                <td><span className="admin-status">Active</span></td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </main>
  )
}
