
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import TableExportButtons from "../Component/TableExportButtons";
import api, { getWithAuth, postWithAuth, putWithAuth } from "../api";

export default function TaxRates() {
  const token = useSelector((state) => state.auth?.accesstoken);
  const [taxRates, setTaxRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({
    date: "",
    account: "",
    type: "",
    category: "",
    amount: "",
    description: "",
    credit: "",
    balance: ""
  });
  const [selected, setSelected] = useState(null);

  const fetchTaxRates = async () => {
    setLoading(true);
    try {
      const res = await getWithAuth("taxrates?limit=100", token);
      setTaxRates(res?.data?.data?.items || []);
    } catch {
      setTaxRates([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await getWithAuth("taxrates?limit=100", token);
        setTaxRates(res?.data?.data?.items || []);
      } catch {
        setTaxRates([]);
      }
      setLoading(false);
    })();
  }, [token]);

  const openAdd = () => {
    setForm({
      date: "",
      account: "",
      type: "",
      category: "",
      amount: "",
      description: "",
      credit: "",
      balance: ""
    });
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
    if (!form.date || !form.account || !form.type || !form.category || !form.amount) {
      Swal.fire({ icon: "warning", title: "Please fill all required fields" });
      return;
    }
    try {
      if (selected && selected.id) {
        // Edit
        await putWithAuth(`taxrates/${selected.id}`, form, token);
        Swal.fire({ icon: "success", title: "Updated" });
      } else {
        // Add
        await postWithAuth("taxrates", form, token);
        Swal.fire({ icon: "success", title: "Added" });
      }
      setShowModal(false);
      fetchTaxRates();
    } catch {
      Swal.fire({ icon: "error", title: "Save failed" });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`taxrates/${selected.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Swal.fire({ icon: "success", title: "Deleted" });
      setShowDelete(false);
      fetchTaxRates();
    } catch {
      Swal.fire({ icon: "error", title: "Delete failed" });
    }
  };

  return (
    <>
      <section className="content-header">
        <div className="header-icon">
          <i className="fa fa-file-text-o"></i>
        </div>
        <div className="header-title">
          <h1>Tax Rates</h1>
          <small>Tax Rates list</small>
        </div>
      </section>
      <section className="content">
        <div className="row">
          <div className="col-sm-12">
            <div className="panel panel-bd lobidrag">
              <div className="panel-heading">
                <div className="btn-group" id="buttonexport">
                  <a href="#">
                    <h4>Tax Rates</h4>
                  </a>
                </div>
              </div>
              <div className="panel-body">
                <div className="btn-group" style={{ marginBottom: 12 }}>
                  <button className="btn btn-add" onClick={openAdd}>
                    <i className="fa fa-plus"></i> Add Tax rates
                  </button>
                  <TableExportButtons tableId="taxRatesTable" filename="taxrates" />
                </div>
                <div className="table-responsive">
                  <table id="taxRatesTable" className="table table-bordered table-striped table-hover">
                    <thead>
                      <tr className="info">
                        <th>Date</th>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Credit</th>
                        <th>Balance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan="9" style={{ textAlign: "center" }}>Loading...</td></tr>
                      ) : taxRates.length === 0 ? (
                        <tr><td colSpan="9" style={{ textAlign: "center" }}>No data</td></tr>
                      ) : (
                        taxRates.map((row) => (
                          <tr key={row.id}>
                            <td>{row.date}</td>
                            <td>{row.account}</td>
                            <td>{row.type}</td>
                            <td>{row.category}</td>
                            <td>{row.amount}</td>
                            <td>{row.description}</td>
                            <td>{row.credit}</td>
                            <td>{row.balance}</td>
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
                  <h3><i className="fa fa-user m-r-5"></i> {selected ? "Edit" : "Add"} Tax Rate</h3>
                </div>
                <form className="form-horizontal" onSubmit={handleFormSubmit}>
                  <div className="modal-body">
                    <div className="row">
                      <div className="col-md-4 form-group" style={{ paddingBottom: 16, marginLeft: 10 }}>
                        <label className="control-label">Date</label>
                        <input type="date" name="date" className="form-control" value={form.date} onChange={handleFormChange} required placeholder="dd-mm-yyyy" />
                      </div>
                      <div className="col-md-4 form-group" style={{ paddingBottom: 16 }}>
                        <label className="control-label">Account</label>
                        <input type="text" name="account" className="form-control" value={form.account} onChange={handleFormChange} required />
                      </div>
                      <div className="col-md-4 form-group" style={{ paddingBottom: 16 }}>
                        <label className="control-label">Type</label>
                        <input type="text" name="type" className="form-control" value={form.type} onChange={handleFormChange} required />
                      </div>
                      <div className="col-md-6 form-group" style={{ paddingBottom: 16, marginLeft: 10 }}>
                        <label className="control-label">Category</label>
                        <input type="text" name="category" className="form-control" value={form.category} onChange={handleFormChange} required />
                      </div>
                      <div className="col-md-6 form-group" style={{ paddingBottom: 16 }}>
                        <label className="control-label">Amount</label>
                        <input type="text" name="amount" className="form-control" value={form.amount} onChange={handleFormChange} required />
                      </div>
                      <div className="col-md-6 form-group" style={{ paddingBottom: 16, marginLeft: 10 }}>
                        <label className="control-label">Description</label>
                        <input type="text" name="description" className="form-control" value={form.description} onChange={handleFormChange} />
                      </div>
                      <div className="col-md-3 form-group" style={{ paddingBottom: 16 }}>
                        <label className="control-label">Credit</label>
                        <input type="text" name="credit" className="form-control" value={form.credit} onChange={handleFormChange} />
                      </div>
                      <div className="col-md-3 form-group" style={{ paddingBottom: 16 }}>
                        <label className="control-label">Balance</label>
                        <input type="text" name="balance" className="form-control" value={form.balance} onChange={handleFormChange} />
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
                  <h3><i className="fa fa-user m-r-5"></i> Delete Tax Rate</h3>
                </div>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-12 form-group user-form-group">
                      <label className="control-label">Are you sure you want to delete this tax rate?</label>
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
