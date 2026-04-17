import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

function monthKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function ReportsPage() {
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [month, setMonth] = useState(monthKey(new Date()))
  const [lines, setLines] = useState([])
  const [productId, setProductId] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadWh() {
      const { data } = await supabase
        .from('warehouses')
        .select('id,name')
        .order('name')
      if (cancelled) return
      setWarehouses(data ?? [])
      setWarehouseId((prev) => prev ?? '')
    }
    loadWh()
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
    async function load() {
      setError('')
      setBusy(true)
      const { data, error: e } = await supabase.rpc('monthly_movement_report', {
        p_warehouse_id: warehouseId || null,
        p_start: range.start.toISOString(),
        p_end: range.end.toISOString(),
      })
      setBusy(false)
      if (cancelled) return
      if (e) {
        setError(e.message)
        setLines([])
        return
      }
      setLines(data ?? [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [warehouseId, range.start, range.end])

  const filterOptions = useMemo(() => {
    const products = (lines ?? [])
      .map((l) => ({ id: l.product_id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const uniqProducts = []
    const seenP = new Set()
    for (const p of products) {
      if (!p?.id || seenP.has(p.id)) continue
      seenP.add(p.id)
      uniqProducts.push(p)
    }

    const brands = Array.from(
      new Set((lines ?? []).map((l) => (l.brand_name || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    const cats = Array.from(
      new Set((lines ?? []).map((l) => (l.category || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    return { products: uniqProducts, brands, categories: cats }
  }, [lines])

  const filteredLines = useMemo(() => {
    return (lines ?? []).filter((l) => {
      if (productId && l.product_id !== productId) return false
      if (brand && (l.brand_name || '') !== brand) return false
      if (category && (l.category || '') !== category) return false
      return true
    })
  }, [lines, productId, brand, category])

  return (
    <div>
      <div className="pageTitle">Monthly report</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 220px' }}>
            <div className="label">Warehouse</div>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All warehouses</option>
              {(warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: '0 0 180px' }}>
            <div className="label">Month</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ height: 10 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 260px' }}>
            <div className="label">Product</div>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">All products</option>
              {filterOptions.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 200px' }}>
            <div className="label">Brand</div>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">All brands</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 200px' }}>
            <div className="label">Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {filterOptions.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div style={{ marginTop: 12 }} className="error">
            {error}
          </div>
        ) : null}

        <div style={{ height: 14 }} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Unit</Th>
                <Th>In</Th>
                <Th>Out</Th>
                <Th>Net</Th>
              </tr>
            </thead>
            <tbody>
              {(filteredLines ?? []).map((l) => (
                <tr key={l.product_id}>
                  <Td mono muted>
                    {l.sku || '—'}
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 800 }}>{l.name}</div>
                    <div style={{ color: 'var(--muted)' }}>
                      {(l.brand_name || '').trim()}
                      {l.category ? ` · ${l.category}` : ''}
                    </div>
                  </Td>
                  <Td muted>{l.unit}</Td>
                  <Td style={{ color: 'var(--ok)', fontFamily: 'var(--mono)' }}>
                    {Number(l.qty_in || 0).toLocaleString('en-IN')}
                  </Td>
                  <Td style={{ color: 'var(--low)', fontFamily: 'var(--mono)' }}>
                    {Number(l.qty_out || 0).toLocaleString('en-IN')}
                  </Td>
                  <Td style={{ fontFamily: 'var(--mono)' }}>
                    {Number(l.net || 0).toLocaleString('en-IN')}
                  </Td>
                </tr>
              ))}
              {!busy && (filteredLines?.length ?? 0) === 0 ? (
                <tr>
                  <Td colSpan={6} muted>
                    No movements for this month.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Th({ children }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 10px',
        fontSize: 11,
        fontFamily: 'var(--mono)',
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, muted, mono, colSpan, style }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '10px 10px',
        borderBottom: '1px solid var(--border)',
        color: muted ? 'var(--muted)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        verticalAlign: 'top',
        ...style,
      }}
    >
      {children}
    </td>
  )
}

