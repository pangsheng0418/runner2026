import React from 'react';
import { Link } from 'react-router-dom';

export default function TurFooter({ showOrganizerEntry = false }) {
  return (
    <footer className="mt-12 border-t border-slate-800/80 bg-slate-950/70 py-4 text-center text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>TUR 活動報名平台</p>
        {showOrganizerEntry && (
          <Link to="/admin/login" className="text-[11px] text-slate-500 hover:text-slate-300 transition">
            承辦人入口
          </Link>
        )}
      </div>
    </footer>
  );
}
