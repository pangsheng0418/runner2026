import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Home, ShieldCheck, Search } from 'lucide-react';
import TurLogo from './TurLogo';

export default function TurHeader({
  title = 'TUR 活動報名平台',
  subtitle = '',
  rightSlot = null,
  showHomeLink = false,
  showLookupLink = false,
  showAdminLink = false,
  homeLabel = '活動列表',
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
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="shrink-0">
            <TurLogo size="sm" />
          </Link>
          <div className="min-w-0">
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
            title={highContrast ? '標準模式' : '高對比模式'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
              highContrast
                ? 'border-yellow-400 bg-yellow-400 text-black'
                : 'border-slate-700/80 bg-slate-900/90 text-slate-300 hover:border-lime-400/60 hover:text-lime-300'
            }`}
          >
            {highContrast ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          {showHomeLink && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-sky-400 hover:text-sky-300 transition"
            >
              <Home className="h-3.5 w-3.5" />
              <span>{homeLabel}</span>
            </Link>
          )}

          {showLookupLink && (
            <Link
              to="/lookup"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-extrabold text-sky-300 hover:bg-sky-500/25 transition"
            >
              <Search className="h-3.5 w-3.5" />
              <span>查詢／修改</span>
            </Link>
          )}

          {showAdminLink && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-extrabold text-amber-300 hover:bg-amber-500/25 transition"
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
