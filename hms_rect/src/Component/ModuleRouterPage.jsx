import { Navigate, useParams } from "react-router-dom"
import ModuleCrudPage from "./ModuleCrudPage"
import { moduleResources } from "../Functions/moduleResources"

function ModuleRouterPage() {
  const { name } = useParams()

  if (!name || !moduleResources[name]) {
    return <Navigate to="/dashboard" replace />
  }

  return <ModuleCrudPage resource={name} />
}

export default ModuleRouterPage
