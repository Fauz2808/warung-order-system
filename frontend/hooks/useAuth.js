'use client';
// hooks/useAuth.js
// Hook untuk cek status login — dipakai di semua halaman yang butuh auth

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('kasir_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    // Verifikasi token ke backend
    getMe(token)
      .then((res) => {
        setUser(res.data);
        setLoading(false);
      })
      .catch(() => {
        // Token tidak valid / kadaluarsa
        localStorage.removeItem('kasir_token');
        router.replace('/login');
      });
  }, [router]);

  const logout = () => {
    localStorage.removeItem('kasir_token');
    router.replace('/login');
  };

  return { user, loading, logout };
}

// Helper — ambil token dari localStorage
export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('kasir_token');
}
