'use client';
// components/StaffLayout.js
// Layout bersama untuk halaman staff — responsive sidebar

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const ALL_NAV = [
  { href: '/kasir',            label: 'Kasir',        icon: '🖥️',  desc: 'Terima & update pesanan', roles: ['owner','kasir'] },
  { href: '/admin/menu',       label: 'Kelola Menu',  icon: '🍽️',  desc: 'Tambah / edit menu',      roles: ['owner','kasir'] },
  { href: '/admin/meja',       label: 'Kelola Meja',  icon: '🪑',  desc: 'Manage meja & QR Code',   roles: ['owner','kasir'] },
  { href: '/admin/laporan',    label: 'Laporan',      icon: '📊',  desc: 'Ringkasan penjualan',      roles: ['owner'] },
  { href: '/admin/pengaturan', label: 'Pengaturan',   icon: '⚙️',  desc: 'Jam buka & tutup',        roles: ['owner'] },
];

export default function StaffLayout({ children }) {
  const pathname  = usePathname();
  const { user, logout } = useAuth();

  // Filter nav berdasarkan role — kasir hanya lihat item yang diizinkan
  const navItems = ALL_NAV.filter((item) => !user?.role || item.roles.includes(user.role));
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapsed

  // Tutup drawer saat navigasi berpindah halaman
  useEffect(() => { setOpen(false); }, [pathname]);

  // Tutup drawer saat klik backdrop
  const handleBackdropClick = () => setOpen(false);

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F7F5' }}>

      {/* ── Backdrop mobile ────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={handleBackdropClick}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          transition-all duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:sticky lg:top-0 lg:z-auto lg:shadow-sm
          ${collapsed ? 'lg:w-16' : 'lg:w-60'}
          w-64
        `}
        style={{ background: '#FFFFFF', borderRight: '1px solid #E8ECE4' }}
      >
        {/* Brand */}
        <div
          className={`flex items-center ${collapsed ? 'lg:justify-center lg:px-0 px-5 py-5' : 'px-5 py-5'} gap-3`}
          style={{ background: '#658051', borderBottom: '1px solid #4d6340' }}
        >
          <span className="text-2xl shrink-0">☕</span>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white whitespace-nowrap tracking-wide" style={{ letterSpacing: '0.06em' }}>
                Carra Coffee
              </p>
              <p className="text-xs whitespace-nowrap" style={{ color: '#c5d4bc' }}>
                Staff Panel
              </p>
            </div>
          )}
          {/* Collapse toggle (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex ml-auto w-6 h-6 items-center justify-center transition text-sm font-bold"
            style={{ color: '#EDF1EA' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#EDF1EA'}
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
                className={`flex items-center gap-3 rounded-xl text-sm transition-all duration-150 group
                  ${collapsed ? 'lg:justify-center lg:px-0 px-3 py-3' : 'px-3 py-3'}
                `}
                style={
                  active
                    ? { background: '#658051', color: '#ffffff' }
                    : {}
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = '#EDF1EA';
                    e.currentTarget.style.color = '#658051';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = '';
                    e.currentTarget.style.color = '';
                  }
                }}
              >
                <span className="text-xl leading-none shrink-0">{item.icon}</span>
                {!collapsed && (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p
                      className="font-semibold leading-tight truncate text-sm"
                      style={{ color: active ? '#ffffff' : '#1C1C1A' }}
                    >
                      {item.label}
                    </p>
                    <p
                      className="text-xs mt-0.5 leading-tight truncate"
                      style={{ color: active ? '#c5d4bc' : '#9CA38F' }}
                    >
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
          <div className="p-3 border-t space-y-2" style={{ background: '#F7F7F5', borderColor: '#E8ECE4' }}>
            <div className="flex items-center gap-2.5 px-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: '#EDF1EA', color: '#658051' }}
              >
                {user?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#1C1C1A' }}>
                  {user?.name || user?.username || 'Staff'}
                </p>
                <p className="text-xs" style={{ color: user?.role === 'owner' ? '#92660A' : '#9CA38F' }}>
                  {user?.role === 'owner' ? '👑 Owner' : '🧑‍💼 Kasir'}
                </p>
              </div>
            </div>
            <div className="space-y-0.5">
              <Link
                href="/"
                className="flex items-center gap-2 text-xs px-1 py-1 rounded transition"
                style={{ color: '#9CA38F' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
              >
                <span>←</span><span>Ke halaman utama</span>
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-2 text-xs px-1 py-1 rounded transition w-full text-left"
                style={{ color: '#9CA38F' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
              >
                <span>🚪</span><span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer collapsed */}
        {collapsed && (
          <div className="hidden lg:flex flex-col items-center p-2 border-t gap-1" style={{ borderColor: '#E8ECE4' }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: '#EDF1EA', color: '#658051' }}
            >
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="text-sm transition"
              style={{ color: '#9CA38F' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
            >
              🚪
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile — hamburger + page title */}
        <div
          className="lg:hidden sticky top-0 z-20 px-4 py-3 flex items-center gap-3 shadow-sm"
          style={{ background: '#FFFFFF', borderBottom: '1px solid #E8ECE4' }}
        >
          <button
            onClick={() => setOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition text-sm"
            style={{ background: '#EDF1EA', color: '#658051' }}
          >
            <span className="text-lg">☰</span>
          </button>
          {/* Nama halaman aktif */}
          {(() => {
            const active = navItems.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'));
            return active ? (
              <div className="flex items-center gap-2">
                <span>{active.icon}</span>
                <span className="font-semibold text-sm" style={{ color: '#1C1C1A' }}>{active.label}</span>
              </div>
            ) : (
              <span className="font-semibold text-sm" style={{ color: '#1C1C1A' }}>☕ Carra Coffee</span>
            );
          })()}
          <div className="ml-auto">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: '#EDF1EA', color: '#658051' }}
            >
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
