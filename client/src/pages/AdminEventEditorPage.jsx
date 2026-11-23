import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  ExternalLink,
  Settings,
  Image as ImageIcon,
  ListChecks,
  FileSpreadsheet,
  Users,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Copy,
  Sparkles,
  Loader2,
  Eye,
  Cpu,
  Hash,
  Send,
  Database,
  X,
} from 'lucide-react';
import { apiRequest, getAdminToken, setAdminToken } from '../api/client';
import TurLogo from '../components/TurLogo';
import BannerHero from '../components/BannerHero';
import FormBuilder from '../components/FormBuilder';
import SyncStatusBadge from '../components/SyncStatusBadge';

const PRESET_BANNERS = [
  {
    name: '城市清晨跑道',
    url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '馬拉松集體起跑',
    url: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '夜間疾速街跑',
    url: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '田徑場跑道衝刺',
    url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1600&q=80',
  },
];

export default function AdminEventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('basic');
  const [event, setEvent] = useState(null);
  const [googleCreds, setGoogleCreds] = useState({ configured: false, serviceAccountEmail: '' });
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sheetBusy, setSheetBusy] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReg, setSelectedReg] = useState(null);

  // 晶片系統對接頁狀態
  const [chipPaidOnly, setChipPaidOnly] = useState(true);
  const [chipAdminUser, setChipAdminUser] = useState('');
  const [chipAdminPass, setChipAdminPass] = useState('');
  const [chipPreview, setChipPreview] = useState([]);
  const [editingBibId, setEditingBibId] = useState(null);
  const [editingBibVal, setEditingBibVal] = useState('');

  const showNotice = (type, text) => {
    setNotice({ type, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchEventData = async () => {
    setLoading(true);
    try {
      const [evRes, regRes] = await Promise.all([
        apiRequest(`/api/admin/events/${id}`, { auth: true }),
        apiRequest(`/api/admin/events/${id}/registrations`, { auth: true }),
      ]);
      setEvent(evRes.event);
      if (evRes.googleCredentials) setGoogleCreds(evRes.googleCredentials);
      setRegistrations(regRes.registrations || []);
    } catch (err) {
      if (err.status === 401) {
        setAdminToken('');
        navigate('/admin/login', { replace: true });
      } else {
        showNotice('error', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventData();
  }, [id]);

  // 切到晶片連結頁時即時載入轉換預覽
  useEffect(() => {
    if (tab === 'chip' && id) {
      apiRequest(`/api/admin/events/${id}/registrations/chip-preview?paidOnly=${chipPaidOnly}`, {
        auth: true,
      })
        .then((res) => setChipPreview(res.registrations || []))
        .catch(() => {});
    }
  }, [tab, id, chipPaidOnly, registrations]);

  const updateEventField = (key, value) => {
    setEvent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (syncHeaders = false) => {
    if (!event) return;
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await apiRequest(`/api/admin/events/${id}`, {
        method: 'PUT',
        auth: true,
        body: {
          ...event,
          syncHeaders,
        },
      });
      setEvent(res.event);
      showNotice(res.warning ? 'warning' : 'success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('banner', file);
      const res = await apiRequest(`/api/admin/events/${id}/upload-banner`, {
        method: 'POST',
        auth: true,
        isFormData: true,
        body: fd,
      });
      updateEventField('banner_image_url', res.banner_image_url);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleLoadDefaultFields = async () => {
    if (!window.confirm('確定要重設為 TUR 路跑標準預設欄位嗎？（記得按「儲存變更」套用）')) {
      return;
    }
    try {
      const res = await apiRequest('/api/admin/events/default-fields', { auth: true });
      updateEventField('fields', res.fields);
      showNotice('success', '已套用 TUR 路跑標準預設欄位，請點擊右上角「儲存變更」完成保存。');
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleAutoCreateSheet = async () => {
    setSheetBusy('create');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/sheets/auto-create`, {
        method: 'POST',
        auth: true,
        body: {
          sheet_url: event.sheet_url,
          sheet_id: event.sheet_id,
          sheet_tab_name: event.sheet_tab_name,
        },
      });
      setEvent(res.event);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  const handleTestSheet = async () => {
    setSheetBusy('test');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/sheets/test`, {
        method: 'POST',
        auth: true,
        body: {
          sheet_sync_mode: event.sheet_sync_mode,
          sheet_id: event.sheet_id,
          sheet_url: event.sheet_url,
          sheet_tab_name: event.sheet_tab_name,
          gas_webhook_url: event.gas_webhook_url,
        },
      });
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  const handleSyncHeaders = async () => {
    setSheetBusy('headers');
    try {
      await handleSave(true);
    } finally {
      setSheetBusy('');
    }
  };

  const handlePullFromSheet = async () => {
    setSheetBusy('pull');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/registrations/pull-from-sheet`, {
        method: 'POST',
        auth: true,
      });
      await fetchEventData();
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  const handleRetrySync = async () => {
    setSheetBusy('retry');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/registrations/retry-sync`, {
        method: 'POST',
        auth: true,
      });
      await fetchEventData();
      showNotice(res.failCount > 0 ? 'warning' : 'success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  const handlePaymentStatusChange = async (regId, nextStatus) => {
    try {
      const res = await apiRequest(`/api/admin/registrations/${regId}/payment-status`, {
        method: 'PATCH',
        auth: true,
        body: { payment_status: nextStatus },
      });
      setRegistrations((prev) => prev.map((r) => (r.id === regId ? res.registration : r)));
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleSaveBib = async (regId) => {
    try {
      const res = await apiRequest(`/api/admin/registrations/${regId}/bib`, {
        method: 'PATCH',
        auth: true,
        body: { bib_number: editingBibVal },
      });
      setRegistrations((prev) => prev.map((r) => (r.id === regId ? res.registration : r)));
      setEditingBibId(null);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleAutoAssignBibs = async (paidOnly = false) => {
    setSheetBusy('bib');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/registrations/auto-assign-bibs`, {
        method: 'POST',
        auth: true,
        body: { paidOnly, overwrite: false },
      });
      setRegistrations(res.registrations || []);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  const handleExportCsv = async (isChipFormat = false, paidOnly = false) => {
    try {
      const token = getAdminToken();
      const endpoint = isChipFormat
        ? `/api/admin/events/${id}/registrations/export-chip-csv?paidOnly=${paidOnly}`
        : `/api/admin/events/${id}/registrations/export-csv`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('匯出 CSV 失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isChipFormat
        ? `${event?.timing_event_id || event?.slug}-TUR晶片系統匯入名單.csv`
        : `${event?.name || 'event'}-報名名單.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showNotice(
        'success',
        isChipFormat
          ? '已下載 TUR 晶片計時系統專用名單（可直接匯入 runchip-timing 後台）！'
          : '已下載完整報名名單 CSV！'
      );
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handlePushToChipSystem = async (e) => {
    e.preventDefault();
    setSheetBusy('push');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/registrations/push-to-chip`, {
        method: 'POST',
        auth: true,
        body: {
          paidOnly: chipPaidOnly,
          timing_gas_url: event.timing_gas_url,
          chip_admin_username: chipAdminUser,
          chip_admin_password: chipAdminPass,
        },
      });
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSheetBusy('');
    }
  };

  if (loading || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-lime-400 mr-2" />
        載入 TUR 活動設定中...
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/register/${event.slug}`;
  const integrationApiUrl = `${window.location.origin}/api/integration/events/${event.slug}/roster?paidOnly=true`;
  const filteredRegs = registrations.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(r.reg_code).toLowerCase().includes(q) ||
      String(r.bib_number || '').toLowerCase().includes(q) ||
      String(r.runner_name).toLowerCase().includes(q) ||
      String(r.runner_phone).toLowerCase().includes(q) ||
      String(r.runner_email).toLowerCase().includes(q) ||
      String(r.runner_id_number).toLowerCase().includes(q)
    );
  });

  const tabs = [
    { key: 'basic', label: '基本設定與網址', icon: Settings },
    { key: 'banner', label: '橫幅 Banner 自訂', icon: ImageIcon },
    { key: 'form', label: `動態表單 (${event.fields?.length || 0})`, icon: ListChecks },
    { key: 'sheets', label: 'Google 試算表', icon: FileSpreadsheet },
    { key: 'registrations', label: `報名名單 (${registrations.length})`, icon: Users },
    { key: 'chip', label: '晶片系統連結', icon: Cpu },
  ];

  return (
    <div className="min-h-screen pb-20">
      {/* 頂部操作列 */}
      <header className="sticky top-0 z-30 tur-header-bar">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/admin"
              className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-lime-400 hover:text-lime-300 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="hidden sm:block">
              <TurLogo size="sm" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">{event.name}</h1>
              <p className="text-[11px] text-slate-400 font-mono-num truncate">{publicUrl}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/register/${event.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 hover:border-sky-400 hover:text-sky-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">預覽前台</span>
            </Link>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60 shadow-lg shadow-emerald-950/50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? '儲存中...' : '儲存變更'}</span>
            </button>
          </div>
        </div>

        {/* 分頁選單 */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 overflow-x-auto">
          <nav className="flex gap-1 border-t border-slate-800/80 pt-1.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs sm:text-sm font-bold transition ${
                    active
                      ? 'border-lime-400 text-lime-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="tur-accent-strip w-full" />
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 mt-6 space-y-6">
        {/* 系統通知橫幅 */}
        {notice.text && (
          <div
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              notice.type === 'error'
                ? 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                : notice.type === 'warning'
                ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                : 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              )}
              <span>{notice.text}</span>
            </div>
            <button type="button" onClick={() => setNotice({ type: '', text: '' })}>
              <X className="h-4 w-4 opacity-70 hover:opacity-100" />
            </button>
          </div>
        )}

        {/* ==================== TAB 1: 基本設定 ==================== */}
        {tab === 'basic' && (
          <div className="tur-control-bar rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
              <div>
                <p className="text-xs font-bold text-sky-300">專屬公開報名網址（可直接對外公告）</p>
                <p className="font-mono-num text-sm text-white mt-0.5 break-all">{publicUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(publicUrl);
                  showNotice('success', '已複製公開報名網址到剪貼簿！');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-black text-slate-950 hover:bg-sky-400"
              >
                <Copy className="h-3.5 w-3.5" />
                複製連結
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">活動名稱 *</label>
                <input
                  type="text"
                  value={event.name || ''}
                  onChange={(e) => updateEventField('name', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  英文賽事名稱（對接晶片系統雙語證書）
                </label>
                <input
                  type="text"
                  value={event.english_name || ''}
                  onChange={(e) => updateEventField('english_name', e.target.value)}
                  placeholder="2026 TUR TAIWAN ULTRA SPEED CHALLENGE"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  公開網址代碼（Slug）
                </label>
                <input
                  type="text"
                  value={event.slug || ''}
                  onChange={(e) => updateEventField('slug', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono-num text-sm text-sky-300 focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  賽事計時模式（與 TUR 晶片計時系統一致）
                </label>
                <select
                  value={event.event_type || 'distance'}
                  onChange={(e) => updateEventField('event_type', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                >
                  <option value="distance">標準距離賽（Distance・全馬/半馬/超馬）</option>
                  <option value="lap_timed">繞圈限時賽（Lap Timed・6H/12H/24H）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">活動日期</label>
                <input
                  type="date"
                  value={event.event_date || ''}
                  onChange={(e) => updateEventField('event_date', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">起終點地點</label>
                <input
                  type="text"
                  value={event.location || ''}
                  onChange={(e) => updateEventField('location', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">報名開始時間</label>
                <input
                  type="datetime-local"
                  value={(event.reg_start_at || '').slice(0, 16)}
                  onChange={(e) => updateEventField('reg_start_at', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">報名截止時間</label>
                <input
                  type="datetime-local"
                  value={(event.reg_end_at || '').slice(0, 16)}
                  onChange={(e) => updateEventField('reg_end_at', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  報名人數上限（填 0 代表不限制）
                </label>
                <input
                  type="number"
                  min={0}
                  value={event.max_participants ?? 0}
                  onChange={(e) => updateEventField('max_participants', Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono-num text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-bold text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(event.is_active)}
                    onChange={(e) => updateEventField('is_active', e.target.checked)}
                    className="h-5 w-5 accent-lime-400"
                  />
                  <span>啟用此活動（公開頁面可瀏覽與報名）</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">活動簡介說明</label>
              <textarea
                rows={3}
                value={event.description || ''}
                onChange={(e) => updateEventField('description', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                繳費方式與匯款說明（顯示於報名成功確認頁）
              </label>
              <textarea
                rows={4}
                value={event.payment_info || ''}
                onChange={(e) => updateEventField('payment_info', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 2: Banner 自訂 ==================== */}
        {tab === 'banner' && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-lime-400 mb-2">
                前台頂部橫幅即時預覽
              </p>
              <BannerHero event={event} compact />
            </div>

            <div className="tur-control-bar rounded-2xl p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    橫幅活動主標題
                  </label>
                  <input
                    type="text"
                    value={event.banner_title || ''}
                    onChange={(e) => updateEventField('banner_title', e.target.value)}
                    placeholder="例如：2026 TUR 台灣超馬疾速城市挑戰賽"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    橫幅副標題 / 活動標語
                  </label>
                  <input
                    type="text"
                    value={event.banner_subtitle || ''}
                    onChange={(e) => updateEventField('banner_subtitle', e.target.value)}
                    placeholder="例如：Taiwan Ultra Runners 官方賽事"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  橫幅背景圖片網址（建議使用公開圖片網址以長期保存）
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={event.banner_image_url || ''}
                    onChange={(e) => updateEventField('banner_image_url', e.target.value)}
                    placeholder="https://... 或上傳圖片"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                  />
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-sky-400 transition shrink-0">
                    <Upload className="h-4 w-4" />
                    <span>{uploading ? '上傳中...' : '上傳圖片檔案'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleBannerUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 mb-2">內建路跑風格精選背景（點擊套用）</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PRESET_BANNERS.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => updateEventField('banner_image_url', item.url)}
                      className={`group overflow-hidden rounded-xl border text-left transition ${
                        event.banner_image_url === item.url
                          ? 'border-lime-400 ring-2 ring-lime-400/40'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <img src={item.url} alt={item.name} className="h-20 w-full object-cover" />
                      <p className="bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-200">
                        {item.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: 動態表單設計器 ==================== */}
        {tab === 'form' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              可拖曳卡片調整欄位順序、增刪欄位、設定計價與晶片分組代碼。點擊右上角「儲存變更」後將同步更新對應 Google 試算表表頭。
            </p>
            <FormBuilder
              fields={event.fields || []}
              onChange={(nextFields) => updateEventField('fields', nextFields)}
              onLoadDefaultFields={handleLoadDefaultFields}
            />
          </div>
        )}

        {/* ==================== TAB 4: Google 試算表雙向同步 ==================== */}
        {tab === 'sheets' && (
          <div className="tur-control-bar rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-xl font-black text-white">
                活動專屬 Google 試算表綁定與雙向同步
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                本報名系統擁有獨立的 Google 試算表與資料庫，不影響晶片計時系統運作。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: 'api',
                  title: '模式 A：Google Sheets API',
                  desc: '使用 GCP Service Account 憑證，支援一鍵自動建立該活動專屬分頁與雙向讀寫。',
                },
                {
                  id: 'webhook',
                  title: '模式 B：GAS Webhook',
                  desc: '免開 GCP 專案！貼上 Google Apps Script 網頁應用程式網址即可雙向同步。',
                },
                {
                  id: 'local',
                  title: '模式 C：本地展示模式',
                  desc: '未設定 Google 憑證時使用本地資料庫儲存，隨時可匯出 CSV 或切換雲端。',
                },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateEventField('sheet_sync_mode', m.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    event.sheet_sync_mode === m.id
                      ? 'border-lime-400 bg-lime-500/10 ring-2 ring-lime-400/25'
                      : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                  }`}
                >
                  <p className="font-bold text-sm text-white">{m.title}</p>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{m.desc}</p>
                </button>
              ))}
            </div>

            {event.sheet_sync_mode === 'api' && (
              <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/75 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-slate-300">伺服器憑證狀態：</span>
                    {googleCreds.configured ? (
                      <>
                        <span className="text-emerald-400 font-bold">
                          已載入（{googleCreds.serviceAccountEmail}）
                        </span>
                        {googleCreds.serviceAccountEmail && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(googleCreds.serviceAccountEmail);
                              showNotice('success', '已複製機器人 Email！請到試算表右上角「共用」加入並設為「編輯者」。');
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-semibold text-sky-300 hover:bg-slate-700"
                          >
                            <Copy className="h-3 w-3" />
                            複製機器人 Email
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-400 font-bold">
                        尚未偵測到憑證（請設定環境變數或 credentials/google-service-account.json）
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoCreateSheet}
                    disabled={Boolean(sheetBusy) || !googleCreds.configured}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {sheetBusy === 'create' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span>
                      {event.sheet_url || event.sheet_id || googleCreds.masterSheetConfigured
                        ? '一鍵自動建立專屬工作表分頁與表頭'
                        : '一鍵自動建立專屬 Google 試算表'}
                    </span>
                  </button>
                </div>

                <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-xs text-sky-200 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sky-300">
                      免費個人 Gmail 快速建立步驟（避開 Google 服務帳戶 0GB 建檔限制）：
                    </span>
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-sky-400"
                    >
                      <ExternalLink className="h-3 w-3" />
                      1. 點此開新空白試算表
                    </a>
                  </div>
                  <p className="text-slate-300">
                    2. 開啟後點右上角「共用」，加入上方機器人 Email 並設為「編輯者」 → 3. 把瀏覽器網址貼到下方欄位 → 點綠色「一鍵自動建立專屬工作表分頁與表頭」即可完成！
                    {googleCreds.masterSheetConfigured && (
                      <span className="ml-1 font-bold text-emerald-300">
                        （已偵測到母試算表 GOOGLE_MASTER_SHEET_ID，可直接點擊綠色按鈕！）
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      Google 試算表連結或 Spreadsheet ID
                    </label>
                    <input
                      type="text"
                      value={event.sheet_url || event.sheet_id || ''}
                      onChange={(e) => {
                        updateEventField('sheet_url', e.target.value);
                        updateEventField('sheet_id', e.target.value);
                      }}
                      placeholder="貼上 https://docs.google.com/spreadsheets/d/.../edit 或純 ID"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 font-mono-num text-xs text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      工作表分頁名稱
                    </label>
                    <input
                      type="text"
                      value={event.sheet_tab_name || '報名資料'}
                      onChange={(e) => updateEventField('sheet_tab_name', e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {event.sheet_sync_mode === 'webhook' && (
              <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/75 p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      Google Apps Script Webhook 網址（以 /exec 結尾）
                    </label>
                    <input
                      type="url"
                      value={event.gas_webhook_url || ''}
                      onChange={(e) => updateEventField('gas_webhook_url', e.target.value)}
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 font-mono-num text-xs text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      工作表分頁名稱
                    </label>
                    <input
                      type="text"
                      value={event.sheet_tab_name || '報名資料'}
                      onChange={(e) => updateEventField('sheet_tab_name', e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestSheet}
                disabled={Boolean(sheetBusy)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
              >
                {sheetBusy === 'test' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span>測試連線</span>
              </button>

              <button
                type="button"
                onClick={handleSyncHeaders}
                disabled={Boolean(sheetBusy) || event.sheet_sync_mode === 'local'}
                className="inline-flex items-center gap-1.5 rounded-xl border border-lime-500/40 bg-lime-500/15 px-4 py-2.5 text-xs font-bold text-lime-300 hover:bg-lime-500/25 disabled:opacity-40"
              >
                {sheetBusy === 'headers' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>儲存並同步表頭至試算表</span>
              </button>

              {event.sheet_url && (
                <a
                  href={event.sheet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>開啟 Google 試算表</span>
                </a>
              )}
            </div>

            {event.last_sheet_sync_at && (
              <p className="text-xs text-slate-400">
                最後同步時間：<span className="font-mono-num text-slate-200">{event.last_sheet_sync_at}</span>
              </p>
            )}
          </div>
        )}

        {/* ==================== TAB 5: 報名名單與配號 ==================== */}
        {tab === 'registrations' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋參賽編號、報名序號、姓名、電話或身分證..."
                className="w-full sm:w-80 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white focus:border-lime-400 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAutoAssignBibs(false)}
                  disabled={Boolean(sheetBusy)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-3.5 py-2 text-xs font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-40"
                >
                  <Hash className="h-3.5 w-3.5" />
                  <span>一鍵自動配號 (Bib)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCsv(true, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>匯出晶片系統專用 CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handlePullFromSheet}
                  disabled={Boolean(sheetBusy) || event.sheet_sync_mode === 'local'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${sheetBusy === 'pull' ? 'animate-spin' : ''}`} />
                  <span>從試算表拉取</span>
                </button>

                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={Boolean(sheetBusy) || event.sheet_sync_mode === 'local'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>補送試算表</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCsv(false, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>完整 CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/85 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">參賽編號 (Bib)</th>
                    <th className="px-4 py-3">報名序號</th>
                    <th className="px-4 py-3">跑者姓名 / 隱碼證號</th>
                    <th className="px-4 py-3">組別代碼</th>
                    <th className="px-4 py-3">應繳金額</th>
                    <th className="px-4 py-3">繳費狀態</th>
                    <th className="px-4 py-3">試算表同步</th>
                    <th className="px-4 py-3 text-right">明細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredRegs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        查無符合條件的報名資料。
                      </td>
                    </tr>
                  ) : (
                    filteredRegs.map((reg) => (
                      <tr key={reg.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {editingBibId === reg.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingBibVal}
                                onChange={(e) => setEditingBibVal(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveBib(reg.id);
                                  if (e.key === 'Escape') setEditingBibId(null);
                                }}
                                autoFocus
                                className="w-20 rounded border border-lime-400 bg-slate-950 px-2 py-1 font-mono-num text-xs font-bold text-lime-300 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveBib(reg.id)}
                                className="rounded bg-lime-400 px-2 py-1 text-[11px] font-black text-slate-950"
                              >
                                存
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBibId(reg.id);
                                setEditingBibVal(reg.bib_number || '');
                              }}
                              title="點擊修改參賽編號"
                              className={`rounded-lg border px-2.5 py-1 font-mono-num text-xs font-black transition ${
                                reg.bib_number
                                  ? 'border-lime-400/40 bg-lime-500/15 text-lime-300 hover:border-lime-400'
                                  : 'border-dashed border-slate-600 bg-slate-950 text-slate-400 hover:text-white'
                              }`}
                            >
                              {reg.bib_number || '未配號'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono-num font-bold text-sky-300 whitespace-nowrap">
                          {reg.reg_code}
                          <div className="text-[10px] font-normal text-slate-500">{reg.created_at}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">
                          {reg.runner_name || '—'}
                          <div className="text-[11px] font-mono-num text-slate-400">
                            {reg.id_masked || reg.runner_id_number}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono-num text-xs font-bold text-emerald-300">
                            {reg.category_code || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono-num font-bold text-amber-300 whitespace-nowrap">
                          NT$ {Number(reg.total_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={reg.payment_status}
                            onChange={(e) => handlePaymentStatusChange(reg.id, e.target.value)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-bold focus:outline-none ${
                              reg.payment_status === '已繳費'
                                ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                                : reg.payment_status === '已取消'
                                ? 'border-rose-500/40 bg-rose-950/60 text-rose-300'
                                : 'border-amber-500/40 bg-amber-950/60 text-amber-300'
                            }`}
                          >
                            <option value="待繳費">待繳費</option>
                            <option value="已繳費">已繳費</option>
                            <option value="已取消">已取消</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <SyncStatusBadge
                            status={reg.sheet_sync_status}
                            errorText={reg.sheet_sync_error}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReg(reg)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            檢視
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: TUR 晶片計時系統連結（獨立資料庫串接） ==================== */}
        {tab === 'chip' && (
          <div className="space-y-6">
            {/* 架構說明卡 */}
            <div className="tur-control-bar rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 mb-2">
                    <Database className="h-3.5 w-3.5" />
                    雙系統獨立資料庫架構（鬆耦合・安全穩定）
                  </div>
                  <h2 className="text-xl font-black text-white">
                    TUR 晶片計時系統資料串接中心
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    本報名平台與 <code className="text-emerald-300">runchip-timing.vercel.app</code> 各自使用獨立資料庫，報名完成並確認繳費後，可透過下方 3 種方式無縫對接參賽名單。
                  </p>
                </div>

                <a
                  href={event.timing_portal_url || 'https://runchip-timing.vercel.app/'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                  開啟 TUR 晶片計時平台
                </a>
              </div>

              {/* 晶片對應基本參數 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    晶片系統對應活動代碼 (eventId)
                  </label>
                  <input
                    type="text"
                    value={event.timing_event_id || ''}
                    onChange={(e) => updateEventField('timing_event_id', e.target.value)}
                    placeholder="例如：TUR-2026-SPEED"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-lime-300 focus:border-lime-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    TUR 晶片計時平台前台網址
                  </label>
                  <input
                    type="url"
                    value={event.timing_portal_url || 'https://runchip-timing.vercel.app/'}
                    onChange={(e) => updateEventField('timing_portal_url', e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-xs text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    晶片系統 GAS 同步網址（未來一鍵推送用・選填）
                  </label>
                  <input
                    type="url"
                    value={event.timing_gas_url || ''}
                    onChange={(e) => updateEventField('timing_gas_url', e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-xs text-white focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 三大串接工具卡片 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 方式 1：自動配號 + 專用 CSV */}
              <div className="tur-card rounded-2xl border border-emerald-500/35 bg-slate-900/90 p-5 space-y-4">
                <div className="flex items-center gap-2 text-emerald-300 font-black">
                  <Download className="h-5 w-5" />
                  <span>方式 1：一鍵匯出晶片系統專用 CSV（最穩）</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  自動對齊 <code className="text-slate-200">參賽編號、姓名、身份證字號、分組代碼、性別(M/F)、出生年月日、縣市、國家</code>，下載後直接拖進晶片系統「選手名單 → 批次匯入」即可！
                </p>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chipPaidOnly}
                    onChange={(e) => setChipPaidOnly(e.target.checked)}
                    className="h-4 w-4 accent-lime-400"
                  />
                  <span>僅匯出 / 推送「已繳費」跑者（目前 {chipPreview.length} 位）</span>
                </label>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAutoAssignBibs(chipPaidOnly)}
                    disabled={Boolean(sheetBusy)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-lime-400/40 bg-lime-500/15 px-4 py-2.5 text-xs font-bold text-lime-300 hover:bg-lime-500/25"
                  >
                    <Hash className="h-4 w-4" />
                    <span>步驟 A：依組別自動配號 (Bib)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv(true, chipPaidOnly)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300"
                  >
                    <Download className="h-4 w-4" />
                    <span>步驟 B：下載 TUR 晶片專用匯入 CSV</span>
                  </button>
                </div>
              </div>

              {/* 方式 2：一鍵推送至晶片系統 GAS (upsertRegistrations) */}
              <form
                onSubmit={handlePushToChipSystem}
                className="tur-card rounded-2xl border border-sky-500/35 bg-slate-900/90 p-5 space-y-3"
              >
                <div className="flex items-center gap-2 text-sky-300 font-black">
                  <Send className="h-5 w-5" />
                  <span>方式 2：一鍵推送至晶片系統 (GAS API)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  呼叫晶片系統的 <code className="text-sky-300">upsertRegistrations</code> 接口直接推送已配號名單（帳密僅本次傳送授權，不會存入本系統資料庫）。
                </p>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={chipAdminUser}
                    onChange={(e) => setChipAdminUser(e.target.value)}
                    placeholder="晶片系統管理員帳號"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={chipAdminPass}
                    onChange={(e) => setChipAdminPass(e.target.value)}
                    placeholder="晶片系統管理員密碼"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={Boolean(sheetBusy) || !event.timing_gas_url}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 disabled:opacity-40"
                >
                  {sheetBusy === 'push' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>推送 {chipPreview.length} 位跑者至晶片系統</span>
                </button>
                {!event.timing_gas_url && (
                  <p className="text-[11px] text-amber-300">
                    請先於上方填入「晶片系統 GAS 同步網址」並按儲存。
                  </p>
                )}
              </form>

              {/* 方式 3：跨系統唯讀 JSON API */}
              <div className="tur-card rounded-2xl border border-amber-500/35 bg-slate-900/90 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-300 font-black">
                  <Cpu className="h-5 w-5" />
                  <span>方式 3：獨立跨系統 JSON API（未來拉取用）</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  未來可在晶片計時系統透過以下 API 直接拉取已格式化完成的選手資料（需帶入 Header <code className="text-amber-300">X-API-Key</code> 對應環境變數 <code className="text-amber-300">INTEGRATION_API_KEY</code>）：
                </p>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono-num text-[11px] text-sky-300 break-all">
                  GET {integrationApiUrl}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(integrationApiUrl);
                    showNotice('success', '已複製跨系統串接 API 網址！');
                  }}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>複製串接 API 網址</span>
                </button>
              </div>
            </div>

            {/* 晶片名單格式即時預覽表 */}
            <div className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-3.5">
                <h3 className="text-sm font-black text-white">
                  晶片計時系統對接名單即時預覽（共 {chipPreview.length} 筆）
                </h3>
                <span className="text-xs text-slate-400 font-mono-num">
                  eventId: {event.timing_event_id || event.slug}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">參賽編號</th>
                      <th className="px-4 py-2.5">姓名</th>
                      <th className="px-4 py-2.5">身分證 (隱碼)</th>
                      <th className="px-4 py-2.5">分組代碼</th>
                      <th className="px-4 py-2.5">性別</th>
                      <th className="px-4 py-2.5">出生年月日</th>
                      <th className="px-4 py-2.5">縣市 / 國籍</th>
                      <th className="px-4 py-2.5">繳費狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {chipPreview.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          目前沒有符合條件的跑者資料（可取消勾選「僅匯出已繳費」檢視全部名單）。
                        </td>
                      </tr>
                    ) : (
                      chipPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/35">
                          <td className="px-4 py-2.5 font-mono-num font-black text-lime-300">
                            {item.bib || <span className="text-rose-400">待配號</span>}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">{item.name}</td>
                          <td className="px-4 py-2.5 font-mono-num text-sky-300">{item.idMasked}</td>
                          <td className="px-4 py-2.5 font-mono-num text-emerald-300">{item.categoryId}</td>
                          <td className="px-4 py-2.5 font-mono-num text-slate-200">{item.gender || '—'}</td>
                          <td className="px-4 py-2.5 font-mono-num text-slate-300">{item.dob || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-300">
                            {item.city || '—'} / {item.country}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                item.paymentStatus === '已繳費'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {item.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 報名詳細內容彈窗 */}
      {selectedReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="tur-control-bar max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono-num text-lg font-black text-sky-300">
                    {selectedReg.reg_code}
                  </h3>
                  {selectedReg.bib_number && (
                    <span className="rounded bg-lime-500/20 border border-lime-400/40 px-2 py-0.5 font-mono-num text-xs font-black text-lime-300">
                      Bib #{selectedReg.bib_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">報名時間：{selectedReg.created_at}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              {selectedReg.sheet_sync_error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <strong>試算表同步錯誤原因：</strong>
                  {selectedReg.sheet_sync_error}
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800">
                {(event.fields || [])
                  .filter((f) => f.type !== 'calculated')
                  .map((f) => {
                    const val = selectedReg.answers?.[f.id];
                    return (
                      <div key={f.id} className="grid grid-cols-3 gap-2 px-4 py-2.5">
                        <span className="text-slate-400">{f.label}</span>
                        <span className="col-span-2 text-white font-medium break-words">
                          {Array.isArray(val) ? val.join('、') : val || '—'}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3">
                <span className="font-bold text-slate-200">應繳總金額</span>
                <span className="font-mono-num text-xl font-black text-amber-300">
                  NT$ {Number(selectedReg.total_amount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
