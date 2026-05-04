import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

function monthKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function DashboardPage() {
  const [warehouses, setWarehouses] = useState([])
  const [stats, setStats] = useState({
    products: 0,
    brands: 0,
    warehouses: 0,
    units: 0,
    low: 0,
  })
  const [topMovers, setTopMovers] = useState([])
  const [month, setMonth] = useState(monthKey(new Date()))
  const [error, setError] = useState('')

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

  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1, 0, 0, 0)
    const end = new Date(y, m, 1, 0, 0, 0)
    return { start, end }
  }, [month])

  useEffect(() => {
    let cancelled = false
    async function loadMovers() {
      setError('')
      const { data, error: e } = await supabase.rpc('monthly_movement_report', {
        p_warehouse_id: null,
        p_start: range.start.toISOString(),
        p_end: range.end.toISOString(),
      })
      if (cancelled) return
      if (e) {
        setError(e.message)
        setTopMovers([])
        return
      }
      const lines = data ?? []
      const sorted = [...lines]
        .map((l) => ({
          product_id: l.product_id,
          name: l.name,
          unit: l.display_unit || l.unit,
          net: Number(l.net || 0),
          qty_in: Number(l.qty_in || 0),
          qty_out: Number(l.qty_out || 0),
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 8)
      setTopMovers(sorted)
    }
    loadMovers()
    return () => {
      cancelled = true
    }
  }, [range.end, range.start])

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
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

        <div style={{ height: 14 }} />

        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Top movers (net) · month</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
              {range.start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '10px 12px',
                borderRadius: 10,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {error ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}

        <div style={{ height: 10 }} />
        <BarList items={topMovers} />
      </div>
    </div>
  )
}

function BarList({ items }) {
  const max = useMemo(() => {
    return Math.max(1, ...((items ?? []).map((i) => Math.abs(Number(i.net || 0))) || [1]))
  }, [items])

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {(items ?? []).map((i) => {
        const value = Number(i.net || 0)
        const pct = (Math.abs(value) / max) * 100
        const color = value >= 0 ? 'var(--ok)' : 'var(--low)'
        return (
          <div
            key={i.product_id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 12,
              background: 'rgba(255,255,255,0.02)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.name}
              </div>
              <div style={{ fontFamily: 'var(--mono)', color }}>
                {value >= 0 ? '+' : ''}
                {value.toLocaleString('en-IN')} {i.unit || ''}
              </div>
            </div>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 999 }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: color,
                  borderRadius: 999,
                  opacity: 0.35,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
              <div>In: {Number(i.qty_in || 0).toLocaleString('en-IN')}</div>
              <div>Out: {Number(i.qty_out || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>
        )
      })}

      {(items?.length ?? 0) === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No movement data for this month.</div>
      ) : null}
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

