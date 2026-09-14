import { createRoot } from 'react-dom/client'
import './assets/plugins/jquery-ui-1.12.1/jquery-ui.min.css'
import './assets/bootstrap/css/bootstrap.min.css'
import './assets/plugins/lobipanel/lobipanel.min.css'
import './assets/plugins/pace/flash.css'
import './assets/pe-icon-7-stroke/css/pe-icon-7-stroke.css'
import './assets/themify-icons/themify-icons.css'
import './assets/plugins/monthly/monthly.css'
import './assets/dist/css/stylecrm.css'
import './assets/dist/css/typography.css'
import './styles/hms-design.css'

import './assets/plugins/jQuery/jquery-1.12.4.min.js'
import './assets/plugins/jquery-ui-1.12.1/jquery-ui.min.js'
import './assets/bootstrap/js/bootstrap.min.js'
import './assets/plugins/pace/pace.min.js'
import './assets/plugins/slimScroll/jquery.slimscroll.min.js'
import './assets/plugins/fastclick/fastclick.min.js'
import './assets/dist/js/custom.js'
// import './assets/plugins/chartJs/Chart.min.js'
// import './assets/plugins/counterup/waypoints.js'
import './assets/plugins/counterup/jquery.counterup.min.js'
import './assets/plugins/monthly/monthly.js'
import { BrowserRouter } from 'react-router-dom'
import React, { lazy, Suspense } from 'react'
const Public = lazy(() => import('./Routing/Public.jsx'))
// Private routes are mounted only when authenticated via AuthGate
const AuthGate = lazy(() => import('./Component/AuthGate.jsx'))

import Preloader from './Component/Preloader.jsx'

const AppSuspense = ({children}) => (
  <Suspense fallback={<Preloader />}>
    {children}
  </Suspense>
)
import { Provider } from 'react-redux'
import { store } from './Redux/store.jsx'
// import './assets/dist/js/dashboard.js'
// import './assets/js/script.js'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Provider store={store}>
        <AppSuspense>
        <Toaster position="top-right" />
        <Public />
        <AuthGate />
      </AppSuspense>
    </Provider>
  </BrowserRouter>
)
