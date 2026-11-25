import React from 'react';
import { Calendar, MapPin, Users, Clock, Radio, Building2 } from 'lucide-react';
import CountdownTimer from './CountdownTimer';

function formatDt(val) {
  if (!val) return '';
  return String(val).replace('T', ' ').slice(0, 16);
}

export default function BannerHero({ event, compact = false }) {
  const bgUrl =
    event?.banner_image_url ||
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80';

  const count = Number(event?.registration_count || 0);
  const max = Number(event?.max_participants || 0);
  const ratio = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const status = event?.regState?.status || 'open';

  const badgeClass =
    status === 'open'
      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
      : status === 'preparing'
      ? 'border-sky-400/50 bg-sky-500/20 text-sky-300'
      : 'border-rose-400/50 bg-rose-500/20 text-rose-300';

  const badgeText =
    status === 'open'
      ? '● 開放中'
      : status === 'preparing'
      ? '● 籌備中'
      : `● 已結案${event?.regState?.subLabel ? `（${event.regState.subLabel}）` : ''}`;

  return (
    <section
      className={`relative overflow-hidden border-b border-slate-800 bg-slate-950 ${
        compact ? 'rounded-2xl border border-slate-700' : ''
      }`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url("${bgUrl}")` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-900/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(132,204,22,0.16),transparent_45%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.16),transparent_45%)]" />

      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${compact ? 'py-5' : 'py-6 sm:py-8'}`}>
        <div className="flex flex-wrap items-center gap-2 mb-2.5">
          {event?.regState && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold border ${badgeClass}`}>
              {badgeText}
            </span>
          )}

          {event?.organizer_name && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
              <Building2 className="h-3 w-3 text-slate-400" />
              {event.organizer_name}
            </span>
          )}
        </div>

        <h1
          className={`font-black tracking-wide text-white drop-shadow ${
            compact ? 'text-xl sm:text-2xl' : 'text-xl sm:text-3xl'
          }`}
        >
          {event?.banner_title || event?.name || '活動報名'}
        </h1>

        {event?.banner_subtitle && (
          <p className="mt-1.5 max-w-3xl text-xs sm:text-sm text-slate-300">
            {event.banner_subtitle}
          </p>
        )}

        {/* 賽事關鍵資訊膠囊列 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-200">
          {event?.event_date && (
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 border border-slate-700/80">
              <Calendar className="h-3.5 w-3.5 text-lime-400" />
              <strong className="font-mono-num text-white">{event.event_date}</strong>
            </div>
          )}
          {(event?.reg_start_at || event?.reg_end_at) && (
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 border border-slate-700/80">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
              <strong className="font-mono-num text-white">
                {formatDt(event.reg_start_at) || '—'} ~ {formatDt(event.reg_end_at) || '—'}
              </strong>
            </div>
          )}
          {event?.location && (
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 border border-slate-700/80">
              <MapPin className="h-3.5 w-3.5 text-emerald-400" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-3 py-1.5 border border-lime-400/35">
            <Users className="h-3.5 w-3.5 text-lime-400" />
            <span className="text-slate-300">報名人員</span>
            <strong className="font-mono-num font-black text-lime-300">
              {count} / {max > 0 ? max : '不限'}
            </strong>
            {max > 0 && (
              <span className="font-mono-num text-[11px] text-slate-400">({ratio}%)</span>
            )}
          </div>
        </div>

        {!compact && status === 'preparing' && event?.reg_start_at && (
          <div className="mt-4">
            <CountdownTimer
              targetIso={event.reg_start_at}
              label="距離開放"
              expiredLabel="即將開放"
              tone="sky"
            />
          </div>
        )}
      </div>
      <div className="tur-accent-strip w-full" />
    </section>
  );
}
