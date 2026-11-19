import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
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
  X,
} from 'lucide-react';
import { apiRequest, setAdminToken } from '../api/client';

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
    slug: '',
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-slate-950">
                <Flame className="h-5 w-5 fill-slate-950" />
              </span>
              <div>
                <span className="font-display text-lg font-bold tracking-wider text-white">
                  RUN<span className="text-orange-500">FLOW</span> ADMIN
                </span>
                <p className="text-[10px] text-slate-400">路跑報名與試算表同步管理後台</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-sky-500 hover:text-sky-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">檢視前台</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-500 hover:text-rose-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>登出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-orange-500/50 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 space-y-8">
        {/* KPI 總覽卡 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">總活動場數</p>
            <p className="mt-2 font-mono text-3xl font-black text-white">{events.length}</p>
            <p className="mt-1 text-xs text-emerald-400">
              開放中：{events.filter((e) => e.is_active).length} 場
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">累計報名跑者</p>
            <p className="mt-2 font-mono text-3xl font-black text-orange-400">{totalRunners}</p>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> 跨所有活動統計
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">累計應收報名費</p>
            <p className="mt-2 font-mono text-3xl font-black text-sky-400">
              NT$ {totalRevenue.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> 含組別與加購金額
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Google Sheets API 憑證</p>
            <p className="mt-2 text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet
                className={`h-5 w-5 ${googleCreds.configured ? 'text-emerald-400' : 'text-amber-400'}`}
              />
              <span>{googleCreds.configured ? '已就緒（支援自動建表）' : '未設定 JSON（可用 GAS）'}</span>
            </p>
            {totalSyncErrors > 0 ? (
              <p className="mt-1 text-xs text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> 有 {totalSyncErrors} 筆待補送同步
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400 truncate">
                {googleCreds.serviceAccountEmail || '詳見 docs/GOOGLE_SHEETS_SETUP.md'}
              </p>
            )}
          </div>
        </div>

        {/* 活動管理標題與發起按鈕 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">路跑活動管理清單</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              建立活動將自動帶入完整路跑標準欄位，可於編輯頁自訂橫幅、拖曳表單與綁定獨立試算表。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-slate-950 hover:from-orange-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 transition"
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
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
            <p className="text-slate-400 mb-4">目前尚未建立任何路跑活動。</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400"
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
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 hover:border-slate-700 transition"
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
                          {ev.sync_error_count > 0 && (
                            <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
                              {ev.sync_error_count} 筆同步異常
                            </span>
                          )}
                        </div>

                        <h2 className="font-display text-xl font-bold text-white">{ev.name}</h2>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-orange-400" />
                            活動日期：{ev.event_date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-sky-400" />
                            已報名：{ev.registration_count}
                            {ev.max_participants > 0 ? ` / ${ev.max_participants} 人` : ' 人'}
                          </span>
                          <span className="font-mono text-orange-300 font-semibold">
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
                        className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-orange-400 transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>管理設定 / 表單 / 名單</span>
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

      {/* 新增活動 Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="font-display text-lg font-bold text-white">發起新路跑活動</h2>
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
                  placeholder="例如：2026 高雄港灣夜間星光路跑"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    專屬公開網址代碼（選填）
                  </label>
                  <input
                    type="text"
                    value={newForm.slug}
                    onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
                    placeholder="例如：kaohsiung-night-run"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">活動日期 *</label>
                  <input
                    type="date"
                    required
                    value={newForm.event_date}
                    onChange={(e) => setNewForm({ ...newForm, event_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
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
                    placeholder="例如：高雄流行音樂中心廣場"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <p className="rounded-xl bg-sky-950/30 border border-sky-500/30 px-3.5 py-2.5 text-xs text-sky-200">
                建立後將自動套用 12 項路跑常用預設欄位（含身分證驗證、報名組別計價、紀念衫尺寸與加購項目），並立即導向完整設計器。
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
                  className="rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-orange-400 disabled:opacity-60"
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
