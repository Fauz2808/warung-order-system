'use client';
// app/admin/layout.js — layout admin menggunakan StaffLayout bersama

import StaffLayout from '@/components/StaffLayout';

export default function AdminLayout({ children }) {
  return <StaffLayout>{children}</StaffLayout>;
}
