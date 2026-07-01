'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CurrencyCircleDollar, Receipt, ForkKnife, Clock, DownloadSimple } from '@phosphor-icons/react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import { getSummary, getChart, getTopMenu, getHourly, exportReport, getOrders } from '@/lib/api';
import DateRangePicker, { presetValue, fmtRangeLabel } from '@/components/DateRangePicker';

// Format YYYY-MM-DD (waktu lokal) untuk input date
const toDateInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
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
  // Filter tanggal global — mengontrol seluruh halaman (default: bulan ini)
  const [range, setRange] = useState(() => presetValue('thisMonth'));
  const { startStr, endStr } = range;

  const [exportStart, setExportStart] = useState(toDateInput(today));
  const [exportEnd,   setExportEnd]   = useState(toDateInput(today));
  const [exporting,   setExporting]   = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['summary', startStr, endStr],
    queryFn: () => getSummary(startStr, endStr),
    refetchInterval: 60000,
  });

  const { data: chartData = [], isLoading: loadingChart } = useQuery({
    queryKey: ['chart', startStr, endStr],
    queryFn: () => getChart(startStr, endStr),
  });

  const { data: topMenu = [], isLoading: loadingTop } = useQuery({
    queryKey: ['top-menu', startStr, endStr],
    queryFn: () => getTopMenu(startStr, endStr),
    refetchInterval: 60000,
  });

  const { data: hourly = [], isLoading: loadingHourly } = useQuery({
    queryKey: ['hourly', startStr, endStr],
    queryFn: () => getHourly(startStr, endStr),
    refetchInterval: 60000,
  });

  const { data: rangeOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders-history', startStr, endStr],
    queryFn: () => getOrders({ start: startStr, end: endStr }),
    refetchInterval: 60000,
  });

  const cancelledOrders = useMemo(() => rangeOrders.filter((o) => o.status === 'cancelled'), [rangeOrders]);
  const doneOrders      = useMemo(() => rangeOrders.filter((o) => o.status === 'done'), [rangeOrders]);

  // Preset tanggal untuk export
  const setPreset = ({ days, monthToDate }) => {
    const end = new Date();
    const start = new Date();
    if (monthToDate) {
      start.setDate(1); // mulai tanggal 1 bulan berjalan
    } else {
      start.setDate(start.getDate() - (days - 1));
    }
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" style={{ background: '#F5EFE6', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Laporan Penjualan</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9CA3AF' }}>
            {range.label} · {fmtRangeLabel(startStr, endStr)}
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Export Card */}
      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8ECE4', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h2 className="font-medium text-sm mb-0.5" style={{ color: '#1A1A1A' }}>Export Laporan</h2>
            <p className="text-xs" style={{ color: '#9CA3AF' }}>Download data order ke file CSV</p>
          </div>

          {/* Preset segmented control */}
          <div className="flex items-center p-0.5 rounded-full" style={{ background: '#EBEBEB' }}>
            {[
              { label: 'Hari ini',  days: 1 },
              { label: '7 hari',    days: 7 },
              { label: 'Bulan ini', monthToDate: true },
            ].map((p) => (
              <button key={p.label} onClick={() => setPreset(p)}
                className="px-3 py-1.5 rounded-full text-xs transition whitespace-nowrap"
                style={{ color: '#6B7280', fontWeight: 400 }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>Dari</label>
              <input
                type="date"
                value={exportStart}
                max={exportEnd}
                onChange={(e) => setExportStart(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-sm outline-none transition"
                style={{ borderColor: '#E8ECE4', color: '#1A1A1A', background: '#FAFAFA' }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>s/d</label>
              <input
                type="date"
                value={exportEnd}
                min={exportStart}
                max={toDateInput(today)}
                onChange={(e) => setExportEnd(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-sm outline-none transition"
                style={{ borderColor: '#E8ECE4', color: '#1A1A1A', background: '#FAFAFA' }}
              />
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm transition disabled:opacity-50"
              style={{ background: '#E76F00', fontWeight: 500 }}
            >
              {exporting ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mengekspor...</>
              ) : (
                <><DownloadSimple size={14} weight="bold" /> Download CSV</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          Icon={CurrencyCircleDollar} label="Pendapatan"
          value={loadingSummary ? '...' : formatRupiah(summary?.revenue || 0)}
          sub={`${summary?.doneOrders || 0} order selesai`}
          color="green"
        />
        <KpiCard
          Icon={Receipt} label="Total Order"
          value={loadingSummary ? '...' : summary?.totalOrders || 0}
          sub={`${summary?.pendingOrders || 0} masih aktif`}
          color="orange"
        />
        <KpiCard
          Icon={ForkKnife} label="Item Terjual"
          value={loadingSummary ? '...' : summary?.totalItems || 0}
          sub="pcs terjual"
          color="blue"
        />
        <KpiCard
          Icon={Clock} label="Jam Tersibuk"
          value={loadingHourly || !peakHour ? '...' : peakHour.hour}
          sub={peakHour ? `${peakHour.orders} order` : '-'}
          color="purple"
        />
      </div>

      {/* Breakdown Tipe Transaksi */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="mb-4">
          <h2 className="font-bold text-gray-800">💳 Tipe Transaksi</h2>
          <p className="text-xs text-gray-400 mt-0.5">Breakdown pendapatan berdasarkan metode pembayaran · {range.label}</p>
        </div>

        {loadingSummary ? (
          <div className="text-center py-6 text-gray-400">Memuat data...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Cash */}
              <div className="rounded-2xl border p-4 bg-emerald-50 border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💵</span>
                  <span className="text-xs text-gray-500 font-medium">Cash</span>
                </div>
                <p className="text-xl font-black text-emerald-600">
                  {formatRupiah(summary?.cashRevenue || 0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{summary?.cashOrders || 0} transaksi</p>
              </div>
              {/* QRIS */}
              <div className="rounded-2xl border p-4 bg-violet-50 border-violet-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📱</span>
                  <span className="text-xs text-gray-500 font-medium">QRIS</span>
                </div>
                <p className="text-xl font-black text-violet-600">
                  {formatRupiah(summary?.qrisRevenue || 0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{summary?.qrisOrders || 0} transaksi</p>
              </div>
              {/* Split */}
              {(summary?.splitOrders || 0) > 0 && (
                <div className="rounded-2xl border p-4 bg-orange-50 border-orange-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">✂️</span>
                    <span className="text-xs text-gray-500 font-medium">Split</span>
                  </div>
                  <p className="text-xl font-black text-orange-600">
                    {formatRupiah(summary?.splitRevenue || 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{summary?.splitOrders || 0} transaksi</p>
                </div>
              )}
            </div>

            <PaymentBreakdownBar
              doneOrders={summary?.doneOrders || 0}
              cashRevenue={summary?.cashRevenue || 0}
              qrisRevenue={summary?.qrisRevenue || 0}
              splitRevenue={summary?.splitRevenue || 0}
            />
          </div>
        )}
      </div>

      {/* Grafik Pendapatan Harian */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-800">Pendapatan Harian</h2>
            <p className="text-xs text-gray-400 mt-0.5">Total omzet per hari (order selesai) · {range.label}</p>
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
          <h2 className="font-bold text-gray-800 mb-1">🏆 Menu Terlaris</h2>
          <p className="text-xs text-gray-400 mb-4">Top 5 berdasarkan jumlah terjual · {range.label}</p>

          {loadingTop ? (
            <div className="text-center py-8 text-gray-400">Memuat data...</div>
          ) : topMenu.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">Belum ada order selesai pada periode ini</p>
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
          <p className="text-xs text-gray-400 mb-4">Jumlah order masuk per jam · {range.label}</p>

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
        <p className="text-xs text-gray-400 mb-5">Tren order · {range.label}</p>

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
      {/* Riwayat Order Hari Ini */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800">📋 Riwayat Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">Semua order termasuk yang dibatalkan · {range.label}</p>
          </div>
          <button
            onClick={() => setShowOrderHistory(true)}
            className="text-xs font-semibold text-orange-500 hover:text-orange-600 border border-orange-200 hover:border-orange-300 px-3 py-1.5 rounded-xl transition"
          >
            Lihat Semua →
          </button>
        </div>

        {/* Stats mini */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-gray-50 border p-3 text-center">
            <p className="text-xl font-black text-gray-700">{rangeOrders.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Order</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
            <p className="text-xl font-black text-green-600">{doneOrders.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Selesai</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
            <p className="text-xl font-black text-red-500">{cancelledOrders.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Dibatalkan</p>
          </div>
        </div>

        {/* Preview tabel 5 order terbaru */}
        {loadingOrders ? (
          <div className="text-center py-6 text-gray-400 text-sm">Memuat data...</div>
        ) : rangeOrders.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">Belum ada order pada periode ini</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-400 font-medium pb-2">Order</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2">Meja</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2">Waktu</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">Total</th>
                  <th className="text-center text-xs text-gray-400 font-medium pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rangeOrders.slice(0, 5).map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
            {rangeOrders.length > 5 && (
              <button onClick={() => setShowOrderHistory(true)}
                className="w-full mt-3 text-xs text-gray-400 hover:text-orange-500 transition py-2">
                +{rangeOrders.length - 5} order lainnya — Lihat semua
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal Order History */}
      {showOrderHistory && (
        <OrderHistoryModal
          orders={rangeOrders}
          rangeLabel={range.label}
          onClose={() => setShowOrderHistory(false)}
        />
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────
function KpiCard({ Icon, label, value, sub, color }) {
  const palettes = {
    green:  { bg: '#F0FFF4', border: '#BBF7D0', text: '#16A34A', iconColor: '#22C55E' },
    orange: { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C', iconColor: '#F97316' },
    blue:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', iconColor: '#3B82F6' },
    purple: { bg: '#FAF5FF', border: '#E9D5FF', text: '#7C3AED', iconColor: '#A855F7' },
  };
  const p = palettes[color] || palettes.green;
  return (
    <div className="rounded-2xl p-4" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={16} weight="duotone" style={{ color: p.iconColor, flexShrink: 0 }} />}
        <span className="text-xs font-medium" style={{ color: '#6B7280' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: p.text }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{sub}</p>
    </div>
  );
}

const STATUS_CONFIG = {
  pending:   { label: 'Menunggu',   bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  preparing: { label: 'Diproses',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  done:      { label: 'Selesai',    bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  cancelled: { label: 'Dibatalkan', bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
};

function OrderRow({ order }) {
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  const time = new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const cfg  = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition">
      <td className="py-2.5 pr-3 font-semibold text-gray-700">#{order.id}</td>
      <td className="py-2.5 pr-3 text-gray-600">Meja {order.table?.number ?? '-'}</td>
      <td className="py-2.5 pr-3 text-gray-400 text-xs">{time}</td>
      <td className="py-2.5 pr-3 text-right font-semibold text-gray-700">{fmt(order.totalAmount)}</td>
      <td className="py-2.5 text-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          {cfg.label}
        </span>
      </td>
    </tr>
  );
}

function OrderHistoryModal({ orders, rangeLabel, onClose }) {
  const [filter, setFilter] = useState('semua');
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const filtered = filter === 'semua' ? orders : orders.filter((o) => o.status === filter);

  const FILTERS = [
    { v: 'semua',     l: `Semua (${orders.length})` },
    { v: 'done',      l: `✅ Selesai (${orders.filter(o=>o.status==='done').length})` },
    { v: 'cancelled', l: `❌ Dibatalkan (${orders.filter(o=>o.status==='cancelled').length})` },
    { v: 'pending',   l: `⏳ Menunggu (${orders.filter(o=>o.status==='pending').length})` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-bold text-gray-800">📋 Riwayat Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">{orders.length} total order · {rangeLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition text-sm">✕</button>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                filter === f.v ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.l}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Tidak ada order untuk filter ini</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Order</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Meja</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Waktu</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Items</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2 pr-3">Total</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Bayar</th>
                  <th className="text-center text-xs text-gray-400 font-medium pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const cfg  = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                  const time = new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                  const itemsSummary = order.items?.slice(0, 2).map((i) => `${i.menuName || i.menu?.name} x${i.quantity}`).join(', ')
                    + (order.items?.length > 2 ? ` +${order.items.length - 2} lagi` : '');
                  const cancelNote = order.status === 'cancelled' && order.notes
                    ? order.notes.replace(/\[.*?\]/g, '').trim()
                    : null;
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition align-top">
                      <td className="py-2.5 pr-3 font-semibold text-gray-700">#{order.id}</td>
                      <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">Meja {order.table?.number ?? '-'}</td>
                      <td className="py-2.5 pr-3 text-gray-400 text-xs whitespace-nowrap">{time}</td>
                      <td className="py-2.5 pr-3 text-gray-500 text-xs max-w-[160px]">
                        <span className="line-clamp-2">{itemsSummary || '-'}</span>
                        {cancelNote && (
                          <span className="block mt-0.5 text-red-400 italic">&ldquo;{cancelNote}&rdquo;</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-gray-700 whitespace-nowrap">{fmt(order.totalAmount)}</td>
                      <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {order.paymentMethod === 'qris' ? '📱 QRIS' : order.paymentMethod === 'split' ? '✂️ Split' : order.status === 'cancelled' ? '-' : '💵 Cash'}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex items-center gap-4 text-xs text-gray-500">
          <span>✅ Selesai: <strong className="text-green-600">{orders.filter(o=>o.status==='done').length}</strong></span>
          <span>❌ Dibatalkan: <strong className="text-red-500">{orders.filter(o=>o.status==='cancelled').length}</strong></span>
          <span>💰 Total: <strong className="text-gray-700">{fmt(orders.filter(o=>o.status==='done').reduce((s,o)=>s+o.totalAmount,0))}</strong></span>
        </div>
      </div>
    </div>
  );
}

function PaymentBreakdownBar({ doneOrders, cashRevenue, qrisRevenue, splitRevenue = 0 }) {
  if (doneOrders === 0) return null;
  const total = cashRevenue + qrisRevenue + splitRevenue;
  const cashPct  = total > 0 ? Math.round((cashRevenue  / total) * 100) : 0;
  const qrisPct  = total > 0 ? Math.round((qrisRevenue  / total) * 100) : 0;
  const splitPct = total > 0 ? 100 - cashPct - qrisPct : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
        <span>💵 Cash {cashPct}%</span>
        {splitPct > 0 && <span>✂️ Split {splitPct}%</span>}
        <span>QRIS {qrisPct}% 📱</span>
      </div>
      <div className="h-3 rounded-full bg-violet-100 overflow-hidden flex">
        <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${cashPct}%` }} />
        <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${splitPct}%` }} />
        <div className="h-full bg-violet-400 transition-all duration-500" style={{ width: `${qrisPct}%` }} />
      </div>
    </div>
  );
}
