import React from 'react';
import { Calendar, MapPin, Users, Zap } from 'lucide-react';
import CountdownTimer from './CountdownTimer';

export default function BannerHero({ event, compact = false }) {
  const bgUrl =
    event?.banner_image_url ||
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80';

  const count = Number(event?.registration_count || 0);
  const max = Number(event?.max_participants || 0);
  const ratio = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;

  return (
    <section
      className={`relative overflow-hidden border-b-4 border-orange-500 bg-slate-900 ${
        compact ? 'rounded-2xl border-2 border-slate-700' : ''
      }`}
    >
      {/* 背景圖片與深色運動漸層遮罩 */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url("${bgUrl}")` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-blue-950/65" />
      <div className="absolute inset-0 track-lane-lines opacity-60" />

      {/* 頂部高速跑道光條 */}
      <div className="relative h-1.5 w-full bg-gradient-to-r from-orange-500 via-amber-400 to-blue-500" />

      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${compact ? 'py-7' : 'py-12 sm:py-16'}`}>
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-orange-500 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-950 speed-skew">
            <span className="speed-unskew inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 fill-slate-950" />
              OFFICIAL RACE REGISTRATION
            </span>
          </span>

          {event?.regState && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold border ${
                event.regState.status === 'open'
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                  : event.regState.status === 'full'
                  ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                  : 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              }`}
            >
              {event.regState.status === 'open'
                ? '● 開放熱血報名中'
                : event.regState.status === 'full'
                ? '● 名額已額滿'
                : event.regState.status === 'upcoming'
                ? '● 即將開放報名'
                : '● 報名已截止 / 關閉'}
            </span>
          )}
        </div>

        <h1
          className={`font-display font-bold tracking-tight text-white drop-shadow ${
            compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-5xl lg:text-6xl'
          }`}
        >
          {event?.banner_title || event?.name || '路跑活動主標題'}
        </h1>

        <p className={`mt-3 max-w-3xl text-slate-200 ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
          {event?.banner_subtitle || '突破自我極限，挑戰全新賽道！'}
        </p>

        {/* 賽事關鍵資訊條 */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-200">
          {event?.event_date && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-900/75 px-3.5 py-2 border border-slate-700/80">
              <Calendar className="h-4 w-4 text-orange-400" />
              <span>起跑日期：</span>
              <strong className="font-mono text-white">{event.event_date}</strong>
            </div>
          )}
          {event?.location && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-900/75 px-3.5 py-2 border border-slate-700/80">
              <MapPin className="h-4 w-4 text-sky-400" />
              <span>{event.location}</span>
            </div>
          )}
          {max > 0 && (
            <div className="flex items-center gap-2.5 rounded-lg bg-slate-900/75 px-3.5 py-2 border border-slate-700/80">
              <Users className="h-4 w-4 text-emerald-400" />
              <span>
                已報名 <strong className="font-mono text-white">{count}</strong> / {max} 人
              </span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all ${
                    ratio >= 90 ? 'bg-rose-500' : 'bg-gradient-to-r from-orange-500 to-amber-400'
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
    </section>
  );
}
