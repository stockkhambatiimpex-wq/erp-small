import { useEffect, useMemo, useRef, useState } from 'react'

export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const selected = useMemo(() => {
    return (options ?? []).find((o) => String(o.value) === String(value)) ?? null
  }, [options, value])

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
          {(options ?? []).map((o) => {
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
        </div>
      ) : null}
    </div>
  )
}

