import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'
import { useDataSync } from '../state/DataSyncProvider.jsx'

export function WarehousesPage() {
  const { isEditor } = useAuth()
  const { notifyChange } = useDataSync()
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  async function load() {
    const { data, error: e } = await supabase
      .from('warehouses')
      .select('id,name,created_at')
      .order('name')
    if (e) {
      setError(e.message)
      return
    }
    setItems(data ?? [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  async function addWarehouse() {
    setError('')
    const n = name.trim()
    if (!n) return
    const { data, error: e } = await supabase
      .from('warehouses')
      .insert({ name: n })
      .select('id,name,created_at')
      .single()
    if (e) {
      setError(e.message)
      return
    }
    setName('')
    if (data) {
      setItems((prev) =>
        [...(prev ?? []), data].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || '')),
        ),
      )
    }
    notifyChange('warehouses')
  }

  async function renameWarehouse(id, newName) {
    if (!isEditor) return
    const n = String(newName || '').trim()
    if (!n) return
    const current = items.find((w) => w.id === id)
    if (current && current.name === n) return
    setError('')
    setBusyId(id)
    const { data, error: e } = await supabase
      .from('warehouses')
      .update({ name: n })
      .eq('id', id)
      .select('id,name,created_at')
      .single()
    setBusyId('')
    if (e) {
      setError(e.message)
      return
    }
    setItems((prev) =>
      (prev ?? [])
        .map((w) => (w.id === id ? { ...w, ...(data ?? { name: n }) } : w))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    )
    notifyChange('warehouses')
  }

  async function deleteWarehouse(id) {
    if (!isEditor) return
    const ok = window.confirm(
      'Delete this warehouse?\n\nThis will also delete all products of this warehouse.',
    )
    if (!ok) return
    setError('')
    setBusyId(id)
    const { error: e } = await supabase.from('warehouses').delete().eq('id', id)
    setBusyId('')
    if (e) {
      setError(e.message)
      return
    }
    setItems((prev) => (prev ?? []).filter((w) => w.id !== id))
    notifyChange('warehouses')
  }

  return (
    <div>
      <div className="pageTitle">Warehouses</div>
      <div className="card">
        {error ? <div className="error">{error}</div> : null}
        {isEditor ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warehouse name"
              style={inputStyle}
            />
            <button className="btn btnPrimary" onClick={addWarehouse}>
              Add warehouse
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>
            Viewer mode: warehouses are read-only.
          </div>
        )}

        <div style={{ height: 14 }} />
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((w) => (
            <div
              key={w.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: 6, flex: '1 1 260px', minWidth: 0 }}>
                {isEditor ? (
                  <input
                    key={`${w.id}:${w.name}`}
                    defaultValue={w.name}
                    disabled={busyId === w.id}
                    onBlur={(e) => renameWarehouse(w.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') e.currentTarget.value = w.name
                    }}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      padding: '10px 12px',
                      borderRadius: 10,
                      outline: 'none',
                      fontWeight: 800,
                      width: '100%',
                      maxWidth: 520,
                    }}
                  />
                ) : (
                  <div style={{ fontWeight: 800 }}>{w.name}</div>
                )}
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  Created: {new Date(w.created_at).toLocaleDateString('en-IN')}
                </div>
              </div>

              {isEditor ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                  <button
                    className="btn btnGhost"
                    disabled={busyId === w.id}
                    onClick={() => deleteWarehouse(w.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {items.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No warehouses yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  flex: '1 1 240px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '10px 12px',
  borderRadius: 10,
  outline: 'none',
}
