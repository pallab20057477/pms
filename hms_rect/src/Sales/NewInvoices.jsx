import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { postWithAuth, getWithAuth } from "../api";

export default function NewInvoices() {
	const token = useSelector((state) => state.auth.accesstoken);
	const [form, setForm] = useState({
		customer_id: "",
		invoice_no: "",
		amount: "",
		due_date: "",
		status: "draft"
	});
	const [customers, setCustomers] = useState([]);
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState(null);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchCustomers = async () => {
			try {
				const res = await getWithAuth("customers?limit=100", token);
				setCustomers(res?.data?.data?.items || []);
			} catch {
				setCustomers([]);
			}
		};
		if (token) fetchCustomers();
	}, [token]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setForm((prev) => ({ ...prev, [name]: value }));
	};

	const handleReset = (e) => {
		e.preventDefault();
		setForm({
			customer_id: "",
			invoice_no: "",
			amount: "",
			due_date: "",
			status: "draft"
		});
		setSuccess(null);
		setError(null);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setSaving(true);
		setSuccess(null);
		setError(null);
		try {
			const payload = {
				customer_id: Number(form.customer_id),
				invoice_no: form.invoice_no,
				amount: form.amount,
				due_date: form.due_date,
				status: form.status
			};
			await postWithAuth("invoices", payload, token);
			setSuccess("Invoice created successfully.");
			setForm({
				customer_id: "",
				invoice_no: "",
				amount: "",
				due_date: "",
				status: "draft"
			});
		} catch (err) {
			setError("Failed to create invoice.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<section className="content-header">
				<div className="header-icon">
					<i className="fa fa-sticky-note-o"></i>
				</div>
				<div className="header-title">
					<h1>Add Invoices</h1>
					<small>Invoices list</small>
				</div>
			</section>
			<section className="content">
				<div className="row">
					<div className="col-sm-12">
						<div className="panel panel-bd lobidrag">
							<div className="panel-heading">
								<div className="btn-group" id="buttonlist">
									<Link className="btn btn-add" to="/sales/invoices">
										<i className="fa fa-list"></i> Invoices
									</Link>
								</div>
							</div>
							<div className="panel-body">
								<form className="col-sm-6" onSubmit={handleSubmit}>
									<div className="form-group">
										<label>Customer</label>
										<select className="form-control" name="customer_id" value={form.customer_id} onChange={handleChange} required>
											<option value="">Select Customer</option>
											{customers.map((c) => (
												<option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
											))}
										</select>
									</div>
									<div className="form-group">
										<label>Invoice No</label>
										<input type="text" className="form-control" name="invoice_no" placeholder="Enter Invoice No" value={form.invoice_no} onChange={handleChange} required />
									</div>
									<div className="form-group">
										<label>Amount</label>
										<input type="number" className="form-control" name="amount" placeholder="Enter Amount" value={form.amount} onChange={handleChange} required />
									</div>
									<div className="form-group">
										<label>Due Date</label>
										<input type="date" className="form-control" name="due_date" value={form.due_date} onChange={handleChange} required />
									</div>
									<div className="form-group">
										<label>Status</label>
										<select className="form-control" name="status" value={form.status} onChange={handleChange} required>
											<option value="draft">Draft</option>
											<option value="unpaid">Unpaid</option>
											<option value="paid">Paid</option>
											<option value="cancelled">Cancelled</option>
										</select>
									</div>
									<div className="reset-button">
										<button type="button" className="btn btn-warning" onClick={handleReset} disabled={saving}>Reset</button>
										<button type="submit" className="btn btn-add" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
									</div>
									{success && <div className="alert alert-success" style={{ marginTop: 10 }}>{success}</div>}
									{error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
								</form>
							</div>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
