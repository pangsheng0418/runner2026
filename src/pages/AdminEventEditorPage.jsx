import React, { useEffect, useMemo, useState } from 'react';
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
  Download,
  Copy,
  Loader2,
  Eye,
  Cpu,
  Hash,
  Send,
  Database,
  X,
  CreditCard,
  Edit3,
  Trash2,
  Lock,
  Sparkles,
  Calculator,
  AlertCircle,
  Crown,
  Package,
} from 'lucide-react';
import { apiRequest, getAdminToken, setAdminToken } from '../api/client';
import { generateEnglishEventName } from '../utils/raceNameTranslator';
import { calculatePricing } from '../utils/validation';
import TurLogo from '../components/TurLogo';
import BannerHero from '../components/BannerHero';
import FormBuilder from '../components/FormBuilder';
import DynamicFormField from '../components/DynamicFormField';

const PRESET_BANNERS = [
  {
    name: '城市清晨跑道',
    url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '雲海稜線越野',
    url: '/banners/mountain-ridge-run.jpg',
  },
  {
    name: '夜間疾速街跑',
    url: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '田徑場跑道衝刺',
    url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '山林越野跑道',
    url: 'https://images.unsplash.com/photo-1502224562085-639556652f33?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '海岸公路路跑',
    url: 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '溪谷晨光疾跑',
    url: '/banners/valley-sunrise-run.jpg',
  },
  {
    name: '森呼吸林道衝刺',
    url: '/banners/forest-sunbeam-run.jpg',
  },
  {
    name: '賽事終點衝線',
    url: 'https://images.unsplash.com/photo-1594882645126-14020914d58d?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: '黃昏河濱熱跑',
    url: 'https://images.unsplash.com/photo-1532444458054-01a7dd3e9fca?auto=format&fit=crop&w=1600&q=80',
  },
];

export default function AdminEventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('basic');
  const [event, setEvent] = useState(null);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [organizers, setOrganizers] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [eventBundles, setEventBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [forbiddenError, setForbiddenError] = useState('');

  // 中英賽事名稱自動同步旗標
  const [englishManuallyEdited, setEnglishManuallyEdited] = useState(false);

  // 名單檢視 / 修改 / 搜尋狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReg, setSelectedReg] = useState(null);
  const [editingReg, setEditingReg] = useState(null);
  const [editRegAnswers, setEditRegAnswers] = useState({});
  const [editRegMeta, setEditRegMeta] = useState({
    bib_number: '',
    category_code: '',
    payment_status: '待繳費',
    reg_type: 'individual',
    group_name: '',
    group_code: '',
    payment_mode: 'individual',
    remittance_last5: '',
    total_amount: 0,
    manualAmount: false,
  });
  const [savingRegEdit, setSavingRegEdit] = useState(false);

  // 對帳管理狀態
  const [reconcileFilter, setReconcileFilter] = useState('all'); // 'all' | 'unpaid' | 'paid' | 'cancelled'
  const [reconcileSearch, setReconcileSearch] = useState('');

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
    setForbiddenError('');
    try {
      const [evRes, regRes, bdlRes] = await Promise.all([
        apiRequest(`/api/admin/events/${id}`, { auth: true }),
        apiRequest(`/api/admin/events/${id}/registrations`, { auth: true }),
        apiRequest(`/api/admin/events/${id}/bundles`, { auth: true }).catch(() => ({ bundles: [] })),
      ]);
      const loadedEv = evRes.event;
      setEvent(loadedEv);
      // 若已有自訂英文名稱且與自動產生結果不同，先視為已手動編輯，避免無意覆蓋
      const autoEn = generateEnglishEventName(loadedEv?.name || '');
      setEnglishManuallyEdited(
        Boolean(loadedEv?.english_name && loadedEv.english_name.trim() !== autoEn)
      );
      if (evRes.currentAdmin) setCurrentAdmin(evRes.currentAdmin);
      if (Array.isArray(evRes.organizers)) setOrganizers(evRes.organizers);
      setRegistrations(regRes.registrations || []);
      setEventBundles(bdlRes?.bundles || []);
    } catch (err) {
      if (err.status === 401) {
        setAdminToken('');
        navigate('/admin/login', { replace: true });
      } else if (err.status === 403 || err.status === 404) {
        setForbiddenError(err.message || '您無權存取此活動報名表。');
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

  const editRegPricing = useMemo(
    () => calculatePricing(event?.fields || [], editRegAnswers),
    [event, editRegAnswers]
  );

  const updateEventField = (key, value) => {
    setEvent((prev) => ({ ...prev, [key]: value }));
  };

  const handleEventChineseNameChange = (nextName) => {
    setEvent((prev) => {
      if (!prev) return prev;
      const shouldAuto = !englishManuallyEdited || !String(prev.english_name || '').trim();
      return {
        ...prev,
        name: nextName,
        english_name: shouldAuto ? generateEnglishEventName(nextName) : prev.english_name,
      };
    });
  };

  const handleSave = async () => {
    if (!event) return;
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await apiRequest(`/api/admin/events/${id}`, {
        method: 'PUT',
        auth: true,
        body: {
          ...event,
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
      showNotice('success', '已套用 TUR 路跑標準預設欄位（含非必選「賽事加購服務」3 項範例），請點擊右上角「儲存變更」完成保存。');
    } catch (err) {
      showNotice('error', err.message);
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

  const handleGroupPaymentStatus = async (groupCode, groupName, nextStatus) => {
    if (
      !window.confirm(
        `確定要將團體「${groupName || groupCode}（${groupCode}）」所有成員批次設為「${nextStatus}」嗎？`
      )
    ) {
      return;
    }
    try {
      const res = await apiRequest(
        `/api/admin/events/${id}/groups/${encodeURIComponent(groupCode)}/payment-status`,
        {
          method: 'PATCH',
          auth: true,
          body: { payment_status: nextStatus },
        }
      );
      const updatedMap = new Map((res.registrations || []).map((r) => [r.id, r]));
      setRegistrations((prev) => prev.map((r) => updatedMap.get(r.id) || r));
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleBundlePaymentStatus = async (bundleCode, nextStatus = '已繳費') => {
    if (
      !window.confirm(
        `確定要將合併單「${bundleCode}」全部場次一次跨場設為「${nextStatus}」嗎？`
      )
    ) {
      return;
    }
    try {
      const res = await apiRequest(
        `/api/admin/bundles/${encodeURIComponent(bundleCode)}/payment-status`,
        {
          method: 'PATCH',
          auth: true,
          body: { payment_status: nextStatus },
        }
      );
      const updatedMap = new Map((res.registrations || []).map((r) => [r.id, r]));
      setRegistrations((prev) => prev.map((r) => updatedMap.get(r.id) || r));
      // 同步刷新合併單清單
      const bdlRes = await apiRequest(`/api/admin/events/${id}/bundles`, { auth: true }).catch(() => null);
      if (bdlRes?.bundles) setEventBundles(bdlRes.bundles);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleExportBundleExcel = async () => {
    setBusyAction('bundle_excel');
    try {
      const token = getAdminToken();
      const res = await fetch(`/api/admin/events/${id}/bundles/export-excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('匯出合併對帳總表失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event?.name || 'event'}-多場合併對帳總表.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showNotice('success', '已成功下載多場聯合報名合併對帳總表（.xlsx）！');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusyAction('');
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
    setBusyAction('bib');
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
      setBusyAction('');
    }
  };

  // 開啟「修改報名者資料」彈窗
  const openEditRegModal = (reg) => {
    setEditingReg(reg);
    setEditRegAnswers({ ...(reg.answers || {}) });
    setEditRegMeta({
      bib_number: reg.bib_number || '',
      category_code: reg.category_code || '',
      payment_status: reg.payment_status || '待繳費',
      reg_type: reg.reg_type || 'individual',
      group_name: reg.group_name || '',
      group_code: reg.group_code || '',
      payment_mode: reg.payment_mode || 'individual',
      remittance_last5: reg.remittance_last5 || reg.answers?.remittance_last5 || '',
      total_amount: Number(reg.total_amount || 0),
      manualAmount: false,
    });
  };

  const handleEditRegFieldChange = (fieldId, val) => {
    setEditRegAnswers((prev) => {
      const next = { ...prev, [fieldId]: val };
      if (fieldId === 'remittance_last5') {
        setEditRegMeta((m) => ({ ...m, remittance_last5: String(val || '') }));
      }
      return next;
    });
  };

  const handleSaveRegistrationEdit = async (e) => {
    e.preventDefault();
    if (!editingReg) return;
    setSavingRegEdit(true);
    try {
      const finalAmount = editRegMeta.manualAmount
        ? Number(editRegMeta.total_amount || 0)
        : editRegPricing.total;

      const res = await apiRequest(`/api/admin/registrations/${editingReg.id}`, {
        method: 'PUT',
        auth: true,
        body: {
          bib_number: editRegMeta.bib_number,
          category_code: editRegMeta.category_code,
          payment_status: editRegMeta.payment_status,
          reg_type: editRegMeta.reg_type,
          group_name: editRegMeta.group_name,
          group_code: editRegMeta.group_code,
          payment_mode: editRegMeta.payment_mode,
          remittance_last5: editRegMeta.remittance_last5,
          total_amount: finalAmount,
          answers: {
            ...editRegAnswers,
            remittance_last5: editRegMeta.remittance_last5,
          },
        },
      });
      setRegistrations((prev) =>
        prev.map((r) => (r.id === editingReg.id ? res.registration : r))
      );
      setEditingReg(null);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSavingRegEdit(false);
    }
  };

  // 刪除單筆報名資料
  const handleDeleteRegistration = async (reg) => {
    if (
      !window.confirm(
        `確定要刪除「${reg.runner_name || '未填姓名'}（${reg.reg_code}）」的報名資料嗎？\n此操作無法復原。`
      )
    ) {
      return;
    }
    try {
      const res = await apiRequest(`/api/admin/registrations/${reg.id}`, {
        method: 'DELETE',
        auth: true,
      });
      setRegistrations((prev) => prev.filter((r) => r.id !== reg.id));
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  // 一鍵清空本活動所有報名名單
  const handleClearAllRegistrations = async () => {
    if (registrations.length === 0) {
      showNotice('warning', '本活動目前沒有任何報名名單可清空。');
      return;
    }
    const ok = window.confirm(
      `警告！確定要「一鍵清空」本活動「${event.name}」的全部 ${registrations.length} 筆報名名單嗎？\n此操作將永久刪除本活動所有名單且無法復原！`
    );
    if (!ok) return;

    setBusyAction('clear_all');
    try {
      const res = await apiRequest(`/api/admin/events/${id}/registrations`, {
        method: 'DELETE',
        auth: true,
      });
      setRegistrations([]);
      showNotice('success', res.message);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusyAction('');
    }
  };

  // 匯出 Excel (.xlsx)
  const handleExportExcel = async () => {
    setBusyAction('excel');
    try {
      const token = getAdminToken();
      const res = await fetch(`/api/admin/events/${id}/registrations/export-excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('匯出 Excel 檔案失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event?.name || 'event'}-報名選手資料.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showNotice('success', '已成功下載報名選手資料 Excel 檔（.xlsx）！');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusyAction('');
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
    setBusyAction('push');
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
      setBusyAction('');
    }
  };

  if (forbiddenError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="tur-control-bar max-w-md rounded-2xl p-8 space-y-4">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
          <h1 className="text-xl font-black text-white">無法進入此活動後台</h1>
          <p className="text-sm text-slate-300 leading-relaxed">{forbiddenError}</p>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" />
            返回我的活動管理列表
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-lime-400 mr-2" />
        載入活動設定中...
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/register/${event.slug}`;
  const integrationApiUrl = `${window.location.origin}/api/integration/events/${event.slug}/roster?paidOnly=true`;
  const maxParticipants = Number(event.max_participants || 0);
  const capacityText = `${registrations.length} / ${maxParticipants > 0 ? maxParticipants : '不限'}`;

  const unpaidRegs = registrations.filter((r) => r.payment_status === '待繳費');
  const paidRegs = registrations.filter((r) => r.payment_status === '已繳費');
  const cancelledRegs = registrations.filter((r) => r.payment_status === '已取消');
  const unpaidTotalAmount = unpaidRegs.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  const paidTotalAmount = paidRegs.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);

  const filteredRegs = registrations.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(r.reg_code).toLowerCase().includes(q) ||
      String(r.bib_number || '').toLowerCase().includes(q) ||
      String(r.runner_name).toLowerCase().includes(q) ||
      String(r.runner_phone).toLowerCase().includes(q) ||
      String(r.runner_email).toLowerCase().includes(q) ||
      String(r.runner_id_number).toLowerCase().includes(q) ||
      String(r.remittance_last5 || '').toLowerCase().includes(q) ||
      String(r.group_name || '').toLowerCase().includes(q) ||
      String(r.group_code || '').toLowerCase().includes(q) ||
      String(r.bundle_code || '').toLowerCase().includes(q)
    );
  });

  // 彙總本活動所有團報（比照路跑管理系統 summarizeGroupOrders）
  const groupSummaries = useMemo(() => {
    const map = new Map();
    const sortedAsc = [...registrations].sort((a, b) => Number(a.id) - Number(b.id));
    for (const r of sortedAsc) {
      const gc = String(r.group_code || '').trim().toUpperCase();
      if (!gc || r.payment_status === '已取消') continue;
      if (!map.has(gc)) map.set(gc, []);
      map.get(gc).push(r);
    }
    const out = [];
    for (const [gc, members] of map.entries()) {
      const leader =
        members.find((m) => String(m.group_role || '').toLowerCase() === 'leader') || members[0];
      const ordered = [leader, ...members.filter((m) => m.id !== leader.id)];
      const unpaidCount = ordered.filter((m) => m.payment_status !== '已繳費').length;
      const totalAmount = ordered.reduce((s, m) => s + Number(m.total_amount || 0), 0);
      const last5 = leader.remittance_last5 || (ordered.find((m) => m.remittance_last5)?.remittance_last5 || '');
      out.push({
        group_code: gc,
        group_name: leader.group_name || '團體報名',
        leader,
        members: ordered,
        member_count: ordered.length,
        unpaid_count: unpaidCount,
        all_paid: ordered.length > 0 && unpaidCount === 0,
        total_amount: totalAmount,
        remittance_last5: last5,
      });
    }
    return out.sort((a, b) => Number(a.all_paid) - Number(b.all_paid) || a.group_code.localeCompare(b.group_code));
  }, [registrations]);

  const filteredReconcileRegs = registrations
    .filter((r) => {
      if (reconcileFilter === 'unpaid' && r.payment_status !== '待繳費') return false;
      if (reconcileFilter === 'paid' && r.payment_status !== '已繳費') return false;
      if (reconcileFilter === 'cancelled' && r.payment_status !== '已取消') return false;
      const q = reconcileSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        String(r.runner_name || '').toLowerCase().includes(q) ||
        String(r.group_name || '').toLowerCase().includes(q) ||
        String(r.group_code || '').toLowerCase().includes(q) ||
        String(r.bundle_code || '').toLowerCase().includes(q) ||
        String(r.remittance_last5 || '').toLowerCase().includes(q) ||
        String(r.reg_code || '').toLowerCase().includes(q)
      );
    })
    // 將尚未繳款者排在最前面，方便承辦人快速核對
    .sort((a, b) => {
      const rank = (s) => (s === '待繳費' ? 0 : s === '已繳費' ? 1 : 2);
      const diff = rank(a.payment_status) - rank(b.payment_status);
      if (diff !== 0) return diff;
      return Number(b.id) - Number(a.id);
    });

  const tabs = [
    { key: 'basic', label: '基本設定與狀態', icon: Settings },
    { key: 'banner', label: '橫幅 Banner 自訂', icon: ImageIcon },
    { key: 'form', label: `動態表單 (${event.fields?.length || 0})`, icon: ListChecks },
    { key: 'registrations', label: `報名名單 (${registrations.length})`, icon: Users },
    {
      key: 'reconcile',
      label: `對帳管理${unpaidRegs.length > 0 ? ` (${unpaidRegs.length} 待繳)` : ''}`,
      icon: CreditCard,
    },
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
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white truncate">{event.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-lime-400/40 bg-lime-500/15 px-2.5 py-0.5 font-mono-num text-xs font-black text-lime-300 shrink-0">
                  <Users className="h-3 w-3" />
                  報名人員 {capacityText}
                </span>
              </div>
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
              onClick={handleSave}
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
                <label className="block text-xs font-bold text-slate-300 mb-1.5">活動名稱（中文） *</label>
                <input
                  type="text"
                  value={event.name || ''}
                  onChange={(e) => handleEventChineseNameChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    英文賽事名稱（輸入中文自動產生・可自行修改）
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEnglishManuallyEdited(false);
                      updateEventField('english_name', generateEnglishEventName(event.name || ''));
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300"
                  >
                    <Sparkles className="h-3 w-3" />
                    重新自動產生
                  </button>
                </div>
                <input
                  type="text"
                  value={event.english_name || ''}
                  onChange={(e) => {
                    setEnglishManuallyEdited(true);
                    updateEventField('english_name', e.target.value);
                  }}
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
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  報名開始日期時間 *（到達此時間將自動切換為「開放中」）
                </label>
                <input
                  type="datetime-local"
                  value={(event.reg_start_at || '').slice(0, 16)}
                  onChange={(e) => updateEventField('reg_start_at', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  報名截止日期時間 *（超過此時間將自動切換為「已結報」）
                </label>
                <input
                  type="datetime-local"
                  value={(event.reg_end_at || '').slice(0, 16)}
                  onChange={(e) => updateEventField('reg_end_at', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  報名人數上限（目前報名：{capacityText}；填 0 代表不限制）
                </label>
                <input
                  type="number"
                  min={0}
                  value={event.max_participants ?? 0}
                  onChange={(e) => updateEventField('max_participants', Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono-num text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  報名狀態控制（目前前台顯示：
                  <span
                    className={
                      event.regState?.status === 'open'
                        ? 'text-emerald-400 font-black ml-1'
                        : event.regState?.status === 'preparing'
                        ? 'text-sky-400 font-black ml-1'
                        : 'text-rose-400 font-black ml-1'
                    }
                  >
                    {event.regState?.label || '未定'}
                  </span>
                  ）
                </label>
                <select
                  value={event.event_status || 'auto'}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateEventField('event_status', val);
                    updateEventField('is_active', val !== 'closed');
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-lime-400 focus:outline-none"
                >
                  <option value="auto">自動依報名起訖日期切換（籌備中 → 開放中 → 已結案）</option>
                  <option value="preparing">強制設為：籌備中（不在首頁公開，尚未開放填表）</option>
                  <option value="open">強制設為：開放中（顯示於首頁並立即開放報名）</option>
                  <option value="closed">強制設為：已結案（不在首頁公開，停止報名）</option>
                </select>
              </div>
              {currentAdmin?.role === 'super_admin' && organizers.length > 0 && (
                <div className="md:col-span-2 rounded-xl border border-amber-500/35 bg-amber-950/20 p-4">
                  <label className="block text-xs font-bold text-amber-300 mb-1.5">
                    活動歸屬承辦人（最高權限總管可移轉活動承辦權責）
                  </label>
                  <select
                    value={event.owner_admin_id || ''}
                    onChange={(e) => updateEventField('owner_admin_id', Number(e.target.value))}
                    className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-amber-400 focus:outline-none"
                  >
                    {organizers.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.display_name}（@{org.username}）
                        {org.role === 'super_admin' ? ' — 最高權限承辦人' : ' — 一般承辦人'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
              <BannerHero event={{ ...event, registration_count: registrations.length }} compact />
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

              {/* 承辦人自行上傳喜歡照片 */}
              <div className="rounded-xl border border-sky-500/35 bg-sky-950/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-sky-300">承辦人自行上傳喜歡照片或貼上圖片網址</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      支援 JPG、PNG、WebP、GIF（最大 5MB），上傳後立即套用至上方橫幅預覽。
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 transition shrink-0">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>{uploading ? '照片上傳中...' : '上傳喜歡的照片'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleBannerUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={event.banner_image_url || ''}
                  onChange={(e) => updateEventField('banner_image_url', e.target.value)}
                  placeholder="https://... 或點右上方按鈕自行上傳照片"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>

              {/* 內建 10 種路跑風格精選背景（含原 4 種 + 新增 6 種） */}
              <div>
                <p className="text-xs font-bold text-slate-300 mb-2.5">
                  內建路跑風格精選背景（共 {PRESET_BANNERS.length} 種・點擊套用）
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                      <img src={item.url} alt={item.name} className="h-24 w-full object-cover" />
                      <p className="bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-200 truncate">
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
              可拖曳卡片調整欄位順序、增刪欄位、設定計價與晶片分組代碼；系統已預設「賽事加購服務」（非必選，含 3 項範例明細），您可自由新增、修改或刪除選項。修改完成後請點擊右上角「儲存變更」。
            </p>
            <FormBuilder
              fields={event.fields || []}
              onChange={(nextFields) => updateEventField('fields', nextFields)}
              onLoadDefaultFields={handleLoadDefaultFields}
            />
          </div>
        )}

        {/* ==================== TAB 4: 報名名單（含修改、刪除、一鍵清空、匯出 Excel） ==================== */}
        {tab === 'registrations' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋序號、姓名、團體名稱、團報代碼或尾五碼..."
                  className="w-full sm:w-72 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-lime-400/35 bg-lime-500/10 px-3 py-2 font-mono-num text-xs font-black text-lime-300">
                  <Users className="h-3.5 w-3.5" />
                  報名人員：{capacityText}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAutoAssignBibs(false)}
                  disabled={Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-3.5 py-2 text-xs font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-40"
                >
                  <Hash className="h-3.5 w-3.5" />
                  <span>一鍵自動配號 (Bib)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3.5 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                >
                  {busyAction === 'excel' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                  )}
                  <span>匯出 Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCsv(false, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>匯出 CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAllRegistrations}
                  disabled={Boolean(busyAction) || registrations.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-600/20 px-3.5 py-2 text-xs font-black text-rose-300 hover:bg-rose-600/35 disabled:opacity-40"
                >
                  {busyAction === 'clear_all' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>一鍵清空名單</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/85 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">參賽編號 (Bib)</th>
                    <th className="px-4 py-3">報名序號 / 團別</th>
                    <th className="px-4 py-3">跑者姓名 / 隱碼證號</th>
                    <th className="px-4 py-3">組別代碼</th>
                    <th className="px-4 py-3">應繳金額</th>
                    <th className="px-4 py-3">匯款方式 / 尾五碼</th>
                    <th className="px-4 py-3">繳費狀態</th>
                    <th className="px-4 py-3 text-right">操作</th>
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
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 font-sans">
                            {reg.reg_type === 'group' ? (
                              <>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                                    reg.group_role === 'leader'
                                      ? 'bg-amber-400 text-slate-950'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {reg.group_role === 'leader' ? '👑 團長' : '👥 組員'}
                                </span>
                                <span className="rounded bg-purple-500/20 border border-purple-400/40 px-1.5 py-0.5 text-[10px] font-bold text-purple-200">
                                  {reg.group_name || reg.group_code}
                                </span>
                              </>
                            ) : (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                                個人{reg.group_name ? ` · ${reg.group_name}` : ''}
                              </span>
                            )}
                            {reg.bundle_code && (
                              <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-emerald-300">
                                📦 {reg.bundle_code}
                              </span>
                            )}
                          </div>
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
                        <td className="px-4 py-3 font-mono-num whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-block w-fit rounded px-1.5 py-0.5 font-sans text-[10px] font-bold ${
                                reg.payment_mode === 'group'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/35'
                                  : reg.payment_mode === 'bundle'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {reg.payment_mode === 'group'
                                ? '團體匯款'
                                : reg.payment_mode === 'bundle'
                                ? '合併匯款'
                                : '個別匯款'}
                            </span>
                            {reg.remittance_last5 ? (
                              <span className="inline-block w-fit rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs font-black text-sky-300">
                                {reg.remittance_last5}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">未填尾五碼</span>
                            )}
                            {reg.group_code && reg.payment_status !== '已繳費' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleGroupPaymentStatus(reg.group_code, reg.group_name, '已繳費')
                                }
                                className="w-fit rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 font-sans text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30"
                              >
                                整團設已繳費
                              </button>
                            )}
                          </div>
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
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReg(reg)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              檢視
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditRegModal(reg)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              修改
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRegistration(reg)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: 對帳管理（精簡欄位 + 醒目標示尚未繳款名單） ==================== */}
        {tab === 'reconcile' && (
          <div className="space-y-4">
            {/* 對帳統計總覽 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="tur-control-bar rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                  <AlertCircle className="h-4 w-4" />
                  <span>尚未繳款名單（待繳費）</span>
                </div>
                <p className="mt-1 font-mono-num text-2xl font-black text-rose-300">
                  {unpaidRegs.length} 筆
                </p>
                <p className="mt-0.5 font-mono-num text-xs text-rose-200/80">
                  未收金額 NT$ {unpaidTotalAmount.toLocaleString()}
                </p>
              </div>

              <div className="tur-control-bar rounded-2xl border border-emerald-500/35 bg-emerald-950/15 p-4">
                <p className="text-xs font-bold text-emerald-300">已完成繳費</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-emerald-300">
                  {paidRegs.length} 筆
                </p>
                <p className="mt-0.5 font-mono-num text-xs text-emerald-200/80">
                  已收金額 NT$ {paidTotalAmount.toLocaleString()}
                </p>
              </div>

              <div className="tur-control-bar rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-400">已取消／總名單數</p>
                <p className="mt-1 font-mono-num text-2xl font-black text-white">
                  {cancelledRegs.length} <span className="text-sm text-slate-400">/ {registrations.length} 筆</span>
                </p>
                <p className="mt-0.5 font-mono-num text-xs text-lime-300">
                  報名人員 {capacityText}
                </p>
              </div>
            </div>

            {/* 👥 團報對帳彙總區（比照路跑管理系統） */}
            {groupSummaries.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-950/20 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-black text-amber-300">
                    <Crown className="h-4 w-4" />
                    <span>👥 團報對帳（{groupSummaries.length} 團）</span>
                  </div>
                  <span className="text-[11px] text-amber-200/80">團長統一匯款與收信，核帳後可一鍵整團入帳</span>
                </div>
                <div className="space-y-2.5">
                  {groupSummaries.map((g) => (
                    <div
                      key={g.group_code}
                      className={`rounded-xl border bg-slate-950/80 p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                        g.all_paid ? 'border-emerald-500/40' : 'border-amber-400/50'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-amber-400 px-2 py-0.5 font-mono-num font-black text-slate-950">
                            {g.group_code}
                          </span>
                          <span className="font-black text-white text-sm">{g.group_name}</span>
                          <span className="rounded bg-slate-800 border border-amber-400/40 px-2 py-0.5 font-bold text-amber-300">
                            👑 團長：{g.leader.runner_name}（{g.leader.id_masked}）
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-bold ${
                              g.all_paid
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {g.all_paid
                              ? `✅ 全團 ${g.member_count} 人已入帳`
                              : `待對帳 ${g.unpaid_count}/${g.member_count} 人`}
                          </span>
                          {g.remittance_last5 ? (
                            <span className="rounded bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 font-mono-num font-bold text-sky-300">
                              統一末五碼 {g.remittance_last5}
                            </span>
                          ) : (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">
                              尚未填報末五碼
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          團長信箱：<span className="font-mono-num text-slate-300">{g.leader.runner_email || '—'}</span> ｜ 成員：
                          {g.members.map((m, idx) => (
                            <span key={m.id} className="inline-block mr-2 text-slate-300">
                              {idx === 0 || m.group_role === 'leader' ? '👑 ' : ''}
                              {m.runner_name}({m.category_code || '—'}
                              {m.bib_number ? `・${m.bib_number}` : ''})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">共 {g.member_count} 人統一匯款</div>
                          <div className="font-mono-num text-sm font-black text-amber-300">
                            整團總額 NT$ {g.total_amount.toLocaleString()}
                          </div>
                        </div>
                        {!g.all_paid && (
                          <button
                            type="button"
                            onClick={() => handleGroupPaymentStatus(g.group_code, g.group_name, '已繳費')}
                            className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow"
                          >
                            💰 整團一次入帳 ({g.unpaid_count} 人)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 📦 聯合報名合併單彙總區（比照路跑管理系統） */}
            {eventBundles.length > 0 && (
              <div className="rounded-2xl border-2 border-emerald-400/60 bg-emerald-950/20 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-300">
                    <Package className="h-4 w-4" />
                    <span>📦 聯合報名合併單（{eventBundles.length} 筆）</span>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === 'bundle_excel'}
                    onClick={handleExportBundleExcel}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>匯出合併對帳表 (.xlsx)</span>
                  </button>
                </div>
                <div className="space-y-2.5">
                  {eventBundles.map((b) => {
                    const thisEvItem = b.items.find((it) => Number(it.event_id) === Number(event.id));
                    return (
                      <div
                        key={b.bundle_code}
                        className={`rounded-xl border bg-slate-950/80 p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                          b.all_paid ? 'border-emerald-500/40' : 'border-amber-400/50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-slate-800 border border-emerald-400/50 px-2 py-0.5 font-mono-num font-black text-emerald-300">
                              {b.bundle_code}
                            </span>
                            <span className="font-black text-white text-sm">{b.runner_name}</span>
                            <span className="font-mono-num text-slate-400">{b.id_masked}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-bold ${
                                b.all_paid
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {b.all_paid
                                ? '✅ 已全數入帳'
                                : `待對帳 ${b.unpaid_count}/${b.items.length} 場`}
                            </span>
                            {b.remittance_last5 ? (
                              <span className="rounded bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 font-mono-num font-bold text-sky-300">
                                末五碼 {b.remittance_last5}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">
                                未填末五碼
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            包含場次：
                            {b.items.map((it) => (
                              <span
                                key={it.reg_code}
                                className={`inline-block mr-2 ${
                                  Number(it.event_id) === Number(event.id)
                                    ? 'text-lime-300 font-bold'
                                    : 'text-slate-300'
                                }`}
                              >
                                {Number(it.event_id) === Number(event.id) ? '★ ' : ''}
                                {it.event_name}（{it.category_code || '—'}・NT$
                                {Number(it.total_amount || 0).toLocaleString()}・{it.payment_status}）
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">
                              本場 NT$ {Number(thisEvItem?.total_amount || 0).toLocaleString()}
                            </div>
                            <div className="font-mono-num text-sm font-black text-emerald-300">
                              合併總額 NT$ {Number(b.total_amount || 0).toLocaleString()}
                            </div>
                          </div>
                          {!b.all_paid &&
                            (b.can_cross_confirm ? (
                              <button
                                type="button"
                                onClick={() => handleBundlePaymentStatus(b.bundle_code, '已繳費')}
                                className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow"
                              >
                                💰 合併整單入帳 ({b.unpaid_count} 場)
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-300 font-bold max-w-[140px]">
                                跨承辦人單，請由最高管理員整單入帳或於下方單場入帳
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 對帳篩選與搜尋 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'all', label: `全部 (${registrations.length})` },
                  { key: 'unpaid', label: `尚未繳款 (${unpaidRegs.length})`, danger: true },
                  { key: 'paid', label: `已繳費 (${paidRegs.length})` },
                  { key: 'cancelled', label: `已取消 (${cancelledRegs.length})` },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setReconcileFilter(opt.key)}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                      reconcileFilter === opt.key
                        ? opt.danger
                          ? 'border-rose-400 bg-rose-500 text-white'
                          : 'border-lime-400 bg-lime-400 text-slate-950'
                        : opt.danger
                        ? 'border-rose-500/40 bg-rose-950/30 text-rose-300 hover:bg-rose-950/50'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={reconcileSearch}
                onChange={(e) => setReconcileSearch(e.target.value)}
                placeholder="快速搜尋姓名、團隊或尾五碼..."
                className="w-full sm:w-64 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white focus:border-lime-400 focus:outline-none"
              />
            </div>

            {/* 精簡對帳表：僅列出 姓名(團隊)、總金額、尾五碼、繳費狀況 */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/85 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">姓名（團隊）</th>
                    <th className="px-5 py-3.5">總金額</th>
                    <th className="px-5 py-3.5">尾五碼</th>
                    <th className="px-5 py-3.5 text-right">繳費狀況</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredReconcileRegs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                        此篩選條件下沒有符合的對帳資料。
                      </td>
                    </tr>
                  ) : (
                    filteredReconcileRegs.map((reg) => {
                      const isUnpaid = reg.payment_status === '待繳費';
                      return (
                        <tr
                          key={reg.id}
                          className={
                            isUnpaid
                              ? 'bg-rose-950/25 hover:bg-rose-950/35 border-l-4 border-l-rose-500'
                              : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white text-sm">
                                {reg.runner_name || '—'}
                              </span>
                              {reg.group_code && (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                                    reg.group_role === 'leader'
                                      ? 'bg-amber-400 text-slate-950'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {reg.group_role === 'leader' ? '👑 團長' : '👥 組員'}
                                </span>
                              )}
                              {reg.group_name && (
                                <span className="rounded-md border border-purple-400/40 bg-purple-500/20 px-2 py-0.5 text-[11px] font-bold text-purple-200">
                                  {reg.group_name}
                                </span>
                              )}
                              {reg.bundle_code && (
                                <span className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 font-mono-num text-[11px] font-bold text-emerald-300">
                                  📦 {reg.bundle_code}
                                </span>
                              )}
                              {isUnpaid && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[11px] font-black text-rose-300">
                                  <AlertCircle className="h-3 w-3" />
                                  尚未繳款
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 font-mono-num font-black text-amber-300 whitespace-nowrap">
                            NT$ {Number(reg.total_amount || 0).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 font-mono-num whitespace-nowrap">
                            {reg.remittance_last5 ? (
                              <span className="inline-block rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-sm font-black tracking-wider text-sky-300">
                                {reg.remittance_last5}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-rose-400">未填尾五碼</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {reg.group_code && isUnpaid && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleGroupPaymentStatus(reg.group_code, reg.group_name, '已繳費')
                                  }
                                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                                >
                                  整團設已繳費
                                </button>
                              )}
                              <select
                                value={reg.payment_status}
                                onChange={(e) => handlePaymentStatusChange(reg.id, e.target.value)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-black focus:outline-none ${
                                  reg.payment_status === '已繳費'
                                    ? 'border-emerald-500/50 bg-emerald-950/70 text-emerald-300'
                                    : reg.payment_status === '已取消'
                                    ? 'border-slate-600 bg-slate-800 text-slate-300'
                                    : 'border-rose-500/60 bg-rose-950/70 text-rose-200'
                                }`}
                              >
                                <option value="待繳費">待繳費</option>
                                <option value="已繳費">已繳費</option>
                                <option value="已取消">已取消</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: TUR 晶片計時系統連結 ==================== */}
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

              {/* 晶片對應基本參數：活動代碼與前台網址唯讀不可修改；GAS 保留以後運用 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    <span>晶片系統對應活動代碼 (eventId)</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      唯讀
                    </span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={event.timing_event_id || event.slug || ''}
                    className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 font-mono-num text-sm text-lime-300/90 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    <span>TUR 晶片計時平台前台網址</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      唯讀
                    </span>
                  </label>
                  <input
                    type="url"
                    readOnly
                    value={event.timing_portal_url || 'https://runchip-timing.vercel.app/'}
                    className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 font-mono-num text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    晶片系統 GAS 同步網址（保留以後運用・選填）
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
                    disabled={Boolean(busyAction)}
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
                    name="chip_admin_acct"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={chipAdminUser}
                    onChange={(e) => setChipAdminUser(e.target.value)}
                    placeholder="晶片系統管理員帳號"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <input
                    type="password"
                    name="chip_admin_secret"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={chipAdminPass}
                    onChange={(e) => setChipAdminPass(e.target.value)}
                    placeholder="晶片系統管理員密碼"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={Boolean(busyAction) || !event.timing_gas_url}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 disabled:opacity-40"
                >
                  {busyAction === 'push' ? (
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

      {/* 報名詳細內容彈窗（檢視） */}
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

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedReg;
                    setSelectedReg(null);
                    openEditRegModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-sky-400"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  修改此筆資料
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 承辦人修改報名者所有資料彈窗 */}
      {editingReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="tur-control-bar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-white">
                  修改報名者資料（<span className="font-mono-num text-sky-300">{editingReg.reg_code}</span>）
                </h3>
                <p className="text-xs text-slate-400">承辦人可在此直接調整報名者所有欄位、組別、配號與帳務狀態</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReg(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRegistrationEdit} className="p-6 space-y-5">
              {/* 系統管理欄位 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 space-y-3">
                <p className="text-xs font-black text-sky-300">配號、團體與帳務設定</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">參賽編號 (Bib)</label>
                    <input
                      type="text"
                      value={editRegMeta.bib_number}
                      onChange={(e) =>
                        setEditRegMeta({ ...editRegMeta, bib_number: e.target.value.toUpperCase() })
                      }
                      placeholder="例：A001"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono-num text-xs font-bold text-lime-300 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">繳費狀況</label>
                    <select
                      value={editRegMeta.payment_status}
                      onChange={(e) =>
                        setEditRegMeta({ ...editRegMeta, payment_status: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:border-lime-400 focus:outline-none"
                    >
                      <option value="待繳費">待繳費</option>
                      <option value="已繳費">已繳費</option>
                      <option value="已取消">已取消</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">匯款尾五碼</label>
                    <input
                      type="text"
                      maxLength={5}
                      value={editRegMeta.remittance_last5}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditRegMeta({ ...editRegMeta, remittance_last5: val });
                        setEditRegAnswers((prev) => ({ ...prev, remittance_last5: val }));
                      }}
                      placeholder="5 位數字"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono-num text-xs text-sky-300 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">報名類型</label>
                    <select
                      value={editRegMeta.reg_type}
                      onChange={(e) => setEditRegMeta({ ...editRegMeta, reg_type: e.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-lime-400 focus:outline-none"
                    >
                      <option value="individual">個人報名</option>
                      <option value="group">團體報名</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">匯款方式</label>
                    <select
                      value={editRegMeta.payment_mode}
                      onChange={(e) =>
                        setEditRegMeta({ ...editRegMeta, payment_mode: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-lime-400 focus:outline-none"
                    >
                      <option value="individual">個別匯款</option>
                      <option value="group">團體匯款</option>
                      <option value="bundle">合併匯款</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">團體名稱</label>
                    <input
                      type="text"
                      value={editRegMeta.group_name}
                      onChange={(e) =>
                        setEditRegMeta({ ...editRegMeta, group_name: e.target.value })
                      }
                      placeholder="選填"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 動態報名欄位（全部可編修） */}
              <div className="space-y-4">
                <p className="text-xs font-black text-lime-300">報名表所有欄位資料</p>
                {(event.fields || [])
                  .filter((f) => f.type !== 'calculated')
                  .map((field) => (
                    <DynamicFormField
                      key={field.id}
                      field={field}
                      value={editRegAnswers[field.id]}
                      onChange={handleEditRegFieldChange}
                      pricing={editRegPricing}
                      namePrefix="admin_edit_reg"
                    />
                  ))}
              </div>

              {/* 總金額自動試算 / 手動調整 */}
              <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                    <Calculator className="h-4 w-4" />
                    <span>依欄位自動試算金額：NT$ {editRegPricing.total.toLocaleString()}</span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editRegMeta.manualAmount}
                      onChange={(e) =>
                        setEditRegMeta({
                          ...editRegMeta,
                          manualAmount: e.target.checked,
                          total_amount: e.target.checked ? editRegMeta.total_amount : editRegPricing.total,
                        })
                      }
                      className="accent-amber-400"
                    />
                    <span>手動指定應繳總金額</span>
                  </label>
                </div>
                {editRegMeta.manualAmount && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300">指定總金額 NT$</span>
                    <input
                      type="number"
                      min={0}
                      value={editRegMeta.total_amount}
                      onChange={(e) =>
                        setEditRegMeta({
                          ...editRegMeta,
                          total_amount: Number(e.target.value || 0),
                        })
                      }
                      className="w-36 rounded-lg border border-amber-400/50 bg-slate-950 px-3 py-1.5 font-mono-num text-sm font-black text-amber-300 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingReg(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingRegEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60"
                >
                  {savingRegEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{savingRegEdit ? '儲存中...' : '儲存修改資料'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
