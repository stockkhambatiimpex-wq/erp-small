import { useEffect, useMemo, useRef, useState } from 'react'

export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = useMemo(() => {
    return (options ?? []).find((o) => String(o.value) === String(value)) ?? null
  }, [options, value])

  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    if (!searchable) return
    // Defer focus until menu mounts.
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 0)
    return () => window.clearTimeout(t)
  }, [open, searchable])

  useEffect(() => {
    function onDoc(e) {
      if (!open) return
      const el = rootRef.current
      if (!el) return
      if (el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  const filteredOptions = useMemo(() => {
    if (!searchable) return options ?? []
    const query = String(q || '').trim().toLowerCase()
    if (!query) return options ?? []
    return (options ?? []).filter((o) => String(o?.label || '').toLowerCase().includes(query))
  }, [options, q, searchable])

  return (
    <div className={`cselect ${disabled ? 'isDisabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="cselectBtn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`cselectText ${selected ? '' : 'isPlaceholder'}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="cselectChevron">▾</span>
      </button>

      {open ? (
        <div className="cselectMenu" role="listbox">
          {searchable ? (
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                style={{ width: '100%' }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false)
                }}
              />
            </div>
          ) : null}

          {(filteredOptions ?? []).map((o) => {
            const isSel = String(o.value) === String(value)
            return (
              <button
                type="button"
                key={String(o.value)}
                className={`cselectOption ${isSel ? 'isSelected' : ''}`}
                disabled={!!o.disabled}
                onClick={() => {
                  onChange?.(o.value)
                  setOpen(false)
                }}
              >
                <span className="cselectOptionLabel">{o.label}</span>
                {isSel ? <span className="cselectCheck">✓</span> : null}
              </button>
            )
          })}

          {searchable && (filteredOptions?.length ?? 0) === 0 ? (
            <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>No matches</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

