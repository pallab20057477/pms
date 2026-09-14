import { useCallback, useEffect, useMemo, useState } from "react"
import Swal from "sweetalert2"
import { useSelector } from "react-redux"
import { useParams, useNavigate } from "react-router-dom"
import { getWithAuth, postWithAuth, putWithAuth, deleteWithAuth } from "../api"
import { moduleResources } from "../Functions/moduleResources"

function ModuleCrudPage({ resource }) {
  const token = useSelector((state) => state.auth.accesstoken)
  const { id } = useParams()
  const navigate = useNavigate()
  const meta = moduleResources[resource]

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [payloadText, setPayloadText] = useState("")

  const headers = useMemo(() => ({ token }), [token])

  useEffect(() => {
    if (!meta) {
      return
    }
    
    // Handle edit mode from URL parameter
    if (id) {
      setEditingId(id)
      loadItemForEdit(id)
    } else {
      setEditingId(null)
      setPayloadText(JSON.stringify(meta.defaultPayload, null, 2))
    }
  }, [id, meta])

  const loadItemForEdit = async (itemId) => {
    if (!meta || !token || !itemId) return
    setLoading(true)
    try {
      const res = await getWithAuth(`${meta.endpoint}/${itemId}`, token)
      const result = res?.data
      if (result?.status && result?.data) {
        setPayloadText(JSON.stringify(result.data, null, 2))
      } else {
        Swal.fire({ title: "Error", text: result?.error || "Item not found", icon: "error" })
        navigate(`/manage_${resource}`)
      }
    } catch {
      Swal.fire({ title: "Error", text: "Unable to load item", icon: "error" })
      navigate(`/manage_${resource}`)
    } finally {
      setLoading(false)
    }
  }

  const loadItems = useCallback(async () => {
    if (!meta || !token) return
    setLoading(true)
    try {
      const res = await getWithAuth(meta.endpoint, token)
      const result = res?.data
      const list = Array.isArray(result?.data) ? result.data : result?.data?.items || []
      setItems(Array.isArray(list) ? list : [])
    } catch {
      Swal.fire({ title: "Oops!", text: "Unable to load data", icon: "error" })
    } finally {
      setLoading(false)
    }
  }, [meta, token])

  useEffect(() => {
    loadItems()
  }, [loadItems, meta])

  if (!meta) {
    return (
      <section className="content" style={{ padding: "20px" }}>
        <div className="alert alert-warning">Module not found.</div>
      </section>
    )
  }

  const parsePayload = () => {
    try {
      return JSON.parse(payloadText)
    } catch {
      Swal.fire({ title: "Invalid JSON", text: "Please provide valid JSON payload", icon: "warning" })
      return null
    }
  }

  const handleCreateOrUpdate = async () => {

    let payload = parsePayload()
    if (!payload) {
      return
    }

    // Only allow valid fields for companies
    if (resource === 'companies') {
      const allowed = ['name', 'email', 'phone', 'address', 'status']
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)))
    }

    setLoading(true)
    try {
      const res = editingId
        ? await putWithAuth(`${meta.endpoint}/${editingId}`, payload, token)
        : await postWithAuth(meta.endpoint, payload, token)
      const result = res?.data
      if (!result?.status) {
        Swal.fire({ title: "Warning", text: result?.error || "Operation failed", icon: "warning" })
        return
      }
      Swal.fire({ title: "Success", text: result.message || "Saved", icon: "success" })
      if (editingId) {
        navigate(`/manage_${resource}`)
      } else {
        setEditingId(null)
        setPayloadText(JSON.stringify(meta.defaultPayload, null, 2))
        await loadItems()
      }
    } catch {
      Swal.fire({ title: "Oops!", text: "Unable to save data", icon: "error" })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setPayloadText(JSON.stringify(item, null, 2))
  }

  const handleDelete = async (id) => {
    const decision = await Swal.fire({
      title: "Are you sure?",
      text: "This record will be deleted",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete"
    })

    if (!decision.isConfirmed) {
      return
    }

    setLoading(true)
    try {
      const res = await deleteWithAuth(`${meta.endpoint}/${id}`, token)
      const result = res?.data
      if (!result?.status) {
        Swal.fire({ title: "Warning", text: result?.error || "Delete failed", icon: "warning" })
        return
      }
      await loadItems()
      Swal.fire({ title: "Deleted", text: result.message || "Record deleted", icon: "success" })
    } catch {
      Swal.fire({ title: "Oops!", text: "Unable to delete record", icon: "error" })
    } finally {
      setLoading(false)
    }
  }

  const columns = items.length > 0 ? Object.keys(items[0]).slice(0, 6) : ["id"]

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-database"></i>
        </div>
        <div className="header-title">
          <h1>{meta.title}</h1>
          <small>React API Module</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-7">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>{meta.title} List</h4>
                </div>
              </div>
              <div className="panel-body table-responsive">
                <table className="table table-bordered table-striped">
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center">
                          {loading ? "Loading..." : "No records found"}
                        </td>
                      </tr>
                    )}
                    {items.map((item) => (
                      <tr key={item.id || JSON.stringify(item)}>
                        {columns.map((col) => (
                          <td key={col}>{String(item[col] ?? "")}</td>
                        ))}
                        <td>
                          <button className="btn btn-xs btn-info" onClick={() => handleEdit(item)}>
                            Edit
                          </button>
                          <button className="btn btn-xs btn-danger" onClick={() => handleDelete(item.id)} style={{ marginLeft: "6px" }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col-sm-5">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>{editingId ? `Edit ${meta.title}` : `Create ${meta.title}`}</h4>
                </div>
              </div>
              <div className="panel-body">
                <div className="form-group">
                  <label>JSON Payload</label>
                  <textarea
                    className="form-control"
                    rows="16"
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                  ></textarea>
                </div>
                <button className="btn btn-success" onClick={handleCreateOrUpdate} disabled={loading}>
                  {editingId ? "Update" : "Create"}
                </button>
                <button
                  className="btn btn-warning"
                  onClick={() => {
                    if (editingId) {
                      navigate(`/manage_${resource}`)
                    } else {
                      setEditingId(null)
                      setPayloadText(JSON.stringify(meta.defaultPayload, null, 2))
                    }
                  }}
                  style={{ marginLeft: "8px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default ModuleCrudPage
