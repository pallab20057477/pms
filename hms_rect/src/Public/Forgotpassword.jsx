import { useFormik } from "formik"
import Swal from 'sweetalert2';
import * as Yup from 'yup';
import api from "../api";
import Preloader from "../Component/Preloader";
import { useState } from "react";
import { Link } from "react-router-dom";
import Cookies from 'js-cookie';

export default function Forgotpassword() {
    const [loader, setLoader] = useState(false);
    const [otpNeeded, setOtpNeeded] = useState(false);
    const [resetToken, setResetToken] = useState(null);

    const resetFormik = useFormik({
        initialValues: {
            email: Cookies.get("email") ?? "",
            otp: '',
        },
        validationSchema: Yup.object({
            email: Yup.string().email('Please Enter Valid Email').required('Please Enter Your Email'),
            ...(otpNeeded && {
                otp: Yup.string().required('OTP is required').matches(/^[0-9]{6}$/, 'OTP must be 6 digits'),
            }),
        }),
        onSubmit: async values => {
            setLoader(true);
            try {
                if (otpNeeded) {
                    const res = await api.post('verify_otp', { email: values.email, otp: Number(values.otp) });
                    const result = res.data;
                    if (result.status) {
                        Swal.fire({ title: "Success", text: result.message, icon: "success" })
                            .then(() => setResetToken(result.data));
                    } else {
                        Swal.fire({ title: "Warning!", text: result.error, icon: "info", iconColor: "#F7C30C" });
                    }
                } else {
                    const res = await api.post('forgot_password', { email: values.email });
                    const result = res.data;
                    if (result.status) {
                        Swal.fire({ title: "Success", text: result.message, icon: "success" })
                            .then(() => setOtpNeeded(true));
                    } else {
                        Swal.fire({ title: "Warning!", text: result.error, icon: "info", iconColor: "#F7C30C" });
                    }
                }
            } catch {
                Swal.fire({ title: "Oops!", text: "Internal Server Problem", icon: "error" });
            } finally {
                setLoader(false);
            }
        }
    });

    const passwordSetFormik = useFormik({
        initialValues: { password: "", confirm_password: '' },
        validationSchema: Yup.object({
            password: Yup.string().min(8, 'Password must be at least 8 characters').required('Please Enter Your Password'),
            confirm_password: Yup.string().oneOf([Yup.ref("password"), null], "Passwords must match").required('Please Confirm Your Password'),
        }),
        onSubmit: async values => {
            setLoader(true);
            try {
                const res = await api.post('reset_password', { password: values.password }, {
                    headers: { Authorization: resetToken }
                });
                const result = res.data;
                if (result.status) {
                    Swal.fire({ title: "Success", text: result.message, icon: "success" })
                        .then(() => { setResetToken(null); setOtpNeeded(false); });
                } else {
                    Swal.fire({ title: "Warning!", text: result.error, icon: "info", iconColor: "#F7C30C" });
                }
            } catch {
                Swal.fire({ title: "Oops!", text: "Internal Server Problem", icon: "error" });
            } finally {
                setLoader(false);
            }
        }
    });

    return (
        <>
            {loader && (<Preloader />)}
            <div className="login-wrapper">
                <div className="container-center">
                    <div className="login-area">
                        <div className="panel panel-bd panel-custom">
                            <div className="panel-heading">
                                <div className="view-header">
                                    <div className="header-icon"><i className="pe-7s-unlock"></i></div>
                                    <div className="header-title">
                                        <h3>Reset your password</h3>
                                        <small><strong>Please enter your credentials to reset password.</strong></small>
                                    </div>
                                </div>
                            </div>
                            <div className="panel-body">
                                {resetToken === null ? (
                                    <form onSubmit={resetFormik.handleSubmit}>
                                        <div className="form-group">
                                            <label className="control-label">Email</label>
                                            <input type="text" placeholder="example@gmail.com" name="email" onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} className="form-control" value={resetFormik.values.email} />
                                            <span className="help-block small text-danger">{resetFormik.errors.email && resetFormik.touched.email ? resetFormik.errors.email : ''}</span>
                                        </div>
                                        {otpNeeded && (
                                            <div className="form-group">
                                                <label className="control-label">OTP</label>
                                                <input type="text" placeholder="6-digit OTP" name="otp" maxLength={6} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} className="form-control" value={resetFormik.values.otp} />
                                                <span className="help-block small text-danger">{resetFormik.errors.otp && resetFormik.touched.otp ? resetFormik.errors.otp : ''}</span>
                                            </div>
                                        )}
                                        <div>
                                            <button className="btn btn-add" style={{ width: "100%" }} type="submit">
                                                {otpNeeded ? "Validate OTP" : "Send OTP"}
                                            </button>
                                        </div>
                                        <div className="text-center" style={{ marginTop: 5 }}>
                                            Already have account? <Link to="/">Login</Link>
                                        </div>
                                    </form>
                                ) : (
                                    <form onSubmit={passwordSetFormik.handleSubmit}>
                                        <div className="form-group">
                                            <label className="control-label">New Password</label>
                                            <input type="password" placeholder="*******" name="password" onChange={passwordSetFormik.handleChange} onBlur={passwordSetFormik.handleBlur} className="form-control" value={passwordSetFormik.values.password} />
                                            <span className="help-block small text-danger">{passwordSetFormik.errors.password && passwordSetFormik.touched.password ? passwordSetFormik.errors.password : ''}</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="control-label">Confirm Password</label>
                                            <input type="password" placeholder="*******" name="confirm_password" onChange={passwordSetFormik.handleChange} onBlur={passwordSetFormik.handleBlur} className="form-control" value={passwordSetFormik.values.confirm_password} />
                                            <span className="help-block small text-danger">{passwordSetFormik.errors.confirm_password && passwordSetFormik.touched.confirm_password ? passwordSetFormik.errors.confirm_password : ''}</span>
                                        </div>
                                        <div>
                                            <button className="btn btn-add" style={{ width: "100%" }} type="submit">Save Password</button>
                                        </div>
                                        <div className="text-center" style={{ marginTop: 5 }}>
                                            Already have account? <Link to="/">Login</Link>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
