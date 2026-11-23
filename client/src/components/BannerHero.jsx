import React from 'react';
import { Calendar, MapPin, Users, Cpu, Radio } from 'lucide-react';
import CountdownTimer from './CountdownTimer';

export default function BannerHero({ event, compact = false }) {
  const bgUrl =
    event?.banner_image_url ||
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80';

  const count = Number(event?.registration_count || 0);
  const max = Number(event?.max_participants || 0);
  const ratio = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const isLapTimed = event?.event_type === 'lap_timed';

  return (
    <section
      className={`relative overflow-hidden border-b border-slate-800 bg-slate-950 ${
        compact ? 'rounded-2xl border border-slate-700' : ''
      }`}
    >
      {/* 背景圖片與 TUR 深海漸層遮罩 */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url("${bgUrl}")` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-900/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(132,204,22,0.16),transparent_45%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.16),transparent_45%)]" />

      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${compact ? 'py-7' : 'py-10 sm:py-14'}`}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/40 bg-lime-500/15 px-3 py-1 text-xs font-extrabold tracking-wider text-lime-300">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            TUR OFFICIAL REGISTRATION
          </span>

          <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-300">
            <Cpu className="h-3.5 w-3.5" />
            {isLapTimed ? '繞圈限時晶片賽 (Lap Timed)' : '標準距離晶片賽 (Distance)'}
          </span>

          {event?.regState && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold border ${
                event.regState.status === 'open'
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                  : event.regState.status === 'full'
                  ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                  : 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              }`}
            >
              {event.regState.status === 'open'
                ? '● 開放線上報名中'
                : event.regState.status === 'full'
                ? '● 名額已額滿'
                : event.regState.status === 'upcoming'
                ? '● 即將開放報名'
                : '● 報名已截止 / 關閉'}
            </span>
          )}
        </div>

        <h1
          className={`font-black tracking-wide text-white drop-shadow ${
            compact ? 'text-2xl sm:text-3xl' : 'text-2xl sm:text-4xl lg:text-5xl'
          }`}
        >
          {event?.banner_title || event?.name || 'TUR 路跑活動主標題'}
        </h1>

        {event?.english_name && (
          <p className="mt-1.5 font-mono-num text-xs sm:text-sm font-bold uppercase tracking-widest text-lime-300/90">
            {event.english_name}
          </p>
        )}

        <p className={`mt-3 max-w-3xl text-slate-200 ${compact ? 'text-sm' : 'text-sm sm:text-base'}`}>
          {event?.banner_subtitle || 'Taiwan Ultra Runners 官方賽事｜Web NFC 晶片計時與即時成績服務'}
        </p>

        {/* 賽事關鍵資訊膠囊列 */}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-200">
          {event?.event_date && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3.5 py-2 border border-slate-700/80">
              <Calendar className="h-4 w-4 text-lime-400" />
              <span>賽事日期：</span>
              <strong className="font-mono-num text-white">{event.event_date}</strong>
            </div>
          )}
          {event?.location && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3.5 py-2 border border-slate-700/80">
              <MapPin className="h-4 w-4 text-sky-400" />
              <span>{event.location}</span>
            </div>
          )}
          {max > 0 && (
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-900/85 px-3.5 py-2 border border-slate-700/80">
              <Users className="h-4 w-4 text-amber-400" />
              <span>
                已報名 <strong className="font-mono-num text-white">{count}</strong> / {max} 人
              </span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    ratio >= 90
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-lime-400 via-emerald-400 to-sky-400'
                  }`}
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 倒數計時器 */}
        {!compact && event?.reg_end_at && (
          <div className="mt-6">
            <CountdownTimer targetIso={event.reg_end_at} label="距離報名截止" />
          </div>
        )}
      </div>
      <div className="tur-accent-strip w-full" />
    </section>
  );
}
