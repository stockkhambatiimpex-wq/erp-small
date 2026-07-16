/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const DataSyncContext = createContext(null)

/**
 * Lightweight app-wide change bus.
 * Screens patch their own UI for local mutations; other screens
 * re-fetch when `revision` bumps so they stay in sync without a full page reload.
 */
export function DataSyncProvider({ children }) {
  const [revision, setRevision] = useState(0)

  const notifyChange = useCallback((scope = 'all') => {
    setRevision((n) => n + 1)
    return scope
  }, [])

  const value = useMemo(
    () => ({
      revision,
      notifyChange,
    }),
    [revision, notifyChange],
  )

  return <DataSyncContext.Provider value={value}>{children}</DataSyncContext.Provider>
}

export function useDataSync() {
  const ctx = useContext(DataSyncContext)
  if (!ctx) throw new Error('useDataSync must be used inside DataSyncProvider')
  return ctx
}
