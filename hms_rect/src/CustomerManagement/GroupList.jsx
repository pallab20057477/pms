import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Swal from "sweetalert2"
import { useSelector } from "react-redux"
import { getWithAuth, postWithAuth, putWithAuth, deleteWithAuth } from "../api"

function GroupList() {
  const token = useSelector((state) => state.auth.accesstoken)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState("list")
  const [form, setForm] = useState({ name: "", cid: "", price: "", description: "", status: true })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState("")
  // Fetch customers for dropdown
  useEffect(() => {
    if (!token || !showModal) return;
    const fetchCustomers = async () => {
      try {
        const res = await getWithAuth('customers?limit=100', token)
        setCustomers(res?.data?.data?.items || res?.data?.items || [])
      } catch {
        setCustomers([])
      }
    };
    fetchCustomers();
  }, [token, showModal])

  const fetchGroups = async () => {
    setLoading(true)
    try {
      const res = await getWithAuth('companies?limit=100', token)
      setGroups(res?.data?.data?.items || res?.data?.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (token) fetchGroups() }, [token])

  const handleOpenModal = (e) => { e.preventDefault(); setShowModal(true); setEditId(null); setForm({ name: "", cid: "", price: "", description: "", status: true }) }
  const handleCloseModal = () => { setShowModal(false); setForm({ name: "", cid: "", price: "", description: "", status: true }); setEditId(null) }
  const handleEdit = (group) => {
    setForm({
      name: group.name || "",
      cid: group.cid || "",
      price: group.price || "",
      description: group.description || "",
      status: group.status !== undefined ? group.status : true
    });
    setEditId(group.id);
    setShowModal(true);
  }
  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) {
        await putWithAuth(`companies/${editId}`, { name: form.name, cid: form.cid, price: form.price, description: form.description, status: form.status }, token)
      } else {
        await postWithAuth('companies', { name: form.name, cid: form.cid, price: form.price, description: form.description, status: form.status }, token)
      }
      Swal.fire({ icon: "success", title: editId ? "Group updated successfully" : "Group added successfully" })
      handleCloseModal()
      fetchGroups()
    } catch {
      Swal.fire({ icon: "error", title: editId ? "Failed to update group" : "Failed to add group" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (group) => {
    const confirm = await Swal.fire({
      title: `Delete group '${group.name}'?`,
      text: "This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel"
    });
    if (confirm.isConfirmed) {
      try {
        await deleteWithAuth(`companies/${group.id}`, token)
        Swal.fire({ icon: "success", title: "Group deleted" })
        fetchGroups()
      } catch {
        Swal.fire({ icon: "error", title: "Failed to delete group" });
      }
    }
  }

  // Export helpers
  const getTableData = () => {
    const table = document.getElementById("groupTable")
    if (!table) return { headers: [], rows: [] }
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.innerText.trim())
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
    )
    return { headers, rows }
  }

  const handleCopy = () => {
    const { headers, rows } = getTableData()
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n")
    navigator.clipboard.writeText(text).then(() =>
      Swal.fire({ icon: "success", title: "Copied!", timer: 1200, showConfirmButton: false })
    )
  }

  const handleCSV = () => {
    const { headers, rows } = getTableData()
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    triggerDownload("groups.csv", "text/csv", csv)
  }

  const handleExcel = () => {
    const { headers, rows } = getTableData()
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Groups"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`
    triggerDownload("groups.xls", "application/vnd.ms-excel", xml)
  }

  const handlePrint = () => {
    const table = document.getElementById("groupTable")
    if (!table) return
    const win = window.open("", "_blank")
    win.document.write(`<html><head><title>Groups</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`)
    win.document.close()
    win.print()
  }

  const triggerDownload = (name, mime, content) => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = name
    a.click()
  }

  return (
    <>
      <section className="content-header">
        <div className="header-icon"><i className="fa fa-group"></i></div>
        <div className="header-title">
          <h1>Groups</h1>
          <small>Group List</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">

            {/* Tabs */}
            <ul className="nav nav-tabs" style={{ marginBottom: 0 }}>
              <li className={activeTab === "list" ? "active" : ""}>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("list") }}>
                  <i className="fa fa-list"></i> Group List
                </a>
              </li>
              <li className={activeTab === "details" ? "active" : ""}>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("details") }}>
                  <i className="fa fa-info-circle"></i> Group Details
                </a>
              </li>
            </ul>

            {/* Group List Tab */}
            {activeTab === "list" && (
              <div className="panel panel-bd" style={{ marginBottom: 0 }}>
                <div className="panel-heading">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div id="buttonlist">
                      <a className="btn btn-add btn-sm" href="#" onClick={handleOpenModal}>
                        <i className="fa fa-plus"></i> Add New Group
                      </a>
                    </div>
                    <div className="btn-group buttonexport">
                      <button type="button" className="btn btn-default btn-sm" onClick={handleCopy}>
                        <i className="fa fa-copy"></i> Copy
                      </button>
                      <button type="button" className="btn btn-default btn-sm" onClick={handleExcel}>
                        <i className="fa fa-file-excel-o"></i> Excel
                      </button>
                      <button type="button" className="btn btn-default btn-sm" onClick={handleCSV}>
                        <i className="fa fa-file-text-o"></i> CSV
                      </button>
                      <button type="button" className="btn btn-default btn-sm" onClick={handlePrint}>
                        <i className="fa fa-print"></i> Print
                      </button>
                    </div>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="table-responsive">
                    <table id="groupTable" className="table table-bordered table-striped table-hover">
                      <thead>
                        <tr>
                          <th>Customer Name</th>
                          <th>CID</th>
                          <th>Price</th>
                          <th>Description</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr><td colSpan={7} className="text-center"><i className="fa fa-spinner fa-spin"></i> Loading...</td></tr>
                        )}
                        {!loading && groups.length === 0 && (
                          <tr><td colSpan={7} className="text-center">No groups found</td></tr>
                        )}
                        {groups.map((g) => (
                          <tr key={g.id}>
                            <td>{g.name}</td>
                            <td>{g.cid || g.id}</td>
                            <td>{g.price || "-"}</td>
                            <td>{g.description || "-"}</td>
                            <td>{g.created_at ? new Date(g.created_at).toLocaleDateString('en-GB') : "-"}</td>
                            <td>
                              <span className={`label ${g.status ? "label-custom" : "label-danger"}`}>
                                {g.status ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              <button type="button" className="btn btn-add btn-xs" title="Edit" onClick={() => handleEdit(g)}>
                                <i className="fa fa-pencil"></i>
                              </button>{" "}
                              <button type="button" className="btn btn-danger btn-xs" title="Delete" onClick={() => handleDelete(g)}>
                                <i className="fa fa-trash-o"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Group Details Tab */}
            {activeTab === "details" && (
              <div className="panel panel-bd" style={{ marginBottom: 0 }}>
                <div className="panel-heading">
                  <div className="panel-title"><h4>Group Details</h4></div>
                </div>
                <div className="panel-body">
                  {groups.length === 0 ? (
                    <p className="text-muted">No group data available.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-bordered table-hover">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>CID</th>
                            <th>Price</th>
                            <th>Description</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((g, i) => (
                            <tr key={g.id}>
                              <td>{i + 1}</td>
                              <td>{g.name}</td>
                              <td>{g.cid || g.id}</td>
                              <td>{g.price || "-"}</td>
                              <td>{g.description || "-"}</td>
                              <td>
                                <span className={`label ${g.status ? "label-custom" : "label-danger"}`}>
                                  {g.status ? "Active" : "Inactive"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* Add Group Modal */}
      {showModal && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1040 }}
            onClick={handleCloseModal}
          />
          <div style={{ position: "fixed", inset: 0, zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div
              style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 650, boxShadow: "0 5px 15px rgba(0,0,0,0.3)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", background: "#f7f9fa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: 0, fontWeight: 700, color: "#333" }}>
                  <i className="fa fa-plus-circle" style={{ color: "#009688", marginRight: 8 }}></i>Add New Group
                </h4>
                <button onClick={handleCloseModal} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>&times;</button>
              </div>
              <form onSubmit={handleSubmit} autoComplete="off">
                <div style={{ padding: "20px" }}>
                  <div className="row">
                    <div className="col-sm-6">
                      <div className="form-group">
                        <label className="control-label">Customer Name <span className="text-danger">*</span></label>
                        <select
                          className="form-control"
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          required
                        >
                          <option value="">Select Customer</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.first_name + ' ' + c.last_name}>
                              {c.first_name} {c.last_name} ({c.email})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="form-group">
                        <label className="control-label">CID <span className="text-danger">*</span></label>
                        <input type="text" name="cid" value={form.cid} onChange={handleChange} className="form-control" placeholder="CID" required />
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="form-group">
                        <label className="control-label">Price</label>
                        <input type="text" name="price" value={form.price} onChange={handleChange} className="form-control" placeholder="Price" />
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="form-group">
                        <label className="control-label">Description</label>
                        <input type="text" name="description" value={form.description} onChange={handleChange} className="form-control" placeholder="Description" />
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="form-group">
                        <label className="control-label">Status</label>
                        <select name="status" value={form.status ? "active" : "inactive"} onChange={e => setForm(f => ({ ...f, status: e.target.value === "active" }))} className="form-control">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn btn-danger" onClick={handleCloseModal} disabled={saving}>
                    <i className="fa fa-times"></i> Cancel
                  </button>
                  <button type="submit" className="btn btn-add" disabled={saving}>
                    {saving ? <><i className="fa fa-spinner fa-spin"></i> Saving...</> : <><i className="fa fa-save"></i> Save</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

export default GroupList
