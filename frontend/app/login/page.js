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
      toast.success(`Selamat datang, ${res.data.username}! 👋`);
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🍜</div>
          <h1 className="text-2xl font-bold text-gray-800">Warung Order System</h1>
          <p className="text-gray-500 text-sm mt-1">Login untuk akses dashboard kasir</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl shadow-lg p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="contoh: kasir"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50 mt-2"
            >
              {loginMutation.isPending ? 'Sedang login...' : 'Login →'}
            </button>
          </form>

          {/* Hint akun default */}
          <div className="mt-5 p-3 bg-gray-50 rounded-xl text-center">
            <p className="text-xs text-gray-400">Akun default:</p>
            <p className="text-xs font-mono text-gray-600 mt-0.5">
              username: <strong>kasir</strong> · password: <strong>1234</strong>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Halaman customer tidak butuh login —{' '}
          <a href="/" className="text-orange-500 hover:underline">kembali ke home</a>
        </p>
      </div>
    </div>
  );
}
