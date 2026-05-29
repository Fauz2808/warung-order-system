'use client';
// components/OwnerGuard.js
// Wrapper untuk halaman owner-only — redirect kasir ke /kasir

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function OwnerGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'owner') {
      router.replace('/kasir');
    }
  }, [user, loading, router]);

  // Selagi loading atau belum tahu role, tampilkan blank
  if (loading || !user) return null;

  // Kasir — sudah redirect, tampilkan blank sementara
  if (user.role !== 'owner') return null;

  return children;
}
