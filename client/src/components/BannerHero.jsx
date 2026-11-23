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

      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${compact ? 'py-7' : 'py-10 sm:py-14'}`}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/40 bg-lime-500/15 px-3 py-1 text-xs font-extrabold tracking-wider text-lime-300">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            線上活動報名
          </span>

          {event?.regState && (
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold border ${badgeClass}`}>
              {badgeText}
            </span>
          )}

          {event?.organizer_name && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs font-bold text-slate-300">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              主辦：{event.organizer_name}
            </span>
          )}
        </div>

        <h1
          className={`font-black tracking-wide text-white drop-shadow ${
            compact ? 'text-2xl sm:text-3xl' : 'text-2xl sm:text-4xl lg:text-5xl'
          }`}
        >
          {event?.banner_title || event?.name || '路跑活動主標題'}
        </h1>

        {event?.english_name && (
          <p className="mt-1.5 font-mono-num text-xs sm:text-sm font-bold uppercase tracking-widest text-lime-300/90">
            {event.english_name}
          </p>
        )}

        <p className={`mt-3 max-w-3xl text-slate-200 ${compact ? 'text-sm' : 'text-sm sm:text-base'}`}>
          {event?.banner_subtitle || '歡迎各位跑者熱血參與賽事活動'}
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
          {(event?.reg_start_at || event?.reg_end_at) && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3.5 py-2 border border-slate-700/80">
              <Clock className="h-4 w-4 text-sky-400" />
              <span>報名期間：</span>
              <strong className="font-mono-num text-white">
                {formatDt(event.reg_start_at) || '未定'} ~ {formatDt(event.reg_end_at) || '未定'}
              </strong>
            </div>
          )}
          {event?.location && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3.5 py-2 border border-slate-700/80">
              <MapPin className="h-4 w-4 text-emerald-400" />
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

        {/* 依活動狀態顯示對應倒數計時器 */}
        {!compact && status === 'open' && event?.reg_end_at && (
          <div className="mt-6">
            <CountdownTimer targetIso={event.reg_end_at} label="距離報名截止" expiredLabel="報名已截止" />
          </div>
        )}
        {!compact && status === 'preparing' && event?.reg_start_at && (
          <div className="mt-6">
            <CountdownTimer
              targetIso={event.reg_start_at}
              label="距離開放報名"
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
