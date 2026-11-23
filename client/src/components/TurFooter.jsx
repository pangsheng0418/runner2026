import React from 'react';
import { Link } from 'react-router-dom';

export default function TurFooter({ showOrganizerEntry = false }) {
  return (
    <footer className="mt-16 border-t border-slate-800/80 bg-slate-950/70 py-6 text-center text-xs text-slate-400">
      <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="font-medium">
          TUR (Taiwan Ultra Runners) 路跑活動線上報名平台 • 身份證字號全面隱碼保護
        </p>
        {showOrganizerEntry && (
          <Link
            to="/admin/login"
            className="text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            主辦單位發起活動／建立報名表
          </Link>
        )}
      </div>
    </footer>
  );
}
