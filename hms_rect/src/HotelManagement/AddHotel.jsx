import React, { useState } from 'react';
import axios from 'axios';

function AddHotel() {
  const [formData, setFormData] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    gstNumber: '',
    panNumber: '',
    logo: null,
    description: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, logo: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.keys(formData).forEach((key) => {
      data.append(key, formData[key]);
    });

    try {
      const response = await axios.post('/api/hotels', data);
      alert('Hotel added successfully!');
    } catch (error) {
      console.error('Error adding hotel:', error);
      alert('Failed to add hotel.');
    }
  };

  return (
    <div>
      <h2>Add New Hotel</h2>
      <form onSubmit={handleSubmit}>
        <input type="text" name="name" placeholder="Hotel Name" onChange={handleChange} required />
        <input type="text" name="address1" placeholder="Address Line 1" onChange={handleChange} required />
        <input type="text" name="address2" placeholder="Address Line 2" onChange={handleChange} />
        <input type="text" name="city" placeholder="City" onChange={handleChange} required />
        <input type="text" name="state" placeholder="State" onChange={handleChange} required />
        <input type="text" name="pincode" placeholder="Pincode" onChange={handleChange} required />
        <input type="text" name="phone" placeholder="Phone Number" onChange={handleChange} required />
        <input type="email" name="email" placeholder="Email" onChange={handleChange} required />
        <input type="text" name="gstNumber" placeholder="GST Number" onChange={handleChange} required />
        <input type="text" name="panNumber" placeholder="PAN Number" onChange={handleChange} />
        <input type="file" name="logo" onChange={handleFileChange} required />
        <textarea name="description" placeholder="Description" onChange={handleChange}></textarea>
        <button type="submit">Save Hotel</button>
      </form>
    </div>
  );
}

export default AddHotel;