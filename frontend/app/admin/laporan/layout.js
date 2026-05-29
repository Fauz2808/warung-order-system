'use client';
import OwnerGuard from '@/components/OwnerGuard';
export default function Layout({ children }) {
  return <OwnerGuard>{children}</OwnerGuard>;
}
