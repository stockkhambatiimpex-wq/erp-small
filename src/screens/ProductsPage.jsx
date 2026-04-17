import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'

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
    if (q.trim()) query.ilike('name', `%${q.trim()}%`)

    const { data, error: e } = await query
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    setRows(data ?? [])
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
            placeholder="Search product…"
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
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Name</Th>
                <Th>Brand</Th>
                <Th>Category</Th>
                <Th>Unit</Th>
                <Th>Min</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td mono muted>
                    {p.sku || '—'}
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    {p.notes ? (
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                        {p.notes}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{p.brand?.name || '—'}</Td>
                  <Td muted>{p.category || '—'}</Td>
                  <Td muted>{p.unit || '—'}</Td>
                  <Td mono muted>
                    {p.min_qty ?? 0}
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'end' }}>
                      {isEditor ? (
                        <button
                          className="btn"
                          onClick={() => setAdj({ open: true, product: p })}
                        >
                          Adjust stock
                        </button>
                      ) : null}
                      {isEditor ? (
                        <button
                          className="btn btnGhost"
                          onClick={() =>
                            setModal({ open: true, mode: 'edit', item: p })
                          }
                        >
                          Edit
                        </button>
                      ) : null}
                      {isEditor ? (
                        <button className="btn btnGhost" onClick={() => deleteProduct(p)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 && !busy ? (
                <tr>
                  <Td colSpan={7} muted>
                    No products found.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {modal.open ? (
        <ProductModal
          brands={brands}
          warehouses={warehouses}
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

function ProductModal({ brands, warehouses, mode, item, onClose, onSaved }) {
  const { isEditor } = useAuth()
  const [sku, setSku] = useState(item?.sku || '')
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(item?.category || '')
  const [unit, setUnit] = useState(item?.unit || 'Pcs')
  const [minQty, setMinQty] = useState(item?.min_qty ?? 0)
  const [notes, setNotes] = useState(item?.notes || '')
  const [brandId, setBrandId] = useState(item?.brand?.id || '')
  const [warehouseId, setWarehouseId] = useState(item?.warehouse_id || '')
  const [openingQty, setOpeningQty] = useState(0)
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
      warehouse_id: warehouseId || null,
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

    // On create, optionally set opening stock for a selected warehouse.
    if (mode !== 'edit') {
      const created = res.data?.[0]
      const qty = Number(openingQty || 0)
      if (created?.id && warehouseId && Number.isFinite(qty) && qty >= 0) {
        const { error: mErr } = await supabase.from('stock_movements').insert({
          product_id: created.id,
          warehouse_id: warehouseId,
          type: 'set',
          qty,
          remark: 'Opening stock',
        })
        if (mErr) {
          setError(mErr.message)
          return
        }
      }
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
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Select</option>
            {(brands ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <div className="label">Unit</div>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {['Pcs', 'Bags', 'Litres', 'Kgs', 'Rolls', 'Boxes', 'Drums', 'Sheets', 'Bundle'].map(
              (u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ),
            )}
          </select>
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

      <div className="modalGrid2">
        <label className="field">
          <div className="label">Warehouse</div>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Select</option>
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {mode !== 'edit' ? (
          <label className="field">
            <div className="label">Current qty *</div>
            <input
              type="number"
              min={0}
              value={openingQty}
              onChange={(e) => setOpeningQty(e.target.value)}
              placeholder="0"
            />
          </label>
        ) : (
          <div />
        )}
      </div>

      <div className="modalFooter">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btnPrimary btnWidePrimary"
          onClick={save}
          disabled={busy || !isEditor || !warehouseId}
        >
          {busy ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Save Product'}
        </button>
      </div>
    </Modal>
  )
}

function AdjustModal({ product, warehouses, onClose, onApplied }) {
  const { isEditor } = useAuth()
  const [warehouseId, setWarehouseId] = useState(warehouses?.[0]?.id || '')
  const [type, setType] = useState('add')
  const [qty, setQty] = useState(1)
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!isEditor) {
      setError('Only editor can adjust stock.')
      return
    }
    setError('')
    if (!warehouseId) {
      setError('Select a warehouse.')
      return
    }
    const val = Number(qty || 0)
    if (!Number.isFinite(val) || val < 0) {
      setError('Quantity must be 0 or more.')
      return
    }

    if (type === 'sub') {
      const { data, error: sErr } = await supabase
        .from('v_current_stock')
        .select('qty')
        .eq('product_id', product.id)
        .eq('warehouse_id', warehouseId)
        .maybeSingle()
      if (sErr) {
        setError(sErr.message)
        return
      }
      const current = Number(data?.qty || 0)
      if (current <= 0) {
        setError('Cannot remove stock: current quantity is 0.')
        return
      }
      if (val > current) {
        setError(`Cannot remove ${val}. Current quantity is ${current}.`)
        return
      }
    }

    setBusy(true)
    const { error: e } = await supabase.from('stock_movements').insert({
      product_id: product.id,
      warehouse_id: warehouseId,
      type,
      qty,
      remark: remark.trim() || null,
    })
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
      <div className="modalGrid2">
        <label className="field">
          <div className="label">Warehouse</div>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <div className="label">Type</div>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="add">Add stock (inward)</option>
            <option value="sub">Remove stock (outward)</option>
            <option value="set">Set exact qty</option>
          </select>
        </label>
      </div>
      <div className="modalGrid2">
        <label className="field">
          <div className="label">Quantity</div>
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <label className="field">
          <div className="label">Remark (optional)</div>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} />
        </label>
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

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 860,
}

