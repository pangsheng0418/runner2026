import React from 'react';
import { CheckCircle2, AlertTriangle, Database, Clock } from 'lucide-react';

export default function SyncStatusBadge({ status, errorText }) {
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已同步試算表
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        title={errorText || '同步失敗'}
        className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300 cursor-help"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        同步異常（可重試）
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        <Clock className="h-3.5 w-3.5" />
        等待同步
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
      <Database className="h-3.5 w-3.5 text-sky-400" />
      本地儲存
    </span>
  );
}
