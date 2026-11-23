import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

function calcRemaining(targetIso) {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { expired: false, days, hours, minutes, seconds };
}

export default function CountdownTimer({ targetIso, label = '距離報名截止' }) {
  const [time, setTime] = useState(() => calcRemaining(targetIso));

  useEffect(() => {
    setTime(calcRemaining(targetIso));
    const timer = setInterval(() => {
      setTime(calcRemaining(targetIso));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetIso]);

  if (!time) return null;

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="inline-flex flex-wrap items-center gap-3 rounded-xl border border-lime-400/35 bg-slate-950/90 px-4 py-2.5 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-lime-400">
        <Timer className="h-4 w-4 animate-pulse" />
        <span>{time.expired ? '報名已截止' : label}</span>
      </div>
      {!time.expired && (
        <div className="flex items-center gap-1.5 font-mono-num text-sm sm:text-base font-bold text-white">
          <span className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5 text-lime-300">
            {pad(time.days)}
          </span>
          <span className="text-xs text-slate-400">天</span>
          <span className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5">{pad(time.hours)}</span>
          <span className="text-sky-400">:</span>
          <span className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5">{pad(time.minutes)}</span>
          <span className="text-sky-400">:</span>
          <span className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5 text-amber-300">
            {pad(time.seconds)}
          </span>
        </div>
      )}
    </div>
  );
}
