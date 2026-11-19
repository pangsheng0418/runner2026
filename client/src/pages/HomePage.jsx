import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame,
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  ShieldCheck,
  Timer,
  Trophy,
} from 'lucide-react';
import { apiRequest } from '../api/client';

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/public/events')
      .then((data) => setEvents(data.events || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-slate-950 font-black shadow-lg shadow-orange-500/30">
              <Flame className="h-5 w-5 fill-slate-950" />
            </span>
            <div>
              <span className="font-display text-xl font-bold tracking-wider text-white">
                RUN<span className="text-orange-500">FLOW</span>
              </span>
              <span className="hidden sm:block text-[10px] font-semibold tracking-widest text-slate-400">
                MARATHON & RACE PLATFORM
              </span>
            </div>
          </Link>

          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-200 hover:border-orange-500 hover:text-orange-400 transition"
          >
            <ShieldCheck className="h-4 w-4 text-orange-400" />
            <span>主辦單位後台</span>
          </Link>
        </div>
      </header>

      {/* Hero 主視覺 */}
      <section className="relative overflow-hidden border-b border-slate-800 track-stripes">
        <div className="absolute -top-24 right-0 h-96 w-96 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-0 h-80 w-80 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-1.5 text-xs font-bold text-orange-300 mb-5">
            <Timer className="h-4 w-4" />
            <span>極速線上報名・即時名額控管・雲端試算表同步</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-white max-w-3xl leading-tight">
            下一場個人最佳紀錄，
            <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-sky-400 bg-clip-text text-transparent">
              從這裡起跑！
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-slate-300">
            探索最新開放報名的城市馬拉松、半馬與越野路跑賽事。手機電腦一鍵填寫，即時計算報名費用與加購裝備，完成立即取得專屬報名序號。
          </p>
        </div>
      </section>

      {/* 熱門路跑賽事清單 */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-6 w-6 text-orange-500" />
            <h2 className="font-display text-2xl font-bold text-white">精選開放報名賽事</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            共 {events.length} 場開放中賽事
          </span>
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((n) => (
              <div key={n} className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-300">
            無法載入活動清單：{error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <p className="text-slate-400">目前尚無開放中的路跑活動。</p>
            <Link
              to="/admin"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400"
            >
              前往後台發起第一場賽事
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {events.map((ev) => {
            const count = Number(ev.registration_count || 0);
            const max = Number(ev.max_participants || 0);
            const ratio = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;

            return (
              <article
                key={ev.id}
                className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 transition hover:border-orange-500/60 hover:shadow-xl hover:shadow-orange-950/30 flex flex-col"
              >
                <div className="relative h-48 overflow-hidden bg-slate-800">
                  <img
                    src={
                      ev.banner_image_url ||
                      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80'
                    }
                    alt={ev.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold backdrop-blur-md ${
                        ev.regState?.status === 'open'
                          ? 'bg-emerald-500/90 text-slate-950'
                          : ev.regState?.status === 'full'
                          ? 'bg-rose-500/90 text-white'
                          : 'bg-amber-500/90 text-slate-950'
                      }`}
                    >
                      {ev.regState?.status === 'open'
                        ? '開放報名中'
                        : ev.regState?.status === 'full'
                        ? '已額滿'
                        : ev.regState?.status === 'upcoming'
                        ? '即將開放'
                        : '已截止'}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-4 right-4">
                    <h3 className="font-display text-xl font-bold text-white line-clamp-1">
                      {ev.name}
                    </h3>
                    <p className="text-xs text-slate-300 line-clamp-1 mt-0.5">
                      {ev.banner_subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                  <div className="space-y-2 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-400 shrink-0" />
                      <span>活動日期：{ev.event_date}</span>
                    </div>
                    {ev.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-sky-400 shrink-0" />
                        <span className="line-clamp-1">{ev.location}</span>
                      </div>
                    )}
                    {max > 0 && (
                      <div className="pt-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Users className="h-3.5 w-3.5" />
                            報名進度
                          </span>
                          <span className="font-mono font-bold text-white">
                            {count} / {max} 人（{ratio}%）
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Link
                    to={`/register/${ev.slug}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-black text-slate-950 hover:from-orange-400 hover:to-orange-500 transition shadow-lg shadow-orange-500/20"
                  >
                    <span>進入賽事報名頁面</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
