import React, { lazy, Suspense } from 'react'
import { useSelector } from 'react-redux'

const Private = lazy(() => import('../Routing/Private'))
const SuperAdminPrivate = lazy(() => import('../Routing/SuperAdminPrivate'))

const LoadingFallback = () => null

export default function AuthGate(){
  const isLogin = useSelector(s => s.auth.isLogin)
  const role = useSelector(s => s.auth.role)

  if (!isLogin) return null

  return (
    <Suspense fallback={<LoadingFallback/>}>
      {role === 'super_admin' ? <SuperAdminPrivate /> : <Private />}
    </Suspense>
  )
}
