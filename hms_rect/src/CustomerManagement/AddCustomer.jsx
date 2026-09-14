
import { useState } from "react";
import Swal from "sweetalert2";
import { useSelector } from "react-redux";
import { postWithAuth } from "../api";
import { useNavigate, Link } from "react-router-dom";

const initialState = {
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
    picture: "",
    bank_details: "",
    passport: "",
    facebook_id: "",
    dob: "",
    address: "",
    customer_type: "vendor",
    gender: "male",
    status: "1"
};


function AddCustomer() {
    const token = useSelector((state) => state.auth.accesstoken);
    const navigate = useNavigate();
    const [formData, setFormData] = useState(initialState);
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (event) => {
        const { name, value, files, type } = event.target;
        if (type === "file") {
            setFormData((prev) => ({ ...prev, [name]: files && files.length > 0 ? files[0].name : "" }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleReset = (e) => {
        if (e) e.preventDefault();
        setFormData(initialState);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!token) {
            Swal.fire({ title: "Unauthorized", text: "Please login again.", icon: "warning" });
            return;
        }
        setIsSaving(true);
        try {
            const res = await postWithAuth('customers', { ...formData, status: formData.status === "1" }, token);
            const result = res?.data;
            if (result?.status) {
                Swal.fire({ title: "Success", text: result.message || "Customer added successfully", icon: "success" })
                    .then(() => navigate("/manage_customer"));
                return;
            }
            Swal.fire({ title: "Warning!", text: result?.error || "Unable to create customer", icon: "warning" });
        } catch {
            Swal.fire({ title: "Oops!", text: "Internal Server Problem", icon: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <section className="content-header">
                <div className="header-icon">
                    <i className="fa fa-users"></i>
                </div>
                <div className="header-title">
                    <h1>Add Customer</h1>
                    <small>Customer list</small>
                </div>
            </section>

            <section className="content">
                <div className="row">
                    <div className="col-sm-12">
                        <div className="panel panel-bd lobidrag">
                            <div className="panel-heading">
                                <div className="btn-group" id="buttonlist">
                                    <Link className="btn btn-add " to="/manage_customer">
                                        <i className="fa fa-list"></i>  Customer List
                                    </Link>
                                </div>
                            </div>
                            <div className="panel-body">
                                <form className="col-sm-6" onSubmit={handleSubmit}>
                                    <div className="form-group">
                                        <label>First Name</label>
                                        <input type="text" className="form-control" name="first_name" placeholder="Enter First Name" value={formData.first_name} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Last Name</label>
                                        <input type="text" className="form-control" name="last_name" placeholder="Enter last Name" value={formData.last_name} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input type="email" className="form-control" name="email" placeholder="Enter Email" value={formData.email} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Mobile</label>
                                        <input type="number" className="form-control" name="mobile" placeholder="Enter Mobile" value={formData.mobile} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Picture upload</label>
                                        <input type="file" name="picture" onChange={handleChange} />
                                        <input type="hidden" name="old_picture" />
                                    </div>
                                    <div className="form-group">
                                        <label>Bank details</label>
                                        <input type="text" className="form-control" name="bank_details" placeholder="Enter Bank details" value={formData.bank_details} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Passport</label>
                                        <input type="text" className="form-control" name="passport" placeholder="Enter Passport details" value={formData.passport} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Facebook Id</label>
                                        <input type="text" className="form-control" name="facebook_id" placeholder="Enter Facebook details" value={formData.facebook_id} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Date of Birth</label>
                                        <input type="date" className="form-control" name="dob" placeholder="Select Date of Birth" value={formData.dob} onChange={handleChange} />
                                    </div>
                                    <div className="form-group">
                                        <label>Address</label>
                                        <textarea className="form-control" rows={3} name="address" placeholder="Enter Address" value={formData.address} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Customer type</label>
                                        <select className="form-control" name="customer_type" value={formData.customer_type} onChange={handleChange}>
                                            <option value="vendor">vendor</option>
                                            <option value="vip">vip</option>
                                            <option value="regular">regular</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Sex</label><br />
                                        <label className="radio-inline">
                                            <input name="gender" value="male" checked={formData.gender === "male"} type="radio" onChange={handleChange} /> Male
                                        </label>
                                        <label className="radio-inline">
                                            <input name="gender" value="female" checked={formData.gender === "female"} type="radio" onChange={handleChange} /> Female
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <label>Status</label><br />
                                        <label className="radio-inline">
                                            <input type="radio" name="status" value="1" checked={formData.status === "1"} onChange={handleChange} />Active
                                        </label>
                                        <label className="radio-inline">
                                            <input type="radio" name="status" value="0" checked={formData.status === "0"} onChange={handleChange} />Inactive
                                        </label>
                                    </div>
                                    <div className="reset-button">
                                        <a href="#" className="btn btn-warning" onClick={handleReset} style={{ marginRight: 8 }}>
                                            Reset
                                        </a>
                                        <button type="submit" className="btn btn-success" disabled={isSaving}>
                                            Save
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}

export default AddCustomer;
