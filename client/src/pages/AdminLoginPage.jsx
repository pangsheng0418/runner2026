import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  Building2,
  KeyRound,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { apiRequest, setAdminToken } from '../api/client';
import TurLogo from '../components/TurLogo';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [requireInviteCode, setRequireInviteCode] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest('/api/auth/register-config')
      .then((res) => {
        setRequireInviteCode(Boolean(res.requireInviteCode));
        setCloudConfigured(Boolean(res.cloudSync?.configured));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('兩次輸入的密碼不一致，請重新確認。');
        return;
      }
      if (password.length < 6) {
        setError('密碼長度至少需 6 個字元。');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? { username, password, displayName, inviteCode }
          : { username, password };

      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: payload,
      });
      setAdminToken(res.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || (mode === 'register' ? '註冊失敗，請確認輸入資料。' : '登入失敗，請確認帳號密碼。'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-lime-400 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回活動報名平台首頁
        </Link>

        <div className="tur-control-bar overflow-hidden rounded-2xl shadow-2xl">
          <div className="tur-accent-strip w-full" />
          <div className="p-7 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <TurLogo size="sm" />
              <h1 className="text-xl font-black text-white">
                {mode === 'login' ? '承辦人登入' : '註冊承辦人'}
              </h1>
            </div>

            {/* 登入 / 註冊切換分頁 */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`rounded-lg py-2 text-xs font-extrabold transition ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-emerald-500 to-lime-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                承辦人登入
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`inline-flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-extrabold transition ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>註冊新承辦人</span>
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    主辦單位 / 承辦人顯示名稱 *
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例如：台北路跑承辦小組 / 王小明"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">承辦人帳號 *</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === 'register' ? '3~32 碼英文小寫或數字（例：runner_org01）' : '請輸入承辦人帳號'}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">密碼 *</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? '請設定至少 6 位字元密碼' : '請輸入密碼'}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">確認密碼 *</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="請再次輸入密碼"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {mode === 'register' && requireInviteCode && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">承辦人開通授權碼 *</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="請輸入平台提供之承辦人授權碼"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-3.5 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60 transition"
              >
                <span>
                  {loading
                    ? '處理中...'
                    : mode === 'register'
                    ? '建立帳號'
                    : '登入'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
