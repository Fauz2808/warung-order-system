'use client';
// components/StaffLayout.js
// Layout bersama untuk halaman staff (kasir, dapur, admin)
// Berisi sidebar navigasi yang sama di semua halaman staff

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/kasir',         label: 'Kasir',       icon: '🖥️',  desc: 'Terima & update pesanan' },
  { href: '/dapur',         label: 'Dapur',        icon: '👨‍🍳', desc: 'Antrian masak' },
  { href: '/admin/menu',    label: 'Kelola Menu',  icon: '🍽️',  desc: 'Tambah / edit menu' },
  { href: '/admin/meja',    label: 'Kelola Meja',  icon: '🪑',  desc: 'Manage meja & QR Code' },
  { href: '/admin/laporan', label: 'Laporan',      icon: '📊',  desc: 'Ringkasan penjualan' },
];

export default function StaffLayout({ children, title, subtitle }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r flex flex-col shadow-sm shrink-0 sticky top-0 h-screen">
        {/* Logo / Brand */}
        <div className="px-5 py-5 border-b bg-orange-500">
          <p className="text-xs text-orange-200 uppercase tracking-wider font-medium">Warung Order System</p>
          <p className="text-lg font-bold text-white mt-0.5">🍜 Staff Panel</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            // Cek apakah halaman aktif
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition group ${
                  active
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold leading-tight ${active ? 'text-white' : 'text-gray-700 group-hover:text-orange-600'}`}>
                    {item.label}
                  </p>
                  <p className={`text-xs mt-0.5 leading-tight truncate ${active ? 'text-orange-100' : 'text-gray-400'}`}>
                    {item.desc}
                  </p>
                </div>
                {active && <span className="text-white/70 text-xs">›</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer sidebar: user info + logout */}
        <div className="p-4 border-t space-y-3 bg-gray-50">
          {/* User info */}
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-500">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">{user?.username || 'Staff'}</p>
              <p className="text-xs text-gray-400">Sedang login</p>
            </div>
          </div>

          {/* Action links */}
          <div className="space-y-1">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 px-1 py-1 rounded transition"
            >
              <span>←</span>
              <span>Ke halaman utama</span>
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 px-1 py-1 rounded transition w-full text-left"
            >
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto min-h-screen">
        {children}
      </main>
    </div>
  );
}
