
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useSelector } from "react-redux";
import { getWithAuth, postWithAuth } from "../api";


export default function NewQuote() {
   const token = useSelector((state) => state.auth?.accesstoken);
   const [form, setForm] = useState({
	   account: "",
	   amount: "",
	   subject_name: "",
	   customer: "",
	   quotes: "",
	   entry_date: "",
	   expired_date: "",
	   mobile: "",
	   stage: "Draft",
	   sales_tax: "",
	   discount: ""
   });
   const [customers, setCustomers] = useState([]);

   useEffect(() => {
	   if (!token) return;
	   const fetchCustomers = async () => {
		   try {
			   const res = await getWithAuth("customers?limit=100", token);
			   setCustomers(res?.data?.data?.items || []);
		   } catch {
			   setCustomers([]);
		   }
	   };
	   fetchCustomers();
   }, [token]);

	const handleChange = (e) => {
		setForm({ ...form, [e.target.name]: e.target.value });
	};

	const handleReset = () => {
		   setForm({
			   account: "",
			   amount: "",
			   subject_name: "",
			   customer: "",
			   quotes: "",
			   entry_date: "",
			   expired_date: "",
			   mobile: "",
			   stage: "Draft",
			   sales_tax: "",
			   discount: ""
		   });
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			// Adjust payload as needed to match backend expectations
			   const payload = {
				   account: form.account,
				   amount: form.amount,
				   subject_name: form.subject_name,
				   customer: form.customer,
				   quotes: form.quotes,
				   entry_date: form.entry_date,
				   expired_date: form.expired_date,
				   mobile: form.mobile,
				   stage: form.stage,
				   sales_tax: form.sales_tax,
				   discount: form.discount
			   };
			await postWithAuth("quotes", payload, token);
			Swal.fire({ icon: "success", title: "Quote saved!" });
			handleReset();
		} catch {
			Swal.fire({ icon: "error", title: "Failed to save quote" });
		}
	};

	return (
		<section className="content-header">
			<div className="header-icon">
				<i className="fa fa-file-text"></i>
			</div>
			<div className="header-title">
				<h1>Add quotes</h1>
				<small>Quotes list</small>
			</div>
			<section className="content">
				<div className="row">
					<div className="col-sm-12">
						<div className="panel panel-bd lobidrag">
							<div className="panel-heading">
								<div className="btn-group" id="buttonlist">
									<Link className="btn btn-add" to="/sales/quotes">
										<i className="fa fa-list"></i> Quotes List
									</Link>
								</div>
							</div>
							<div className="panel-body">
								<form className="col-sm-6" onSubmit={handleSubmit}>
									   <div className="form-group">
										   <label>Account</label>
										   <input type="text" className="form-control" name="account" placeholder="Enter Account" value={form.account} onChange={handleChange} required />
									   </div>
									   <div className="form-group">
										   <label>Amount</label>
										   <input type="number" className="form-control" name="amount" placeholder="Enter Amount" value={form.amount} onChange={handleChange} required />
									   </div>
									   <div className="form-group">
											   <label>Subject</label>
											   <input type="text" className="form-control" name="subject_name" placeholder="Enter Subject" value={form.subject_name} onChange={handleChange} required />
									   </div>
									   <div className="form-group">
										   <label>Select Customer</label>
										   <select className="form-control" name="customer" value={form.customer} onChange={handleChange} required>
											   <option value="">Select Customer</option>
											   {customers.map((c) => (
												   <option key={c.id} value={c.id}>
													   {c.first_name} {c.last_name} ({c.email})
												   </option>
											   ))}
										   </select>
									   </div>
									<div className="form-group">
										<label>Quotes</label>
										<input type="text" className="form-control" name="quotes" placeholder="Enter Quotes" value={form.quotes} onChange={handleChange} required />
									</div>
									   <div className="form-group">
										   <label>Entry date</label>
										   <input type="date" className="form-control" name="entry_date" placeholder="Entry Date" value={form.entry_date} onChange={handleChange} />
									   </div>
									   <div className="form-group">
										   <label>Expire Date</label>
										   <input type="date" className="form-control" name="expired_date" placeholder="Expire Date" value={form.expired_date} onChange={handleChange} />
									   </div>
									<div className="form-group">
										<label>Mobile</label>
										<input type="number" className="form-control" name="mobile" placeholder="Enter Mobile" value={form.mobile} onChange={handleChange} />
									</div>
									<div className="form-group">
										<label>Stage</label>
										<select className="form-control" name="stage" value={form.stage} onChange={handleChange} required>
											<option>Draft</option>
											<option>accept</option>
											<option>cancel</option>
										</select>
									</div>
									<div className="form-group">
										<label>Sales tax</label>
										<input type="number" className="form-control" name="sales_tax" placeholder="Enter tax" value={form.sales_tax} onChange={handleChange} />
									</div>
									<div className="form-group">
										<label>Discount</label>
										<input type="text" className="form-control" name="discount" placeholder="Enter Discount" value={form.discount} onChange={handleChange} />
									</div>
									   <div className="reset-button">
										   <button type="button" className="btn btn-warning me-2" style={{marginRight: 8}} onClick={handleReset}>Reset</button>
										   <button type="submit" className="btn btn-add">Save</button>
									   </div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</section>
		</section>
	);
}
