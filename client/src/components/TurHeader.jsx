import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ShieldCheck, Sun, Moon, Home } from 'lucide-react';
import TurLogo from './TurLogo';

export default function TurHeader({
  title = '路跑活動線上報名平台',
  subtitle = 'TUR (Taiwan Ultra Runners) 官方賽事報名系統',
  statusLabel = '系統連線正常',
  rightSlot = null,
  showTimingLink = true,
  showAdminLink = true,
  showHomeLink = false,
  timingUrl = 'https://runchip-timing.vercel.app/',
}) {
  const [highContrast, setHighContrast] = useState(
    () => typeof document !== 'undefined' && document.body.classList.contains('high-contrast')
  );

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  return (
    <header className="sticky top-0 z-30 tur-header-bar">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="shrink-0">
            <TurLogo />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-lime-400 animate-pulse" />
                {statusLabel}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-black tracking-wide text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden md:block text-[11px] text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHighContrast((v) => !v)}
            title="切換戶外強光高對比模式"
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition ${
              highContrast
                ? 'border-yellow-400 bg-yellow-400 text-black'
                : 'border-slate-700/80 bg-slate-900/90 text-slate-300 hover:border-lime-400/60 hover:text-lime-300'
            }`}
          >
            {highContrast ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{highContrast ? '標準模式' : '高對比'}</span>
          </button>

          {showTimingLink && (
            <a
              href={timingUrl || 'https://runchip-timing.vercel.app/'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-extrabold text-emerald-300 hover:bg-emerald-500/25 transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>晶片計時平台</span>
            </a>
          )}

          {showHomeLink && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-sky-400 hover:text-sky-300 transition"
            >
              <Home className="h-3.5 w-3.5" />
              <span>大廳</span>
            </Link>
          )}

          {showAdminLink && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-extrabold text-amber-300 hover:bg-amber-500/25 transition"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>後台管理</span>
            </Link>
          )}

          {rightSlot}
        </div>
      </div>
      <div className="tur-accent-strip w-full" />
    </header>
  );
}
