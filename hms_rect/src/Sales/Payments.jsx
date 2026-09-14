import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import { deleteWithAuth, getWithAuth, postWithAuth, putWithAuth } from "../api";
import "./PaymentsModern.css";

const formatINR = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const extractItems = (res) => {
	const list = res?.data?.data?.items ?? res?.data?.items ?? res?.data?.data ?? [];
	return Array.isArray(list) ? list : [];
};

export default function Payments() {
	const navigate = useNavigate();
	const token = useSelector((state) => state.auth.accesstoken);
	const [payments, setPayments] = useState([]);
	const [form, setForm] = useState({ invoice_id: '', method: '', amount: '', paid_on: '', status: 'success' });
	const [showModal, setShowModal] = useState(false);
	const [saving, setSaving] = useState(false);
	const [invoices, setInvoices] = useState([]);
	const [editId, setEditId] = useState(null);
	const [editForm, setEditForm] = useState({ invoice_id: '', method: '', amount: '', paid_on: '', status: 'success' });
	const [openDropdownId, setOpenDropdownId] = useState(null);
	const [filterBookingId, setFilterBookingId] = useState(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (!e.target.closest('.payment-dropdown-btn') && !e.target.closest('.payment-actions-dropdown')) {
				setOpenDropdownId(null);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const toggleDropdown = (id) => {
		setOpenDropdownId(openDropdownId === id ? null : id);
	};

	const refreshPayments = async () => {
		const res = await getWithAuth('payments?limit=500', token);
		setPayments(extractItems(res));
	};

	const handleEdit = (p) => {
		setOpenDropdownId(null);
		setEditId(p.id);
		setEditForm({
			invoice_id: p.invoice_id || '',
			method: p.method || '',
			amount: p.amount || '',
			paid_on: p.paid_on ? p.paid_on.slice(0, 10) : '',
			status: p.status || 'success',
		});
	};

	const handleDelete = async (id) => {
		setOpenDropdownId(null);
		if (!window.confirm('Are you sure you want to delete this payment?')) return;
		setSaving(true);
		try {
			await deleteWithAuth(`payments/${id}`, token);
			setPayments(payments.filter(p => p.id !== id));
			Swal.fire({ icon: 'success', title: 'Payment deleted' });
		} catch {
			Swal.fire({ icon: 'error', title: 'Failed to delete payment' });
		}
		setSaving(false);
	};

	const handleEditSubmit = async (e) => {
		e.preventDefault();
		setSaving(true);
		try {
			const amountValue = Number(editForm.amount);
			if (!Number.isFinite(amountValue) || amountValue < 0) {
				Swal.fire({ icon: 'error', title: 'Invalid amount' });
				setSaving(false);
				return;
			}
			const payload = {
				method: editForm.method,
				amount: amountValue,
				paid_on: editForm.paid_on,
				status: editForm.status
			};
			const invoiceIdValue = Number(editForm.invoice_id);
			if (Number.isInteger(invoiceIdValue) && invoiceIdValue > 0) payload.invoice_id = invoiceIdValue;
			await putWithAuth(`payments/${editId}`, payload, token);
			await refreshPayments();
			setEditId(null);
			Swal.fire({ icon: 'success', title: 'Payment updated' });
		} catch (err) {
			const msg = err?.response?.data?.error || 'Failed to update payment';
			Swal.fire({ icon: 'error', title: msg });
		}
		setSaving(false);
	};

	const paymentsWithExtras = React.useMemo(() => {
		const filtered = filterBookingId ? payments.filter(p => p.booking_id === filterBookingId) : payments;
		return filtered.reduce((acc, p) => {
			const account = p.method || p.from || "-";
			const transaction_id = p.id ? `TXN${p.id}` : "-";
			const credit = p.amount && !isNaN(Number(p.amount)) ? Number(p.amount) : 0;
			const prevBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
			const balance = prevBalance + credit;
			acc.push({
				...p,
				account,
				transaction_id,
				credit: credit > 0 ? credit : "-",
				balance
			});
			return acc;
		}, []);
	}, [payments, filterBookingId]);

	const totalCount = paymentsWithExtras.length;
	const successCount = paymentsWithExtras.filter((p) => (p.status || "").toLowerCase() === "success").length;
	const pendingCount = paymentsWithExtras.filter((p) => (p.status || "").toLowerCase() === "pending").length;
	const totalAmount = paymentsWithExtras.reduce((sum, p) => sum + Number(p.amount || 0), 0);

	useEffect(() => {
		if (!token) return;
		const fetchData = async () => {
			try {
				const [paymentsRes, invoicesRes] = await Promise.all([
					getWithAuth("payments?limit=500", token),
					getWithAuth("invoices?limit=500", token)
				]);
				setPayments(extractItems(paymentsRes));
				setInvoices(extractItems(invoicesRes));
			} catch {
				setPayments([]);
				setInvoices([]);
			}
		};
		fetchData();
	}, [token]);

	const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
	const handleOpenModal = () => setShowModal(true);
	const handleCloseModal = () => { setShowModal(false); setForm({ invoice_id: "", method: "", amount: "", paid_on: "", status: "success" }); };
	const handleSubmit = async (e) => {
		e.preventDefault();
		setSaving(true);
		try {
			const amountValue = Number(form.amount);
			if (!Number.isFinite(amountValue) || amountValue <= 0) {
				Swal.fire({ icon: 'error', title: 'Invalid amount' });
				setSaving(false);
				return;
			}
			const payload = {
				method: form.method,
				amount: amountValue,
				paid_on: form.paid_on,
				status: form.status
			};
			if (form.invoice_id) {
				payload.invoice_id = parseInt(form.invoice_id);
			}
			await postWithAuth("payments", payload, token);
			Swal.fire({ icon: "success", title: "Payment added" });
			handleCloseModal();
			await refreshPayments();
		} catch (err) {
			const msg = err?.response?.data?.error || "Failed to add payment";
			Swal.fire({ icon: "error", title: msg });
		}
		setSaving(false);
	};

	const getTableData = () => {
		const table = document.getElementById("paymentsTable");
		if (!table) return { headers: [], rows: [] };
		const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.innerText.trim());
		const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
			Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
		);
		return { headers, rows };
	};
	const handleCopy = () => {
		const { headers, rows } = getTableData();
		const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
		navigator.clipboard.writeText(text);
	};
	const triggerDownload = (name, mime, content) => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(new Blob([content], { type: mime }));
		a.download = name;
		a.click();
	};
	const handleCSV = () => {
		const { headers, rows } = getTableData();
		const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
		triggerDownload("payments.csv", "text/csv", csv);
	};
	const handleExcel = () => {
		const { headers, rows } = getTableData();
		const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Payments"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
		triggerDownload("payments.xls", "application/vnd.ms-excel", xml);
	};
	const handlePrint = () => {
		const table = document.getElementById("paymentsTable");
		if (!table) return;
		const win = window.open("", "_blank");
		win.document.write(`<html><head><title>Payments</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`);
		win.document.close();
		win.print();
	};

	return (
		<>
			<section className="content-header">
				<div className="header-icon">
					<i className="fa-solid fa-credit-card"></i>
				</div>
				<div className="header-title">
					<h1>Payment</h1>
					<small>Payments List</small>
				</div>
			</section>
			<section className="content">
				<div className="row">
					<div className="col-sm-12">
						<div className="row payment-kpi-row">
							<div className="col-sm-3 col-xs-6">
								<div className="payment-kpi-card payment-kpi-total">
									<span className="payment-kpi-label">Total Payments</span>
									<div className="payment-kpi-value">{totalCount}</div>
								</div>
							</div>
							<div className="col-sm-3 col-xs-6">
								<div className="payment-kpi-card payment-kpi-success">
									<span className="payment-kpi-label">Success</span>
									<div className="payment-kpi-value">{successCount}</div>
								</div>
							</div>
							<div className="col-sm-3 col-xs-6">
								<div className="payment-kpi-card payment-kpi-pending">
									<span className="payment-kpi-label">Pending</span>
									<div className="payment-kpi-value">{pendingCount}</div>
								</div>
							</div>
							<div className="col-sm-3 col-xs-6">
								<div className="payment-kpi-card payment-kpi-amount">
									<span className="payment-kpi-label">Total Amount</span>
									<div className="payment-kpi-value payment-kpi-money">{formatINR(totalAmount)}</div>
								</div>
							</div>
						</div>

						<div className="panel panel-bd lobidrag payment-panel">
							<div className="panel-heading payment-panel-heading">
								<div>
									<h4 className="payment-panel-title">Payment Ledger</h4>
									<p className="payment-panel-subtitle">Manage posted payments, references, and running balances.</p>
								</div>
							</div>
							<div className="panel-body">
								<div className="btn-group buttonexport payment-toolbar">
									<button type="button" className="btn btn-success btn-sm" onClick={handleOpenModal}>
										<i className="fa-solid fa-plus"></i> Add Payment
									</button>
									<button type="button" className="btn btn-default btn-sm" onClick={handleCopy}>
										<i className="fa-solid fa-copy"></i> Copy
									</button>
									<button type="button" className="btn btn-default btn-sm" onClick={handleExcel}>
										<i className="fa-solid fa-file-excel"></i> Excel
									</button>
									<button type="button" className="btn btn-default btn-sm" onClick={handleCSV}>
										<i className="fa-solid fa-file-csv"></i> CSV
									</button>
									<button type="button" className="btn btn-default btn-sm" onClick={handlePrint}>
										<i className="fa-solid fa-print"></i> Print
									</button>
									{filterBookingId && (
										<button type="button" className="btn btn-warning btn-sm" onClick={() => setFilterBookingId(null)}>
											<i className="fa-solid fa-filter-circle-xmark"></i> Clear Filter
										</button>
									)}
								</div>
								<div className="table-responsive" style={{ overflow: 'visible' }}>
									<table id="paymentsTable" className="table table-bordered table-hover payment-table">
										<thead>
											<tr>
												<th>Booking ID</th>
												<th>Customer</th>
												<th>Date</th>
												<th>Account</th>
												<th>Amount</th>
												<th>Transaction Id</th>
												<th>Credit</th>
												<th>Balance</th>
												<th style={{ width: 80, textAlign: 'center' }}>Action</th>
											</tr>
										</thead>
										<tbody>
											{paymentsWithExtras.map((p) => {
												const bookingDisplay = p.booking_code || (p.booking_id ? `#${p.booking_id}` : "-");
												const customerDisplay = p.customer_name || "-";
												
												const account = p.account || "-";
												const transaction_id = p.transaction_id || "-";
												const credit = p.credit || "-";
												const balance = typeof p.balance === "number" ? p.balance.toFixed(2) : "-";
												return (
													<tr key={p.id}>
														<td>{bookingDisplay}</td>
														<td>{customerDisplay}</td>
														<td>{p.paid_on || "-"}</td>
														<td>{account}</td>
														<td>{p.amount !== undefined && p.amount !== null && p.amount !== "" ? formatINR(p.amount) : "-"}</td>
														<td>{transaction_id}</td>
														<td>{credit !== "-" ? formatINR(credit) : "-"}</td>
														<td>{balance !== "-" ? formatINR(balance) : "-"}</td>
														<td style={{ textAlign: 'center', position: 'relative' }}>
															<button type="button" className="payment-dropdown-btn" onClick={() => toggleDropdown(p.id)}>
																<i className="fa-solid fa-ellipsis-vertical"></i>
															</button>
															{openDropdownId === p.id && (
																<div className="payment-actions-dropdown">
																	<ul>
																		<li>
																			<button type="button" onClick={() => navigate(`/booking/${p.booking_id}/folio`)} disabled={saving}>
																				<i className="fa-solid fa-file-invoice"></i> View Folio
																			</button>
																		</li>
																		<li>
																			<button type="button" onClick={() => { setFilterBookingId(p.booking_id); setOpenDropdownId(null); }} disabled={saving}>
																				<i className="fa-solid fa-list"></i> View Related
																			</button>
																		</li>
																		<li>
																			<button type="button" onClick={() => handleEdit(p)} disabled={saving}>
																				<i className="fa-solid fa-pen"></i> Edit
																			</button>
																		</li>
																		<li>
																			<button type="button" className="text-danger" style={{ color: '#ef4444' }} onClick={() => handleDelete(p.id)} disabled={saving}>
																				<i className="fa-solid fa-trash"></i> Delete
																			</button>
																		</li>
																	</ul>
																</div>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
			{/* Edit Modal (rendered once, outside the table) */}
			{editId && (
				<div className="payment-modal-overlay" onClick={() => setEditId(null)}>
					<div className="payment-modal-shell">
						<div className="payment-modal-card" onClick={e => e.stopPropagation()}>
							<div className="payment-modal-head">
								<h4>Edit Payment</h4>
								<button onClick={() => setEditId(null)} className="payment-modal-close">&times;</button>
							</div>
							<form onSubmit={handleEditSubmit} className="payment-modal-form">
								<div className="form-group">
									<label>Method</label>
									<input name="method" value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} className="form-control payment-input" required minLength={2} maxLength={50} />
								</div>
								<div className="form-group">
									<label>Amount</label>
									<input name="amount" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} className="form-control payment-input" required />
								</div>
								<div className="form-group">
									<label>Paid On</label>
									<input name="paid_on" value={editForm.paid_on} onChange={e => setEditForm(f => ({ ...f, paid_on: e.target.value }))} className="form-control payment-input" type="date" required />
								</div>
								<div className="form-group">
									<label>Status</label>
									<select name="status" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="form-control payment-input" required>
										<option value="success">Success</option>
										<option value="failed">Failed</option>
										<option value="pending">Pending</option>
									</select>
								</div>
								<div className="payment-modal-actions">
									<button type="button" className="btn btn-danger" onClick={() => setEditId(null)} disabled={saving}>Cancel</button>
									<button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			)}
			{showModal && (
				<div className="payment-modal-overlay" onClick={handleCloseModal}>
					<div className="payment-modal-shell">
						<div className="payment-modal-card" onClick={e => e.stopPropagation()}>
							<div className="payment-modal-head">
								<h4>Add Payment</h4>
								<button onClick={handleCloseModal} className="payment-modal-close">&times;</button>
							</div>
							<form onSubmit={handleSubmit} className="payment-modal-form">
								<div className="form-group">
									<label>Invoice</label>
									<select name="invoice_id" value={form.invoice_id} onChange={handleChange} className="form-control payment-input" required>
										<option value="">Select Invoice</option>
										{invoices.map(inv => (
											<option key={inv.id} value={inv.id}>
												{inv.invoice_no || inv.id}
											</option>
										))}
									</select>
								</div>
								<div className="form-group">
									<label>Method</label>
									<input name="method" value={form.method} onChange={handleChange} className="form-control payment-input" required minLength={2} maxLength={50} />
								</div>
								<div className="form-group">
									<label>Amount</label>
									<input name="amount" value={form.amount} onChange={handleChange} className="form-control payment-input" required />
								</div>
								<div className="form-group">
									<label>Paid On</label>
									<input name="paid_on" value={form.paid_on} onChange={handleChange} className="form-control payment-input" type="date" required />
								</div>
								<div className="form-group">
									<label>Status</label>
									<select name="status" value={form.status} onChange={handleChange} className="form-control payment-input" required>
										<option value="success">Success</option>
										<option value="failed">Failed</option>
										<option value="pending">Pending</option>
									</select>
								</div>
								<div className="payment-modal-actions">
									<button type="button" className="btn btn-danger" onClick={handleCloseModal} disabled={saving}>Cancel</button>
									<button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			)}
	   </>
   );
}
