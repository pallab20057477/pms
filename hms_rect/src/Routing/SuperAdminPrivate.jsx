import React, { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'

const SuperAdminDashboard = lazy(() => import('../SuperAdmin/SuperAdminDashboard'))

const LoadingFallback = () => <div className="p-4 text-center">Loading...</div>

function SuperAdminPrivate() {
  const isLogin = useSelector((state) => state.auth.isLogin)
  const role = useSelector((state) => state.auth.role)

  if (!isLogin || role !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path='/super-admin/dashboard' element={<SuperAdminDashboard />} />
        <Route path='*' element={<Navigate to='/super-admin/dashboard' replace />} />
      </Routes>
    </Suspense>
  )
}

export default SuperAdminPrivate
