import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import TableExportButtons from "../Component/TableExportButtons";
import api, { getWithAuth, postWithAuth } from "../api";

export default function RunningTasks() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [tasks, setTasks] = useState([]);
  const [sessionDuration, setSessionDuration] = useState('');
  const intervalRef = useRef();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({
    name: "",
    due_date: "",
    description: "",
    assigned_to: "",
    status: "running"
  });
  const statusOptions = [
    { value: "running", label: "Running" },
    { value: "pending", label: "Pending" },
    { value: "completed", label: "Completed" },
    { value: "onhold", label: "On Hold" },
    { value: "cancelled", label: "Cancelled" }
  ];
  const [selected, setSelected] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWithAuth("tasks?limit=100", token);
      setTasks(res?.data?.data?.items || []);
    } catch {
      setTasks([]);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchTasks();
  }, [token, fetchTasks]);

  // Session duration effect
  useEffect(() => {
    function formatDuration(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${hours.toString().padStart(2, '0')} Hours, ${minutes.toString().padStart(2, '0')} Minutes, ${seconds.toString().padStart(2, '0')} Seconds`;
    }
    function updateDuration() {
      const loginTime = parseInt(localStorage.getItem('login_time'), 10);
      if (!loginTime) {
        setSessionDuration('00 Hours, 00 Minutes, 00 Seconds');
        return;
      }
      const now = Date.now();
      setSessionDuration(formatDuration(now - loginTime));
    }
    updateDuration();
    intervalRef.current = setInterval(updateDuration, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const openAdd = () => {
    setForm({ name: "", due_date: "", description: "", assigned_to: "", status: "running" });
    setSelected(null);
    setShowModal(true);
  };
  const openEdit = (row) => {
    setForm({ ...row });
    setSelected(row);
    setShowModal(true);
  };
  const openDelete = (row) => {
    setSelected(row);
    setShowDelete(true);
  };
  const handleModalClose = () => {
    setShowModal(false);
    setSelected(null);
  };
  const handleDeleteClose = () => {
    setShowDelete(false);
    setSelected(null);
  };
  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.due_date || !form.assigned_to) {
      Swal.fire({ icon: "warning", title: "Please fill all required fields" });
      return;
    }
    try {
      if (selected && selected.id) {
        await api.put(`tasks/${selected.id}`, form, { headers: { Authorization: `Bearer ${token}` } });
        Swal.fire({ icon: "success", title: "Updated" });
      } else {
        await postWithAuth("tasks", form, token);
        Swal.fire({ icon: "success", title: "Added" });
      }
      setShowModal(false);
      fetchTasks();
    } catch {
      Swal.fire({ icon: "error", title: "Save failed" });
    }
  };
  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`tasks/${selected.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Swal.fire({ icon: "success", title: "Deleted" });
      setShowDelete(false);
      fetchTasks();
    } catch {
      Swal.fire({ icon: "error", title: "Delete failed" });
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-bar-chart-o"></i>
        </div>
        <div className="header-title">
          <h1>Running Tasks</h1>
          <small>Running Tasks details</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12 col-md-12">
            <div className="panel panel-bd lobidisable">
              <div className="panel-heading">
                <div className="panel-title">
                  <h4>Running Tasks Duration</h4>
                </div>
              </div>
              <div className="panel-body text-center">
                <h4 className="timing">{sessionDuration}</h4>
              </div>
            </div>
          </div>
          <div className="col-sm-12 col-md-12">
            <div className="panel panel-bd lobidisable">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Add Task</h4>
                  </a>
                </div>
              </div>
              <div className="panel-body">
                <div className="btn-group" style={{ marginBottom: 12 }}>
                  <button className="btn btn-add" onClick={openAdd}>
                    <i className="fa fa-plus"></i> Add Task
                  </button>
                  <TableExportButtons tableId="tasksTable" filename="running_tasks" />
                </div>

                {/* Add/Edit Task Modal */}
                {showModal && (
                  <div className="modal fade show" tabIndex="-1" role="dialog" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered justify-content-center" role="document" style={{ display: 'flex', justifyContent: 'center' }}>
                      <div className="modal-content">
                        <div className="modal-header">
                          <h4 className="modal-title">{selected ? 'Edit Task' : 'Add Task'}</h4>
                          <button type="button" className="close" aria-label="Close" onClick={handleModalClose}>
                            <span aria-hidden="true">&times;</span>
                          </button>
                        </div>
                        <form onSubmit={handleFormSubmit}>
                          <div className="modal-body" style={{ maxWidth: 500, margin: '0 auto' }}>
                            <div className="form-row mb-3" style={{ display: 'flex', gap: '12px' }}>
                              <div style={{ flex: 1 }}>
                                <label className="mb-1">Task Name</label>
                                <input type="text" className="form-control" name="name" value={form.name} onChange={handleFormChange} required autoFocus />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="mb-1">Due Date</label>
                                <input type="date" className="form-control" name="due_date" value={form.due_date} onChange={handleFormChange} required placeholder="dd-mm-yyyy" />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="mb-1">Assign To</label>
                                <input type="text" className="form-control" name="assigned_to" value={form.assigned_to} onChange={handleFormChange} required />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label className="mb-1">Status</label>
                                <select className="form-control" name="status" value={form.status} onChange={handleFormChange} required>
                                  {statusOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="form-row mb-3" style={{ display: 'flex', gap: '12px'  }}>
                              <div style={{ flex: 1 }}>
                                <label className="mb-1">Description</label>
                                <textarea className="form-control" name="description" value={form.description} onChange={handleFormChange} rows={3} />
                              </div>
                            </div>
                          </div>
                          <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={handleModalClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary">{selected ? 'Update' : 'Add'} Task</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
                <div className="table-responsive">
                  <table id="tasksTable" className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Task Name</th>
                        <th>Due date</th>
                        <th>Description</th>
                        <th>Assign to</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan="6" style={{ textAlign: "center" }}>Loading...</td></tr>
                      ) : tasks.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: "center" }}>No tasks</td></tr>
                      ) : (
                        tasks.map((row) => (
                          <tr key={row.id}>
                            <td>{row.name}</td>
                            <td>{row.due_date}</td>
                            <td>{row.description}</td>
                            <td>{row.assigned_to}</td>
                            <td><span className="label-custom label label-default">{row.status}</span></td>
                            <td>
                              <button className="btn btn-add btn-sm" title="Edit" onClick={() => openEdit(row)}><i className="fa fa-pencil"></i></button>
                              <button className="btn btn-danger btn-sm" title="Delete" onClick={() => openDelete(row)}><i className="fa fa-trash-o"></i></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Modal for Add/Edit */}
        {showModal && (
          <div className="modal fade in" style={{ display: "block" }}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header modal-header-primary">
                  <button type="button" className="close" onClick={handleModalClose}>&times;</button>
                  <h3><i className="fa fa-user m-r-5"></i> {selected ? "Edit" : "Add"} Task</h3>
                </div>
                <form className="form-horizontal" onSubmit={handleFormSubmit}>
                  <div className="modal-body">
                    <div className="row">
                      <div className="form-row mb-3" style={{ display: 'flex', gap: '12px', paddingBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <label className="control-label">Task Name</label>
                          <input type="text" name="name" className="form-control" value={form.name} onChange={handleFormChange} required />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="control-label">Due Date</label>
                          <input type="date" name="due_date" className="form-control" value={form.due_date} onChange={handleFormChange} required />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="control-label">Assign To</label>
                          <input type="text" name="assigned_to" className="form-control" value={form.assigned_to} onChange={handleFormChange} required />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="control-label">Status</label>
                          <select name="status" className="form-control" value={form.status} onChange={handleFormChange} required>
                            {statusOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row mb-3" style={{ display: 'flex', gap: '12px', paddingBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <label className="control-label">Description</label>
                          <textarea name="description" className="form-control" value={form.description} onChange={handleFormChange} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-danger pull-left" onClick={handleModalClose}>Cancel</button>
                    <button type="submit" className="btn btn-add btn-sm">Save</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
        {/* Modal for Delete */}
        {showDelete && (
          <div className="modal fade in" style={{ display: "block" }}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header modal-header-primary">
                  <button type="button" className="close" onClick={handleDeleteClose}>&times;</button>
                  <h3><i className="fa fa-user m-r-5"></i> Delete Task</h3>
                </div>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-12 form-group user-form-group">
                      <label className="control-label">Are you sure you want to delete this task?</label>
                      <div className="pull-right">
                        <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteClose}>No</button>
                        <button type="button" className="btn btn-add btn-sm" onClick={handleDeleteConfirm}>Yes</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-danger pull-left" onClick={handleDeleteClose}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
