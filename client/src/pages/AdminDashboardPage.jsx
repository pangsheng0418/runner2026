import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ExternalLink,
  Copy,
  Check,
  Edit3,
  Trash2,
  Power,
  Users,
  DollarSign,
  Calendar,
  LogOut,
  FileSpreadsheet,
  AlertTriangle,
  Cpu,
  X,
} from 'lucide-react';
import { apiRequest, setAdminToken } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [googleCreds, setGoogleCreds] = useState({ configured: false, serviceAccountEmail: '' });
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState('');

  // 新增活動 Modal 狀態
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    english_name: '',
    slug: '',
    event_type: 'distance',
    timing_event_id: '',
    event_date: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    location: '',
    max_participants: 300,
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/events', { auth: true });
      setEvents(data.events || []);
      if (data.googleCredentials) setGoogleCreds(data.googleCredentials);
    } catch (err) {
      if (err.status === 401) {
        setAdminToken('');
        navigate('/admin/login', { replace: true });
      } else {
        showToast(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleCopyUrl = (ev) => {
    const url = `${window.location.origin}/register/${ev.slug}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(ev.id);
    showToast(`已複製公開報名連結：${url}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggle = async (ev) => {
    try {
      const res = await apiRequest(`/api/admin/events/${ev.id}/toggle`, {
        method: 'PATCH',
        auth: true,
      });
      setEvents((prev) => prev.map((item) => (item.id === ev.id ? res.event : item)));
      showToast(res.message);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDelete = async (ev) => {
    if (!window.confirm(`確定要刪除活動「${ev.name}」嗎？此操作將一併移除該活動的本地報名紀錄且無法復原。`)) {
      return;
    }
    try {
      const res = await apiRequest(`/api/admin/events/${ev.id}`, {
        method: 'DELETE',
        auth: true,
      });
      setEvents((prev) => prev.filter((item) => item.id !== ev.id));
      showToast(res.message);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await apiRequest('/api/admin/events', {
        method: 'POST',
        auth: true,
        body: {
          ...newForm,
          banner_title: newForm.name,
        },
      });
      setShowCreate(false);
      navigate(`/admin/events/${res.event.id}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    setAdminToken('');
    navigate('/admin/login', { replace: true });
  };

  const totalRunners = events.reduce((acc, ev) => acc + Number(ev.registration_count || 0), 0);
  const totalRevenue = events.reduce((acc, ev) => acc + Number(ev.total_revenue || 0), 0);
  const totalSyncErrors = events.reduce((acc, ev) => acc + Number(ev.sync_error_count || 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title="TUR 報名系統管理後台"
        subtitle="活動表單設計・Google 試算表雙向同步・獨立晶片計時名單串接"
        statusLabel="管理員已驗證"
        showAdminLink={false}
        showHomeLink
        rightSlot={
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-500 hover:text-rose-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>登出</span>
          </button>
        }
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-lime-400/50 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pt-8 space-y-8">
        {/* KPI 總覽卡 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="tur-control-bar rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">總活動場數</p>
            <p className="mt-2 font-mono-num text-3xl font-black text-white">{events.length}</p>
            <p className="mt-1 text-xs text-emerald-400">
              開放中：{events.filter((e) => e.is_active).length} 場
            </p>
          </div>
          <div className="tur-control-bar rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">累計報名跑者</p>
            <p className="mt-2 font-mono-num text-3xl font-black text-lime-400">{totalRunners}</p>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-sky-400" /> 跨所有活動統計
            </p>
          </div>
          <div className="tur-control-bar rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">累計應收報名費</p>
            <p className="mt-2 font-mono-num text-3xl font-black text-amber-300">
              NT$ {totalRevenue.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-amber-400" /> 含組別與加購金額
            </p>
          </div>
          <div className="tur-control-bar rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Google Sheets 憑證</p>
            <p className="mt-2 text-base font-black text-white flex items-center gap-2">
              <FileSpreadsheet
                className={`h-5 w-5 ${googleCreds.configured ? 'text-emerald-400' : 'text-amber-400'}`}
              />
              <span>{googleCreds.configured ? '已就緒（支援建分頁）' : '未設定（可用 GAS）'}</span>
            </p>
            {totalSyncErrors > 0 ? (
              <p className="mt-1 text-xs text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> 有 {totalSyncErrors} 筆待補送同步
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400 truncate font-mono-num">
                {googleCreds.serviceAccountEmail || '詳見 docs/GOOGLE_SHEETS_SETUP.md'}
              </p>
            )}
          </div>
        </div>

        {/* 活動管理標題與發起按鈕 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-wide text-white">TUR 路跑活動管理清單</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              建立活動自動載入 TUR 標準欄位（含晶片組別代碼、居住縣市與國籍），可一鍵自動配號與匯出晶片計時名單。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-3 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 shadow-lg shadow-emerald-950/50 transition"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>發起新路跑活動</span>
          </button>
        </div>

        {/* 活動卡片清單 */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="tur-control-bar rounded-2xl p-12 text-center">
            <p className="text-slate-400 mb-4">目前尚未建立任何路跑活動。</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
            >
              立即發起第一場活動
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((ev) => {
              const publicPath = `/register/${ev.slug}`;
              const syncLabel =
                ev.sheet_sync_mode === 'api'
                  ? 'Google Sheets API'
                  : ev.sheet_sync_mode === 'webhook'
                  ? 'GAS Webhook'
                  : '本地展示模式';

              return (
                <div
                  key={ev.id}
                  className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 hover:border-lime-400/40 transition"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <img
                        src={
                          ev.banner_image_url ||
                          'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=400&q=60'
                        }
                        alt={ev.name}
                        className="hidden sm:block h-20 w-32 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              ev.is_active
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-700/60 text-slate-400 border border-slate-600'
                            }`}
                          >
                            {ev.is_active ? '● 啟用中' : '○ 已關閉'}
                          </span>
                          <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                            {syncLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 border border-lime-400/30 px-2.5 py-0.5 font-mono-num text-[11px] font-semibold text-lime-300">
                            <Cpu className="h-3 w-3" />
                            {ev.event_type === 'lap_timed' ? '繞圈限時' : '距離賽'} · {ev.timing_event_id || ev.slug}
                          </span>
                          {ev.sync_error_count > 0 && (
                            <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
                              {ev.sync_error_count} 筆同步異常
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl font-black text-white">{ev.name}</h2>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-lime-400" />
                            活動日期：{ev.event_date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-sky-400" />
                            已報名：{ev.registration_count}
                            {ev.max_participants > 0 ? ` / ${ev.max_participants} 人` : ' 人'}
                          </span>
                          <span className="font-mono-num text-amber-300 font-bold">
                            累計 NT$ {Number(ev.total_revenue || 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <code className="rounded bg-slate-950 px-2 py-1 text-sky-300 border border-slate-800">
                            {window.location.origin}
                            {publicPath}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(ev)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                          >
                            {copiedId === ev.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                已複製
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                複製報名網址
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 右側操作按鈕 */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link
                        to={`/admin/events/${ev.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>管理設定 / 表單 / 晶片串接</span>
                      </Link>
                      <Link
                        to={publicPath}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>前台頁</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggle(ev)}
                        title={ev.is_active ? '暫停關閉報名' : '重新啟用活動'}
                        className={`rounded-xl border p-2.5 transition ${
                          ev.is_active
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ev)}
                        title="刪除活動"
                        className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-400 hover:border-rose-500/50 hover:bg-rose-950/50 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <TurFooter />

      {/* 新增活動 Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="tur-control-bar w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-lg font-black text-white">發起新 TUR 路跑活動</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">活動名稱 *</label>
                <input
                  type="text"
                  required
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="例如：2026 TUR 八百壯士極東霸主超級馬拉松"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  英文賽事名稱（選填・供晶片系統雙語證書使用）
                </label>
                <input
                  type="text"
                  value={newForm.english_name}
                  onChange={(e) => setNewForm({ ...newForm, english_name: e.target.value })}
                  placeholder="例如：2026 TUR ULTRA MARATHON"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    賽事計時模式（對接晶片系統）
                  </label>
                  <select
                    value={newForm.event_type}
                    onChange={(e) => setNewForm({ ...newForm, event_type: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  >
                    <option value="distance">標準距離賽 (Distance)</option>
                    <option value="lap_timed">繞圈限時賽 (Lap Timed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    晶片系統活動代碼（選填）
                  </label>
                  <input
                    type="text"
                    value={newForm.timing_event_id}
                    onChange={(e) => setNewForm({ ...newForm, timing_event_id: e.target.value })}
                    placeholder="例如：TUR-2026-ULTRA"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-lime-300 focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    公開網址代碼（選填）
                  </label>
                  <input
                    type="text"
                    value={newForm.slug}
                    onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
                    placeholder="例如：tur-ultra-2026"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">活動日期 *</label>
                  <input
                    type="date"
                    required
                    value={newForm.event_date}
                    onChange={(e) => setNewForm({ ...newForm, event_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">活動起終點地點</label>
                  <input
                    type="text"
                    value={newForm.location}
                    onChange={(e) => setNewForm({ ...newForm, location: e.target.value })}
                    placeholder="例如：台北河濱公園"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    人數上限（0 = 不限）
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newForm.max_participants}
                    onChange={(e) =>
                      setNewForm({ ...newForm, max_participants: Number(e.target.value || 0) })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              <p className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 px-3.5 py-2.5 text-xs text-emerald-200">
                建立後將自動套用 TUR 標準表單欄位（含身分證驗證、晶片分組代碼、縣市/國籍與加購項目），與晶片系統 100% 欄位對齊！
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-xs font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60"
                >
                  {creating ? '建立中...' : '建立並進入設計器'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
