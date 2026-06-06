// lib/api.js
// Semua request ke backend lewat sini

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ─── Menu ────────────────────────────────────────────
export const getMenu = () => api.get('/menu').then((r) => r.data.data);
export const getMenuByCategory = (category) =>
  api.get(`/menu?category=${category}`).then((r) => r.data.data);
export const createMenu = (data) => api.post('/menu', data).then((r) => r.data);
export const updateMenu = (id, data) => api.put(`/menu/${id}`, data).then((r) => r.data);
export const deleteMenu = (id) => api.delete(`/menu/${id}`).then((r) => r.data);
export const adjustStock = (id, payload) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.patch(`/menu/${id}/stock`, payload, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const uploadMenuImage = (id, file) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  const formData = new FormData();
  formData.append('image', file);
  return api.post(`/menu/${id}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${token}`,
    },
  }).then((r) => r.data);
};
export const deleteMenuImage = (id) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.delete(`/menu/${id}/image`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

// ─── Tables ──────────────────────────────────────────
export const getTable = (id) => api.get(`/tables/${id}`).then((r) => r.data.data);
export const getTables = () => api.get('/tables').then((r) => r.data.data);
export const createTable = (data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.post('/tables', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const deleteTable = (id) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.delete(`/tables/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

// ─── Orders ──────────────────────────────────────────
export const getOrderById = (id) => api.get(`/orders/${id}`).then((r) => r.data.data);
// ─── Auth ─────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data).then((r) => r.data);
export const getMe = (token) =>
  api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const createOrder = (data) => api.post('/orders', data).then((r) => r.data);
export const getOrders = (params) => api.get('/orders', { params }).then((r) => r.data.data);
export const getPendingYesterday = () => api.get('/orders/pending-yesterday').then((r) => r.data);
export const updateOrderStatus = (id, status) =>
  api.put(`/orders/${id}/status`, { status }).then((r) => r.data);
export const bulkUpdateStatus = (ids, status) =>
  api.put('/orders/bulk-status', { ids, status }).then((r) => r.data);
export const markOrderPaid = (id, notes, paymentMethod = 'cash', cashAmount, qrisAmount) =>
  api.patch(`/orders/${id}/mark-paid`, { notes, paymentMethod, cashAmount, qrisAmount }).then((r) => r.data);
export const editOrderItems = (id, items) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.put(`/orders/${id}/items`, { items }, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

// ─── Reports ──────────────────────────────────────────
const authHeader = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
export const getSummary  = () => api.get('/reports/summary',  { headers: authHeader() }).then((r) => r.data.data);
export const getChart    = (range) => api.get(`/reports/chart?range=${range}`, { headers: authHeader() }).then((r) => r.data.data);
export const getTopMenu  = () => api.get('/reports/top-menu', { headers: authHeader() }).then((r) => r.data.data);
export const getHourly   = () => api.get('/reports/hourly',   { headers: authHeader() }).then((r) => r.data.data);

// Export laporan sebagai CSV — trigger browser download
export const exportReport = async (start, end) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  const params = new URLSearchParams({ start, end });
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/reports/export?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Gagal mengekspor data');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `laporan_carra_${start}_sd_${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Categories ───────────────────────────────────────
export const getCategories  = () => api.get('/categories').then((r) => r.data.data);
export const createCategory = (data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.post('/categories', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const updateCategory = (id, data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.put(`/categories/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const deleteCategory = (id) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.delete(`/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

// ─── Settings ─────────────────────────────────────────
export const getSettings    = () => api.get('/settings').then((r) => r.data.data);
export const updateSettings = (data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.put('/settings', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

// ─── Users (owner only) ───────────────────────────────
export const getUsers = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.get('/users', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data);
};
export const createUser = (data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.post('/users', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const updateUser = (id, data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.put(`/users/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const deleteUser = (id) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.delete(`/users/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};
export const changePassword = (data) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return api.put('/auth/change-password', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);
};

export default api;
