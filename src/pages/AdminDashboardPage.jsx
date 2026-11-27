import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ExternalLink,
  Copy,
  Check,
  Edit3,
  Trash2,
  Users,
  DollarSign,
  Calendar,
  LogOut,
  Database,
  AlertTriangle,
  Clock,
  X,
  ShieldCheck,
  Sparkles,
  Crown,
  UserPlus,
  KeyRound,
  Building2,
  Save,
  Download,
  Upload,
  HardDrive,
  RotateCcw,
} from 'lucide-react';
import { apiRequest, getAdminToken, setAdminToken } from '../api/client';
import { generateEnglishEventName } from '../utils/raceNameTranslator';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';

function defaultDateTimeOffset(days) {
  const d = new Date(Date.now() + days * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateOffset(days) {
  const d = new Date(Date.now() + days * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDt(val) {
  if (!val) return '';
  return String(val).replace('T', ' ').slice(0, 16);
}

const INITIAL_FORM = () => ({
  name: '',
  english_name: '',
  slug: '',
  event_type: 'distance',
  event_status: 'auto',
  event_date: defaultDateOffset(60),
  reg_start_at: defaultDateTimeOffset(0),
  reg_end_at: defaultDateTimeOffset(30),
  location: '',
  max_participants: 300,
});

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [googleCreds, setGoogleCreds] = useState({
    unifiedDbConfigured: false,
    unifiedDbMode: 'local',
  });
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('events'); // 'events' | 'users'
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState('');

  // 新增活動狀態
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(INITIAL_FORM);
  const [englishManuallyEdited, setEnglishManuallyEdited] = useState(false);

  // 最高權限承辦人：帳號與權限管理狀態
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'organizer',
  });
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);

  // 資料管理與備份（載入測試資料 / 完整備份還原 / 資料清空）
  const [dataBusy, setDataBusy] = useState('');
  const [clearAlsoOrganizers, setClearAlsoOrganizers] = useState(false);

  const isSuperAdmin = currentAdmin?.role === 'super_admin';

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3800);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await apiRequest('/api/admin/users', { auth: true });
      setUsers(res.users || []);
    } catch (err) {
      showToast(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/events', { auth: true });
      setEvents(data.events || []);
      if (data.googleCredentials) setGoogleCreds(data.googleCredentials);
      if (data.currentAdmin) {
        setCurrentAdmin(data.currentAdmin);
        if (data.currentAdmin.role === 'super_admin') {
          apiRequest('/api/admin/users', { auth: true })
            .then((u) => setUsers(u.users || []))
            .catch(() => {});
        }
      }
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

  const handleChangeStatus = async (ev, nextStatus) => {
    try {
      const res = await apiRequest(`/api/admin/events/${ev.id}/status`, {
        method: 'PATCH',
        auth: true,
        body: { event_status: nextStatus },
      });
      setEvents((prev) => prev.map((item) => (item.id === ev.id ? res.event : item)));
      showToast(res.message);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDelete = async (ev) => {
    if (!window.confirm(`確定要刪除活動「${ev.name}」嗎？此操作將一併移除該活動的報名紀錄且無法復原。`)) {
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
      setNewForm(INITIAL_FORM());
      setEnglishManuallyEdited(false);
      navigate(`/admin/events/${res.event.id}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const res = await apiRequest('/api/admin/users', {
        method: 'POST',
        auth: true,
        body: newUserForm,
      });
      setUsers((prev) => [...prev, res.user]);
      setNewUserForm({ username: '', display_name: '', password: '', role: 'organizer' });
      setShowCreateUser(false);
      showToast(res.message);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    try {
      const payload = {
        display_name: editingUser.display_name,
        role: editingUser.role,
      };
      if (editingUser.newPassword && editingUser.newPassword.trim()) {
        payload.password = editingUser.newPassword.trim();
      }
      const res = await apiRequest(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        auth: true,
        body: payload,
      });
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? res.user : u)));
      setEditingUser(null);
      showToast(res.message);
      loadEvents();
    } catch (err) {
      showToast(err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (
      !window.confirm(
        `確定要刪除承辦人「${u.display_name}（${u.username}）」嗎？\n若其名下仍有活動，將會自動移交給您保管。`
      )
    ) {
      return;
    }
    try {
      const res = await apiRequest(`/api/admin/users/${u.id}`, {
        method: 'DELETE',
        auth: true,
      });
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
      showToast(res.message);
      loadEvents();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleLogout = () => {
    setAdminToken('');
    navigate('/', { replace: true });
  };

  // ==================== 資料管理：載入測試資料 / 完整備份 / 備份還原 / 資料清空 ====================
  const handleSeedDemo = async () => {
    setDataBusy('seed');
    try {
      const res = await apiRequest('/api/admin/data/seed-demo', {
        method: 'POST',
        auth: true,
      });
      showToast(res.message);
      await loadEvents();
      await loadUsers();
    } catch (err) {
      showToast(err.message);
    } finally {
      setDataBusy('');
    }
  };

  const handleDownloadBackup = async () => {
    setDataBusy('backup');
    try {
      const token = getAdminToken();
      const res = await fetch('/api/admin/data/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '下載備份檔失敗');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = nameMatch ? nameMatch[1] : `tur-registration-backup-${Date.now()}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已成功下載資料完整備份檔：${filename}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setDataBusy('');
    }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (
      !window.confirm(
        `確定要使用備份檔「${file.name}」還原全平台資料嗎？\n此操作將以備份檔內容覆蓋目前的承辦人、活動與報名資料。`
      )
    ) {
      return;
    }
    setDataBusy('restore');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiRequest('/api/admin/data/restore', {
        method: 'POST',
        auth: true,
        body: parsed,
      });
      showToast(res.message);
      await loadEvents();
      await loadUsers();
    } catch (err) {
      showToast(err.message || '備份檔解析或還原失敗，請確認檔案格式。');
    } finally {
      setDataBusy('');
    }
  };

  const handleClearData = async (scope) => {
    const promptMsg =
      scope === 'registrations_only'
        ? '此操作將永久清空所有活動的「報名名單紀錄」（保留活動設定與承辦人帳號）。\n建議先下載完整備份！若確定執行請輸入 CLEAR：'
        : clearAlsoOrganizers
        ? '警告！此操作將清空所有「活動、報名名單與其他承辦人帳號」（僅保留您目前登入的最高權限帳號）。\n建議先下載完整備份！若確定執行請輸入 CLEAR：'
        : '警告！此操作將清空所有「活動與報名名單資料」（保留承辦人帳號）。\n建議先下載完整備份！若確定執行請輸入 CLEAR：';

    const input = window.prompt(promptMsg, '');
    if (input !== 'CLEAR') {
      if (input !== null) showToast('輸入不符，已取消資料清空操作。');
      return;
    }

    setDataBusy(`clear_${scope}`);
    try {
      const res = await apiRequest('/api/admin/data/clear', {
        method: 'POST',
        auth: true,
        body: {
          scope,
          clearOrganizers: scope === 'all_data' ? clearAlsoOrganizers : false,
          confirm: 'CONFIRM_CLEAR',
        },
      });
      showToast(res.message);
      await loadEvents();
      await loadUsers();
    } catch (err) {
      showToast(err.message);
    } finally {
      setDataBusy('');
    }
  };

  const totalRunners = events.reduce((acc, ev) => acc + Number(ev.registration_count || 0), 0);
  const totalRevenue = events.reduce((acc, ev) => acc + Number(ev.total_revenue || 0), 0);
  const totalUnpaid = events.reduce((acc, ev) => acc + Number(ev.unpaid_count || 0), 0);
  const openCount = events.filter((e) => e.regState?.status === 'open').length;
  const preparingCount = events.filter((e) => e.regState?.status === 'preparing').length;
  const closedCount = events.filter((e) => e.regState?.status === 'closed').length;

  const hasEvents = events.length > 0;
  const filteredEvents = events.filter((ev) => {
    if (statusFilter !== 'all' && ev.regState?.status !== statusFilter) return false;
    if (isSuperAdmin && ownerFilter !== 'all' && String(ev.owner_admin_id) !== String(ownerFilter)) {
      return false;
    }
    return true;
  });

  // 共用「建立活動報名表」表單內容
  const renderCreateForm = (isInline = false) => (
    <form onSubmit={handleCreateEvent} className={isInline ? 'space-y-4' : 'p-6 space-y-4'}>
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">活動名稱（中文） *</label>
        <input
          type="text"
          required
          value={newForm.name}
          onChange={(e) => {
            const nextName = e.target.value;
            setNewForm((prev) => ({
              ...prev,
              name: nextName,
              english_name: englishManuallyEdited ? prev.english_name : generateEnglishEventName(nextName),
            }));
          }}
          placeholder="例如：2026 台灣城市超級馬拉松"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">報名狀態 *</label>
          <select
            value={newForm.event_status}
            onChange={(e) => setNewForm({ ...newForm, event_status: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
          >
            <option value="auto">自動（依報名起訖日期切換）</option>
            <option value="preparing">籌備中（尚未公開於首頁）</option>
            <option value="open">開放中（立即顯示於首頁報名）</option>
            <option value="closed">已結案（下架停止報名）</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">報名開始日期時間 *</label>
          <input
            type="datetime-local"
            required
            value={newForm.reg_start_at}
            onChange={(e) => setNewForm({ ...newForm, reg_start_at: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">報名截止日期時間 *</label>
          <input
            type="datetime-local"
            required
            value={newForm.reg_end_at}
            onChange={(e) => setNewForm({ ...newForm, reg_end_at: e.target.value })}
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
          <label className="block text-xs font-bold text-slate-300 mb-1">人數上限（0 = 不限）</label>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-300">英文賽事名稱（自動產生・可修改）</label>
            <button
              type="button"
              onClick={() => {
                setEnglishManuallyEdited(false);
                setNewForm((prev) => ({
                  ...prev,
                  english_name: generateEnglishEventName(prev.name),
                }));
              }}
              className="text-[11px] font-bold text-sky-400 hover:text-sky-300"
            >
              重新產生
            </button>
          </div>
          <input
            type="text"
            value={newForm.english_name}
            onChange={(e) => {
              setEnglishManuallyEdited(true);
              setNewForm({ ...newForm, english_name: e.target.value });
            }}
            placeholder="輸入中文活動名稱後自動產生，亦可手動修改"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">公開網址代碼（選填）</label>
          <input
            type="text"
            value={newForm.slug}
            onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
            placeholder="留空將依活動名稱自動產生"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {!isInline && (
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          <span>{creating ? '建立中...' : '建立活動'}</span>
        </button>
      </div>
    </form>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title={isSuperAdmin ? '後台管理（最高權限）' : '承辦人後台'}
        subtitle={currentAdmin ? `${currentAdmin.displayName} (@${currentAdmin.username})` : ''}
        showHomeLink
        homeLabel="前台"
        rightSlot={
          <div className="flex items-center gap-2">
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setAdminToken('');
                  navigate('/admin/login?mode=super_admin');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-extrabold text-amber-300 hover:bg-amber-500/25 transition"
              >
                <Crown className="h-3.5 w-3.5" />
                <span>最高管理權限</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-500 hover:text-rose-400 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>登出</span>
            </button>
          </div>
        }
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-lime-400/50 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pt-5 space-y-5">
        {/* 最高權限導覽分頁 */}
        {!loading && isSuperAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/35 bg-amber-950/20 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
              <Crown className="h-4 w-4 shrink-0" />
              <span>最高權限</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSection('events')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition ${
                  activeSection === 'events'
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>活動管理 ({events.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSection('users');
                  loadUsers();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition ${
                  activeSection === 'users'
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>承辦人 ({users.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSection('data');
                  loadUsers();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition ${
                  activeSection === 'data'
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                <HardDrive className="h-3.5 w-3.5" />
                <span>資料備份</span>
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
            ))}
          </div>
        ) : activeSection === 'data' && isSuperAdmin ? (
          /* ==================== 資料管理與備份 ==================== */
          <section className="space-y-5">
            <h1 className="text-xl font-black text-white">資料管理與備份</h1>

            {/* 統計 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">承辦人</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-sky-300">{users.length}</p>
              </div>
              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">活動</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-lime-400">{events.length}</p>
              </div>
              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">報名筆數</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-amber-300">{totalRunners}</p>
              </div>
            </div>

            {/* 三大工具卡 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 1. 載入測試資料 */}
              <div className="tur-card rounded-2xl border border-emerald-500/40 bg-slate-900/90 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-emerald-300 font-black text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>載入測試資料</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    建立示範承辦人（org_north / org_south）、三態活動與測試名單。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSeedDemo}
                  disabled={Boolean(dataBusy)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-50 transition"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{dataBusy === 'seed' ? '載入中...' : '載入測試資料'}</span>
                </button>
              </div>

              {/* 2. 備份與還原 */}
              <div className="tur-card rounded-2xl border border-sky-500/40 bg-slate-900/90 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-sky-300 font-black text-sm">
                    <Download className="h-4 w-4" />
                    <span>備份與還原</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    下載或還原全平台 JSON 備份（含帳號、活動與名單）。
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    disabled={Boolean(dataBusy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 disabled:opacity-50 transition"
                  >
                    <Download className="h-4 w-4" />
                    <span>{dataBusy === 'backup' ? '備份中...' : '下載完整備份 (.json)'}</span>
                  </button>

                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-xs font-extrabold text-sky-300 hover:bg-sky-500/25 transition">
                    <Upload className="h-4 w-4" />
                    <span>{dataBusy === 'restore' ? '還原中...' : '上傳備份檔還原'}</span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={handleRestoreBackup}
                      disabled={Boolean(dataBusy)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* 3. 資料清空 */}
              <div className="tur-card rounded-2xl border border-rose-500/40 bg-slate-900/90 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="inline-flex items-center gap-2 text-rose-400 font-black text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>清空資料（需輸入 CLEAR）</span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearAlsoOrganizers}
                      onChange={(e) => setClearAlsoOrganizers(e.target.checked)}
                      className="h-4 w-4 accent-rose-500"
                    />
                    <span>一併刪除其他一般承辦人</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleClearData('registrations_only')}
                    disabled={Boolean(dataBusy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-extrabold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{dataBusy === 'clear_registrations_only' ? '清空中...' : '僅清空報名名單'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleClearData('all_data')}
                    disabled={Boolean(dataBusy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs sm:text-sm font-black text-white hover:bg-rose-500 disabled:opacity-50 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{dataBusy === 'clear_all_data' ? '清空中...' : '清空全部活動與名單'}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : activeSection === 'users' && isSuperAdmin ? (
          /* ==================== 承辦人管理 ==================== */
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-black text-white">承辦人與權限管理</h1>
              <button
                type="button"
                onClick={() => setShowCreateUser(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2 text-xs sm:text-sm font-black text-slate-950 hover:from-amber-400 hover:to-yellow-300"
              >
                <UserPlus className="h-4 w-4" />
                <span>註冊新承辦人</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/85 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">承辦人帳號</th>
                    <th className="px-4 py-3">承辦單位 / 顯示名稱</th>
                    <th className="px-4 py-3">權限角色</th>
                    <th className="px-4 py-3">名下活動數</th>
                    <th className="px-4 py-3">建立時間</th>
                    <th className="px-4 py-3 text-right">權限操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                        載入承辦人資料中...
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isMe = Number(u.id) === Number(currentAdmin?.id);
                      const isSuper = u.role === 'super_admin';
                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono-num font-bold text-sky-300">
                            {u.username}
                            {isMe && (
                              <span className="ml-2 rounded bg-lime-500/20 px-1.5 py-0.5 text-[10px] font-bold text-lime-300">
                                目前登入
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{u.display_name}</td>
                          <td className="px-4 py-3">
                            {isSuper ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-300">
                                <Crown className="h-3 w-3" />
                                最高權限承辦人
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                                <ShieldCheck className="h-3 w-3 text-sky-400" />
                                一般承辦人
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono-num font-bold text-slate-200">
                            {u.event_count} 場
                          </td>
                          <td className="px-4 py-3 font-mono-num text-xs text-slate-400">
                            {u.created_at}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingUser({
                                    ...u,
                                    newPassword: '',
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/40 px-2.5 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                修改權限 / 密碼
                              </button>
                              {!isMe && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-500/50 hover:text-rose-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  刪除
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : !hasEvents && !isSuperAdmin ? (
          /* ==================== 一般承辦人尚未建立報名表：先建立第一張報名表 ==================== */
          <section className="mx-auto max-w-2xl space-y-5">
            <div className="tur-control-bar rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="space-y-2 border-b border-slate-800 pb-4">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  承辦人獨立工作空間
                </div>
                <h2 className="text-2xl font-black text-white">建立您的第一張活動報名表</h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  建立報名表後，您即可在此管理自己發起的所有活動；狀態設為「開放中」的活動將自動刊登於前台首頁供跑者報名。
                </p>
              </div>
              {renderCreateForm(true)}
            </div>
          </section>
        ) : (
          /* ==================== 活動管理主視圖（一般承辦人看自己的 / 總管看全平台） ==================== */
          <>
            {/* KPI 總覽卡 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">活動場數</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-white">{events.length}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  開放 {openCount} · 籌備 {preparingCount} · 結案 {closedCount}
                </p>
              </div>

              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">累計報名</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-lime-400">{totalRunners}</p>
              </div>

              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">應收總額</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-amber-300">
                  NT$ {totalRevenue.toLocaleString()}
                </p>
              </div>

              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs text-slate-400">尚未繳款（待對帳）</p>
                <p
                  className={`mt-1 font-mono-num text-2xl font-black ${
                    totalUnpaid > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {totalUnpaid} 筆
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {totalUnpaid > 0 ? '請至各活動「對帳管理」核對' : '目前皆已完成對帳'}
                </p>
              </div>
            </div>

            {/* 標題與建立按鈕 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-black text-white">
                {isSuperAdmin ? '全平台活動' : '我的活動'}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setNewForm(INITIAL_FORM());
                  setEnglishManuallyEdited(false);
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 transition"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                <span>新建活動</span>
              </button>
            </div>

            {/* 狀態篩選 + 最高權限專屬承辦人篩選 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'all', label: '全部活動', count: events.length, active: 'bg-lime-400 text-slate-950 border-lime-400' },
                  { key: 'open', label: '開放中', count: openCount, active: 'bg-emerald-500 text-slate-950 border-emerald-400' },
                  { key: 'preparing', label: '籌備中', count: preparingCount, active: 'bg-sky-500 text-slate-950 border-sky-400' },
                  { key: 'closed', label: '已結案', count: closedCount, active: 'bg-slate-600 text-white border-slate-500' },
                ].map((tabItem) => (
                  <button
                    key={tabItem.key}
                    type="button"
                    onClick={() => setStatusFilter(tabItem.key)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                      statusFilter === tabItem.key
                        ? tabItem.active
                        : 'border-slate-700 bg-slate-900/90 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    <span>{tabItem.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono-num text-[11px] font-black ${
                        statusFilter === tabItem.key ? 'bg-slate-950/20' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {tabItem.count}
                    </span>
                  </button>
                ))}
              </div>

              {isSuperAdmin && users.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">依承辦人篩選：</span>
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="all">全部承辦人 ({users.length})</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}（@{u.username}）
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 活動卡片清單 */}
            <div className="space-y-4">
              {filteredEvents.length === 0 ? (
                <div className="tur-control-bar rounded-2xl p-10 text-center text-sm text-slate-400">
                  目前此篩選條件下沒有活動報名表。
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const publicPath = `/register/${ev.slug}`;
                  const status = ev.regState?.status || 'closed';

                  const statusBadgeStyle =
                    status === 'open'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : status === 'preparing'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-700/60 text-slate-300 border-slate-600';

                  const statusText =
                    status === 'open'
                      ? '● 開放中'
                      : status === 'preparing'
                      ? '● 籌備中'
                      : '● 已結案';

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
                            className="hidden sm:block h-24 w-36 rounded-xl object-cover border border-slate-700 shrink-0"
                          />
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusBadgeStyle}`}>
                                {statusText}
                              </span>
                              {isSuperAdmin && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                                  <Building2 className="h-3 w-3" />
                                  承辦：{ev.owner_display_name || ev.owner_username} (@{ev.owner_username})
                                </span>
                              )}
                              {ev.unpaid_count > 0 && (
                                <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
                                  尚未繳款 {ev.unpaid_count} 筆
                                </span>
                              )}
                            </div>

                            <h2 className="text-xl font-black text-white">{ev.name}</h2>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-lime-400" />
                                賽事日期：{ev.event_date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-sky-400" />
                                報名期間：{formatDt(ev.reg_start_at)} ~ {formatDt(ev.reg_end_at)}
                              </span>
                              <span className="flex items-center gap-1 font-mono-num font-bold text-lime-300">
                                <Users className="h-3.5 w-3.5 text-emerald-400" />
                                報名人員：{ev.registration_count} /{' '}
                                {ev.max_participants > 0 ? ev.max_participants : '不限'}
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

                        {/* 右側操作按鈕與狀態切換 */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            value={ev.event_status || 'auto'}
                            onChange={(e) => handleChangeStatus(ev, e.target.value)}
                            title="切換活動報名狀態"
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-200 focus:border-lime-400 focus:outline-none"
                          >
                            <option value="auto">自動（依日期）</option>
                            <option value="preparing">籌備中</option>
                            <option value="open">開放中</option>
                            <option value="closed">已結案</option>
                          </select>

                          <Link
                            to={`/admin/events/${ev.id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 transition"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>進入後台管理</span>
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
                })
              )}
            </div>
          </>
        )}
      </main>

      <TurFooter />

      {/* 新增活動彈窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="tur-control-bar w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-lg font-black text-white">建立新活動報名表</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderCreateForm(false)}
          </div>
        </div>
      )}

      {/* 最高權限：新增承辦人帳號彈窗 */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="tur-control-bar w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-lg font-black text-white">註冊新承辦人帳號</h2>
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">承辦單位 / 顯示名稱 *</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={newUserForm.display_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, display_name: e.target.value })}
                  placeholder="例如：新竹賽事承辦人"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">登入帳號 *</label>
                <input
                  type="text"
                  name="new_organizer_acct"
                  required
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  placeholder="3~32 碼英文小寫或數字"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">初始密碼 *（至少 6 碼）</label>
                <input
                  type="password"
                  name="new_organizer_pass"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">權限等級 *</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="organizer">一般承辦人（僅可管理自己建立的活動）</option>
                  <option value="super_admin">最高權限承辦人（可管理全部活動與所有帳號權限）</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {savingUser ? '建立中...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 最高權限：編輯承辦人權限與重設密碼彈窗 */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="tur-control-bar w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-lg font-black text-white">
                修改權限資料（@{editingUser.username}）
              </h2>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditUser} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">承辦單位 / 顯示名稱 *</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={editingUser.display_name}
                  onChange={(e) => setEditingUser({ ...editingUser, display_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">權限等級 *</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="organizer">一般承辦人（僅管理自己建立的活動）</option>
                  <option value="super_admin">最高權限承辦人（可管理全部活動與所有權限資料）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  重設密碼（選填：留空則維持原密碼）
                </label>
                <input
                  type="password"
                  name="reset_organizer_pass"
                  minLength={6}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={editingUser.newPassword || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                  placeholder="輸入新密碼（至少 6 碼）"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{savingUser ? '儲存中...' : '儲存權限變更'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
