import { useNavigate, useSearchParams } from 'react-router-dom'
import GuestLoginModal from './GuestLoginModal'
import './GuestPortal.css'

export default function GuestAccess() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirectTo = params.get('redirect') || '/guest'

  return (
    <div className="guest-page">
      <GuestLoginModal
        onClose={() => navigate('/book')}
        onSuccess={() => navigate(redirectTo, { replace: true })}
      />
    </div>
  )
}
