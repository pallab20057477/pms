import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import Aside from "./Aside"
import Footer from "./Footer"
import Header from "./Header"
import { legacyPageSet } from "../Functions/legacyPages"
import { htmlToReactRoute } from "../Functions/htmlToReactRoute"

function Layout() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev)
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('sidebar-collapse')
    }
  }

  useEffect(() => {
    const handleLegacyLinkClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const anchor = event.target.closest("a[href]")
      if (!anchor) {
        return
      }

      const href = anchor.getAttribute("href") || ""
      if (!href || href === "#") {
        return
      }

      if (!href.toLowerCase().endsWith(".html")) {
        return
      }

      const fileName = href.split("/").pop() || ""
      const page = fileName.replace(/\.html$/i, "")

      const mappedRoute = htmlToReactRoute[page]
      if (mappedRoute) {
        event.preventDefault()
        navigate(mappedRoute)
        return
      }

      if (!legacyPageSet.has(page)) {
        return
      }

      event.preventDefault()
      navigate(`/legacy/${page}`)
    }

    document.addEventListener("click", handleLegacyLinkClick)
    return () => {
      document.removeEventListener("click", handleLegacyLinkClick)
    }
  }, [navigate])

  return (
    <div className={`hold-transition sidebar-mini fixed ${sidebarCollapsed ? 'sidebar-collapse' : ''}`}>
        <div className="wrapper">
            <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
            <Aside sidebarCollapsed={sidebarCollapsed} />
            <div className="content-wrapper">
              <Outlet /> 
            </div>
            <Footer/>
        </div>
    </div>
  )
}

export default Layout
