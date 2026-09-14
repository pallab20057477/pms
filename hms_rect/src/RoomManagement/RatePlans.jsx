import React, { useState, useEffect } from 'react';
import { getWithAuth, postWithAuth, putWithAuth, deleteWithAuth } from '../api';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import './RatePlansModern.css';

export default function RatePlans() {
  const token = useSelector((state) => state.auth.accesstoken);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    description: '',
    meal_plan: 'EP',
    is_active: true
  });

  const fetchPlans = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getWithAuth('/api/rate-plans', token);
      setPlans(res.data || []);
    } catch (err) {
      toast.error('Failed to fetch rate plans');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, [token]);

  const openNew = () => {
    setFormData({ id: null, name: '', description: '', meal_plan: 'EP', is_active: true });
    setShowModal(true);
  };

  const openEdit = (plan) => {
    setFormData({ ...plan });
    setShowModal(true);
  };

  const savePlan = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await putWithAuth(`/api/rate-plans/${formData.id}`, formData, token);
        toast.success('Rate plan updated');
      } else {
        await postWithAuth('/api/rate-plans', formData, token);
        toast.success('Rate plan created');
      }
      setShowModal(false);
      fetchPlans();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save rate plan');
    }
  };

  const toggleStatus = async (plan) => {
    try {
      await putWithAuth(`/api/rate-plans/${plan.id}`, { ...plan, is_active: !plan.is_active }, token);
      toast.success(plan.is_active ? 'Rate plan paused' : 'Rate plan activated');
      fetchPlans();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const deletePlan = async (id) => {
    if (!window.confirm("Are you sure you want to delete this rate plan? It will be removed from all mappings.")) return;
    try {
      await deleteWithAuth(`/api/rate-plans/${id}`, token);
      toast.success("Rate plan deleted");
      fetchPlans();
    } catch (err) {
      toast.error("Failed to delete rate plan");
    }
  };

  return (
    <div className="rate-plans-container">
      <div className="rp-header">
        <div className="rp-header-title">
          <div className="rp-header-icon">
            <i className="fa-solid fa-tags"></i>
          </div>
          <div>
            <h2>Rate Plans</h2>
            <p>Manage your hotel's meal plans and pricing packages for OTA channels</p>
          </div>
        </div>
        <button className="btn-premium" onClick={openNew}>
          <i className="fa-solid fa-plus"></i> New Rate Plan
        </button>
      </div>

      <div className="rp-card">
        {loading ? (
          <div className="p-5 text-center text-muted">
            <i className="fa-solid fa-circle-notch fa-spin fs-4 mb-3"></i>
            <p>Loading rate plans...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="rp-empty">
            <div className="rp-empty-icon">
              <i className="fa-solid fa-box-open"></i>
            </div>
            <h4>No Rate Plans Found</h4>
            <p>You haven't created any rate plans yet. Create one to map with your OTA channels (Booking.com, Agoda, etc).</p>
            <button className="btn-premium" onClick={openNew}>
              Create First Rate Plan
            </button>
          </div>
        ) : (
          <div className="rp-table-container">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Package Name</th>
                  <th>Meal Plan Code</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="rp-name">{p.name}</div>
                      <div className="rp-desc">{p.description || "No description provided"}</div>
                    </td>
                    <td>
                      <span className={`badge-meal badge-${p.meal_plan}`}>
                        {p.meal_plan}
                      </span>
                    </td>
                    <td>
                      <button className="rp-status-toggle" onClick={() => toggleStatus(p)}>
                        <div className={`toggle-track ${p.is_active ? 'active' : ''}`}>
                          <div className="toggle-thumb"></div>
                        </div>
                        <span style={{ fontSize: '13.5px', color: p.is_active ? '#10B981' : '#94A3B8', fontWeight: 600 }}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td>
                      <div className="rp-actions">
                        <button className="btn-icon" onClick={() => openEdit(p)} title="Edit">
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button className="btn-icon delete" onClick={() => deletePlan(p.id)} title="Delete">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="rp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={savePlan}>
              <div className="rp-modal-header">
                <h3>{formData.id ? 'Edit Rate Plan' : 'Create New Rate Plan'}</h3>
                <button type="button" className="rp-close-btn" onClick={() => setShowModal(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="rp-modal-body">
                <div className="rp-form-group">
                  <label>Package Name <span className="text-danger">*</span></label>
                  <input 
                    type="text" 
                    className="rp-input" 
                    required 
                    placeholder="e.g. Standard Rate, Breakfast Included"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                <div className="rp-form-group">
                  <label>Meal Plan Code <span className="text-danger">*</span></label>
                  <select 
                    className="rp-select" 
                    value={formData.meal_plan} 
                    onChange={e => setFormData({...formData, meal_plan: e.target.value})}
                  >
                    <option value="EP">EP (European Plan - Room Only)</option>
                    <option value="CP">CP (Continental Plan - Room + Breakfast)</option>
                    <option value="MAP">MAP (Modified American Plan - Half Board)</option>
                    <option value="AP">AP (American Plan - Full Board)</option>
                    <option value="RO">RO (Room Only)</option>
                    <option value="BB">BB (Bed & Breakfast)</option>
                  </select>
                </div>
                <div className="rp-form-group" style={{ marginBottom: 0 }}>
                  <label>Description</label>
                  <textarea 
                    className="rp-textarea" 
                    placeholder="Provide additional details about this rate plan..."
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  ></textarea>
                </div>
              </div>
              <div className="rp-modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary-solid">
                  {formData.id ? 'Save Changes' : 'Create Rate Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
