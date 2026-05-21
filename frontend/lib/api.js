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
export const createTable = (data) => api.post('/tables', data).then((r) => r.data);
export const deleteTable = (id) => api.delete(`/tables/${id}`).then((r) => r.data);

// ─── Orders ──────────────────────────────────────────
// ─── Auth ─────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data).then((r) => r.data);
export const getMe = (token) =>
  api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const createOrder = (data) => api.post('/orders', data).then((r) => r.data);
export const getOrders = (params) => api.get('/orders', { params }).then((r) => r.data.data);
export const updateOrderStatus = (id, status) =>
  api.put(`/orders/${id}/status`, { status }).then((r) => r.data);

// ─── Reports ──────────────────────────────────────────
const authHeader = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
export const getSummary  = () => api.get('/reports/summary',  { headers: authHeader() }).then((r) => r.data.data);
export const getChart    = (range) => api.get(`/reports/chart?range=${range}`, { headers: authHeader() }).then((r) => r.data.data);
export const getTopMenu  = () => api.get('/reports/top-menu', { headers: authHeader() }).then((r) => r.data.data);
export const getHourly   = () => api.get('/reports/hourly',   { headers: authHeader() }).then((r) => r.data.data);

export default api;
