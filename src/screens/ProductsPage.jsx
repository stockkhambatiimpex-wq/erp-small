import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'
import { SelectField } from '../components/SelectField.jsx'

export function ProductsPage() {
  const { isEditor } = useAuth()
  const [q, setQ] = useState('')
  const [brandId, setBrandId] = useState('')
  const [brands, setBrands] = useState([])
  const [rows, setRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [modal, setModal] = useState({ open: false, mode: 'add', item: null })
  const [adj, setAdj] = useState({ open: false, product: null })

  async function loadMeta() {
    const [{ data: b }, { data: w }] = await Promise.all([
      supabase.from('brands').select('id,name').order('name'),
      supabase.from('warehouses').select('id,name').order('name'),
    ])
    setBrands(b ?? [])
    setWarehouses(w ?? [])
  }

  async function loadProducts() {
    setError('')
    setBusy(true)
    const query = supabase
      .from('products')
      .select(
        'id,sku,name,category,unit,min_qty,notes,warehouse_id,brand:brands(id,name),created_at',
      )
      .order('name')
      .limit(250)

    if (brandId) query.eq('brand_id', brandId)
    if (q.trim()) {
      const term = q.trim()
      query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
    }

    const { data, error: e } = await query
    if (e) {
      setBusy(false)
      setError(e.message)
      return
    }
    const products = data ?? []
    const ids = products.map((p) => p.id).filter(Boolean)
    if (ids.length === 0) {
      setBusy(false)
      setRows([])
      return
    }

    const { data: stockRows, error: sErr } = await supabase
      .from('v_current_stock')
      .select('product_id,warehouse_id,qty')
      .in('product_id', ids)

    setBusy(false)
    if (sErr) {
      setError(sErr.message)
      setRows(products)
      return
    }

    const byProduct = {}
    for (const r of stockRows ?? []) {
      const pid = r.product_id
      if (!pid) continue
      const wh = r.warehouse_id
      const qty = Number(r.qty || 0)
      if (!byProduct[pid]) byProduct[pid] = { total: 0, byWarehouse: {} }
      byProduct[pid].total += qty
      if (wh) byProduct[pid].byWarehouse[wh] = qty
    }

    setRows(
      products.map((p) => ({
        ...p,
        stock_total: byProduct[p.id]?.total ?? 0,
        stock_by_warehouse: byProduct[p.id]?.byWarehouse ?? {},
      })),
    )
  }

  async function deleteProduct(product) {
    if (!isEditor) return
    const ok = window.confirm(
      `Delete this product?\n\n${product?.name || 'Product'}\n\nThis will also delete its stock movements.`,
    )
    if (!ok) return
    setError('')
    const { error: e } = await supabase.from('products').delete().eq('id', product.id)
    if (e) {
      setError(e.message)
      return
    }
    loadProducts()
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMeta()
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, brandId])

  const brandOptions = useMemo(
    () => [{ id: '', name: 'All brands' }, ...(brands ?? [])],
    [brands],
  )

  return (
    <div>
      <div className="pageTitle">Products</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product or SKU"
            style={inputStyle}
          />
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            style={inputStyle}
          >
            {brandOptions.map((b) => (
              <option key={b.id || 'all'} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {isEditor ? (
            <button
              className="btn btnPrimary"
              onClick={() => setModal({ open: true, mode: 'add', item: null })}
            >
              Add product
            </button>
          ) : null}
        </div>

        {error ? (
          <div style={{ marginTop: 12 }} className="error">
            {error}
          </div>
        ) : null}

        <div style={{ height: 14 }} />
        <div className="productGrid">
          {rows.map((p) => {
            const total = Number(p.stock_total || 0)
            const min = Number(p.min_qty || 0)
            const isLow = min > 0 && total < min
            return (
              <div key={p.id} className="productCard">
                <div className="productCardTop">
                  <div style={{ minWidth: 0 }}>
                    <div className="productName">{p.name}</div>
                    <div className="productMeta">
                      <span className="pill">{p.sku || '—'}</span>
                      <span className="pill">{p.brand?.name || '—'}</span>
                      <span className="pill">{p.category || '—'}</span>
                      <span className="pill">{p.unit || '—'}</span>
                    </div>
                  </div>
                  <div className={`stockBadge ${isLow ? 'low' : 'ok'}`}>
                    {isLow ? 'Low' : 'OK'}
                  </div>
                </div>

                <div className="productStockLine">
                  <div className="stockTotal">
                    {total.toLocaleString('en-IN')} {p.unit || ''}
                  </div>
                  <div className="stockMin">
                    Min: {min.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="whChips">
                  {(warehouses ?? []).map((w) => {
                    const q = Number(p.stock_by_warehouse?.[w.id] || 0)
                    return (
                      <div key={w.id} className={`whChip ${q > 0 ? 'has' : ''}`}>
                        {w.name}: {q}
                      </div>
                    )
                  })}
                </div>

                {p.notes ? <div className="productNotes">{p.notes}</div> : null}

                <div className="productActions">
                  {isEditor ? (
                    <button className="btn btnIcon" onClick={() => setAdj({ open: true, product: p })}>
                      +
                    </button>
                  ) : null}
                  {isEditor ? (
                    <button
                      className="btn btnIcon"
                      onClick={() => setModal({ open: true, mode: 'edit', item: p })}
                      aria-label="Edit"
                    >
                      ✎
                    </button>
                  ) : null}
                  {isEditor ? (
                    <button
                      className="btn btnIcon btnDanger"
                      onClick={() => deleteProduct(p)}
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}

          {rows.length === 0 && !busy ? (
            <div style={{ color: 'var(--muted)' }}>No products found.</div>
          ) : null}
        </div>
      </div>

      {modal.open ? (
        <ProductModal
          brands={brands}
          mode={modal.mode}
          item={modal.item}
          onClose={() => setModal({ open: false, mode: 'add', item: null })}
          onSaved={() => {
            setModal({ open: false, mode: 'add', item: null })
            loadProducts()
          }}
        />
      ) : null}

      {adj.open ? (
        <AdjustModal
          product={adj.product}
          warehouses={warehouses}
          onClose={() => setAdj({ open: false, product: null })}
          onApplied={() => {
            setAdj({ open: false, product: null })
          }}
        />
      ) : null}
    </div>
  )
}

const CATEGORY_OPTIONS = [
  'Waterproofing',
  'Tile Adhesive',
  'Grouting',
  'Sealant',
  'Primer',
  'Crack Filler',
  'Repair Mortar',
  'Injection Grout',
  'Building Chemical',
  'Other',
]

function ProductModal({ brands, mode, item, onClose, onSaved }) {
  const { isEditor } = useAuth()
  const [sku, setSku] = useState(item?.sku || '')
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(item?.category || '')
  const [unit, setUnit] = useState(item?.unit || 'Pcs')
  const [minQty, setMinQty] = useState(item?.min_qty ?? 0)
  const [notes, setNotes] = useState(item?.notes || '')
  const [brandId, setBrandId] = useState(item?.brand?.id || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!isEditor) return
    setError('')
    if (!name.trim()) {
      setError('Product name is required.')
      return
    }
    setBusy(true)
    const payload = {
      sku: sku.trim() || null,
      name: name.trim(),
      category: category.trim() || null,
      unit,
      min_qty: Number(minQty || 0),
      notes: notes.trim() || null,
      brand_id: brandId || null,
      // Products are global. Stock is tracked per-warehouse in stock movements.
      warehouse_id: null,
    }

    const res =
      mode === 'edit'
        ? await supabase.from('products').update(payload).eq('id', item.id)
        : await supabase.from('products').insert(payload)

    setBusy(false)
    if (res.error) {
      setError(res.error.message)
      return
    }

    onSaved()
  }

  return (
    <Modal
      title={mode === 'edit' ? 'Edit Product' : 'Add Product'}
      subtitle="Fill in the product details below"
      onClose={onClose}
    >
      {error ? <div className="error">{error}</div> : null}
      <div className="modalGrid2">
        <label className="field">
          <div className="label">SKU / Code</div>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. KI-ZH-001"
          />
        </label>
        <label className="field">
          <div className="label">Brand</div>
          <SelectField
            value={brandId}
            onChange={(v) => setBrandId(v)}
            placeholder="Select"
            options={[
              { value: '', label: 'Select' },
              ...(brands ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </label>
      </div>
      <label className="field">
        <div className="label">Product name *</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full product name"
        />
      </label>
      <div className="modalGrid2">
        <label className="field">
          <div className="label">Category</div>
          <SelectField
            value={category}
            onChange={(v) => setCategory(v)}
            placeholder="Select"
            options={[
              { value: '', label: 'Select' },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: c })),
            ]}
          />
        </label>
        <label className="field">
          <div className="label">Unit</div>
          <SelectField
            value={unit}
            onChange={(v) => setUnit(v)}
            options={['Pcs', 'Bags', 'Litres', 'Kgs', 'Rolls', 'Boxes', 'Drums', 'Sheets', 'Bundle'].map(
              (u) => ({ value: u, label: u }),
            )}
          />
        </label>
      </div>
      <div className="modalGrid2">
        <label className="field">
          <div className="label">Min level</div>
          <input
            type="number"
            min={0}
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
          />
        </label>
        <label className="field">
          <div className="label">Notes / Variant</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Grey colour, 20kg pack"
          />
        </label>
      </div>

      <div className="modalFooter">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btnPrimary btnWidePrimary"
          onClick={save}
          disabled={busy || !isEditor}
        >
          {busy ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Save Product'}
        </button>
      </div>
    </Modal>
  )
}

function AdjustModal({ product, warehouses, onClose, onApplied }) {
  const { isEditor } = useAuth()
  const [currentByWarehouse, setCurrentByWarehouse] = useState({})
  const [ops, setOps] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadCurrent() {
      if (!product?.id) return
      const { data, error: e } = await supabase
        .from('v_current_stock')
        .select('warehouse_id,qty')
        .eq('product_id', product.id)
      if (cancelled) return
      if (e) {
        setError(e.message)
        return
      }
      const map = {}
      for (const row of data ?? []) map[row.warehouse_id] = Number(row.qty || 0)
      setCurrentByWarehouse(map)
    }
    loadCurrent()
    return () => {
      cancelled = true
    }
  }, [product?.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOps((prev) => {
      const byId = new Map((prev ?? []).map((o) => [o.warehouse_id, o]))
      return (warehouses ?? []).map((w) => {
        const existing = byId.get(w.id)
        return (
          existing ?? {
            warehouse_id: w.id,
            type: 'add',
            qty: '',
            remark: '',
            touched: false,
          }
        )
      })
    })
  }, [warehouses])

  const totals = useMemo(() => {
    let total = 0
    for (const w of warehouses ?? []) total += Number(currentByWarehouse?.[w.id] || 0)
    return { total }
  }, [currentByWarehouse, warehouses])

  async function apply() {
    if (!isEditor) {
      setError('Only editor can adjust stock.')
      return
    }
    setError('')
    const movements = []
    for (const o of ops ?? []) {
      if (!o?.warehouse_id) continue
      if (!o.touched) continue
      const val = Number(o.qty || 0)
      if (!Number.isFinite(val) || val < 0) {
        setError('Quantity must be 0 or more.')
        return
      }
      if (o.type !== 'set' && val <= 0) continue
      if (o.type === 'sub') {
        const current = Number(currentByWarehouse?.[o.warehouse_id] || 0)
        if (current <= 0) {
          setError('Cannot remove stock: current quantity is 0.')
          return
        }
        if (val > current) {
          setError(`Cannot remove ${val}. Current quantity is ${current}.`)
          return
        }
      }
      movements.push({
        product_id: product.id,
        warehouse_id: o.warehouse_id,
        type: o.type,
        qty: val,
        remark: String(o.remark || '').trim() || null,
      })
    }

    if (movements.length === 0) {
      setError('Enter at least one warehouse adjustment.')
      return
    }

    setBusy(true)
    const { error: e } = await supabase.from('stock_movements').insert(movements)
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    onApplied()
  }

  return (
    <Modal title={`Adjust stock · ${product.name}`} onClose={onClose}>
      {error ? <div className="error">{error}</div> : null}
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
        Total stock (all warehouses): {Number(totals.total || 0).toLocaleString('en-IN')}
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: 'grid', gap: 10 }}>
        {(warehouses ?? []).map((w) => {
          const current = Number(currentByWarehouse?.[w.id] || 0)
          const o = (ops ?? []).find((x) => x.warehouse_id === w.id) ?? {
            warehouse_id: w.id,
            type: 'add',
            qty: '',
            remark: '',
            touched: false,
          }
          return (
            <div
              key={w.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 900 }}>{w.name}</div>
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  Current: {Number(current || 0).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="modalGrid2">
                <label className="field">
                  <div className="label">Type</div>
                  <SelectField
                    value={o.type}
                    onChange={(v) =>
                      setOps((prev) =>
                        (prev ?? []).map((x) =>
                          x.warehouse_id === w.id ? { ...x, type: v, touched: true } : x,
                        ),
                      )
                    }
                    options={[
                      { value: 'add', label: 'Add stock (inward)' },
                      { value: 'sub', label: 'Remove stock (outward)' },
                      { value: 'set', label: 'Set exact qty' },
                    ]}
                  />
                </label>
                <label className="field">
                  <div className="label">Quantity</div>
                  <input
                    type="number"
                    min={0}
                    value={o.qty}
                    onChange={(e) =>
                      setOps((prev) =>
                        (prev ?? []).map((x) =>
                          x.warehouse_id === w.id
                            ? { ...x, qty: e.target.value, touched: true }
                            : x,
                        ),
                      )
                    }
                    placeholder="0"
                  />
                </label>
              </div>
              <label className="field">
                <div className="label">Remark (optional)</div>
                <input
                  value={o.remark}
                  onChange={(e) =>
                    setOps((prev) =>
                      (prev ?? []).map((x) =>
                        x.warehouse_id === w.id
                          ? { ...x, remark: e.target.value, touched: true }
                          : x,
                      ),
                    )
                  }
                  placeholder="Optional note"
                />
              </label>
            </div>
          )
        })}
        {(warehouses?.length ?? 0) === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No warehouses found.</div>
        ) : null}
      </div>

      <div className="modalFooter">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btnPrimary btnWidePrimary" onClick={apply} disabled={busy || !isEditor}>
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </Modal>
  )
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">{title}</div>
            {subtitle ? <div className="modalSubtitle">{subtitle}</div> : null}
          </div>
          <button className="btn btnGhost" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
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

function Td({ children, muted, mono, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '10px 10px',
        borderBottom: '1px solid var(--border)',
        color: muted ? 'var(--muted)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  )
}

const inputStyle = {
  flex: '1 1 220px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '10px 12px',
  borderRadius: 10,
  outline: 'none',
}

