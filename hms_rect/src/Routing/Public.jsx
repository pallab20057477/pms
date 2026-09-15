import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../Public/Login'
import { useEffect } from 'react'
import Forgotpassword from '../Public/Forgotpassword';
import { useSelector, useDispatch } from 'react-redux';
import { lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../Redux/authSlice';

const BookingPortal = lazy(() => import('../BookingPortal/BookingPortal'))
const BookingFolio = lazy(() => import('../Booking/BookingFolio'))
// GuestAccess (/guest/login) is disabled — login is handled via the modal on the booking portal
// const GuestAccess = lazy(() => import('../Public/GuestAccess'))
const GuestPortal = lazy(() => import('../Public/GuestPortal'))

function Public() {
  const isLogin = useSelector((state) => state.auth.isLogin)
  const role = useSelector((state) => state.auth.role)

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://mercury.phonepe.com/web/bundle/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, [])

  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const impersonateToken = queryParams.get('impersonate_token');
    const impersonateHotelId = queryParams.get('impersonate_hotel_id');

    if (impersonateToken) {
      dispatch(login({
        token: impersonateToken,
        role: 'admin',
        activeHotelId: impersonateHotelId ? Number(impersonateHotelId) : null
      }));
      navigate('/dashboard', { replace: true });
    }
  }, [location, dispatch, navigate]);

  // Redirect logged-in users to their respective dashboards
  const getRedirect = () => {
    if (!isLogin) return null
    return role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard'
  }

  const redirect = getRedirect()

  return (
    <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
      <Routes>
        <Route path='/' element={redirect ? <Navigate to={redirect} replace /> : <Login />} />
        <Route path='/forgot_password' element={redirect ? <Navigate to={redirect} replace /> : <Forgotpassword />} />
        {/* /guest/login is disabled — guests log in via the modal popup on the booking portal */}
        <Route path='/guest/login' element={<Navigate to="/book" replace />} />
        <Route path='/guest' element={<GuestPortal />} />
        <Route path='/book' element={<BookingPortal />} />
        <Route path='/book/:hotelCode' element={<BookingPortal />} />
        <Route path='/book/:hotelCode/:shareCode' element={<BookingPortal />} />
        <Route path='/guest/bookings/:id' element={<BookingFolio />} />
        {!isLogin ? (
          <Route path='*' element={<Navigate to="/" replace />} />
        ) : (
          <Route path='*' element={null} />
        )}
      </Routes>
    </Suspense>
  )
}

export default Public
