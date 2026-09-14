import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import { getWithAuth, postWithAuth } from "../api";

export default function NewRecurring() {
	const token = useSelector((state) => state.auth.accesstoken);
	const [form, setForm] = useState({
		referenceNo: "",
		recurringEvery: "Month",
		department: "",
		startDate: "",
		endDate: "",
		client: "",
		notes: ""
	});
	const [departments, setDepartments] = useState([]);
	const [clients, setClients] = useState([]);

	useEffect(() => {
		if (!token) return;
		const fetchData = async () => {
			try {
				const res = await getWithAuth("customers?limit=100", token);
				setClients(res?.data?.data?.items || res?.data?.items || []);
			} catch {
				setClients([]);
			}
		};
		fetchData();
	}, [token]);

	const handleChange = e => {
		setForm({ ...form, [e.target.name]: e.target.value });
	};

	const handleSubmit = async e => {
		e.preventDefault();
		try {
			await postWithAuth("recurring", {
				reference_no: form.referenceNo,
				recurring_every: form.recurringEvery,
				department: form.department,
				start_date: form.startDate,
				end_date: form.endDate,
				client_id: form.client,
				notes: form.notes,
				is_recurring: true
			}, token);
			Swal.fire({ icon: "success", title: "Success", text: "Recurring invoice created." });
			setForm({ referenceNo: "", recurringEvery: "Month", department: "", startDate: "", endDate: "", client: "", notes: "" });
		} catch (err) {
			Swal.fire({ icon: "error", title: "Error", text: "Could not create recurring invoice." });
		}
	};

	return (
		<div className="content">
			<section className="content-header">
				<div className="header-icon">
					<i className="fa fa-suitcase"></i>
				</div>
				<div className="header-title">
					<h1>New Recurring invoices</h1>
					<small>New Recurring invoices Details</small>
				</div>
			</section>
			<section className="content">
				<div className="row">
					<div className="col-sm" style={{ marginTop: 40, marginBottom: 40 }}>
						<div className="panel lobidisable panel-bd">
							<div className="panel-heading">
								<div className="btn-group" id="buttonexport">
									<a href="#">
										<h4>New Recurring invoices</h4>
									</a>
								</div>
							</div>
							<div className="panel-body">
								<form className="col-sm-6"onSubmit={handleSubmit} style={{ padding: 0, background: 'none', boxShadow: 'none', borderRadius: 0 }}>
									  <div className="form-group">
										<label>Reference No.</label>
										<input type="text" className="form-control" name="referenceNo" value={form.referenceNo} onChange={handleChange} placeholder="Ref No." required />
									  </div>
									<div className="form-group">
										<label>Recurring Every</label>
										<select className="form-control" name="recurringEvery" value={form.recurringEvery} onChange={handleChange} required>
											<option value="Day">Day</option>
											<option value="Week">Week</option>
											<option value="Month">Month</option>
											<option value="Year">Year</option>
										</select>
									</div>
									<div className="form-group">
										<label>Department</label>
										<input type="text" className="form-control" name="department" value={form.department} onChange={handleChange} placeholder="Department" required />
									</div>
									<div className="form-group">
										<label>Start Date</label>
										<input type="date" className="form-control" name="startDate" value={form.startDate} onChange={handleChange} required />
									</div>
									<div className="form-group">
										<label>End Date</label>
										<input type="date" className="form-control" name="endDate" value={form.endDate} onChange={handleChange} required />
									</div>
									<div className="form-group">
										<label>Select Client</label>
										<select className="form-control" name="client" value={form.client} onChange={handleChange} required>
											<option value="">Select</option>
											{clients.map(cli => (
												<option key={cli.id} value={cli.id}>{cli.name}</option>
											))}
										</select>
									</div>
									<div className="form-group">
										<label>Notes</label><br />
										<textarea name="notes" className="form-control" rows="3" value={form.notes} onChange={handleChange}></textarea>
									</div>
									<div className="form-group">
										<input type="submit" value="Save As Draft" className="btn btn-warning" />
										<input type="submit" value="Update" className="btn btn-add" style={{ marginLeft: 10 }} />
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
