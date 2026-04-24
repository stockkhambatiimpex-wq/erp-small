import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthProvider.jsx'

export function AppShell() {
  const nav = useNavigate()
  const loc = useLocation()
  const sidebarRef = useRef(null)
  const { profile, signOut, isEditor, user } = useAuth()

  useEffect(() => {
    // Guest users can access only Products.
    if (!user && loc.pathname !== '/products') {
      nav('/products', { replace: true })
    }
  }, [loc.pathname, nav, user])

  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    const active = el.querySelector?.('.navItem.active')
    if (!active?.scrollIntoView) return
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [loc.pathname])

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
        <nav className="sidebar" ref={sidebarRef}>
          <NavLink to="/products" className="navItem">
            Products
          </NavLink>
          {user ? (
            <>
              <NavLink to="/" end className="navItem">
                Dashboard
              </NavLink>
              <NavLink to="/warehouses" className="navItem">
                Warehouses
              </NavLink>
              <NavLink to="/reports" className="navItem">
                Monthly report
              </NavLink>
              <NavLink to="/analysis" className="navItem">
                Analysis
              </NavLink>
            </>
          ) : null}
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

