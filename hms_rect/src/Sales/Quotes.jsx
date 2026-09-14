import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import api, { getWithAuth, postWithAuth } from "../api";
export default function Quotes() {
	const token = useSelector((state) => state.auth.accesstoken);
	const [quotes, setQuotes] = useState([]);
	const [selected, setSelected] = useState(null);
	const [showEdit, setShowEdit] = useState(false);
	const [showDelete, setShowDelete] = useState(false);
	const [editForm, setEditForm] = useState({});

	const fetchQuotes = async () => {
		try {
			const res = await getWithAuth("quotes?limit=100", token);
			setQuotes(res?.data?.data?.items || []);
		} catch {
			setQuotes([]);
		}
	};

	useEffect(() => {
		if (!token) return;
		fetchQuotes();
	}, [token]);

	const handleEdit = (quote) => {
		setSelected(quote);
		setEditForm({ ...quote });
		setShowEdit(true);
	};

	const handleDelete = (quote) => {
		setSelected(quote);
		setShowDelete(true);
	};

	const handleDeleteConfirm = async () => {
		try {
			await api.delete(`quotes/${selected.id}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			Swal.fire({ icon: "success", title: "Deleted" });
			setShowDelete(false);
			fetchQuotes();
		} catch {
			Swal.fire({ icon: "error", title: "Delete failed" });
		}
	};

	const handleEditChange = (e) => {
		setEditForm({ ...editForm, [e.target.name]: e.target.value });
	};

	const handleEditSubmit = async (e) => {
		e.preventDefault();
		try {
			const payload = {
				account: editForm.account,
				subject_name: editForm.subject_name,
				amount: editForm.amount,
				entry_date: editForm.entry_date,
				expired_date: editForm.expired_date,
				stage: editForm.stage
			};
			await api.put(`quotes/${selected.id}`, payload, {
				headers: { Authorization: `Bearer ${token}` }
			});
			Swal.fire({ icon: "success", title: "Updated" });
			setShowEdit(false);
			fetchQuotes();
		} catch {
			Swal.fire({ icon: "error", title: "Update failed" });
		}
	};

	// ...existing code...

	// Export helpers (copy, excel, csv, print)
	const getTableData = () => {
		const table = document.getElementById("quotesTable");
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
		triggerDownload("quotes.csv", "text/csv", csv);
	};
	const handleExcel = () => {
		const { headers, rows } = getTableData();
		const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Quotes"><Table>${[headers, ...rows].map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
		triggerDownload("quotes.xls", "application/vnd.ms-excel", xml);
	};
	const handlePrint = () => {
		const table = document.getElementById("quotesTable");
		if (!table) return;
		const win = window.open("", "_blank");
		win.document.write(`<html><head><title>Quotes</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`);
		win.document.close();
		win.print();
	};

	return (
		<>
			<section className="content-header">
				<div className="header-icon">
					<i className="fa fa-file-text-o"></i>
				</div>
				<div className="header-title">
					<h1>Quotes</h1>
					<small>Quotes List</small>
				</div>
			</section>
			<section className="content">
				<div className="row">
					<div className="col-sm-12">
						<div className="panel panel-bd lobidrag">
							<div className="panel-heading">
								<div className="btn-group" id="buttonexport">
									<a href="#"><h4>Quotes</h4></a>
								</div>
							</div>
							<div className="panel-body">
								<div className="btn-group buttonexport" style={{ marginBottom: 12 }}>
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
								{/* Export Table Data dropdown removed as requested */}
								<div className="table-responsive">
									<table id="quotesTable" className="table table-bordered table-striped table-hover">
										<thead>
											<tr className="info">
												<th>Serial No.</th>
												<th>Account</th>
												<th>Subject Name</th>
												<th>Amount</th>
												<th>Entry Date</th>
												<th>Expired Date</th>
												<th>Stage</th>
												<th>Action</th>
											</tr>
										</thead>
										<tbody>
											{quotes.length === 0 ? (
												<tr>
													<td colSpan="8" style={{ textAlign: "center" }}>No quotes found</td>
												</tr>
											) : (
												quotes.map((q, idx) => (
													<tr key={q.id}>
														<td>{idx + 1}</td>
														<td>{q.account}</td>
														<td>{q.subject_name}</td>
														<td>{q.amount}</td>
														<td>{q.entry_date}</td>
														<td>{(q.expired_date || q.expiry_date || '').split('T')[0]}</td>
														<td><span className={`label label-${q.stage === "Draft" ? "custom" : q.stage === "transfer" ? "info" : "warning"}`}>{q.stage}</span></td>
														<td>
															<button type="button" className="btn btn-add btn-sm" onClick={() => handleEdit(q)}><i className="fa fa-pencil"></i></button>
															<button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(q)}><i className="fa fa-trash-o"></i></button>
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
				{/* Edit Modal */}
				{showEdit && (
					<div className="modal fade in" style={{ display: "block" }}>
						<div className="modal-dialog">
							<div className="modal-content">
								<div className="modal-header modal-header-primary">
									<button type="button" className="close" onClick={() => setShowEdit(false)}>×</button>
									<h3><i className="fa fa-user m-r-5"></i> Update Quotes</h3>
								</div>
								<div className="modal-body">
									<div className="row">
										<div className="col-md-12">
											<form className="form-horizontal" onSubmit={handleEditSubmit}>
												<fieldset>
													<div className="col-md-4 form-group">
														<label className="control-label">Subject name</label>
														<input type="text" name="subject_name" placeholder="Subject" className="form-control" value={editForm.subject_name || ""} onChange={handleEditChange} />
													</div>
													<div className="col-md-4 form-group">
														<label className="control-label">Account</label>
														<input type="text" name="account" placeholder="Account" className="form-control" value={editForm.account || ""} onChange={handleEditChange} />
													</div>
													<div className="col-md-4 form-group">
														<label className="control-label">Amount</label>
														<input type="number" name="amount" placeholder="Amount" className="form-control" value={editForm.amount || ""} onChange={handleEditChange} />
													</div>
													<div className="col-md-6 form-group">
														<label className="control-label">Entry Date</label>
														<input type="date" name="entry_date" placeholder="Entry Date" className="form-control" value={(editForm.entry_date || '').split('T')[0]} onChange={handleEditChange} />
													</div>
													<div className="col-md-6 form-group">
														<label className="control-label">Expire Date</label>
														<input type="date" name="expired_date" placeholder="Expire Date" className="form-control" value={(editForm.expired_date || '').split('T')[0]} onChange={handleEditChange} />
													</div>
													<div className="col-md-6 form-group">
														<label className="control-label">Stage</label>
														<select name="stage" className="form-control" value={editForm.stage || ''} onChange={handleEditChange} required>
															<option value="Draft">Draft</option>
															<option value="accept">accept</option>
															<option value="cancel">cancel</option>
														</select>
													</div>
													<div className="col-md-12 form-group user-form-group">
														<div className="pull-right">
															<button type="button" className="btn btn-danger btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
															<button type="submit" className="btn btn-add btn-sm">Save</button>
														</div>
													</div>
												</fieldset>
											</form>
										</div>
									</div>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn btn-danger pull-left" onClick={() => setShowEdit(false)}>Close</button>
								</div>
							</div>
						</div>
					</div>
				)}
				{/* Delete Modal */}
				{showDelete && (
					<div className="modal fade in" style={{ display: "block" }}>
						<div className="modal-dialog">
							<div className="modal-content">
								<div className="modal-header modal-header-primary">
									<button type="button" className="close" onClick={() => setShowDelete(false)}>×</button>
									<h3><i className="fa fa-user m-r-5"></i> Delete Quote</h3>
								</div>
								<div className="modal-body">
									<p>Are you sure you want to delete this quote?</p>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn btn-danger pull-left" onClick={() => setShowDelete(false)}>Cancel</button>
									<button type="button" className="btn btn-add pull-right" onClick={handleDeleteConfirm}>Delete</button>
								</div>
							</div>
						</div>
					</div>
				)}
			</section>
		</>
	);
}
