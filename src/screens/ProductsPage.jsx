import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'
import { SelectField } from '../components/SelectField.jsx'

export function ProductsPage() {
  const { isEditor } = useAuth()
  const [qRaw, setQRaw] = useState('')
  const [q, setQ] = useState('')
  const [searchMode, setSearchMode] = useState('all') // all | qty
  const [brandId, setBrandId] = useState('')
  const [brands, setBrands] = useState([])
  const [allRows, setAllRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const qDebounceRef = useRef(null)

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
    async function fetchProducts(selectColumns) {
      const query = supabase
        .from('products')
        .select(selectColumns)
        .order('name')
        .limit(500)

      // Search is handled client-side (fast token matching + suggestions).
      if (brandId) query.eq('brand_id', brandId)

      return await query
    }

    const selectV2 =
      'id,sku,name,category,unit,is_divisible,sub_unit,sub_unit_per_unit,min_qty,notes,warehouse_id,brand:brands(id,name),created_at'
    const selectV1 =
      'id,sku,name,category,unit,min_qty,notes,warehouse_id,brand:brands(id,name),created_at'

    let data
    let e
    ;({ data, error: e } = await fetchProducts(selectV2))
    if (e && /is_divisible|sub_unit|sub_unit_per_unit/i.test(e.message || '')) {
      // DB not migrated yet — fallback to old schema so the app keeps working.
      ;({ data, error: e } = await fetchProducts(selectV1))
    }
    if (e) {
      setBusy(false)
      setError(e.message)
      return
    }
    const products = data ?? []
    const ids = products.map((p) => p.id).filter(Boolean)
    if (ids.length === 0) {
      setBusy(false)
      setAllRows([])
      return
    }

    const { data: stockRows, error: sErr } = await supabase
      .from('v_current_stock')
      .select('product_id,warehouse_id,qty')
      .in('product_id', ids)

    setBusy(false)
    if (sErr) {
      setError(sErr.message)
      setAllRows(products)
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

    setAllRows(
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
  }, [brandId])

  const brandOptions = useMemo(
    () => [{ id: '', name: 'All brands' }, ...(brands ?? [])],
    [brands],
  )

  useEffect(() => {
    if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current)
    qDebounceRef.current = window.setTimeout(() => setQ(qRaw), 160)
    return () => {
      if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current)
    }
  }, [qRaw])

  const indexedRows = useMemo(() => {
    return (allRows ?? []).map((p) => ({
      ...p,
      _search: {
        name: normalizeForSearch(p?.name),
        sku: normalizeForSearch(p?.sku),
        brand: normalizeForSearch(p?.brand?.name),
        qtyStr: String(Number(p?.stock_total ?? 0)),
        minQtyStr: String(Number(p?.min_qty ?? 0)),
      },
    }))
  }, [allRows])

  const matcher = useMemo(() => createProductMatcher(q, searchMode), [q, searchMode])

  const rows = useMemo(() => {
    if (!matcher) return allRows ?? []
    return (indexedRows ?? []).filter((p) => matcher(p))
  }, [indexedRows, matcher, allRows])

  const suggestions = useMemo(() => {
    if (!q.trim()) return []
    const base = (indexedRows ?? []).filter((p) => matcher?.(p))
    const list = base.slice(0, 6)
    return list.map((p) => ({
      id: p.id,
      label: `${p.name}${p.sku ? ` · ${p.sku}` : ''}`,
      value: p.name,
    }))
  }, [indexedRows, matcher, q])

  const highlightTokens = useMemo(() => extractSearchTokens(q), [q])

  return (
    <div>
      <div className="pageTitle">Products</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 220 }}>
            <input
              value={qRaw}
              onChange={(e) => {
                setQRaw(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
              placeholder={
                searchMode === 'qty'
                    ? 'Search quantity (e.g. 10) or /regex/'
                    : 'Search name / SKU (e.g. 303 glue) or /regex/'
              }
              style={{ ...inputStyle, width: '100%' }}
            />
            {showSuggestions && suggestions.length > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  zIndex: 10,
                  boxShadow: '0 14px 40px rgba(0,0,0,0.24)',
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="btn"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      borderRadius: 0,
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      padding: '10px 12px',
                      background: 'transparent',
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setQRaw(s.value)
                      setQ(s.value)
                      setShowSuggestions(false)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <select value={searchMode} onChange={(e) => setSearchMode(e.target.value)} style={inputStyle}>
            <option value="all">Search: Name / SKU</option>
            <option value="qty">Search: Quantity</option>
          </select>

          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={inputStyle}>
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
            const displayUnit = (p.is_divisible ? p.sub_unit : p.unit) || ''
            const perRoll = Number(p.sub_unit_per_unit || 0)
            return (
              <div key={p.id} className="productCard">
                <div className="productCardTop">
                  <div style={{ minWidth: 0 }}>
                    <div className="productName">
                      <Highlight text={p.name} tokens={searchMode === 'all' ? highlightTokens : []} />
                    </div>
                    <div className="productMeta">
                      <span className="pill">
                        <Highlight text={p.sku || '—'} tokens={searchMode === 'all' ? highlightTokens : []} />
                      </span>
                      <span className="pill">
                        {p.brand?.name || '—'}
                      </span>
                      <span className="pill">{p.category || '—'}</span>
                      <span className="pill">{`Unit: ${p.unit || '—'}`}</span>
                      <span className="pill">{`Stock in: ${displayUnit || '—'}`}</span>
                    </div>
                    {p.is_divisible && perRoll > 0 ? (
                      <div className="helpText" style={{ marginTop: 6 }}>
                        1 {p.unit} = {perRoll.toLocaleString('en-IN')} {p.sub_unit || 'Sq m'}
                      </div>
                    ) : null}
                  </div>
                  <div className={`stockBadge ${isLow ? 'low' : 'ok'}`}>
                    {isLow ? 'Low' : 'OK'}
                  </div>
                </div>

                <div className="productStockLine">
                  <div className="stockTotal">
                    {total.toLocaleString('en-IN')} {displayUnit}
                  </div>
                  <div className="stockMin">
                    Min: {min.toLocaleString('en-IN')} {displayUnit}
                  </div>
                </div>

                <div className="whChips">
                  {(warehouses ?? []).map((w) => {
                    const q = Number(p.stock_by_warehouse?.[w.id] || 0)
                    const hasPer = p.is_divisible && perRoll > 0
                    const rollEq = hasPer ? q / perRoll : 0
                    return (
                      <div key={w.id} className={`whChip ${q > 0 ? 'has' : ''}`}>
                        {w.name}: {q.toLocaleString('en-IN')} {displayUnit}
                        {hasPer ? ` (${rollEq.toLocaleString('en-IN')} ${p.unit})` : ''}
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
  const [isDivisible, setIsDivisible] = useState(Boolean(item?.is_divisible))
  const [subUnitPerUnit, setSubUnitPerUnit] = useState(item?.sub_unit_per_unit ?? '')
  const [minQty, setMinQty] = useState(item?.min_qty ?? 0)
  const [notes, setNotes] = useState(item?.notes || '')
  const [brandId, setBrandId] = useState(item?.brand?.id || '')
  const [initWarehouseId, setInitWarehouseId] = useState('')
  const [initQty, setInitQty] = useState('')
  const [initQtyMode, setInitQtyMode] = useState('base') // base | unit (for divisible)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!isEditor) return
    setError('')
    if (!name.trim()) {
      setError('Product name is required.')
      return
    }
    if (unit === 'Rolls' && isDivisible) {
      const sqm = Number(subUnitPerUnit)
      if (!Number.isFinite(sqm) || sqm <= 0) {
        setError('Sq m per roll is required and must be greater than 0.')
        return
      }
    }
    if (mode === 'add' && initQty) {
      const q = Number(initQty)
      if (!Number.isFinite(q) || q < 0) {
        setError('Initial quantity must be 0 or more.')
        return
      }
      if (q > 0 && !initWarehouseId) {
        setError('Select a warehouse for initial stock.')
        return
      }
      if (q > 0 && unit === 'Rolls' && isDivisible && initQtyMode === 'unit') {
        const sqm = Number(subUnitPerUnit)
        if (!Number.isFinite(sqm) || sqm <= 0) {
          setError('Set "Sq m per roll" before entering initial qty in rolls.')
          return
        }
      }
    }
    setBusy(true)
    const payloadV2 = {
      sku: sku.trim() || null,
      name: name.trim(),
      category: category.trim() || null,
      unit,
      is_divisible: unit === 'Rolls' ? Boolean(isDivisible) : false,
      sub_unit: unit === 'Rolls' && isDivisible ? 'Sq m' : null,
      sub_unit_per_unit: unit === 'Rolls' && isDivisible ? Number(subUnitPerUnit) : null,
      min_qty: Number(minQty || 0),
      notes: notes.trim() || null,
      brand_id: brandId || null,
      // Products are global. Stock is tracked per-warehouse in stock movements.
      warehouse_id: null,
    }

    const payloadV1 = {
      sku: payloadV2.sku,
      name: payloadV2.name,
      category: payloadV2.category,
      unit: payloadV2.unit,
      min_qty: payloadV2.min_qty,
      notes: payloadV2.notes,
      brand_id: payloadV2.brand_id,
      warehouse_id: payloadV2.warehouse_id,
    }

    let res
    if (mode === 'edit') {
      res = await supabase.from('products').update(payloadV2).eq('id', item.id)
    } else {
      res = await supabase.from('products').insert(payloadV2).select('id').single()
    }

    if (res.error && /is_divisible|sub_unit|sub_unit_per_unit/i.test(res.error.message || '')) {
      // DB not migrated yet — save without new columns.
      if (mode === 'edit') {
        res = await supabase.from('products').update(payloadV1).eq('id', item.id)
      } else {
        res = await supabase.from('products').insert(payloadV1).select('id').single()
      }
    }

    const createdId = mode === 'add' ? res.data?.id : item?.id
    if (!res.error && mode === 'add' && createdId && initWarehouseId && Number(initQty || 0) > 0) {
      const raw = Number(initQty || 0)
      const factor =
        unit === 'Rolls' && isDivisible && initQtyMode === 'unit'
          ? Number(subUnitPerUnit)
          : 1
      const qtyBase = raw * factor
      const { error: mErr } = await supabase.from('stock_movements').insert([
        {
          product_id: createdId,
          warehouse_id: initWarehouseId,
          type: 'add',
          qty: qtyBase,
          remark: 'Initial stock',
        },
      ])
      if (mErr) {
        setBusy(false)
        setError(mErr.message)
        return
      }
    }

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
            onChange={(v) => {
              setUnit(v)
              if (v !== 'Rolls') {
                setIsDivisible(false)
                setSubUnitPerUnit('')
              }
            }}
            options={[
              'Pcs',
              'Bags',
              'Litres',
              'Kgs',
              'Rolls',
              'Bucket',
              'Boards',
              'Ply',
              'Boxes',
              'Drums',
              'Sheets',
              'Bundle',
            ].map((u) => ({ value: u, label: u }))}
          />
        </label>
      </div>
      {unit === 'Rolls' ? (
        <div className="modalGrid2">
          <label className="field">
            <div className="label">Divisible?</div>
            <SelectField
              value={isDivisible ? 'yes' : 'no'}
              onChange={(v) => {
                const yes = v === 'yes'
                setIsDivisible(yes)
                if (!yes) setSubUnitPerUnit('')
              }}
              options={[
                { value: 'no', label: 'No (track as full rolls)' },
                { value: 'yes', label: 'Yes (track by Sq m)' },
              ]}
            />
          </label>
          <label className="field">
            <div className="label">Sq m per roll</div>
            <input
              type="number"
              step="0.01"
              min={0}
              disabled={!isDivisible}
              value={subUnitPerUnit}
              onChange={(e) => setSubUnitPerUnit(e.target.value)}
              placeholder="e.g. 5.8"
            />
          </label>
        </div>
      ) : null}

      {mode === 'add' ? (
        <>
          <div style={{ height: 6 }} />
          <div className="sectionTitle">Initial stock (optional)</div>
          <div className="helpText">
            Set opening stock while creating a product. You can also use the <span style={{ fontFamily: 'var(--mono)' }}>+</span> button later.
          </div>
          <div className="modalGrid2">
            <label className="field">
              <div className="label">Warehouse</div>
              <SelectField
                value={initWarehouseId}
                onChange={(v) => setInitWarehouseId(v)}
                options={[
                  { value: '', label: 'Select' },
                  ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            </label>
            <label className="field">
              <div className="label">Quantity</div>
              <input
                type="number"
                min={0}
                step={unit === 'Rolls' && isDivisible && initQtyMode === 'base' ? '0.01' : '1'}
                value={initQty}
                onChange={(e) => setInitQty(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          {unit === 'Rolls' && isDivisible ? (
            <div className="modalGrid2">
              <label className="field">
                <div className="label">Enter qty in</div>
                <SelectField
                  value={initQtyMode}
                  onChange={(v) => setInitQtyMode(v)}
                  options={[
                    { value: 'base', label: 'Sq m' },
                    { value: 'unit', label: 'Rolls' },
                  ]}
                />
              </label>
              <div />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="modalGrid2">
        <label className="field">
          <div className="label">Min level</div>
          <input
            type="number"
            min={0}
            step={unit === 'Rolls' && isDivisible ? '0.01' : '1'}
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
  const [qtyMode, setQtyMode] = useState('base') // base | unit (only meaningful for divisible)

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
    const perUnit = Number(product?.sub_unit_per_unit)
    const isDiv = Boolean(product?.is_divisible)
    const factor = isDiv && qtyMode === 'unit' ? perUnit : 1
    if (isDiv && qtyMode === 'unit') {
      if (!Number.isFinite(perUnit) || perUnit <= 0) {
        setError('This product is divisible, but "Sq m per roll" is missing. Edit the product and set it.')
        return
      }
    }
    const movements = []
    for (const o of ops ?? []) {
      if (!o?.warehouse_id) continue
      if (!o.touched) continue
      const raw = Number(o.qty || 0)
      const val = raw * factor
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
        Total stock (all warehouses): {Number(totals.total || 0).toLocaleString('en-IN')}{' '}
        {(product?.is_divisible ? product?.sub_unit : product?.unit) || ''}
        {product?.is_divisible && Number(product?.sub_unit_per_unit) > 0 ? (
          <span>
            {' '}
            · 1 {product?.unit} = {Number(product?.sub_unit_per_unit).toLocaleString('en-IN')} {product?.sub_unit || 'Sq m'}
          </span>
        ) : null}
      </div>
      {product?.is_divisible ? (
        <div style={{ height: 10 }} />
      ) : null}
      {product?.is_divisible ? (
        <div className="modalGrid2">
          <label className="field">
            <div className="label">Enter qty in</div>
            <SelectField
              value={qtyMode}
              onChange={(v) => setQtyMode(v)}
              options={[
                { value: 'base', label: product?.sub_unit || 'Sq m' },
                { value: 'unit', label: product?.unit || 'Rolls' },
              ]}
            />
          </label>
          <div />
        </div>
      ) : null}
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
                  Current: {Number(current || 0).toLocaleString('en-IN')}{' '}
                  {(product?.is_divisible ? product?.sub_unit : product?.unit) || ''}
                  {product?.is_divisible && Number(product?.sub_unit_per_unit) > 0 ? (
                    <span>
                      {' '}
                      ({(Number(current || 0) / Number(product?.sub_unit_per_unit)).toLocaleString('en-IN')} {product?.unit})
                    </span>
                  ) : null}
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
                    step={product?.is_divisible && qtyMode === 'base' ? '0.01' : '1'}
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

function normalizeForSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function createProductMatcherWithMode(queryRaw, mode) {
  const query = normalizeForSearch(queryRaw)
  if (!query) return null

  // Allow explicit regex in the form /pattern/flags
  const regexMatch = String(queryRaw || '').trim().match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1], regexMatch[2] || 'i')
      return (p) => {
        const hay = getModeHaystack(p, mode)
        return re.test(hay)
      }
    } catch {
      // Fall back to non-regex search if invalid regex
    }
  }

  const tokens = extractSearchTokens(query)
  if (tokens.length === 0) return null

  return (p) => {
    const hay = getModeHaystack(p, mode)
    for (const t of tokens) {
      if (!t) continue
      if (hay.includes(t)) continue
      return false
    }
    return true
  }
}

function createProductMatcher(queryRaw, mode) {
  return createProductMatcherWithMode(queryRaw, mode || 'all')
}

function getModeHaystack(p, mode) {
  const s = p?._search
  if (mode === 'qty') return [s?.qtyStr, s?.minQtyStr].filter(Boolean).join(' ')
  // default: name + sku only (numeric-safe, partial via substring)
  return [s?.name, s?.sku].filter(Boolean).join(' ')
}

function extractSearchTokens(queryOrRaw) {
  const query = normalizeForSearch(queryOrRaw)
  if (!query) return []
  return query.split(' ').map((t) => t.trim()).filter(Boolean)
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, tokens }) {
  const raw = String(text ?? '')
  const cleanTokens = (tokens ?? []).filter(Boolean)
  if (!raw || cleanTokens.length === 0) return raw

  // Highlight is purely visual; match using a safe regex, longest tokens first.
  const uniq = Array.from(new Set(cleanTokens)).sort((a, b) => b.length - a.length)
  const re = new RegExp(`(${uniq.map(escapeRegExp).join('|')})`, 'ig')
  const parts = raw.split(re)
  return (
    <>
      {parts.map((part, idx) => {
        const isHit = uniq.some((t) => part.toLowerCase() === t.toLowerCase())
        return isHit ? (
          <mark key={idx} style={{ background: 'rgba(250, 204, 21, 0.35)', color: 'inherit', padding: '0 2px' }}>
            {part}
          </mark>
        ) : (
          <span key={idx}>{part}</span>
        )
      })}
    </>
  )
}

