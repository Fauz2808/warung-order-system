'use client';
// app/admin/laporan/page.js

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import { getSummary, getChart, getTopMenu, getHourly, exportReport } from '@/lib/api';

// Format YYYY-MM-DD untuk input date
const toDateInput = (date) => date.toISOString().split('T')[0];
const today = new Date();

const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const formatRupiahShort = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
};

const ORANGE = '#f97316';
const ORANGE_LIGHT = '#fed7aa';
const CATEGORY_COLORS = { makanan: '#f97316', minuman: '#3b82f6' };

export default function LaporanPage() {
  const [chartRange, setChartRange] = useState(7);
  const [exportStart, setExportStart] = useState(toDateInput(today));
  const [exportEnd,   setExportEnd]   = useState(toDateInput(today));
  const [exporting,   setExporting]   = useState(false);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['summary'],
    queryFn: getSummary,
    refetchInterval: 60000,
  });

  const { data: chartData = [], isLoading: loadingChart } = useQuery({
    queryKey: ['chart', chartRange],
    queryFn: () => getChart(chartRange),
  });

  const { data: topMenu = [], isLoading: loadingTop } = useQuery({
    queryKey: ['top-menu'],
    queryFn: getTopMenu,
    refetchInterval: 60000,
  });

  const { data: hourly = [], isLoading: loadingHourly } = useQuery({
    queryKey: ['hourly'],
    queryFn: getHourly,
    refetchInterval: 60000,
  });

  // Preset tanggal untuk export
  const setPreset = (days) => {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setExportStart(toDateInput(start));
    setExportEnd(toDateInput(end));
  };

  // Handle export CSV
  const handleExport = async () => {
    if (exportStart > exportEnd) {
      toast.error('Tanggal mulai tidak boleh lebih dari tanggal akhir');
      return;
    }
    setExporting(true);
    try {
      await exportReport(exportStart, exportEnd);
      toast.success('Laporan berhasil didownload!');
    } catch {
      toast.error('Gagal mengekspor laporan');
    } finally {
      setExporting(false);
    }
  };

  // Hitung peak hour
  const peakHour = hourly.length
    ? hourly.reduce((max, h) => (h.orders > max.orders ? h : max), hourly[0])
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">📊 Laporan Penjualan</h1>
        <p className="text-sm text-gray-500 mt-1">
          Data hari ini · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Export Card */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h2 className="font-bold text-gray-800 mb-1">📥 Export Laporan</h2>
            <p className="text-xs text-gray-400">Download data order ke file CSV (bisa dibuka di Excel)</p>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'Hari ini',    days: 1 },
              { label: '7 hari',      days: 7 },
              { label: '30 hari',     days: 30 },
            ].map((p) => (
              <button key={p.days} onClick={() => setPreset(p.days)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 shrink-0">Dari</label>
              <input
                type="date"
                value={exportStart}
                max={exportEnd}
                onChange={(e) => setExportStart(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 shrink-0">s/d</label>
              <input
                type="date"
                value={exportEnd}
                min={exportStart}
                max={toDateInput(today)}
                onChange={(e) => setExportEnd(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-semibold text-sm transition disabled:opacity-50"
            >
              {exporting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mengekspor...</>
              ) : (
                <>⬇️ Download CSV</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon="💰" label="Pendapatan Hari Ini"
          value={loadingSummary ? '...' : formatRupiah(summary?.revenue || 0)}
          sub={`${summary?.doneOrders || 0} order selesai`}
          color="green"
        />
        <KpiCard
          icon="🧾" label="Total Order"
          value={loadingSummary ? '...' : summary?.totalOrders || 0}
          sub={`${summary?.pendingOrders || 0} masih aktif`}
          color="orange"
        />
        <KpiCard
          icon="🍽️" label="Item Terjual"
          value={loadingSummary ? '...' : summary?.totalItems || 0}
          sub="pcs hari ini"
          color="blue"
        />
        <KpiCard
          icon="⏰" label="Jam Tersibuk"
          value={loadingHourly || !peakHour ? '...' : peakHour.hour}
          sub={peakHour ? `${peakHour.orders} order` : '-'}
          color="purple"
        />
      </div>

      {/* Grafik Pendapatan Harian */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-800">Pendapatan Harian</h2>
            <p className="text-xs text-gray-400 mt-0.5">Total omzet per hari (order selesai)</p>
          </div>
          <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
            {[7, 30].map((r) => (
              <button key={r} onClick={() => setChartRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  chartRange === r ? 'bg-white shadow text-orange-500' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {r} hari
              </button>
            ))}
          </div>
        </div>

        {loadingChart ? (
          <div className="h-52 flex items-center justify-center text-gray-400">Memuat grafik...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(v) => [formatRupiah(v), 'Pendapatan']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill={ORANGE} radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === chartData.length - 1 ? ORANGE : ORANGE_LIGHT} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Menu Terlaris */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-1">🏆 Menu Terlaris Hari Ini</h2>
          <p className="text-xs text-gray-400 mb-4">Top 5 berdasarkan jumlah terjual</p>

          {loadingTop ? (
            <div className="text-center py-8 text-gray-400">Memuat data...</div>
          ) : topMenu.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">Belum ada order selesai hari ini</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topMenu.map((item, i) => {
                const maxQty = topMenu[0].quantity;
                const pct = Math.round((item.quantity / maxQty) * 100);
                return (
                  <div key={item.menuId} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-yellow-400 text-yellow-900' :
                      i === 1 ? 'bg-gray-300 text-gray-700' :
                      i === 2 ? 'bg-orange-300 text-orange-800' :
                      'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 truncate">{item.name}</span>
                        <span className="text-sm font-bold text-gray-800 ml-2 shrink-0">{item.quantity} pcs</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: CATEGORY_COLORS[item.category] || ORANGE,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Distribusi Order per Jam */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-1">🕐 Distribusi Order per Jam</h2>
          <p className="text-xs text-gray-400 mb-4">Jumlah order masuk per jam hari ini</p>

          {loadingHourly ? (
            <div className="text-center py-8 text-gray-400">Memuat data...</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={24} />
                <Tooltip
                  formatter={(v) => [v, 'Order']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                />
                <Bar dataKey="orders" fill={ORANGE_LIGHT} radius={[4, 4, 0, 0]}>
                  {hourly.map((entry, i) => (
                    <Cell key={i} fill={entry === peakHour ? ORANGE : ORANGE_LIGHT} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {peakHour && peakHour.orders > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-orange-50 rounded-xl px-3 py-2">
              <span>🔥</span>
              <span>Jam tersibuk: <strong className="text-orange-600">{peakHour.hour}</strong> dengan <strong>{peakHour.orders}</strong> order</span>
            </div>
          )}
        </div>
      </div>

      {/* Grafik jumlah order harian */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-1">📈 Jumlah Order Harian</h2>
        <p className="text-xs text-gray-400 mb-5">Tren order dalam {chartRange} hari terakhir</p>

        {loadingChart ? (
          <div className="h-40 flex items-center justify-center text-gray-400">Memuat...</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={24} />
              <Tooltip
                formatter={(v) => [v, 'Order']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="orders" stroke={ORANGE} strokeWidth={2.5}
                dot={{ fill: ORANGE, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }) {
  const colors = {
    green:  'bg-green-50  border-green-100',
    orange: 'bg-orange-50 border-orange-100',
    blue:   'bg-blue-50   border-blue-100',
    purple: 'bg-purple-50 border-purple-100',
  };
  const textColors = {
    green:  'text-green-600',
    orange: 'text-orange-500',
    blue:   'text-blue-500',
    purple: 'text-purple-500',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-black ${textColors[color]}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
