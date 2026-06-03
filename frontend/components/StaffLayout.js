'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  ClipboardText,
  ForkKnife,
  GridFour,
  ChartBar,
  Gear,
  SignOut,
  ArrowLeft,
  List,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';

const ALL_NAV = [
  { href: '/kasir',            label: 'Kasir',       Icon: ClipboardText, desc: 'Terima & update pesanan', roles: ['owner','kasir'] },
  { href: '/admin/menu',       label: 'Kelola Menu', Icon: ForkKnife,     desc: 'Tambah / edit menu',      roles: ['owner','kasir'] },
  { href: '/admin/meja',       label: 'Kelola Meja', Icon: GridFour,      desc: 'Manage meja & QR Code',   roles: ['owner','kasir'] },
  { href: '/admin/laporan',    label: 'Laporan',     Icon: ChartBar,      desc: 'Ringkasan penjualan',     roles: ['owner'] },
  { href: '/admin/pengaturan', label: 'Pengaturan',  Icon: Gear,          desc: 'Notifikasi & pengaturan', roles: ['owner','kasir'] },
];

export default function StaffLayout({ children }) {
  const pathname  = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen]           = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted]     = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { setMounted(true); }, []);

  // Auth-dependent values — kosong di server, terisi setelah client mount
  const displayName    = mounted ? (user?.name || user?.username || 'Staff') : '';
  const displayInitial = mounted ? (user?.username?.[0]?.toUpperCase() || '') : '';
  const displayRole    = mounted ? (user?.role === 'owner' ? 'Owner' : 'Kasir') : '';

  // Server render semua nav (user belum diketahui), client filter berdasarkan role
  const navItems = mounted
    ? ALL_NAV.filter((item) => !user?.role || item.roles.includes(user.role))
    : ALL_NAV;

  return (
    <div className="min-h-screen flex" style={{ background: '#F5EFE6' }}>

      {/* Backdrop mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          transition-all duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:sticky lg:top-0 lg:z-auto
          ${collapsed ? 'lg:w-16' : 'lg:w-56'}
          w-64
        `}
        style={{ background: '#FFFFFF', borderRight: '1px solid #E8ECE4' }}
      >
        {/* Brand header — light */}
        <div
          className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center lg:px-0 px-4 py-4' : 'px-4 py-4'}`}
          style={{ borderBottom: '1px solid #E8ECE4' }}
        >
          <span className="text-lg shrink-0 leading-none">☕</span>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold whitespace-nowrap" style={{ color: '#1B4332', letterSpacing: '0.02em' }}>
                Carra Coffee
              </p>
              <p className="text-xs whitespace-nowrap" style={{ color: '#9CA3AF' }}>
                Staff Panel
              </p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex ml-auto w-5 h-5 items-center justify-center rounded transition"
            style={{ color: '#D1D5DB' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#1B4332'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#D1D5DB'}
          >
            {collapsed
              ? <CaretRight size={12} weight="bold" />
              : <CaretLeft size={12} weight="bold" />
            }
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-lg transition-all duration-100
                  ${collapsed ? 'lg:justify-center lg:px-0 px-3 py-2.5' : 'px-3 py-2.5'}
                `}
                style={active
                  ? { background: '#F0FAF3', color: '#1B4332' }
                  : { color: '#6B7280' }
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = '#F5F5F5';
                    e.currentTarget.style.color = '#374151';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = '';
                    e.currentTarget.style.color = '#6B7280';
                  }
                }}
              >
                <item.Icon
                  size={17}
                  weight={active ? 'fill' : 'regular'}
                  style={{ color: active ? '#1B4332' : 'inherit', flexShrink: 0 }}
                />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate"
                      style={{ color: active ? '#1B4332' : '#374151' }}>
                      {item.label}
                    </p>
                    <p className="text-xs mt-0.5 leading-tight truncate"
                      style={{ color: '#9CA3AF' }}>
                      {item.desc}
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer — expanded */}
        {!collapsed && (
          <div className="px-3 py-3 border-t" style={{ borderColor: '#E8ECE4' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: '#D8F3DC', color: '#1B4332' }}>
                {displayInitial || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" style={{ color: '#374151' }}>
                  {displayName}
                </p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>
                  {displayRole}
                </p>
              </div>
            </div>
            <div className="space-y-0.5">
              <Link href="/"
                className="flex items-center gap-1.5 text-xs px-1 py-1 rounded transition"
                style={{ color: '#9CA3AF' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#6B7280'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
              >
                <ArrowLeft size={11} />
                <span>Ke halaman utama</span>
              </Link>
              <button onClick={logout}
                className="flex items-center gap-1.5 text-xs px-1 py-1 rounded transition w-full text-left"
                style={{ color: '#9CA3AF' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
              >
                <SignOut size={11} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer — collapsed */}
        {collapsed && (
          <div className="hidden lg:flex flex-col items-center px-2 py-3 border-t gap-2" style={{ borderColor: '#E8ECE4' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: '#D8F3DC', color: '#1B4332' }}>
              {displayInitial || '?'}
            </div>
            <button onClick={logout} title="Logout"
              className="flex items-center justify-center w-7 h-7 rounded transition"
              style={{ color: '#D1D5DB' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#D1D5DB'}
            >
              <SignOut size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar mobile */}
        <div className="lg:hidden sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
          style={{ background: '#FFFFFF', borderBottom: '1px solid #E8ECE4' }}>
          <button onClick={() => setOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition"
            style={{ background: '#F5F5F5', color: '#374151' }}>
            <List size={16} weight="regular" />
          </button>
          {(() => {
            const active = navItems.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'));
            return active ? (
              <div className="flex items-center gap-1.5">
                <active.Icon size={14} weight="fill" style={{ color: '#1B4332' }} />
                <span className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{active.label}</span>
              </div>
            ) : (
              <span className="font-medium text-sm" style={{ color: '#1A1A1A' }}>Carra Coffee</span>
            );
          })()}
          <div className="ml-auto">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: '#D8F3DC', color: '#1B4332' }}>
              {displayInitial || '?'}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
