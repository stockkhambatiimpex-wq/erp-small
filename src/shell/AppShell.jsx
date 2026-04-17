import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthProvider.jsx'

export function AppShell() {
  const nav = useNavigate()
  const { profile, signOut, isEditor, user } = useAuth()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Khambati <span>Impex</span>
        </div>
        <div className="topbarRight">
          <div className="who">
            <div className="whoName">{profile?.full_name || (user ? 'User' : 'Guest')}</div>
            <div className="whoRole">
              {user ? (isEditor ? 'Editor' : 'Viewer') : 'Viewer'}
            </div>
          </div>
          {user ? (
            <button className="btn btnGhost" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button className="btn btnPrimary" onClick={() => nav('/login')}>
              Sign in (Editor)
            </button>
          )}
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          <NavLink to="/" end className="navItem">
            Dashboard
          </NavLink>
          <NavLink to="/products" className="navItem">
            Products
          </NavLink>
          <NavLink to="/warehouses" className="navItem">
            Warehouses
          </NavLink>
          <NavLink to="/reports" className="navItem">
            Monthly report
          </NavLink>
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

