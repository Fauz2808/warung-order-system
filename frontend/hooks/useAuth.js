'use client';
// hooks/useAuth.js

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/lib/api';

// Decode JWT payload synchronously — tidak butuh API call
function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function useAuth() {
  const router = useRouter();

  // Inisialisasi user langsung dari JWT — tidak ada loading flash
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('kasir_token');
    if (!token) return null;
    const payload = decodeToken(token);
    if (!payload) return null;
    return { id: payload.id, username: payload.username, role: payload.role, name: payload.name };
  });
  const loading = false;

  useEffect(() => {
    const token = localStorage.getItem('kasir_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    // Validasi token ke server di background (tidak blokir UI)
    getMe(token)
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('kasir_token');
        localStorage.removeItem('kasir_role');
        localStorage.removeItem('kasir_name');
        router.replace('/login');
      });
  }, [router]);

  const logout = () => {
    localStorage.removeItem('kasir_token');
    localStorage.removeItem('kasir_role');
    localStorage.removeItem('kasir_name');
    router.replace('/login');
  };

  const isOwner = user?.role === 'owner';

  return { user, loading, logout, isOwner };
}

// useOwnerGuard — redirect kasir yang coba akses halaman owner
export function useOwnerGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'owner') {
      router.replace('/kasir');
    }
  }, [user, loading, router]);

  return { user, loading, isOwner: user?.role === 'owner' };
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('kasir_token');
}
