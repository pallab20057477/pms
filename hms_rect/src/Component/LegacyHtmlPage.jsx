import { Navigate, useParams } from "react-router-dom"
import { legacyPageSet } from "../Functions/legacyPages"

function LegacyHtmlPage() {
  const { page } = useParams()

  if (!page || !legacyPageSet.has(page)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <iframe
      title={`legacy-${page}`}
      src={`/crm-template/${page}.html`}
      style={{ width: "100%", height: "calc(100vh - 50px)", border: 0, background: "#fff" }}
    />
  )
}

export default LegacyHtmlPage
