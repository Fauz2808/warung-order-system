'use client';
// components/StaffLayout.js
// Layout bersama untuk halaman staff — responsive sidebar

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/kasir',           label: 'Kasir',       icon: '🖥️',  desc: 'Terima & update pesanan' },
  { href: '/dapur',           label: 'Dapur',        icon: '👨‍🍳', desc: 'Antrian masak' },
  { href: '/admin/menu',      label: 'Kelola Menu',  icon: '🍽️',  desc: 'Tambah / edit menu' },
  { href: '/admin/meja',      label: 'Kelola Meja',  icon: '🪑',  desc: 'Manage meja & QR Code' },
  { href: '/admin/laporan',   label: 'Laporan',      icon: '📊',  desc: 'Ringkasan penjualan' },
  { href: '/admin/pengaturan', label: 'Pengaturan',  icon: '⚙️',  desc: 'Jam buka & tutup' },
];

export default function StaffLayout({ children }) {
  const pathname  = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapsed

  // Tutup drawer saat navigasi berpindah halaman
  useEffect(() => { setOpen(false); }, [pathname]);

  // Tutup drawer saat klik backdrop
  const handleBackdropClick = () => setOpen(false);

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* ── Backdrop mobile ────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={handleBackdropClick}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────── */}
      <aside className={`
        fixed top-0 left-0 h-screen z-40 bg-white border-r shadow-lg flex flex-col
        transition-all duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto lg:shadow-sm
        ${collapsed ? 'lg:w-16' : 'lg:w-60'}
        w-64
      `}>
        {/* Brand */}
        <div className={`border-b bg-orange-500 flex items-center ${collapsed ? 'lg:justify-center lg:px-0 px-5 py-5' : 'px-5 py-5'} gap-3`}>
          <span className="text-2xl shrink-0">🍜</span>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-xs text-orange-200 uppercase tracking-wider font-medium whitespace-nowrap">Warung Order System</p>
              <p className="text-base font-bold text-white whitespace-nowrap">Staff Panel</p>
            </div>
          )}
          {/* Collapse toggle (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex ml-auto w-6 h-6 items-center justify-center text-orange-200 hover:text-white transition"
            title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl text-sm transition group
                  ${collapsed ? 'lg:justify-center lg:px-0 px-3 py-3' : 'px-3 py-3'}
                  ${active
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
              >
                <span className="text-xl leading-none shrink-0">{item.icon}</span>
                {!collapsed && (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className={`font-semibold leading-tight truncate ${active ? 'text-white' : 'text-gray-700 group-hover:text-orange-600'}`}>
                      {item.label}
                    </p>
                    <p className={`text-xs mt-0.5 leading-tight truncate ${active ? 'text-orange-100' : 'text-gray-400'}`}>
                      {item.desc}
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-3 border-t bg-gray-50 space-y-2">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-500 shrink-0">
                {user?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{user?.username || 'Staff'}</p>
                <p className="text-xs text-gray-400">Sedang login</p>
              </div>
            </div>
            <div className="space-y-0.5">
              <Link href="/" className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 px-1 py-1 rounded transition">
                <span>←</span><span>Ke halaman utama</span>
              </Link>
              <button onClick={logout} className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 px-1 py-1 rounded transition w-full text-left">
                <span>🚪</span><span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer collapsed */}
        {collapsed && (
          <div className="hidden lg:flex flex-col items-center p-2 border-t gap-1">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-500">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <button onClick={logout} title="Logout" className="text-gray-400 hover:text-red-500 text-sm transition">🚪</button>
          </div>
        )}
      </aside>

      {/* ── Main area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile — hamburger + page title */}
        <div className="lg:hidden sticky top-0 z-20 bg-white border-b px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => setOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition text-gray-600"
          >
            <span className="text-lg">☰</span>
          </button>
          {/* Nama halaman aktif */}
          {(() => {
            const active = navItems.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'));
            return active ? (
              <div className="flex items-center gap-2">
                <span>{active.icon}</span>
                <span className="font-semibold text-gray-800 text-sm">{active.label}</span>
              </div>
            ) : <span className="font-semibold text-gray-800 text-sm">🍜 Staff Panel</span>;
          })()}
          <div className="ml-auto">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-500">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
