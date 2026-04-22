import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'
import { SelectField } from '../components/SelectField.jsx'

function isoDate(d) {
  // yyyy-mm-dd
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDayISO(dateStr) {
  // interpret as local date, but output as ISO
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0).toISOString()
}
function nextDayISO(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, m - 1, d + 1, 0, 0, 0).toISOString()
}

function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`
    return s
  }
  const headers = Object.keys(rows?.[0] ?? {})
  const lines = [headers.map(esc).join(',')]
  for (const r of rows ?? []) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function AnalysisPage() {
  const { isEditor } = useAuth()

  const [warehouses, setWarehouses] = useState([])
  const [brands, setBrands] = useState([])
  const [products, setProducts] = useState([])

  const [warehouseId, setWarehouseId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [productId, setProductId] = useState('')

  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => isoDate(today), [today])
  const [from, setFrom] = useState(isoDate(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(todayStr)

  const [stockRows, setStockRows] = useState([])
  const [movementRows, setMovementRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const productById = useMemo(() => {
    const m = new Map()
    for (const p of products ?? []) m.set(p.id, p)
    return m
  }, [products])

  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      const [{ data: wh }, { data: br }, { data: pr }] = await Promise.all([
        supabase.from('warehouses').select('id,name').order('name'),
        supabase.from('brands').select('id,name').order('name'),
        supabase.from('products').select('id,name,sku,brand_id').eq('active', true).order('name'),
      ])
      if (cancelled) return
      setWarehouses(wh ?? [])
      setBrands(br ?? [])
      setProducts(pr ?? [])
    }
    loadMeta()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredProductIds = useMemo(() => {
    const out = []
    for (const p of products ?? []) {
      if (brandId && p.brand_id !== brandId) continue
      if (productId && p.id !== productId) continue
      out.push(p.id)
    }
    return out
  }, [brandId, productId, products])

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setError('')
      setBusy(true)

      // Current stock
      let stockQ = supabase.from('v_current_stock').select('product_id,warehouse_id,qty,as_of')
      if (warehouseId) stockQ = stockQ.eq('warehouse_id', warehouseId)
      if (filteredProductIds.length) stockQ = stockQ.in('product_id', filteredProductIds)
      const { data: sData, error: sErr } = await stockQ

      if (cancelled) return
      if (sErr) {
        setBusy(false)
        setError(sErr.message)
        setStockRows([])
        setMovementRows([])
        return
      }

      // Movements in date range
      let movQ = supabase
        .from('stock_movements')
        .select('id,created_at,product_id,warehouse_id,type,qty,remark')
        .gte('created_at', startOfDayISO(from))
        .lt('created_at', nextDayISO(to))
        .order('created_at', { ascending: true })

      if (warehouseId) movQ = movQ.eq('warehouse_id', warehouseId)
      if (filteredProductIds.length) movQ = movQ.in('product_id', filteredProductIds)
      const { data: mData, error: mErr } = await movQ

      setBusy(false)
      if (cancelled) return
      if (mErr) {
        setError(mErr.message)
        setStockRows(sData ?? [])
        setMovementRows([])
        return
      }

      setStockRows(sData ?? [])
      setMovementRows(mData ?? [])
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [brandId, filteredProductIds, from, productId, to, warehouseId])

  const stockByProduct = useMemo(() => {
    const map = new Map()
    for (const r of stockRows ?? []) {
      if (!r?.product_id) continue
      if (!map.has(r.product_id)) map.set(r.product_id, { total: 0, byWarehouse: new Map() })
      const entry = map.get(r.product_id)
      const qty = Number(r.qty || 0)
      entry.total += qty
      entry.byWarehouse.set(r.warehouse_id, qty)
    }
    return map
  }, [stockRows])

  const moved = useMemo(() => {
    const productIds = new Set()
    const warehouseIds = new Set()
    for (const m of movementRows ?? []) {
      if (m?.product_id) productIds.add(m.product_id)
      if (m?.warehouse_id) warehouseIds.add(m.warehouse_id)
    }
    return { productIds, warehouseIds }
  }, [movementRows])

  const pieData = useMemo(() => {
    const arr = []
    for (const [pid, v] of stockByProduct.entries()) {
      // Apply date range filter: only show items that moved in the selected range.
      if (!moved.productIds.has(pid)) continue
      const p = productById.get(pid)
      if (!p) continue
      const qty = Number(v.total || 0)
      if (qty <= 0) continue
      arr.push({ id: pid, label: p.name, value: qty })
    }
    arr.sort((a, b) => b.value - a.value)
    const top = arr.slice(0, 8)
    const rest = arr.slice(8).reduce((s, x) => s + x.value, 0)
    if (rest > 0) top.push({ id: 'other', label: 'Other', value: rest })
    return top
  }, [moved, productById, stockByProduct])

  const lineOutData = useMemo(() => {
    const map = new Map()
    for (const m of movementRows ?? []) {
      if (m.type !== 'sub') continue
      const day = String(m.created_at).slice(0, 10)
      map.set(day, (map.get(day) ?? 0) + Number(m.qty || 0))
    }
    const days = []
    const fromD = new Date(from + 'T00:00:00')
    const toD = new Date(to + 'T00:00:00')
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      const k = isoDate(d)
      days.push({ x: k, y: Number(map.get(k) ?? 0) })
    }
    return days
  }, [from, movementRows, to])

  const barData = useMemo(() => {
    // Bar graph: stock out quantity (type=sub) grouped by warehouse for selected date range.
    const byWh = new Map()
    for (const m of movementRows ?? []) {
      if (m.type !== 'sub') continue
      const wh = m.warehouse_id
      if (!wh) continue
      byWh.set(wh, (byWh.get(wh) ?? 0) + Number(m.qty || 0))
    }

    const out = (warehouses ?? []).map((w) => ({
      id: w.id,
      label: w.name,
      value: Number(byWh.get(w.id) ?? 0),
    }))

    return out.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  }, [movementRows, warehouses])

  const clusterData = useMemo(() => {
    // Cluster graph: grouped bars for top products across warehouses
    const arr = []
    for (const [pid, v] of stockByProduct.entries()) {
      if (!moved.productIds.has(pid)) continue
      const p = productById.get(pid)
      if (!p) continue
      const qty = Number(v.total || 0)
      if (qty <= 0) continue
      arr.push({ pid, name: p.name, total: qty })
    }
    arr.sort((a, b) => b.total - a.total)
    const top = arr.slice(0, 6)
    const series = (warehouses ?? [])
      .filter((w) => (!warehouseId || w.id === warehouseId) && moved.warehouseIds.has(w.id))
      .slice(0, 6)
      .map((w) => ({ id: w.id, label: w.name }))

    const points = top.map((t) => {
      const entry = stockByProduct.get(t.pid)
      const vals = series.map((s) => Number(entry?.byWarehouse?.get(s.id) ?? 0))
      return { id: t.pid, label: t.name, values: vals }
    })

    return { series, points }
  }, [moved, productById, stockByProduct, warehouseId, warehouses])

  async function exportCsv() {
    if (!isEditor) return
    setError('')
    setBusy(true)
    let movQ = supabase
      .from('stock_movements')
      .select('created_at,product_id,warehouse_id,type,qty,remark')
      .gte('created_at', startOfDayISO(from))
      .lt('created_at', nextDayISO(to))
      .order('created_at', { ascending: true })

    if (warehouseId) movQ = movQ.eq('warehouse_id', warehouseId)
    if (filteredProductIds.length) movQ = movQ.in('product_id', filteredProductIds)
    const { data, error: e } = await movQ
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }

    const rows =
      (data ?? []).map((r) => ({
        created_at: r.created_at,
        warehouse: warehouses.find((w) => w.id === r.warehouse_id)?.name ?? r.warehouse_id,
        product: productById.get(r.product_id)?.name ?? r.product_id,
        sku: productById.get(r.product_id)?.sku ?? '',
        type: r.type,
        qty: r.qty,
        remark: r.remark ?? '',
      })) ?? []

    downloadText(`stock_movements_${from}_to_${to}.csv`, toCsv(rows))
  }

  return (
    <div>
      <div className="pageTitle">Analysis</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field" style={{ flex: '1 1 220px' }}>
            <div className="label">Warehouse</div>
            <SelectField
              value={warehouseId}
              onChange={(v) => setWarehouseId(v)}
              options={[
                { value: '', label: 'All warehouses' },
                ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
          </label>

          <label className="field" style={{ flex: '1 1 220px' }}>
            <div className="label">Brand</div>
            <SelectField
              value={brandId}
              onChange={(v) => setBrandId(v)}
              options={[
                { value: '', label: 'All brands' },
                ...(brands ?? []).map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </label>

          <label className="field" style={{ flex: '1 1 260px' }}>
            <div className="label">Product</div>
            <SelectField
              value={productId}
              onChange={(v) => setProductId(v)}
              options={[
                { value: '', label: 'All products' },
                ...(products ?? [])
                  .filter((p) => (!brandId ? true : p.brand_id === brandId))
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>

          <label className="field" style={{ flex: '0 0 170px' }}>
            <div className="label">From</div>
            <input
              type="date"
              value={from}
              max={todayStr}
              onChange={(e) => {
                const v = e.target.value
                setFrom(v > todayStr ? todayStr : v)
              }}
            />
          </label>
          <label className="field" style={{ flex: '0 0 170px' }}>
            <div className="label">To</div>
            <input
              type="date"
              value={to}
              max={todayStr}
              onChange={(e) => {
                const v = e.target.value
                setTo(v > todayStr ? todayStr : v)
              }}
            />
          </label>

          {isEditor ? (
            <button className="btn btnPrimary" disabled={busy} onClick={exportCsv}>
              Export CSV
            </button>
          ) : null}
        </div>

        {error ? (
          <div style={{ marginTop: 12 }} className="error">
            {error}
          </div>
        ) : null}

        <div style={{ height: 12 }} />
        <div className="analysisGrid">
          <ChartCard title="Available products quantity (pie)" subtitle="Current stock by product">
            <PieChart data={pieData} />
          </ChartCard>

          <ChartCard title="Stocks out vs days (line)" subtitle="Daily outward (type=sub)">
            <LineChart data={lineOutData} />
          </ChartCard>

          <ChartCard
            title="Stock out quantity · warehouse wise (bar)"
            subtitle="Sum of outward (type=sub) by warehouse in selected date range"
          >
            <BarChart data={barData} />
          </ChartCard>

          <ChartCard title="Cluster graph" subtitle="Top products grouped by warehouse">
            <ClusterChart series={clusterData.series} points={clusterData.points} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="analysisCard">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
      </div>
      {subtitle ? <div style={{ marginTop: 4, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>{subtitle}</div> : null}
      <div style={{ height: 10 }} />
      {children}
    </div>
  )
}

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: tip.x,
        top: tip.y,
        transform: 'translate(10px, 10px)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '8px 10px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        zIndex: 5,
        maxWidth: 240,
      }}
    >
      <div style={{ fontWeight: 900, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tip.title}
      </div>
      {tip.subtitle ? (
        <div style={{ marginTop: 2, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
          {tip.subtitle}
        </div>
      ) : null}
      <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>
        {tip.value}
      </div>
    </div>
  )
}

function PieChart({ data }) {
  const size = 220
  const r = 88
  const c = size / 2
  const total = (data ?? []).reduce((s, x) => s + Number(x.value || 0), 0) || 1

  const colors = ['var(--accent)', 'var(--ok)', 'var(--low)', 'var(--text)', 'var(--muted)']
  const [tip, setTip] = useState(null)

  const slices = (data ?? []).reduce(
    (acc, d, idx) => {
      const frac = Number(d.value || 0) / total
      const a0 = acc.a
      const a1 = a0 + frac * Math.PI * 2
      const x0 = c + r * Math.cos(a0)
      const y0 = c + r * Math.sin(a0)
      const x1 = c + r * Math.cos(a1)
      const y1 = c + r * Math.sin(a1)
      const large = frac > 0.5 ? 1 : 0
      const path = `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
      return {
        a: a1,
        slices: [...acc.slices, { ...d, path, color: colors[idx % colors.length] }],
      }
    },
    { a: -Math.PI / 2, slices: [] },
  ).slices

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onMouseLeave={() => setTip(null)}
          onTouchEnd={() => setTip(null)}
        >
        <circle cx={c} cy={c} r={r} fill="rgba(255,255,255,0.03)" stroke="var(--border)" />
        {slices.map((s) => (
          <path
            key={s.id}
            d={s.path}
            fill={s.color}
            opacity={0.85}
            stroke="var(--bg)"
            strokeWidth="1"
            onMouseMove={(e) =>
              setTip({
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
                title: s.label,
                subtitle: 'Available qty',
                value: Number(s.value || 0).toLocaleString('en-IN'),
              })
            }
            onTouchStart={(e) => {
              const t = e.touches?.[0]
              if (!t) return
              const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
              const x = rect ? t.clientX - rect.left : 0
              const y = rect ? t.clientY - rect.top : 0
              setTip({
                x,
                y,
                title: s.label,
                subtitle: 'Available qty',
                value: Number(s.value || 0).toLocaleString('en-IN'),
              })
            }}
          />
        ))}
        <circle cx={c} cy={c} r={46} fill="var(--surface)" stroke="var(--border)" />
        <text x={c} y={c - 4} textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="900">
          {Number(total).toLocaleString('en-IN')}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" fill="var(--muted)" fontFamily="var(--mono)" fontSize="11">
          Total qty
        </text>
        </svg>
        <Tooltip tip={tip} />
      </div>
      <div style={{ display: 'grid', gap: 6, flex: '1 1 220px', minWidth: 0 }}>
        {(data ?? []).map((d, i) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }} />
              <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
              {Number(d.value || 0).toLocaleString('en-IN')}
            </div>
          </div>
        ))}
        {(data?.length ?? 0) === 0 ? <div style={{ color: 'var(--muted)' }}>No available stock.</div> : null}
      </div>
    </div>
  )
}

function LineChart({ data }) {
  const w = 520
  const h = 220
  const pad = 26
  const maxY = Math.max(1, ...((data ?? []).map((d) => Number(d.y || 0)) || [1]))
  const n = Math.max(1, (data ?? []).length)
  const [tip, setTip] = useState(null)

  const pts = (data ?? []).map((d, i) => {
    const x = pad + (i / Math.max(1, n - 1)) * (w - pad * 2)
    const y = h - pad - (Number(d.y || 0) / maxY) * (h - pad * 2)
    return { x, y, d }
  })
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onMouseLeave={() => setTip(null)}
        onMouseMove={(e) => {
          const x = e.nativeEvent.offsetX
          const idx = Math.round(((x - pad) / Math.max(1, w - pad * 2)) * Math.max(1, n - 1))
          const clamped = Math.min(Math.max(idx, 0), Math.max(0, n - 1))
          const p = pts[clamped]
          if (!p) return
          setTip({
            x: p.x,
            y: p.y,
            title: p.d.x,
            subtitle: 'Stock out (qty)',
            value: Number(p.d.y || 0).toLocaleString('en-IN'),
          })
        }}
        onTouchStart={(e) => {
          const t = e.touches?.[0]
          if (!t) return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = t.clientX - rect.left
          const idx = Math.round(((x - pad) / Math.max(1, rect.width - (pad * 2 * rect.width) / w)) * Math.max(1, n - 1))
          const clamped = Math.min(Math.max(idx, 0), Math.max(0, n - 1))
          const p = pts[clamped]
          if (!p) return
          setTip({
            x: p.x,
            y: p.y,
            title: p.d.x,
            subtitle: 'Stock out (qty)',
            value: Number(p.d.y || 0).toLocaleString('en-IN'),
          })
        }}
        onTouchEnd={() => setTip(null)}
      >
        <rect x="0" y="0" width={w} height={h} fill="rgba(255,255,255,0.02)" stroke="var(--border)" rx="14" />
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = h - pad - t * (h - pad * 2)
        const v = Math.round(t * maxY)
        return (
          <g key={t}>
            <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="rgba(255,255,255,0.06)" />
            <text x={8} y={y + 4} fill="var(--muted)" fontFamily="var(--mono)" fontSize="10">
              {v}
            </text>
          </g>
        )
      })}
      <path d={path} fill="none" stroke="var(--danger)" strokeWidth="2.5" />
      {pts.map((p) => (
        <circle key={p.d.x} cx={p.x} cy={p.y} r="3.2" fill="var(--danger)" />
      ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

function BarChart({ data }) {
  const w = 520
  const h = 240
  const pad = 28
  const items = (data ?? []).slice(0, 12)
  const maxV = Math.max(1, ...items.map((d) => Number(d.value || 0)))
  const barW = (w - pad * 2) / Math.max(1, items.length)
  const [tip, setTip] = useState(null)

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} onMouseLeave={() => setTip(null)} onTouchEnd={() => setTip(null)}>
        <rect x="0" y="0" width={w} height={h} fill="rgba(255,255,255,0.02)" stroke="var(--border)" rx="14" />
      {items.map((d, i) => {
        const v = Number(d.value || 0)
        const bh = (v / maxV) * (h - pad * 2 - 18)
        const x = pad + i * barW + 4
        const y = h - pad - bh
        return (
          <g key={d.id}>
            <rect
              x={x}
              y={y}
              width={Math.max(6, barW - 8)}
              height={bh}
              fill="var(--accent)"
              opacity="0.85"
              rx="8"
              onMouseMove={(e) =>
                setTip({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  title: d.label,
                  subtitle: 'outward qty',
                  value: Number(v || 0).toLocaleString('en-IN'),
                })
              }
              onTouchStart={(e) => {
                const t = e.touches?.[0]
                if (!t) return
                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                const xx = rect ? t.clientX - rect.left : 0
                const yy = rect ? t.clientY - rect.top : 0
                setTip({
                  x: xx,
                  y: yy,
                  title: d.label,
                  subtitle: 'Available qty',
                  value: Number(v || 0).toLocaleString('en-IN'),
                })
              }}
            />
            <text x={x + 2} y={h - 10} fill="var(--muted)" fontFamily="var(--mono)" fontSize="9">
              {String(d.label).slice(0, 10)}
            </text>
          </g>
        )
      })}
      {items.length === 0 ? (
        <text x={pad} y={h / 2} fill="var(--muted)" fontFamily="var(--mono)" fontSize="12">
          No data
        </text>
      ) : null}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

function ClusterChart({ series, points }) {
  const w = 520
  const h = 260
  const pad = 28
  const s = series ?? []
  const p = points ?? []
  const maxV = Math.max(
    1,
    ...p.flatMap((x) => (x.values ?? []).map((v) => Number(v || 0))),
  )

  const groupW = (w - pad * 2) / Math.max(1, p.length)
  const barW = (groupW - 12) / Math.max(1, s.length)
  const palette = ['var(--accent)', 'var(--ok)', 'var(--low)', 'var(--text)', 'var(--muted)']
  const [tip, setTip] = useState(null)

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} onMouseLeave={() => setTip(null)} onTouchEnd={() => setTip(null)}>
          <rect x="0" y="0" width={w} height={h} fill="rgba(255,255,255,0.02)" stroke="var(--border)" rx="14" />
        {p.map((pt, i) => {
          const gx = pad + i * groupW
          return (
            <g key={pt.id}>
              {(pt.values ?? []).map((v, j) => {
                const val = Number(v || 0)
                const bh = (val / maxV) * (h - pad * 2 - 18)
                const x = gx + 6 + j * barW
                const y = h - pad - bh
                return (
                  <rect
                    key={j}
                    x={x}
                    y={y}
                    width={Math.max(4, barW - 4)}
                    height={bh}
                    fill={palette[j % palette.length]}
                    opacity="0.8"
                    rx="6"
                    onMouseMove={(e) =>
                      setTip({
                        x: e.nativeEvent.offsetX,
                        y: e.nativeEvent.offsetY,
                        title: pt.label,
                        subtitle: s[j]?.label || 'Series',
                        value: Number(val || 0).toLocaleString('en-IN'),
                      })
                    }
                    onTouchStart={(e) => {
                      const t = e.touches?.[0]
                      if (!t) return
                      const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                      const xx = rect ? t.clientX - rect.left : 0
                      const yy = rect ? t.clientY - rect.top : 0
                      setTip({
                        x: xx,
                        y: yy,
                        title: pt.label,
                        subtitle: s[j]?.label || 'Series',
                        value: Number(val || 0).toLocaleString('en-IN'),
                      })
                    }}
                  />
                )
              })}
              <text x={gx + 6} y={h - 10} fill="var(--muted)" fontFamily="var(--mono)" fontSize="9">
                {String(pt.label).slice(0, 10)}
              </text>
            </g>
          )
        })}
        {p.length === 0 ? (
          <text x={pad} y={h / 2} fill="var(--muted)" fontFamily="var(--mono)" fontSize="12">
            No data
          </text>
        ) : null}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        {(s ?? []).map((x, idx) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: palette[idx % palette.length] }} />
            <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>{x.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

