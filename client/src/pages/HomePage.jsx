import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  Cpu,
  ShieldCheck,
  ClipboardCheck,
  ExternalLink,
  Trophy,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';

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
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title="TUR 路跑活動線上報名平台"
        subtitle="Taiwan Ultra Runners 官方賽事報名・獨立資料庫架構・無縫對接晶片計時系統"
        statusLabel="雲端報名服務運行中"
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 pt-8 space-y-10">
        {/* TUR 三大入口大廳卡片（致敬 runchip-timing.vercel.app 大廳設計） */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          <a
            href="#open-events"
            className="tur-portal-box tur-portal-sky p-6 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-400/35 px-2.5 py-1 text-[11px] font-bold text-sky-300">
                <ClipboardCheck className="h-3.5 w-3.5" />
                跑者專區
              </span>
              <span className="font-mono-num text-xs font-bold text-sky-400">
                {events.length} 場開放中
              </span>
            </div>
            <div className="mt-5">
              <h2 className="text-2xl font-black tracking-[0.12em] text-sky-300 group-hover:text-white transition">
                公開報名
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                免登入直接報名 TUR 超馬與路跑賽事，即時計算組別與加購費用，自動產生報名序號。
              </p>
            </div>
          </a>

          <a
            href="https://runchip-timing.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="tur-portal-box tur-portal-emerald p-6 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                <Cpu className="h-3.5 w-3.5" />
                獨立計時系統
              </span>
              <ExternalLink className="h-4 w-4 text-emerald-400 group-hover:translate-x-0.5 transition" />
            </div>
            <div className="mt-5">
              <h2 className="text-2xl font-black tracking-[0.12em] text-emerald-300 group-hover:text-white transition">
                晶片計時
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                前往 TUR Web NFC 晶片計時平台，查詢即時里程排名、歷年成績、八百壯士榜與官方雙語證書。
              </p>
            </div>
          </a>

          <Link
            to="/admin"
            className="tur-portal-box tur-portal-amber p-6 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-400/35 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                主辦單位專用
              </span>
              <ArrowRight className="h-4 w-4 text-amber-400 group-hover:translate-x-0.5 transition" />
            </div>
            <div className="mt-5">
              <h2 className="text-2xl font-black tracking-[0.12em] text-amber-300 group-hover:text-white transition">
                後台管理
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                活動建立、動態表單、Google 試算表雙向同步、自動配號與一鍵匯出晶片系統名單。
              </p>
            </div>
          </Link>
        </section>

        {/* 精選開放報名賽事 */}
        <section id="open-events" className="space-y-5">
          <div className="tur-control-bar rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Trophy className="h-5 w-5 text-lime-400" />
              <div>
                <h2 className="text-lg sm:text-xl font-black tracking-wide text-white">
                  TUR 開放報名賽事清單
                </h2>
                <p className="text-xs text-slate-400">
                  所有賽事皆支援與 TUR 晶片計時系統標準欄位對接（各自獨立資料庫）
                </p>
              </div>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-950/90 px-3 py-1 font-mono-num text-xs font-bold text-sky-300">
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
            <div className="tur-control-bar rounded-2xl p-12 text-center">
              <p className="text-slate-400">目前尚無開放中的路跑活動。</p>
              <Link
                to="/admin"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
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
                  className="tur-card group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 transition hover:border-lime-400/60 hover:shadow-2xl hover:shadow-lime-950/20 flex flex-col"
                >
                  <div className="relative h-48 overflow-hidden bg-slate-950">
                    <img
                      src={
                        ev.banner_image_url ||
                        'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80'
                      }
                      alt={ev.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                    <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-extrabold backdrop-blur-md ${
                          ev.regState?.status === 'open'
                            ? 'bg-emerald-500/90 text-slate-950'
                            : ev.regState?.status === 'full'
                            ? 'bg-rose-500/90 text-white'
                            : 'bg-amber-500/90 text-slate-950'
                        }`}
                      >
                        {ev.regState?.status === 'open'
                          ? '● 開放報名中'
                          : ev.regState?.status === 'full'
                          ? '● 已額滿'
                          : ev.regState?.status === 'upcoming'
                          ? '● 即將開放'
                          : '● 已截止'}
                      </span>
                      <span className="rounded-full bg-slate-950/80 border border-sky-400/40 px-2.5 py-1 text-[11px] font-bold text-sky-300 backdrop-blur-md">
                        {ev.event_type === 'lap_timed' ? '繞圈限時賽' : '距離計時賽'}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="text-xl font-black text-white line-clamp-1">{ev.name}</h3>
                      {ev.english_name && (
                        <p className="font-mono-num text-[11px] text-lime-300 line-clamp-1">
                          {ev.english_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                    <div className="space-y-2 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-lime-400 shrink-0" />
                        <span>
                          賽事日期：<strong className="font-mono-num text-white">{ev.event_date}</strong>
                        </span>
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
                            <span className="font-mono-num font-bold text-white">
                              {count} / {max} 人（{ratio}%）
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-sky-400"
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <Link
                      to={`/register/${ev.slug}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-3 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 transition shadow-lg shadow-emerald-950/50"
                    >
                      <span>進入賽事線上報名</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <TurFooter />
    </div>
  );
}
