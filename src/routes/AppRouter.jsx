import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../screens/LoginPage.jsx'
import { AppShell } from '../shell/AppShell.jsx'
import { DashboardPage } from '../screens/DashboardPage.jsx'
import { ProductsPage } from '../screens/ProductsPage.jsx'
import { WarehousesPage } from '../screens/WarehousesPage.jsx'
import { ReportsPage } from '../screens/ReportsPage.jsx'
import { AnalysisPage } from '../screens/AnalysisPage.jsx'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={<AppShell />}
      >
        <Route index element={<ProductsPage />} />
        <Route path="products" element={<Navigate to="/" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

