import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Home, ShieldCheck, Search, Type, Crown } from 'lucide-react';
import TurLogo from './TurLogo';
import {
  FONT_SCALES,
  applyFontScale,
  getSavedFontScale,
  subscribeFontScale,
} from '../utils/fontScale';

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
  const [fontScale, setFontScale] = useState(() => getSavedFontScale());

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  useEffect(() => subscribeFontScale(setFontScale), []);

  const handleSelectFont = (key) => {
    setFontScale(applyFontScale(key));
  };

  return (
    <header className="sticky top-0 z-30 tur-header-bar">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="shrink-0">
            <TurLogo size="sm" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black tracking-wide text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden md:block text-xs text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 全站字體大小調整器 */}
          <div
            role="group"
            aria-label="字體大小調整"
            className="inline-flex items-center gap-0.5 rounded-xl border border-slate-700/90 bg-slate-950/90 p-0.5"
          >
            <span className="inline-flex items-center gap-1 pl-2 pr-1 text-xs font-bold text-slate-400">
              <Type className="h-3.5 w-3.5 text-lime-400" />
              <span className="hidden sm:inline">字體</span>
            </span>
            {FONT_SCALES.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelectFont(opt.key)}
                aria-pressed={fontScale === opt.key}
                className={`rounded-lg px-2 py-1 text-xs font-extrabold transition ${
                  fontScale === opt.key
                    ? 'bg-lime-400 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

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
            <>
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-extrabold text-emerald-300 hover:bg-emerald-500/25 transition"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>後台管理</span>
              </Link>
              <Link
                to="/admin/login?mode=super_admin"
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-extrabold text-amber-300 hover:bg-amber-500/25 transition"
              >
                <Crown className="h-3.5 w-3.5" />
                <span>最高管理權限</span>
              </Link>
            </>
          )}

          {rightSlot}
        </div>
      </div>
      <div className="tur-accent-strip w-full" />
    </header>
  );
}
