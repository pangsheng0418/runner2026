import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  Crown,
} from 'lucide-react';
import { apiRequest, setAdminToken } from '../api/client';
import TurLogo from '../components/TurLogo';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'super_admin' ? 'super_admin' : 'organizer';

  const [mode, setMode] = useState(initialMode); // 'organizer' | 'super_admin'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inputUnlocked, setInputUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 進入登入頁時清空殘留登入憑證與欄位，避免瀏覽器自動填入密碼讓外人直接登入
  useEffect(() => {
    setAdminToken('');
    setUsername('');
    setPassword('');
    setInputUnlocked(false);
  }, []);

  useEffect(() => {
    const queryMode = searchParams.get('mode');
    if (queryMode === 'super_admin' || queryMode === 'organizer') {
      setMode(queryMode);
      setUsername('');
      setPassword('');
      setInputUnlocked(false);
      setError('');
    }
  }, [searchParams]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setUsername('');
    setPassword('');
    setInputUnlocked(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password, loginMode: mode },
      });
      setAdminToken(res.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || '登入失敗，請確認帳號密碼與權限身分。');
    } finally {
      setLoading(false);
    }
  };

  const isSuperMode = mode === 'super_admin';

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
              <div>
                <h1 className="text-xl font-black text-white">
                  {isSuperMode ? '最高管理權限登入' : '承辦人登入'}
                </h1>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isSuperMode
                    ? '僅限最高管理權責進入，可註冊新承辦人與管理全平台'
                    : '請使用由最高管理權限配發之承辦人帳號登入'}
                </p>
              </div>
            </div>

            {/* 承辦人登入 / 最高管理權限 雙入口切換 */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => switchMode('organizer')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold transition ${
                  !isSuperMode
                    ? 'bg-gradient-to-r from-emerald-500 to-lime-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>承辦人登入</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('super_admin')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold transition ${
                  isSuperMode
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Crown className="h-3.5 w-3.5" />
                <span>最高管理權限</span>
              </button>
            </div>

            {isSuperMode && (
              <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-200">
                系統僅開放由「最高管理權限」帳號註冊新承辦人與管理權限設定。
              </div>
            )}

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form key={mode} onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  {isSuperMode ? '最高管理員帳號 *' : '承辦人帳號 *'}
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    name={`tur_acct_${mode}`}
                    required
                    readOnly={!inputUnlocked}
                    onFocus={() => setInputUnlocked(true)}
                    onPointerDown={() => setInputUnlocked(true)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={isSuperMode ? '請手動輸入最高管理員帳號' : '請手動輸入承辦人帳號'}
                    className={`w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:outline-none ${
                      isSuperMode ? 'focus:border-amber-400' : 'focus:border-lime-400'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">密碼 *</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    name={`tur_pass_${mode}`}
                    required
                    readOnly={!inputUnlocked}
                    onFocus={() => setInputUnlocked(true)}
                    onPointerDown={() => setInputUnlocked(true)}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請手動輸入密碼（系統禁止自動填入）"
                    className={`w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-3 text-sm text-white focus:outline-none ${
                      isSuperMode ? 'focus:border-amber-400' : 'focus:border-lime-400'
                    }`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black text-slate-950 disabled:opacity-60 transition ${
                  isSuperMode
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300'
                    : 'bg-gradient-to-r from-emerald-500 to-lime-400 hover:from-emerald-400 hover:to-lime-300'
                }`}
              >
                <span>
                  {loading
                    ? '驗證登入中...'
                    : isSuperMode
                    ? '進入最高管理權限後台'
                    : '登入承辦人後台'}
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
