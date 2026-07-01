'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarBlank, CaretLeft, CaretRight, CaretDown } from '@phosphor-icons/react';

// ─── Util tanggal (memakai waktu lokal browser = WIB untuk pengguna) ─────────
export const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
const sameYMD = (a, b) => toYMD(a) === toYMD(b);
const fmtShort = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const fmtLong  = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtRangeLabel = (startStr, endStr) => {
  const s = parseYMD(startStr), e = parseYMD(endStr);
  if (sameYMD(s, e)) return fmtLong(s);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${sameYear ? fmtShort(s) : fmtLong(s)} – ${fmtLong(e)}`;
};

// ─── Preset ──────────────────────────────────────────────────────────────────
export const PRESETS = [
  { key: 'today',     label: 'Hari ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: 'last7',     label: '7 hari terakhir' },
  { key: 'last30',    label: '30 hari terakhir' },
  { key: 'thisWeek',  label: 'Minggu ini' },
  { key: 'lastWeek',  label: 'Minggu lalu' },
  { key: 'thisMonth', label: 'Bulan ini' },
  { key: 'lastMonth', label: 'Bulan lalu' },
  { key: 'custom',    label: 'Custom' },
];

// Hitung [start, end] (Date) untuk sebuah preset — basis: hari ini lokal
function presetDates(key) {
  const today = startOfDay(new Date());
  const dowMon = (today.getDay() + 6) % 7; // Senin = 0
  switch (key) {
    case 'today':     return [today, today];
    case 'yesterday': { const y = addDays(today, -1); return [y, y]; }
    case 'last7':     return [addDays(today, -6), today];
    case 'last30':    return [addDays(today, -29), today];
    case 'thisWeek':  return [addDays(today, -dowMon), today];
    case 'lastWeek':  { const mon = addDays(today, -dowMon); return [addDays(mon, -7), addDays(mon, -1)]; }
    case 'thisMonth': return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    case 'lastMonth': return [
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
      new Date(today.getFullYear(), today.getMonth(), 0),
    ];
    default:          return [today, today];
  }
}

// { startStr, endStr, preset, label } untuk sebuah preset — dipakai juga oleh halaman untuk default
export function presetValue(key) {
  const [s, e] = presetDates(key);
  const label = PRESETS.find((p) => p.key === key)?.label || 'Custom';
  return { startStr: toYMD(s), endStr: toYMD(e), preset: key, label };
}

const GREEN = '#1B4332';
const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ─── Komponen utama ────────────────────────────────────────────────────────
export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Draft saat popover terbuka
  const [draftStart, setDraftStart] = useState(parseYMD(value.startStr));
  const [draftEnd,   setDraftEnd]   = useState(parseYMD(value.endStr));
  const [draftPreset, setDraftPreset] = useState(value.preset || 'custom');
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseYMD(value.endStr); return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = startOfDay(new Date());

  // Reset draft tiap kali dibuka
  useEffect(() => {
    if (open) {
      setDraftStart(parseYMD(value.startStr));
      setDraftEnd(parseYMD(value.endStr));
      setDraftPreset(value.preset || 'custom');
      const d = parseYMD(value.endStr);
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [open, value.startStr, value.endStr, value.preset]);

  // Tutup saat klik di luar (desktop) + Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pickPreset = (key) => {
    if (key === 'custom') { setDraftPreset('custom'); return; }
    const [s, e] = presetDates(key);
    setDraftStart(s); setDraftEnd(e); setDraftPreset(key);
    setViewMonth(new Date(e.getFullYear(), e.getMonth(), 1));
  };

  const clickDay = (day) => {
    const picked = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    if (picked > today) return; // tidak boleh pilih masa depan
    setDraftPreset('custom');
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(picked); setDraftEnd(null);
    } else if (picked < draftStart) {
      setDraftEnd(draftStart); setDraftStart(picked);
    } else {
      setDraftEnd(picked);
    }
  };

  const apply = () => {
    const s = draftStart;
    const e = draftEnd || draftStart; // kalau baru pilih 1 tanggal, anggap 1 hari
    const label = draftPreset && draftPreset !== 'custom'
      ? PRESETS.find((p) => p.key === draftPreset)?.label
      : fmtRangeLabel(toYMD(s), toYMD(e));
    onChange({ startStr: toYMD(s), endStr: toYMD(e), preset: draftPreset, label });
    setOpen(false);
  };

  // Grid kalender bulan aktif
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const inRange = (day) => {
    if (!day || !draftStart) return false;
    const d = new Date(y, m, day);
    const e = draftEnd || draftStart;
    return d >= draftStart && d <= e;
  };
  const isEndpoint = (day) => {
    if (!day || !draftStart) return false;
    const d = new Date(y, m, day);
    return sameYMD(d, draftStart) || (draftEnd && sameYMD(d, draftEnd));
  };

  const goMonth = (delta) => setViewMonth(new Date(y, m + delta, 1));
  const canGoNext = new Date(y, m + 1, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="relative inline-block text-left w-full sm:w-auto" ref={containerRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full sm:w-auto flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-sm transition bg-white"
        style={{ borderColor: '#E8ECE4', color: '#1A1A1A' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <CalendarBlank size={16} weight="bold" style={{ color: GREEN, flexShrink: 0 }} />
          <span className="font-semibold truncate">{value.label}</span>
          <span className="hidden sm:inline text-xs" style={{ color: '#9CA3AF' }}>
            · {fmtRangeLabel(value.startStr, value.endStr)}
          </span>
        </span>
        <CaretDown size={13} weight="bold" style={{ color: '#9CA3AF', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent" onClick={() => setOpen(false)} />

          {/* Panel: bottom-sheet di mobile, dropdown di desktop */}
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white shadow-2xl max-h-[88vh] overflow-y-auto
                       sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:rounded-2xl
                       sm:w-[544px] sm:max-h-none sm:overflow-visible sm:border"
            style={{ borderColor: '#E8ECE4' }}
          >
            {/* handle mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex flex-col sm:flex-row">
              {/* Preset list */}
              <div className="flex flex-row flex-wrap gap-2 p-3 sm:flex-col sm:flex-nowrap sm:gap-1 sm:w-44 sm:border-r sm:p-2"
                style={{ borderColor: '#E8ECE4' }}>
                {PRESETS.map((p) => {
                  const active = draftPreset === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => pickPreset(p.key)}
                      className="text-left text-xs sm:text-sm rounded-lg px-3 py-2 transition whitespace-nowrap font-medium"
                      style={active
                        ? { background: '#D8F3DC', color: GREEN }
                        : { background: 'transparent', color: '#6B7280' }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Kalender */}
              <div className="p-3 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => goMonth(-1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                    <CaretLeft size={16} weight="bold" style={{ color: '#6B7280' }} />
                  </button>
                  <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>{MONTHS[m]} {y}</span>
                  <button onClick={() => canGoNext && goMonth(1)} disabled={!canGoNext}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition disabled:opacity-30">
                    <CaretRight size={16} weight="bold" style={{ color: '#6B7280' }} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="text-center text-[11px] font-semibold py-1" style={{ color: '#9CA3AF' }}>{w}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((day, idx) => {
                    if (day === null) return <div key={`b${idx}`} />;
                    const d = new Date(y, m, day);
                    const future = d > today;
                    const isToday = sameYMD(d, today);
                    const selected = isEndpoint(day);
                    const within = inRange(day) && !selected;
                    return (
                      <button
                        key={day}
                        onClick={() => clickDay(day)}
                        disabled={future}
                        className="aspect-square rounded-lg text-sm font-medium transition flex items-center justify-center"
                        style={
                          future   ? { color: '#D1D5DB', cursor: 'not-allowed' } :
                          selected ? { background: GREEN, color: '#fff', fontWeight: 700 } :
                          within   ? { background: '#D8F3DC', color: GREEN } :
                                     { color: '#1A1A1A', border: isToday ? '1px solid #BBD8C4' : '1px solid transparent' }
                        }
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t p-3" style={{ borderColor: '#E8ECE4' }}>
              <span className="text-xs sm:text-sm font-medium" style={{ color: '#6B7280' }}>
                {draftStart ? fmtRangeLabel(toYMD(draftStart), toYMD(draftEnd || draftStart)) : 'Pilih tanggal'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium border transition"
                  style={{ borderColor: '#E8ECE4', color: '#6B7280' }}>
                  Batal
                </button>
                <button onClick={apply} disabled={!draftStart}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                  style={{ background: GREEN }}>
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
