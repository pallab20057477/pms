import React, { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'

const Invoices = lazy(() => import('../Sales/Invoices'))
const InvoiceRecords = lazy(() => import('../Sales/InvoiceRecords'))
const NewInvoices = lazy(() => import('../Sales/NewInvoices'))
const Recurring = lazy(() => import('../Sales/Recurring'))
const NewRecurring = lazy(() => import('../Sales/NewRecurring'))
const Quotes = lazy(() => import('../Sales/Quotes'))
const NewQuote = lazy(() => import('../Sales/NewQuote'))
const Payments = lazy(() => import('../Sales/Payments'))
const TaxRates = lazy(() => import('../Sales/TaxRates'))
const Layout = lazy(() => import('../Component/Layout'))
const Dashboard = lazy(() => import('../Public/Dashboard'))
const HotelList = lazy(() => import('../HotelManagement/HotelList'))
const HotelForm = lazy(() => import('../HotelManagement/HotelForm'))
const HotelDetail = lazy(() => import('../HotelManagement/HotelDetail'))
const RoomList = lazy(() => import('../RoomManagement/RoomList'))
const RoomForm = lazy(() => import('../RoomManagement/RoomForm'))
const RoomDetail = lazy(() => import('../RoomManagement/RoomDetail'))
const RatePlans = lazy(() => import('../RoomManagement/RatePlans'))
const GuestForm = lazy(() => import('../GuestManagement/GuestForm'))
const GuestList = lazy(() => import('../GuestManagement/GuestList'))
const GuestDetail = lazy(() => import('../GuestManagement/GuestDetail'))
const BookingCreate = lazy(() => import('../Booking/BookingCreate'))
const BookingList = lazy(() => import('../Booking/BookingList'))
const BookingFolio = lazy(() => import('../Booking/BookingFolio'))
const RunningFolios = lazy(() => import('../Booking/RunningFolios'))
const BookingBoard = lazy(() => import('../Booking/BookingBoard'))
const AddCustomer = lazy(() => import('../CustomerManagement/AddCustomer'))
const CustomerList = lazy(() => import('../CustomerManagement/CustomerList'))
const LegacyHtmlPage = lazy(() => import('../Component/LegacyHtmlPage'))
const ModuleCrudPage = lazy(() => import('../Component/ModuleCrudPage'))
const GroupList = lazy(() => import('../CustomerManagement/GroupList'))
const ModuleRouterPage = lazy(() => import('../Component/ModuleRouterPage'))
const ReportOverviewPage = lazy(() => import('../Component/ReportOverviewPage'))
const ReportsDashboard = lazy(() => import('../Reports/ReportsDashboard'))
const ReportsDetail = lazy(() => import('../Reports/ReportsDetail'))
const ReportsTablePage = lazy(() => import('../Reports/ReportsTablePage'))
const Deposit = lazy(() => import('../Transaction/Deposit'))
const Expense = lazy(() => import('../Transaction/Expense'))
const Transfer = lazy(() => import('../Transaction/Transfer'))
const ViewTransaction = lazy(() => import('../Transaction/ViewTransaction'))
const Balance = lazy(() => import('../Transaction/Balance'))
const TReport = lazy(() => import('../Transaction/TReport'))
const RunningTasks = lazy(() => import('../Task/RunningTasks'))
const ArchiveTasks = lazy(() => import('../Task/ArchiveTasks'))
const ClientPayment = lazy(() => import('../Accounting/ClientPayment'))
const ExpenseManagement = lazy(() => import('../Accounting/ExpenseManagement'))
const ExpenseCategory = lazy(() => import('../Accounting/ExpenseCategory'))
const DirtyRooms = lazy(() => import('../Housekeeping/DirtyRooms'))
const CleaningRooms = lazy(() => import('../Housekeeping/CleaningRooms'))
const CleaningHistory = lazy(() => import('../Housekeeping/CleaningHistory'))
const StaffList = lazy(() => import('../StaffManagement/StaffList'))
const StaffForm = lazy(() => import('../StaffManagement/StaffForm'))
const StaffDetail = lazy(() => import('../StaffManagement/StaffDetail'))
const StaffAttendance = lazy(() => import('../StaffManagement/StaffAttendance'))
const StaffPerformanceRanking = lazy(() => import('../StaffManagement/StaffPerformanceRanking'))
const ActivityLogPage = lazy(() => import('../Operations/ActivityLogPage'))
const SettingsPage = lazy(() => import('../Operations/SettingsPage'))
const SeasonalPricingPage = lazy(() => import('../SystemSettings/SeasonalPricingPage'))
const ChannelManager = lazy(() => import('../Integrations/ChannelManager'))
const RestApi = lazy(() => import('../Integrations/RestApi'))
const ExternalIntegrations = lazy(() => import('../Integrations/ExternalIntegrations'))

const LoadingFallback = () => <div className="p-4 text-center">Loading...</div>

function Private() {
  const isLogin = useSelector((state) => state.auth.isLogin)
  const features = useSelector((state) => state.auth.hotelFeatures)
  const can = (key) => features ? (features[key] ?? true) : true

  if(!isLogin){
    return <Navigate to="/" replace/>
  }

  return(
    <Suspense fallback={<LoadingFallback/>}>
      <Routes >
          <Route element={<Layout/>}>
              <Route path='/dashboard' element={<Dashboard/>}/>
              <Route path='/hotels' element={<HotelList/>}/>
              <Route path='/hotels/new' element={<HotelForm/>}/>
              <Route path='/hotels/:id' element={<HotelDetail/>}/>
              <Route path='/hotels/:id/edit' element={<HotelForm/>}/>
              <Route path='/rooms' element={<RoomList/>}/>
              <Route path='/rooms/new' element={<RoomForm/>}/>
              <Route path='/rooms/maintenance' element={<RoomList/>}/>
              <Route path='/rooms/:id' element={<RoomDetail/>}/>
              <Route path='/rooms/:id/edit' element={<RoomForm/>}/>
              <Route path='/rate-plans' element={<RatePlans/>}/>
              <Route path='/guests/new' element={<GuestForm/>}/>
              <Route path='/guests' element={<GuestList/>}/>
              <Route path='/guests/:id' element={<GuestDetail/>}/>
              <Route path='/add_customer' element={<AddCustomer/>}/>
              <Route path='/legacy/:page' element={<LegacyHtmlPage/>}/>
              <Route path='/manage_customer' element={<CustomerList/>}/>
              <Route path='/manage_customer/view/:id' element={<ModuleCrudPage resource='customers'/>}/>
              <Route path='/manage_customer/edit/:id' element={<ModuleCrudPage resource='customers'/>}/>
              <Route path='/manage_customer_group' element={<GroupList/>}/>
              <Route path='/manage_customer_group/view/customers' element={<ModuleCrudPage resource='companies'/>}/>
              <Route path='/manage_customer_group/add/customers' element={<ModuleCrudPage resource='companies'/>}/>

              <Route path='/booking' element={<BookingList preset='all'/>}/>
              <Route path='/booking/calendar' element={<BookingBoard/>}/>
              <Route path='/booking/create' element={<BookingCreate/>}/>
              <Route path='/booking/list' element={<BookingList preset='all'/>}/>
              <Route path='/bookings/new' element={<BookingCreate/>}/>
              <Route path='/bookings' element={<BookingList preset='all'/>}/>
              <Route path='/booking/all' element={<BookingList preset='all'/>}/>
              <Route path='/booking/checkins' element={<BookingList preset='checkins'/>}/>
              <Route path='/booking/checkout' element={<BookingList preset='checkout'/>}/>
              <Route path='/booking/reserved' element={<BookingList preset='reserved'/>}/>
              <Route path='/booking/cancelled' element={<BookingList preset='cancelled'/>}/>
              <Route path='/booking/:id/folio' element={<BookingFolio/>}/>
              <Route path='/bookings/:id/folio' element={<BookingFolio/>}/>
              <Route path='/folio/running' element={<RunningFolios/>}/>
              <Route path='/folio/invoice' element={<Invoices/>}/>
              {/* <Route path='/folio/invoice/records' element={<InvoiceRecords/>}/> */}
              <Route path='/folio/payments' element={<Payments/>}/>
              <Route path='/manage_booking' element={<ModuleCrudPage resource='bookings'/>}/>
              <Route path='/manage_booking/view/:id' element={<ModuleCrudPage resource='bookings'/>}/>
              <Route path='/manage_booking/edit/:id' element={<ModuleCrudPage resource='bookings'/>}/>

              <Route path='/staff' element={<StaffList/>}/>
              <Route path='/staff/new' element={<StaffForm/>}/>
              <Route path='/staff/attendance' element={<StaffAttendance/>}/>
              <Route path='/staff/performance-ranking' element={<StaffPerformanceRanking/>}/>
              <Route path='/staff/:id' element={<StaffDetail/>}/>
              <Route path='/staff/:id/edit' element={<StaffForm/>}/>
              {/* <Route path='/staff/manage' element={<StaffList/>}/>
              <Route path='/staff/manage/edit/:id' element={<StaffForm/>}/>
              <Route path='/staff/manage/view/:id' element={<StaffDetail/>}/> */}

              <Route path='/module/:name' element={<ModuleRouterPage/>}/>
              <Route path='/sales/invoices' element={<Invoices/>}/>
              {/* <Route path='/sales/invoices/records' element={<InvoiceRecords/>}/> */}
              <Route path='/sales/new-invoices' element={<NewInvoices/>}/>
              <Route path='/sales/recurring' element={<Recurring/>}/>
              <Route path='/sales/new-recurring' element={<NewRecurring/>}/>
              <Route path='/recurring' element={<Recurring/>}/>
              <Route path='/sales/quotes' element={<Quotes/>}/>
              <Route path='/sales/new-quote' element={<NewQuote/>}/>
              <Route path='/quotes' element={<Quotes/>}/>
              <Route path='/sales/payments' element={<Payments/>}/>
              <Route path='/sales/taxrates' element={<TaxRates/>}/>
              <Route path='/taxrates' element={<TaxRates/>}/>
              <Route path='/reports' element={<ReportsDashboard/>}/>
              <Route path='/reports/:type' element={<ReportsDetail/>}/>
              <Route path='/reports/:type/table' element={<ReportsTablePage/>}/>
              <Route path='/reports/overview' element={<ReportOverviewPage/>}/>
              <Route path='/transaction/deposit' element={<Deposit/>}/>
              <Route path='/transaction/expense' element={<Expense/>}/>
              <Route path='/transaction/transfer' element={<Transfer/>}/>
              <Route path='/transaction/view-tsaction' element={<ViewTransaction/>}/>
              <Route path='/transaction/balance' element={<Balance/>}/>
              <Route path='/transaction/treport' element={<TReport/>}/>
              <Route path='/task/running' element={<RunningTasks/>}/>
              <Route path='/task/archive' element={<ArchiveTasks/>}/>
              <Route path='/tasks/running' element={<RunningTasks/>}/>
              <Route path='/tasks/archive' element={<ArchiveTasks/>}/>
              <Route path='/accounting/client-payment' element={<ClientPayment/>}/>
              <Route path='/accounting/expense-management' element={<ExpenseManagement/>}/>
              <Route path='/accounting/expense-category' element={<ExpenseCategory/>}/>
              <Route path='/expenses' element={<ExpenseManagement/>}/>
                {/* <Route path='/housekeeping/dirty' element={<DirtyRooms/>}/>
                <Route path='/housekeeping/cleaning' element={<CleaningRooms/>}/>
                <Route path='/housekeeping/history' element={<CleaningHistory/>}/> */}
              <Route path='/activity/logs' element={<ActivityLogPage/>}/>
              <Route path='/settings' element={<SettingsPage/>}/>
              <Route path='/settings/profile' element={<SettingsPage/>}/>
              <Route path='/settings/pricing' element={<SeasonalPricingPage/>}/>
              {/* <Route path='/integrations/channel-manager' element={can('channel_manager') ? <ChannelManager/> : <Navigate to='/dashboard' replace/>}/>
              <Route path='/integrations/rest-api' element={<RestApi/>}/>
              <Route path='/integrations/external' element={<ExternalIntegrations/>}/> */}
          <Route path='*' element={<Navigate to='/dashboard' replace/>}/>
          </Route>
      </Routes>
    </Suspense>
  )
}

export default Private
