import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  ArrowRight,
  Clock,
  Trophy,
  Search,
  Building2,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatDtShort(val) {
  if (!val) return '';
  return String(val).replace('T', ' ').slice(0, 16);
}

function parseEventDateParts(dateStr) {
  const s = String(dateStr || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return {
      monthKey: '9999-99',
      monthLabel: '未定月份',
      monthShort: '未定',
      day: '--',
      month: '--',
      weekday: '',
    };
  }
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const d = new Date(year, monthNum - 1, dayNum);
  const weekday = Number.isNaN(d.getTime()) ? '' : `(${WEEKDAYS[d.getDay()]})`;
  return {
    monthKey: `${m[1]}-${m[2]}`,
    monthLabel: `${m[1]} 年 ${m[2]} 月`,
    monthShort: `${m[1]}/${m[2]}`,
    month: m[2],
    day: m[3],
    weekday,
  };
}

function extractCategories(fields) {
  if (!Array.isArray(fields)) return [];
  const catField =
    fields.find((f) => f.id === 'race_category') ||
    fields.find((f) => String(f.label || '').includes('組別'));
  if (!catField || !Array.isArray(catField.options)) return [];
  return catField.options.map((opt) => ({
    label: opt.label || opt.value,
    price: Number(opt.price || 0),
  }));
}

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/public/events')
      .then((data) => {
        const list = (data.events || [])
          .filter((e) => e.regState?.status === 'open')
          .sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')));
        setEvents(list);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 計算所有可用月份清單（依時間由近至遠）
  const monthOptions = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const parts = parseEventDateParts(ev.event_date);
      const prev = map.get(parts.monthKey);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(parts.monthKey, {
          key: parts.monthKey,
          label: parts.monthLabel,
          short: parts.monthShort,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [events]);

  // 關鍵字與月份篩選後，再依月份分組
  const groupedByMonth = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const filtered = events.filter((ev) => {
      const parts = parseEventDateParts(ev.event_date);
      if (selectedMonth !== 'all' && parts.monthKey !== selectedMonth) {
        return false;
      }
      if (!q) return true;
      return (
        String(ev.name || '').toLowerCase().includes(q) ||
        String(ev.english_name || '').toLowerCase().includes(q) ||
        String(ev.location || '').toLowerCase().includes(q) ||
        String(ev.organizer_name || '').toLowerCase().includes(q) ||
        String(ev.description || '').toLowerCase().includes(q) ||
        String(ev.banner_subtitle || '').toLowerCase().includes(q)
      );
    });

    const groups = new Map();
    for (const ev of filtered) {
      const parts = parseEventDateParts(ev.event_date);
      if (!groups.has(parts.monthKey)) {
        groups.set(parts.monthKey, {
          monthKey: parts.monthKey,
          monthLabel: parts.monthLabel,
          items: [],
        });
      }
      groups.get(parts.monthKey).items.push({ ...ev, _dateParts: parts });
    }
    return Array.from(groups.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [events, searchText, selectedMonth]);

  const totalFilteredCount = useMemo(
    () => groupedByMonth.reduce((acc, g) => acc + g.items.length, 0),
    [groupedByMonth]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title="TUR 路跑活動線上報名平台"
        subtitle="按月份條列所有開放中賽事・點擊活動可展開完整摘要或直接線上報名"
        statusLabel="線上報名服務運行中"
        showLookupLink
        showAdminLink
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pt-6 space-y-5">
        {/* 頂部篩選控制列（搜尋 + 月份快速切換） */}
        <section className="tur-control-bar rounded-2xl p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Trophy className="h-5 w-5 text-lime-400 shrink-0" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
                    開放報名中賽事清單
                  </h2>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 font-mono-num text-xs font-extrabold text-emerald-300">
                    共 {events.length} 場開放中
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  依賽事月份由近至遠排列，單一畫面即可檢視各活動摘要、組別與報名期限
                </p>
              </div>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜尋賽事名稱、地點、摘要或主辦單位..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-lime-400 focus:outline-none"
              />
            </div>
          </div>

          {/* 月份快速篩選膠囊 */}
          {monthOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 mr-1">
                <Calendar className="h-3.5 w-3.5 text-lime-400" />
                月份篩選：
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth('all')}
                className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition ${
                  selectedMonth === 'all'
                    ? 'border-lime-400 bg-lime-400 text-slate-950'
                    : 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                全部月份 ({events.length})
              </button>
              {monthOptions.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedMonth(m.key)}
                  className={`rounded-lg border px-2.5 py-1 font-mono-num text-xs font-bold transition ${
                    selectedMonth === m.key
                      ? 'border-sky-400 bg-sky-500 text-slate-950'
                      : 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  {m.label} ({m.count})
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 載入中 */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/70" />
            ))}
          </div>
        )}

        {/* 錯誤提示 */}
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-300">
            無法載入活動清單：{error}
          </div>
        )}

        {/* 空清單 */}
        {!loading && !error && totalFilteredCount === 0 && (
          <div className="tur-control-bar rounded-2xl p-10 text-center space-y-2">
            <p className="text-base font-bold text-slate-300">
              {searchText.trim() || selectedMonth !== 'all'
                ? '查無符合條件的開放中賽事'
                : '目前尚無開放報名中的賽事活動'}
            </p>
            <p className="text-xs text-slate-500">
              {searchText.trim() || selectedMonth !== 'all'
                ? '您可以切換為「全部月份」或清除搜尋關鍵字瀏覽所有賽事。'
                : '新賽事開放報名後將自動依月份顯示於此列表。'}
            </p>
          </div>
        )}

        {/* 按月份分組之條列式賽事清單 */}
        {!loading && !error && groupedByMonth.length > 0 && (
          <div className="space-y-6">
            {groupedByMonth.map((group) => (
              <section key={group.monthKey} className="space-y-2.5">
                {/* 月份標題列 */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-1.5 rounded-full bg-gradient-to-b from-lime-400 to-emerald-500" />
                    <h3 className="font-mono-num text-base sm:text-lg font-black tracking-wide text-white">
                      {group.monthLabel}
                    </h3>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono-num text-[11px] font-bold text-sky-300">
                      {group.items.length} 場賽事
                    </span>
                  </div>
                </div>

                {/* 該月份條列清單 */}
                <div className="divide-y divide-slate-800/90 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90">
                  {group.items.map((ev) => {
                    const categories = extractCategories(ev.fields);
                    const summaryText = ev.banner_subtitle || ev.description || '歡迎跑者踴躍報名參加！';
                    const isExpanded = expandedId === ev.id;
                    const dp = ev._dateParts;

                    return (
                      <article
                        key={ev.id}
                        className="transition hover:bg-slate-800/45"
                      >
                        {/* 單一精簡條列主列 */}
                        <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 px-4 py-3.5">
                          {/* 左側：賽事日期方塊 + 縮圖 */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex h-14 w-16 flex-col items-center justify-center rounded-xl border border-lime-400/35 bg-slate-950 text-center shrink-0">
                              <span className="font-mono-num text-[10px] font-bold text-lime-400 leading-none">
                                {dp.month}月 {dp.weekday}
                              </span>
                              <span className="font-mono-num text-xl font-black text-white leading-tight mt-0.5">
                                {dp.day}
                              </span>
                            </div>

                            <img
                              src={
                                ev.banner_image_url ||
                                'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=400&q=60'
                              }
                              alt={ev.name}
                              className="hidden sm:block h-14 w-24 rounded-xl object-cover border border-slate-700/80 shrink-0"
                            />
                          </div>

                          {/* 中間：標題、摘要、地點、組別與報名期限 */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 shrink-0">
                                ● 開放中
                              </span>
                              <Link
                                to={`/register/${ev.slug}`}
                                className="text-base sm:text-lg font-black text-white hover:text-lime-300 transition truncate"
                              >
                                {ev.name}
                              </Link>
                              {ev.organizer_name && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold text-slate-300 shrink-0">
                                  <Building2 className="h-3 w-3 text-slate-400" />
                                  {ev.organizer_name}
                                </span>
                              )}
                            </div>

                            {/* 同一畫面即時顯示活動摘要 */}
                            <p className="text-xs text-slate-300 line-clamp-1">
                              {summaryText}
                            </p>

                            {/* 關鍵資訊迷你列：地點、報名期限、組別標籤 */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                              {ev.location && (
                                <span className="inline-flex items-center gap-1 max-w-xs truncate">
                                  <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  <span className="truncate">{ev.location}</span>
                                </span>
                              )}
                              {(ev.reg_start_at || ev.reg_end_at) && (
                                <span className="inline-flex items-center gap-1 font-mono-num">
                                  <Clock className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                                  <span>
                                    報名：{formatDtShort(ev.reg_start_at)} ~ {formatDtShort(ev.reg_end_at)}
                                  </span>
                                </span>
                              )}
                              {categories.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-lime-300/90">
                                  <Tag className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-xs">
                                    {categories.map((c) => c.label).join(' / ')}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 右側：摘要展開 + 立即報名按鈕（首頁不顯示名額） */}
                          <div className="flex flex-wrap lg:flex-nowrap items-center justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-bold text-slate-300 hover:border-sky-400 hover:text-sky-300 transition"
                            >
                              <span>{isExpanded ? '收合摘要' : '詳細摘要'}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <Link
                              to={`/register/${ev.slug}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 shadow-md shadow-emerald-950/40 transition whitespace-nowrap"
                            >
                              <span>立即報名</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>

                        {/* 同畫面展開：完整活動摘要、組別費用表與賽事資訊 */}
                        {isExpanded && (
                          <div className="border-t border-slate-800 bg-slate-950/75 px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                            <div className="md:col-span-7 space-y-2">
                              <p className="font-bold text-lime-300">賽事活動簡介摘要</p>
                              <p className="whitespace-pre-line text-slate-300 leading-relaxed">
                                {ev.description || ev.banner_subtitle || '尚未填寫詳細賽事簡介。'}
                              </p>
                            </div>
                            <div className="md:col-span-5 space-y-2">
                              <p className="font-bold text-sky-300">報名組別與費用一覽</p>
                              {categories.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {categories.map((cat, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200"
                                    >
                                      <span className="font-bold">{cat.label}</span>
                                      {cat.price > 0 && (
                                        <span className="font-mono-num font-bold text-amber-300">
                                          NT$ {cat.price.toLocaleString()}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-400">請點選「立即報名」查看詳細報名項目。</p>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <TurFooter showOrganizerEntry />
    </div>
  );
}
