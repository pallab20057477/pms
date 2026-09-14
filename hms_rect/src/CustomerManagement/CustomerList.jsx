import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { getWithAuth, putWithAuth, deleteWithAuth } from "../api"
import { Link, useNavigate } from "react-router-dom"
import Swal from "sweetalert2"
import { createPortal } from "react-dom"

function CustomerList() {
  const token = useSelector((state) => state.auth.accesstoken)
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState("list")
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
    address: "",
    customer_type: "",
    gender: "",
    status: true
  })

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const res = await getWithAuth('customers?limit=100', token)
      setCustomers(res?.data?.data?.items || res?.data?.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (token) fetchCustomers() }, [token])

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Are you sure?",
      text: "This customer will be deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#E5343D"
    })
    if (!confirm.isConfirmed) return
    try {
      const res = await deleteWithAuth(`customers/${id}`, token)
      const result = res?.data
      if (result?.status) {
        Swal.fire({ icon: "success", title: "Deleted!", timer: 1200, showConfirmButton: false })
        fetchCustomers()
      } else {
        Swal.fire({ icon: "error", title: result?.error || "Delete failed" })
      }
    } catch {
      Swal.fire({ icon: "error", title: "Server error" })
    }
  }

  // Modal handlers
  const handleEditClick = (customer) => {
    setEditingCustomer(customer)
    setEditForm({
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || "",
      mobile: customer.mobile || "",
      address: customer.address || "",
      customer_type: customer.customer_type || "",
      gender: customer.gender || "",
      status: typeof customer.status === 'boolean' ? customer.status : true
    })
  }

  const handleDeleteClick = (customer) => {
    setDeletingCustomer(customer)
  }

  const closeEditModal = () => {
    setEditingCustomer(null)
  }

  const closeDeleteModal = () => {
    setDeletingCustomer(null)
  }

  const handleEditFormChange = (e) => {
    const { name, value } = e.target
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingCustomer) return

    try {
      const res = await putWithAuth(`customers/${editingCustomer.id}`, editForm, token)
      const result = res?.data
      if (result?.status) {
        Swal.fire({ icon: "success", title: "Updated!", timer: 1200, showConfirmButton: false })
        fetchCustomers()
        closeEditModal()
      } else {
        Swal.fire({ icon: "error", title: result?.error || "Update failed" })
      }
    } catch {
      Swal.fire({ icon: "error", title: "Server error" })
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingCustomer) return

    try {
      const res = await deleteWithAuth(`customers/${deletingCustomer.id}`, token)
      const result = res?.data
      if (result?.status) {
        Swal.fire({ icon: "success", title: "Deleted!", timer: 1200, showConfirmButton: false })
        fetchCustomers()
        closeDeleteModal()
      } else {
        Swal.fire({ icon: "error", title: result?.error || "Delete failed" })
      }
    } catch {
      Swal.fire({ icon: "error", title: "Server error" })
    }
  }

  // Export helpers
  const getTableData = () => {
    const table = document.getElementById("customerTable")
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
    triggerDownload("customers.csv", "text/csv", csv)
  }

  const handleExcel = () => {
    const { headers, rows } = getTableData()
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Customers"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`
    triggerDownload("customers.xls", "application/vnd.ms-excel", xml)
  }

  const handlePrint = () => {
    const table = document.getElementById("customerTable")
    if (!table) return
    const win = window.open("", "_blank")
    win.document.write(`<html><head><title>Customer List</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`)
    win.document.close()
    win.print()
  }

  const triggerDownload = (name, mime, content) => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = name
    a.click()
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return (
      (c.first_name || "").toLowerCase().includes(q) ||
      (c.last_name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.mobile || "").toLowerCase().includes(q)
    )
  })

  return (
    <>
      {/* Page Header */}
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-users"></i>
        </div>
        <div className="header-title">
          <h1>Customer</h1>
          <small>Customer List</small>
        </div>
      </section>

      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Add customer</h4>
                  </a>
                </div>
              </div>
              <div className="panel-body">
                {/* Plugin content:powerpoint,txt,pdf,png,word,xl */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div className="buttonexport" id="buttonlist"> 
                    <Link className="btn btn-add" to="/add_customer"> <i className="fa fa-plus"></i> Add Customer
                    </Link>  
                  </div>
                  <div className="btn-group">
                    <button className="btn btn-default btn-sm" onClick={handleCopy}>
                      <i className="fa fa-copy"></i> Copy
                    </button>
                    <button className="btn btn-default btn-sm" onClick={handleExcel}>
                      <i className="fa fa-file-excel-o"></i> Excel
                    </button>
                    <button className="btn btn-default btn-sm" onClick={handleCSV}>
                      <i className="fa fa-file-text-o"></i> CSV
                    </button>
                    <button className="btn btn-default btn-sm" onClick={handlePrint}>
                      <i className="fa fa-print"></i> Print
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="row" style={{ marginBottom: 12 }}>
                  <div className="col-sm-4 col-sm-offset-8">
                    <div className="input-group">
                      <span className="input-group-addon"><i className="fa fa-search"></i></span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search customers..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="table-responsive">
                  <table id="customerTable" className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Photo</th>
                        <th>Customer Name</th>
                        <th>Mobile</th>
                        <th>Email</th>
                        <th>Address</th>
                        <th>Type</th>
                        <th>Join</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={9} className="text-center">
                            <i className="fa fa-spinner fa-spin"></i> Loading...
                          </td>
                        </tr>
                      )}
                      {!loading && filtered.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center">No customers found</td>
                        </tr>
                      )}
                      {filtered.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <img
                              src={c.picture || `https://ui-avatars.com/api/?name=${c.first_name}+${c.last_name}&background=009688&color=fff&size=50`}
                              alt={c.first_name}
                              className="img-circle"
                              width={50}
                              height={50}
                            />
                          </td>
                          <td>{c.first_name} {c.last_name}</td>
                          <td>{c.mobile}</td>
                          <td>{c.email}</td>
                          <td>{c.address || "-"}</td>
                          <td>
                            <span className="label label-default">{c.customer_type || "V.I.P"}</span>
                          </td>
                          <td>{c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : "-"}</td>
                          <td>
                            <span className={`label ${c.status ? "label-custom" : "label-danger"} label-default`}>
                              {c.status ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <button type="button" className="btn btn-add btn-sm" data-toggle="modal" data-target="#customer1" onClick={() => handleEditClick(c)}>
                              <i className="fa fa-pencil"></i>
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" data-toggle="modal" data-target="#customer2" onClick={() => handleDeleteClick(c)}>
                              <i className="fa fa-trash-o"></i> 
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer count */}
                {!loading && (
                  <div style={{ marginTop: 8, color: "#777", fontSize: 13 }}>
                    Showing {filtered.length} of {customers.length} customers
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modals rendered via Portal - Custom Implementation */}
      {editingCustomer && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} onClick={closeEditModal}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              backgroundColor: '#3c8dbc',
              color: 'white',
              padding: '15px 20px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>
                <i className="fa fa-user m-r-5"></i> Update Customer
              </h3>
              <button 
                onClick={closeEditModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <form onSubmit={handleEditSubmit}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
                                    <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Status:</label>
                                      <select
                                        name="status"
                                        value={editForm.status ? 'active' : 'inactive'}
                                        onChange={e => setEditForm(f => ({ ...f, status: e.target.value === 'active' }))}
                                        style={{
                                          width: '100%',
                                          padding: '8px',
                                          border: '1px solid #ddd',
                                          borderRadius: '4px',
                                          boxSizing: 'border-box'
                                        }}
                                      >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                      </select>
                                    </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>First Name:</label>
                    <input 
                      type="text" 
                      name="first_name" 
                      value={editForm.first_name} 
                      onChange={handleEditFormChange} 
                      placeholder="First Name" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Last Name:</label>
                    <input 
                      type="text" 
                      name="last_name" 
                      value={editForm.last_name} 
                      onChange={handleEditFormChange} 
                      placeholder="Last Name" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email:</label>
                    <input 
                      type="email" 
                      name="email" 
                      value={editForm.email} 
                      onChange={handleEditFormChange} 
                      placeholder="Email" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Mobile:</label>
                    <input 
                      type="text" 
                      name="mobile" 
                      value={editForm.mobile} 
                      onChange={handleEditFormChange} 
                      placeholder="Mobile" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Gender:</label>
                    <select 
                      name="gender" 
                      value={editForm.gender} 
                      onChange={handleEditFormChange} 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Type:</label>
                    <input 
                      type="text" 
                      name="customer_type" 
                      value={editForm.customer_type} 
                      onChange={handleEditFormChange} 
                      placeholder="Type" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                  <div style={{ flex: '1 1 100%', minWidth: '300px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Address:</label>
                    <textarea 
                      name="address" 
                      value={editForm.address} 
                      onChange={handleEditFormChange} 
                      rows="3" 
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button 
                    type="button" 
                    onClick={closeEditModal}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: '#d9534f',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: '#3c8dbc',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deletingCustomer && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} onClick={closeDeleteModal}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              backgroundColor: '#3c8dbc',
              color: 'white',
              padding: '15px 20px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>
                <i className="fa fa-user m-r-5"></i> Delete Customer
              </h3>
              <button 
                onClick={closeDeleteModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ marginBottom: '20px', textAlign: 'center' }}>
                Are you sure you want to delete {deletingCustomer?.first_name} {deletingCustomer?.last_name}?
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={closeDeleteModal}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#d9534f',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  NO
                </button>
                <button 
                  type="button" 
                  onClick={handleDeleteConfirm}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#3c8dbc',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  YES
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default CustomerList
