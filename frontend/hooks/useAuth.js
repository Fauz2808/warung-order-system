'use client';
// hooks/useAuth.js

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

    getMe(token)
      .then((res) => {
        setUser(res.data);
        setLoading(false);
      })
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
