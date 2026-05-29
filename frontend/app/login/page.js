'use client';
// app/login/page.js

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Kalau sudah login, redirect ke kasir
  useEffect(() => {
    const token = localStorage.getItem('kasir_token');
    if (token) router.replace('/kasir');
  }, [router]);

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (res) => {
      localStorage.setItem('kasir_token', res.data.token);
      localStorage.setItem('kasir_role', res.data.role);
      localStorage.setItem('kasir_name', res.data.name || res.data.username);
      const greeting = res.data.role === 'owner' ? '👑' : '👋';
      toast.success(`Selamat datang, ${res.data.name || res.data.username}! ${greeting}`);
      router.replace('/kasir');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Login gagal. Coba lagi.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error('Username dan password wajib diisi');
      return;
    }
    loginMutation.mutate(form);
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F7F5' }}>

      {/* ── Left panel (hidden mobile, shown lg) ─────── */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-12 shrink-0"
        style={{ background: '#1C1C1A' }}
      >
        {/* Top: Logo */}
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: '#658051' }}
            >
              ☕
            </div>
            <div>
              <p className="text-white font-bold text-base tracking-wide">Carra Coffee</p>
              <p className="text-xs" style={{ color: '#6B7560' }}>Staff Dashboard</p>
            </div>
          </div>

          {/* Decorative dots pattern */}
          <div className="mb-10 grid grid-cols-8 gap-2 w-40 opacity-20">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full" style={{ background: '#658051' }} />
            ))}
          </div>

          {/* Tagline */}
          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
            Kelola warung<br />
            <span style={{ color: '#658051' }}>lebih efisien.</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#6B7560' }}>
            Terima pesanan, pantau dapur, dan lihat laporan — semua dalam satu dashboard.
          </p>
        </div>

        {/* Bottom: Quote */}
        <div style={{ borderLeft: '2px solid #658051', paddingLeft: '16px' }}>
          <p className="text-sm italic" style={{ color: '#6B7560' }}>
            &ldquo;Good coffee is a pleasure. Good service is a skill.&rdquo;
          </p>
        </div>
      </div>

      {/* ── Right panel / form ───────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo (shown only on small screens) */}
          <div className="lg:hidden text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
              style={{ background: '#EDF1EA' }}
            >
              ☕
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#1C1C1A' }}>Carra Coffee</h1>
            <p className="text-sm mt-1" style={{ color: '#9CA38F' }}>Staff Dashboard</p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold" style={{ color: '#1C1C1A' }}>Selamat datang</h1>
            <p className="text-sm mt-1" style={{ color: '#9CA38F' }}>Masuk ke akun staff Anda</p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-7 shadow-sm"
            style={{ background: '#FFFFFF', border: '1px solid #E8ECE4' }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: '#1C1C1A' }}
                >
                  Username
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="contoh: kasir"
                  className="w-full rounded-xl px-4 py-3 text-sm transition outline-none"
                  style={{
                    border: '1px solid #E8ECE4',
                    color: '#1C1C1A',
                    background: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#658051';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(101,128,81,0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E8ECE4';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: '#1C1C1A' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-xl px-4 py-3 text-sm transition outline-none pr-11"
                    style={{
                      border: '1px solid #E8ECE4',
                      color: '#1C1C1A',
                      background: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#658051';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(101,128,81,0.12)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#E8ECE4';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-lg transition"
                    style={{ color: '#9CA38F' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#6B7560'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9CA38F'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all mt-1 disabled:opacity-50"
                style={{ background: '#658051' }}
                onMouseEnter={(e) => {
                  if (!loginMutation.isPending) e.currentTarget.style.background = '#4d6340';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#658051';
                }}
              >
                {loginMutation.isPending ? 'Sedang login...' : 'Masuk →'}
              </button>
            </form>

            {/* Hint akun owner */}
            <div
              className="mt-5 p-3 rounded-xl text-center"
              style={{ background: '#FFF8EC', border: '1px solid #F59E0B' }}
            >
              <p className="text-xs font-semibold" style={{ color: '#92660A' }}>👑 Akun Owner:</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: '#6B7560' }}>
                username: <strong style={{ color: '#1C1C1A' }}>owner</strong>
                {' · '}
                password: <strong style={{ color: '#1C1C1A' }}>owner123</strong>
              </p>
              <p className="text-xs mt-1" style={{ color: '#9CA38F' }}>Buat akun kasir di Pengaturan setelah login</p>
            </div>
          </div>

          {/* Footer link */}
          <p className="text-center text-xs mt-6" style={{ color: '#9CA38F' }}>
            Halaman customer tidak butuh login —{' '}
            <a
              href="/"
              className="transition"
              style={{ color: '#658051' }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              kembali ke home
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
