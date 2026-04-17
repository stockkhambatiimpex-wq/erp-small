import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export function DashboardPage() {
  const [warehouses, setWarehouses] = useState([])
  const [stats, setStats] = useState({
    products: 0,
    brands: 0,
    warehouses: 0,
    units: 0,
    low: 0,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: wh }, { data: kpi }] = await Promise.all([
        supabase.from('warehouses').select('id,name').order('name'),
        supabase.rpc('kpi_overview'),
      ])
      if (cancelled) return
      setWarehouses(wh ?? [])
      if (kpi?.[0]) setStats(kpi[0])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const warehouseNames = useMemo(
    () => warehouses.map((w) => w.name).join(' • '),
    [warehouses],
  )

  return (
    <div>
      <div className="pageTitle">Dashboard</div>
      <div className="card">
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          Warehouses: {warehouseNames || '—'}
        </div>
        <div style={{ height: 12 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Kpi label="Products" value={stats.products} accent="var(--accent)" />
          <Kpi label="Brands" value={stats.brands} accent="var(--ok)" />
          <Kpi
            label="Warehouses"
            value={stats.warehouses}
            accent="#a78bfa"
          />
          <Kpi
            label="Total units (all WH)"
            value={Number(stats.units || 0).toLocaleString('en-IN')}
            accent="var(--text)"
          />
          <Kpi label="Low stock lines" value={stats.low} accent="var(--low)" />
        </div>
        
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        style={{
          color: 'var(--muted)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

