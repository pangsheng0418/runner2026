import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Lock, User, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { apiRequest, setAdminToken } from '../api/client';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setAdminToken(res.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || '登入失敗，請確認帳號密碼。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 track-stripes flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-orange-400 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回前台活動首頁
        </Link>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 via-amber-400 to-blue-500" />
          <div className="p-7 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-slate-950">
                <Flame className="h-6 w-6 fill-slate-950" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold text-white">RunFlow 後台登入</h1>
                <p className="text-xs text-slate-400">路跑活動管理・動態表單・試算表同步</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">管理員帳號</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="請輸入管理員帳號"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">管理員密碼</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請輸入密碼"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3.5 text-sm font-black text-slate-950 hover:from-orange-400 hover:to-orange-500 disabled:opacity-60 transition"
              >
                <span>{loading ? '驗證中...' : '登入後台管理中心'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* 測試用帳號提示 */}
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs text-slate-400">
              <p className="font-bold text-slate-300 mb-1">預設測試管理員帳號：</p>
              <div className="flex items-center justify-between font-mono">
                <span>帳號：admin</span>
                <span>密碼：runner2026</span>
                <button
                  type="button"
                  onClick={() => {
                    setUsername('admin');
                    setPassword('runner2026');
                  }}
                  className="text-orange-400 hover:underline font-sans font-bold"
                >
                  一鍵帶入
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
