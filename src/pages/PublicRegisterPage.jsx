import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Edit3,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Mail,
  Package,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';
import BannerHero from '../components/BannerHero';
import DynamicFormField from '../components/DynamicFormField';
import {
  calculatePricing,
  validateAllFields,
  validateFieldWithCrossChecks,
  validateRemittanceLast5,
} from '../utils/validation';

function maskIdDisplay(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '—';
  if (s.length <= 4) return s[0] + '*'.repeat(Math.max(0, s.length - 1));
  return s.slice(0, 4) + '****' + s.slice(-2);
}

function formatDt(val) {
  if (!val) return '';
  return String(val).replace('T', ' ').slice(0, 16);
}

export default function PublicRegisterPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'lookup' ? 'lookup' : 'register';
  const initialRegCode = searchParams.get('regCode') || '';
  const initialRegType = searchParams.get('regType') === 'group' ? 'group' : 'individual';

  const [pageMode, setPageMode] = useState(initialMode); // 'register' | 'lookup'
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ==================== 個人 / 團體報名狀態（比照路跑管理系統購物車團長制） ====================
  const [regType, setRegType] = useState(initialRegType); // 'individual' | 'group'

  // 共用單筆填寫表單（個人模式直接送出；團報模式逐位加入右側團報名單）
  const [answers, setAnswers] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [individualPaymentMode, setIndividualPaymentMode] = useState('individual');
  const [individualGroupName, setIndividualGroupName] = useState('');

  // 團體報名專屬狀態（2～50 人・第 1 位團長統一收信匯款與管理）
  const [groupName, setGroupName] = useState('');
  const [groupCart, setGroupCart] = useState([]); // [{ answers, pricing, runnerName, idNumber, categoryLabel, email }]
  const [groupRemittanceLast5, setGroupRemittanceLast5] = useState('');
  const [groupToast, setGroupToast] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // ==================== 活動內反向查詢與改報狀態（支援團長管理全團 / 組員唯讀 / 合併單末五碼） ====================
  const [lookupIdNumber, setLookupIdNumber] = useState('');
  const [lookupCred, setLookupCred] = useState(initialRegCode);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupRecords, setLookupRecords] = useState([]);
  const [activeLookupCode, setActiveLookupCode] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editAnswers, setEditAnswers] = useState({});
  const [editPaymentMode, setEditPaymentMode] = useState('individual');
  const [editGroupName, setEditGroupName] = useState('');
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNotice, setEditNotice] = useState({ type: '', text: '' });

  // 團長整團末五碼 / 合併單末五碼快速補填
  const [quickGroupLast5, setQuickGroupLast5] = useState('');
  const [savingGroupLast5, setSavingGroupLast5] = useState(false);
  const [quickBundleLast5, setQuickBundleLast5] = useState('');
  const [savingBundleLast5, setSavingBundleLast5] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setConfirmation(null);
    setLookupRecords([]);
    setActiveLookupCode('');
    setEditMode(false);
    setGroupCart([]);
    setGroupName('');
    setGroupRemittanceLast5('');
    setGroupToast('');
    apiRequest(`/api/public/events/${encodeURIComponent(slug)}`)
      .then((data) => {
        setEvent(data.event);
        setAnswers({});
        setFieldErrors({});
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (searchParams.get('regType') === 'group') {
      setRegType('group');
    }
  }, [searchParams]);

  // 團報模式：第 1 位為團長，加入後第 2～50 位組員自動沿用團長信箱（唯讀）
  const groupLeader = groupCart[0] || null;
  const isAddingGroupMember = regType === 'group' && Boolean(groupLeader);
  const leaderEmail = groupLeader?.email || '';

  useEffect(() => {
    if (isAddingGroupMember && leaderEmail) {
      setAnswers((prev) => (prev.email === leaderEmail ? prev : { ...prev, email: leaderEmail }));
    }
  }, [isAddingGroupMember, leaderEmail]);

  const pricing = useMemo(
    () => calculatePricing(event?.fields || [], answers),
    [event, answers]
  );

  const groupTotalAmount = useMemo(
    () => groupCart.reduce((acc, item) => acc + Number(item.pricing?.total || 0), 0),
    [groupCart]
  );

  const activeLookupRecord = useMemo(() => {
    if (lookupRecords.length === 0) return null;
    return (
      lookupRecords.find((r) => r.registration?.reg_code === activeLookupCode) ||
      lookupRecords[0]
    );
  }, [lookupRecords, activeLookupCode]);

  const editPricing = useMemo(
    () => calculatePricing(event?.fields || [], editAnswers),
    [event, editAnswers]
  );

  const handleFieldChange = (fieldId, val) => {
    const nextAnswers = { ...answers, [fieldId]: val };
    setAnswers(nextAnswers);
    setFieldErrors((prev) =>
      validateFieldWithCrossChecks(event?.fields, nextAnswers, fieldId, prev, { checkRequired: false })
    );
  };

  const handleFieldBlur = (fieldId, val) => {
    const nextAnswers = { ...answers, [fieldId]: val };
    setFieldErrors((prev) =>
      validateFieldWithCrossChecks(event?.fields, nextAnswers, fieldId, prev, { checkRequired: true })
    );
  };

  // 團報模式：將目前表單這位跑者加入右側「團報名單」購物車
  const handleAddToGroupCart = () => {
    if (!event) return;
    setSubmitError('');
    setGroupToast('');

    if (groupName.trim().length < 2) {
      setSubmitError('團體報名請先填寫「團體名稱」（至少 2 字，例如：台北超馬跑團）。');
      window.scrollTo({ top: 180, behavior: 'smooth' });
      return;
    }
    if (groupCart.length >= 50) {
      setSubmitError('單次團體報名上限 50 位成員。');
      return;
    }

    const effectiveAnswers = {
      ...answers,
      ...(isAddingGroupMember && leaderEmail ? { email: leaderEmail } : {}),
      remittance_last5: '',
    };

    const formFieldsWithoutRemit = (event.fields || []).filter(
      (f) => f.id !== 'remittance_last5' && f.validation !== 'remittance_last5'
    );
    const clientErrors = validateAllFields(formFieldsWithoutRemit, effectiveAnswers, {
      allowEmptyRemittance: true,
    });

    // 額外防呆：緊急聯絡人不可與本人同名或同手機
    const runnerName = String(effectiveAnswers.full_name || '').trim();
    const runnerPhone = String(effectiveAnswers.phone || '').replace(/[\s\-()]/g, '');
    const emergName = String(effectiveAnswers.emergency_name || '').trim();
    const emergPhone = String(effectiveAnswers.emergency_phone || '').replace(/[\s\-()]/g, '');
    if (runnerName && emergName && runnerName === emergName) {
      clientErrors.emergency_name = '緊急聯絡人姓名不可與本人相同';
    }
    if (runnerPhone && emergPhone && runnerPhone === emergPhone) {
      clientErrors.emergency_phone = '緊急聯絡人電話不可與本人手機相同';
    }

    // 檢查是否與團報購物車內既有成員身分證重複
    const idUpper = String(effectiveAnswers.id_number || '').trim().toUpperCase();
    if (!clientErrors.id_number && idUpper && groupCart.some((m) => m.idNumber === idUpper)) {
      clientErrors.id_number = '此證件號碼已在右側團報名單內，請勿重複加入。';
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setSubmitError('部分欄位格式不正確或尚未填寫完整，請檢查下方紅色提示項目。');
      const firstErrId = Object.keys(clientErrors)[0];
      const el = document.getElementById(`field-wrap-${firstErrId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const memberPricing = calculatePricing(event.fields || [], effectiveAnswers);
    const catField = (event.fields || []).find((f) => f.id === 'race_category');
    const categoryLabel = catField ? String(effectiveAnswers[catField.id] || '') : '';
    const isLeader = groupCart.length === 0;
    const savedEmail = isLeader ? String(effectiveAnswers.email || '').trim() : leaderEmail;

    const nextItem = {
      answers: { ...effectiveAnswers, email: savedEmail },
      pricing: memberPricing,
      runnerName: runnerName || `成員 #${groupCart.length + 1}`,
      idNumber: idUpper,
      categoryLabel,
      email: savedEmail,
    };

    const nextCart = [...groupCart, nextItem];
    setGroupCart(nextCart);
    // 清空個人識別欄位，保留組別與沿用團長信箱，方便快速連續填寫下一位組員
    setAnswers((prev) => ({
      race_category: prev.race_category || '',
      diet_preference: prev.diet_preference || '',
      email: nextCart[0]?.email || '',
    }));
    setFieldErrors({});
    setGroupToast(
      isLeader
        ? `👑 已加入團長「${nextItem.runnerName}」（第 1 位），請繼續填寫組員資料（至少 2 人可送出團報）！`
        : `👥 已加入組員「${nextItem.runnerName}」（目前共 ${nextCart.length} / 50 人）！`
    );
  };

  const handleRemoveFromGroupCart = (idx) => {
    setGroupCart((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // 若移除後還有成員，確保全部沿用新第 1 位（團長）的 Email
      if (next.length > 0) {
        const newLeaderEmail = next[0].email || '';
        const synced = next.map((m) => ({
          ...m,
          email: newLeaderEmail,
          answers: { ...m.answers, email: newLeaderEmail },
        }));
        setAnswers((a) => ({ ...a, email: newLeaderEmail }));
        return synced;
      }
      return next;
    });
  };

  // 送出個人報名（或團報模式下按 Enter 觸發加入名單）
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!event) return;
    if (regType === 'group') {
      handleAddToGroupCart();
      return;
    }

    setSubmitError('');
    const clientErrors = validateAllFields(event.fields, answers);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setSubmitError('部分欄位格式不正確或尚未填寫完整，請檢查下方紅色提示。');
      const firstErrId = Object.keys(clientErrors)[0];
      const el = document.getElementById(`field-wrap-${firstErrId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/public/events/${encodeURIComponent(slug)}/register`, {
        method: 'POST',
        body: {
          payment_mode: individualPaymentMode,
          group_name: individualPaymentMode === 'group' ? individualGroupName.trim() : '',
          answers,
        },
      });
      setConfirmation(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.fieldErrors) setFieldErrors(err.data.fieldErrors);
      setSubmitError(err.message || '報名送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // 送出整團報名（右側團報購物車送出，2～50 人）
  const handleSubmitGroupCart = async () => {
    if (!event) return;
    setSubmitError('');

    if (groupName.trim().length < 2) {
      setSubmitError('團體報名請填寫「團體名稱」（至少 2 字）。');
      return;
    }
    if (groupCart.length < 2) {
      setSubmitError('團體報名至少須 2 位成員（第 1 位團長 ＋ 至少 1 位組員），單人請改用個人報名。');
      return;
    }
    if (groupRemittanceLast5.trim()) {
      const err5 = validateRemittanceLast5(groupRemittanceLast5);
      if (err5) {
        setSubmitError(`整團統一匯款${err5}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/public/events/${encodeURIComponent(slug)}/register-group`, {
        method: 'POST',
        body: {
          group_name: groupName.trim(),
          payment_mode: 'group',
          group_remittance_last5: groupRemittanceLast5.trim(),
          members: groupCart.map((m) => ({ answers: m.answers })),
        },
      });
      setConfirmation(res);
      setGroupCart([]);
      setGroupRemittanceLast5('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err.message || '團體報名送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== 活動內查詢與修改 ====================
  const syncLookupSelection = (record) => {
    if (!record) return;
    setActiveLookupCode(record.registration.reg_code);
    setEditAnswers({ ...(record.registration.answers || {}) });
    setEditPaymentMode(record.registration.payment_mode || 'individual');
    setEditGroupName(record.registration.group_name || '');
    setQuickGroupLast5(record.groupInfo?.remittance_last5 || '');
    setQuickBundleLast5(record.bundleInfo?.remittance_last5 || '');
    setEditFieldErrors({});
    setEditMode(false);
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    setEditNotice({ type: '', text: '' });
    setEditMode(false);
    setLookupBusy(true);
    try {
      const res = await apiRequest(`/api/public/events/${encodeURIComponent(slug)}/lookup`, {
        method: 'POST',
        body: {
          idNumber: lookupIdNumber.trim(),
          credential: lookupCred.trim(),
        },
      });
      const list =
        Array.isArray(res.groupMemberRecords) && res.groupMemberRecords.length > 0
          ? res.groupMemberRecords
          : [res];
      setLookupRecords(list);
      const primary = list.find((x) => x.registration.reg_code === res.registration.reg_code) || list[0];
      syncLookupSelection(primary);
    } catch (err) {
      setLookupRecords([]);
      setActiveLookupCode('');
      setLookupError(err.message || '查無符合的報名紀錄。');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleEditFieldChange = (fieldId, val) => {
    const nextAnswers = { ...editAnswers, [fieldId]: val };
    setEditAnswers(nextAnswers);
    setEditFieldErrors((prev) =>
      validateFieldWithCrossChecks(event?.fields, nextAnswers, fieldId, prev, { checkRequired: false })
    );
  };

  const handleEditFieldBlur = (fieldId, val) => {
    const nextAnswers = { ...editAnswers, [fieldId]: val };
    setEditFieldErrors((prev) =>
      validateFieldWithCrossChecks(event?.fields, nextAnswers, fieldId, prev, { checkRequired: true })
    );
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!activeLookupRecord) return;
    setEditNotice({ type: '', text: '' });

    const allowEmptyRemit = Boolean(
      activeLookupRecord.registration?.group_code || activeLookupRecord.registration?.bundle_code
    );
    const clientErrors = validateAllFields(event?.fields || [], editAnswers, {
      allowEmptyRemittance: allowEmptyRemit,
    });
    if (Object.keys(clientErrors).length > 0) {
      setEditFieldErrors(clientErrors);
      setEditNotice({ type: 'error', text: '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示。' });
      return;
    }

    setSavingEdit(true);
    try {
      const res = await apiRequest(
        `/api/public/events/${encodeURIComponent(slug)}/registrations/${encodeURIComponent(
          activeLookupRecord.registration.reg_code
        )}`,
        {
          method: 'PUT',
          body: {
            editToken: activeLookupRecord.editToken,
            payment_mode: editPaymentMode,
            group_name: editGroupName,
            answers: editAnswers,
          },
        }
      );
      setLookupRecords((prev) =>
        prev.map((item) =>
          item.registration.reg_code === res.registration.reg_code ? res : item
        )
      );
      syncLookupSelection(res);
      const emailTip = res.emailNotification?.notice ? ` ${res.emailNotification.notice}` : '';
      setEditNotice({ type: 'success', text: `${res.message}${emailTip}` });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.fieldErrors) setEditFieldErrors(err.data.fieldErrors);
      setEditNotice({ type: 'error', text: err.message || '資料修改失敗。' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveGroupLast5 = async () => {
    const grp = activeLookupRecord?.groupInfo;
    if (!grp?.groupRemitToken) return;
    const err5 = validateRemittanceLast5(quickGroupLast5);
    if (err5) {
      setEditNotice({ type: 'error', text: err5 });
      return;
    }
    setSavingGroupLast5(true);
    setEditNotice({ type: '', text: '' });
    try {
      const res = await apiRequest(
        `/api/public/groups/${encodeURIComponent(grp.group_code)}/remittance`,
        {
          method: 'PATCH',
          body: {
            eventId: event.id,
            remittance_last5: quickGroupLast5.trim(),
            groupRemitToken: grp.groupRemitToken,
          },
        }
      );
      setLookupRecords((prev) =>
        prev.map((item) =>
          item.registration.group_code === grp.group_code
            ? {
                ...item,
                registration: {
                  ...item.registration,
                  remittance_last5:
                    item.registration.payment_status === '已繳費'
                      ? item.registration.remittance_last5
                      : res.remittance_last5,
                },
                groupInfo: item.groupInfo
                  ? { ...item.groupInfo, remittance_last5: res.remittance_last5 }
                  : item.groupInfo,
              }
            : item
        )
      );
      setEditNotice({ type: 'success', text: res.message });
    } catch (err) {
      setEditNotice({ type: 'error', text: err.message || '更新整團末五碼失敗。' });
    } finally {
      setSavingGroupLast5(false);
    }
  };

  const handleSaveBundleLast5 = async () => {
    const bdl = activeLookupRecord?.bundleInfo;
    if (!bdl?.bundleRemitToken) return;
    const err5 = validateRemittanceLast5(quickBundleLast5);
    if (err5) {
      setEditNotice({ type: 'error', text: err5 });
      return;
    }
    setSavingBundleLast5(true);
    setEditNotice({ type: '', text: '' });
    try {
      const res = await apiRequest(
        `/api/public/bundles/${encodeURIComponent(bdl.bundle_code)}/remittance`,
        {
          method: 'PATCH',
          body: {
            remittance_last5: quickBundleLast5.trim(),
            bundleRemitToken: bdl.bundleRemitToken,
          },
        }
      );
      setLookupRecords((prev) =>
        prev.map((item) =>
          item.registration.bundle_code === bdl.bundle_code
            ? {
                ...item,
                registration: {
                  ...item.registration,
                  remittance_last5:
                    item.registration.payment_status === '已繳費'
                      ? item.registration.remittance_last5
                      : res.remittance_last5,
                },
                bundleInfo: item.bundleInfo
                  ? { ...item.bundleInfo, remittance_last5: res.remittance_last5 }
                  : item.bundleInfo,
              }
            : item
        )
      );
      setEditNotice({ type: 'success', text: res.message });
    } catch (err) {
      setEditNotice({ type: 'error', text: err.message || '更新合併單末五碼失敗。' });
    } finally {
      setSavingBundleLast5(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
          <span>載入活動報名表單中...</span>
        </div>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="min-h-screen flex flex-col">
        <TurHeader title="找不到賽事活動" showHomeLink showMultiLink showLookupLink />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <ShieldAlert className="h-14 w-14 text-rose-400 mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">找不到此路跑活動</h1>
          <p className="text-slate-400 mb-6">{loadError || '請確認您開啟的報名連結是否正確。'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" />
            返回活動報名平台
          </Link>
        </div>
      </div>
    );
  }

  // ==================== 團體報名成功確認畫面 ====================
  if (confirmation?.isGroup) {
    const grp = confirmation.group;
    const regs = confirmation.registrations || [];
    const mailInfo = confirmation.emailNotification;

    return (
      <div className="min-h-screen flex flex-col pb-16">
        <TurHeader
          title={event.name}
          subtitle="團體報名完成確認單 • 團長統一收信匯款與管理"
          showHomeLink
          showMultiLink
          showLookupLink
        />

        <div className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 mt-8">
          <div className="tur-card overflow-hidden rounded-2xl border border-amber-400/50 bg-slate-900/95 shadow-2xl">
            <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-lime-400 px-6 py-6 text-slate-950">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-10 w-10 shrink-0" />
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black">
                    團體「{grp.group_name}」報名成功！（共 {grp.member_count} 位）
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-0.5">
                    👑 團長「{grp.leader_name}」統一收信、匯款與管理，請截圖保存團報代碼
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {mailInfo?.notice && (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 text-xs sm:text-sm text-sky-200">
                  <Mail className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{mailInfo.notice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-slate-700 bg-slate-950 p-5">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">團體名稱 / 團報代碼</p>
                  <p className="mt-1 text-lg font-black text-white">{grp.group_name}</p>
                  <p className="font-mono-num text-base font-black text-amber-300">{grp.group_code}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">整團統一匯款後五碼</p>
                  <p className="mt-1 font-mono-num text-base font-black text-sky-300">
                    {grp.group_remittance_last5 || '尚未填寫（可由團長事後補填）'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    統一收信：{grp.leader_email || '—'}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase text-slate-400">全團應繳總金額</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-amber-300">
                    NT$ {Number(grp.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-300 mb-2">全團成員報名明細</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-slate-800 bg-slate-900/90 text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">角色</th>
                        <th className="px-4 py-2.5">專屬報名序號</th>
                        <th className="px-4 py-2.5">姓名 / 隱碼證號</th>
                        <th className="px-4 py-2.5">組別</th>
                        <th className="px-4 py-2.5 text-right">個人小計</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {regs.map((r, i) => {
                        const isLeader = i === 0 || r.group_role === 'leader';
                        return (
                          <tr key={r.reg_code} className={isLeader ? 'bg-amber-950/20' : ''}>
                            <td className="px-4 py-2.5">
                              {isLeader ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                                  <Crown className="h-3 w-3" /> 團長
                                </span>
                              ) : (
                                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                                  組員 #{i}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono-num font-black text-lime-400">{r.reg_code}</td>
                            <td className="px-4 py-2.5 text-white font-bold">
                              {r.runner_name}
                              <span className="ml-2 font-mono-num text-xs text-slate-400">{r.id_masked}</span>
                            </td>
                            <td className="px-4 py-2.5 font-mono-num text-emerald-300">{r.category_code || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-bold text-amber-300">
                              NT$ {Number(r.total_amount || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {confirmation.event?.payment_info && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/25 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-300 mb-2">
                    <CreditCard className="h-4 w-4" />
                    <span>匯款帳戶與對帳說明（請由團長統一匯入全團總金額）</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-200 leading-relaxed">
                    {confirmation.event.payment_info}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
                >
                  <Printer className="h-4 w-4" />
                  列印 / 存成 PDF
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLookupCred(grp.group_code);
                      setConfirmation(null);
                      setPageMode('lookup');
                    }}
                    className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-500/25"
                  >
                    團長查詢 / 補填整團末五碼
                  </button>
                  <Link
                    to="/"
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
                  >
                    返回所有活動
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <TurFooter />
      </div>
    );
  }

  // ==================== 個人報名成功確認畫面 ====================
  if (confirmation) {
    const reg = confirmation.registration;
    const mailInfo = confirmation.emailNotification;
    return (
      <div className="min-h-screen flex flex-col pb-16">
        <TurHeader
          title={event.name}
          subtitle="報名完成確認單 • 身份證字號全面隱碼保護"
          showHomeLink
          showMultiLink
          showLookupLink
        />

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 sm:px-6 mt-8">
          <div className="tur-card overflow-hidden rounded-2xl border border-emerald-400/50 bg-slate-900/95 shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-lime-500 px-6 py-6 text-slate-950">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-10 w-10 shrink-0" />
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black">
                    報名成功！我們賽道上見！
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-0.5">
                    請妥善截圖保存您的專屬報名序號，日後可隨時反向查詢或修改資料
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {mailInfo?.notice && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-4 text-xs sm:text-sm ${
                    mailInfo.sent
                      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                      : 'border-sky-500/40 bg-sky-950/30 text-sky-200'
                  }`}
                >
                  <Mail className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{mailInfo.notice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-slate-700 bg-slate-950 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    專屬報名序號
                  </p>
                  <p className="mt-1 font-mono-num text-2xl font-black tracking-wider text-lime-400">
                    {reg.reg_code}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {reg.payment_mode === 'group' ? '團體匯款後五碼' : '個別匯款後五碼'}
                  </p>
                  <p className="mt-1 font-mono-num text-xl font-black text-white">
                    {reg.remittance_last5 || (
                      <span className="text-sm font-bold text-amber-300">尚未填寫（可日後補填）</span>
                    )}
                  </p>
                  {reg.group_name && (
                    <p className="text-[11px] text-sky-300 mt-0.5">團體：{reg.group_name}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    應繳總金額
                  </p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-amber-300">
                    NT$ {Number(reg.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {reg.sheet_sync_notice && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200">
                  <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                  <span>{reg.sheet_sync_notice}</span>
                </div>
              )}

              {reg.priceBreakdown?.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-300 mb-2">費用加總明細</h3>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 divide-y divide-slate-800">
                    {reg.priceBreakdown.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-slate-300">
                          {item.fieldLabel}：<strong className="text-white">{item.itemLabel}</strong>
                        </span>
                        <span className="font-mono-num font-bold text-amber-300">
                          NT$ {Number(item.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-300">您的報名填寫明細</h3>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    身分證字號已自動隱碼顯示
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 divide-y divide-slate-800 text-sm">
                  {(event.fields || [])
                    .filter((f) => f.type !== 'calculated')
                    .map((f) => {
                      const val = reg.answers?.[f.id];
                      const isIdField = f.type === 'tw_id' || f.id === 'id_number';
                      const displayVal = isIdField
                        ? maskIdDisplay(val)
                        : Array.isArray(val)
                        ? val.join('、')
                        : val;
                      return (
                        <div key={f.id} className="grid grid-cols-3 gap-2 px-4 py-2.5">
                          <span className="text-slate-400">{f.label}</span>
                          <span
                            className={`col-span-2 font-medium text-white break-words ${
                              isIdField ? 'font-mono-num text-sky-300' : ''
                            }`}
                          >
                            {displayVal || '—'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {confirmation.event?.payment_info && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/25 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-300 mb-2">
                    <CreditCard className="h-4 w-4" />
                    <span>匯款帳戶與對帳說明</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-200 leading-relaxed">
                    {confirmation.event.payment_info}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
                  >
                    <Printer className="h-4 w-4" />
                    列印 / 存成 PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLookupCred(reg.reg_code);
                      setConfirmation(null);
                      setPageMode('lookup');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/25"
                  >
                    <Edit3 className="h-4 w-4" />
                    查詢 / 修改資料或補填後五碼
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmation(null);
                      setAnswers({});
                      setPageMode('register');
                    }}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
                  >
                    再幫親友報名
                  </button>
                  <Link
                    to="/"
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
                  >
                    返回所有活動
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <TurFooter />
      </div>
    );
  }

  // ==================== 活動主畫面 ====================
  const status = event.regState?.status || 'closed';
  const canRegister = Boolean(event.regState?.canRegister);
  // 團體報名模式採「整團統一匯款」，左側單員表單不顯示個別後五碼欄（統一由右側團報名單填寫或事後補填）
  const activeFormFields =
    regType === 'group'
      ? (event.fields || []).filter(
          (f) => f.id !== 'remittance_last5' && f.validation !== 'remittance_last5'
        )
      : event.fields || [];

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-0">
      <TurHeader
        title={event.name}
        showHomeLink
        showMultiLink
        showLookupLink
      />

      <BannerHero event={event} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 mt-5 space-y-5">
        {/* 雙功能頁籤 */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-1.5">
          <button
            type="button"
            onClick={() => setPageMode('register')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-black transition ${
              pageMode === 'register'
                ? 'bg-gradient-to-r from-emerald-500 to-lime-400 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>線上報名</span>
          </button>
          <button
            type="button"
            onClick={() => setPageMode('lookup')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-black transition ${
              pageMode === 'lookup'
                ? 'bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>查詢／修改</span>
          </button>
        </div>

        {pageMode === 'lookup' ? (
          /* ==================== 活動內反向查詢與改報分頁（支援團長全團管理／組員唯讀） ==================== */
          <section className="max-w-4xl space-y-5">
            <div className="tur-control-bar rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-white">查詢／修改報名</h2>
                  <p className="text-xs text-slate-400">
                    支援序號、團報碼（GRP...）、合併單號（TURM-...）或 Email 查詢；團報由團長統一管理
                  </p>
                </div>
              </div>

              <form onSubmit={handleLookup} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">身份證字號 *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={lookupIdNumber}
                    onChange={(e) => setLookupIdNumber(e.target.value)}
                    placeholder="A123456789"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white uppercase focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    序號 / 團報碼 / 合併單號 / Email *
                  </label>
                  <input
                    type="text"
                    required
                    value={lookupCred}
                    onChange={(e) => setLookupCred(e.target.value)}
                    placeholder="TUR26-... / GRP26-... / Email"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={lookupBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 disabled:opacity-60"
                >
                  {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span>{lookupBusy ? '查詢中...' : '驗證並查詢'}</span>
                </button>
              </form>

              {lookupError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{lookupError}</span>
                </div>
              )}
            </div>

            {editNotice.text && (
              <div
                className={`flex items-start gap-2 rounded-xl border px-4 py-3.5 text-sm ${
                  editNotice.type === 'success'
                    ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
                    : 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                }`}
              >
                {editNotice.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                )}
                <span>{editNotice.text}</span>
              </div>
            )}

            {activeLookupRecord && (
              <div className="space-y-4">
                {/* 團長管理面板 */}
                {activeLookupRecord.groupInfo?.isLeader && (
                  <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-950/25 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-black text-amber-300">
                          <Crown className="h-5 w-5" />
                          <span>
                            團長管理：{activeLookupRecord.groupInfo.group_name}（
                            {activeLookupRecord.groupInfo.group_code}）
                          </span>
                        </div>
                        <p className="text-xs text-amber-100/80 mt-0.5">
                          共 {activeLookupRecord.groupInfo.member_count} 人 ｜ 全團總額{' '}
                          <strong className="font-mono-num text-amber-300">
                            NT$ {Number(activeLookupRecord.groupInfo.total_amount || 0).toLocaleString()}
                          </strong>
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          activeLookupRecord.groupInfo.unpaid_count > 0
                            ? 'bg-rose-500/20 border border-rose-400/50 text-rose-300'
                            : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                        }`}
                      >
                        {activeLookupRecord.groupInfo.unpaid_count > 0
                          ? `待對帳 (${activeLookupRecord.groupInfo.unpaid_count}/${activeLookupRecord.groupInfo.member_count})`
                          : '✅ 全團已繳費'}
                      </span>
                    </div>

                    {activeLookupRecord.groupInfo.groupRemitToken && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-amber-200">🏦 整團末 5 碼：</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={quickGroupLast5}
                          onChange={(e) => setQuickGroupLast5(e.target.value.replace(/[^\d]/g, ''))}
                          placeholder="5 位數字"
                          className="w-36 rounded-xl border border-amber-400/60 bg-slate-950 px-3 py-1.5 font-mono-num text-sm text-white focus:border-amber-300 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingGroupLast5}
                          onClick={handleSaveGroupLast5}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-black text-slate-950 disabled:opacity-60"
                        >
                          {savingGroupLast5 ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          <span>套用全團</span>
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {lookupRecords.map((item, idx) => {
                        const isLdr = item.registration.group_role === 'leader';
                        const isActive = item.registration.reg_code === activeLookupRecord.registration.reg_code;
                        return (
                          <button
                            key={item.registration.reg_code}
                            type="button"
                            onClick={() => syncLookupSelection(item)}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                              isActive
                                ? 'border-amber-400 bg-amber-400 text-slate-950 font-black'
                                : 'border-slate-700 bg-slate-950/80 text-slate-200 hover:border-amber-400/60'
                            }`}
                          >
                            {isLdr ? '👑' : `#${idx}`} {item.registration.runner_name}（
                            {item.registration.bib_number || item.registration.payment_status}）
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 組員唯讀提示 */}
                {activeLookupRecord.groupInfo?.isMemberReadOnly && (
                  <div className="rounded-2xl border-2 border-rose-500/60 bg-rose-950/30 p-4 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5">
                    <Lock className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <p className="font-black text-rose-300">🔒 組員唯讀（不可修改）</p>
                      <p className="mt-0.5">
                        本筆屬團體報名「{activeLookupRecord.groupInfo.group_name}」（
                        {activeLookupRecord.groupInfo.group_code}）。如需異動資料或補填匯款末 5 碼，請洽團長「
                        <strong>{activeLookupRecord.groupInfo.leader_name || '團長'}</strong>」登入修改。
                      </p>
                    </div>
                  </div>
                )}

                {/* 合併單提示與末五碼套用全單 */}
                {activeLookupRecord.bundleInfo && (
                  <div className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/25 p-4 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-black text-emerald-300 text-sm">
                        <Package className="h-4 w-4" />
                        <span>
                          合併單 {activeLookupRecord.bundleInfo.bundle_code}（共{' '}
                          {activeLookupRecord.bundleInfo.event_count} 場・合計 NT${' '}
                          {Number(activeLookupRecord.bundleInfo.total_amount || 0).toLocaleString()}）
                        </span>
                      </div>
                      <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 font-bold text-emerald-200">
                        {activeLookupRecord.bundleInfo.unpaid_count > 0
                          ? `待對帳 ${activeLookupRecord.bundleInfo.unpaid_count} 場`
                          : '✅ 已全數入帳'}
                      </span>
                    </div>
                    {activeLookupRecord.bundleInfo.bundleRemitToken && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emerald-200">🏦 合併單末 5 碼：</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={quickBundleLast5}
                          onChange={(e) => setQuickBundleLast5(e.target.value.replace(/[^\d]/g, ''))}
                          placeholder="5 位數字"
                          className="w-36 rounded-xl border border-emerald-400/60 bg-slate-950 px-3 py-1.5 font-mono-num text-sm text-white"
                        />
                        <button
                          type="button"
                          disabled={savingBundleLast5}
                          onClick={handleSaveBundleLast5}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 text-xs font-black text-slate-950 disabled:opacity-60"
                        >
                          {savingBundleLast5 ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          <span>套用全單</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="tur-card rounded-2xl border border-slate-800 bg-slate-900/95 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-950/80 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                            activeLookupRecord.registration.payment_status === '已繳費'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : activeLookupRecord.registration.payment_status === '已取消'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {activeLookupRecord.registration.payment_status}
                        </span>
                        <span className="font-mono-num text-sm font-black text-sky-300">
                          序號：{activeLookupRecord.registration.reg_code}
                        </span>
                        {activeLookupRecord.registration.group_code && (
                          <span className="rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-xs font-bold text-amber-200">
                            {activeLookupRecord.registration.group_role === 'leader' ? '👑 團長' : '👥 組員'}：
                            {activeLookupRecord.registration.group_name} ({activeLookupRecord.registration.group_code})
                          </span>
                        )}
                        {activeLookupRecord.registration.bundle_code && (
                          <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-mono-num text-xs font-bold text-emerald-300">
                            📦 {activeLookupRecord.registration.bundle_code}
                          </span>
                        )}
                        {activeLookupRecord.registration.bib_number && (
                          <span className="rounded bg-lime-500/20 border border-lime-400/40 px-2 py-0.5 font-mono-num text-xs font-black text-lime-300">
                            參賽編號：{activeLookupRecord.registration.bib_number}
                          </span>
                        )}
                      </div>
                      <p className="text-base font-black text-white">
                        {activeLookupRecord.registration.runner_name}（{activeLookupRecord.registration.id_masked}）
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="font-mono-num text-xl font-black text-amber-300">
                        NT$ {Number(activeLookupRecord.registration.total_amount || 0).toLocaleString()}
                      </p>
                      <p className="text-xs font-mono-num text-slate-300">
                        後五碼：
                        {activeLookupRecord.registration.remittance_last5 ? (
                          <strong className="text-emerald-300 ml-1">
                            {activeLookupRecord.registration.remittance_last5}
                          </strong>
                        ) : (
                          <span className="text-rose-400 font-bold ml-1">尚未填寫</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {editMode ? (
                    <form onSubmit={handleSaveEdit} noValidate className="p-6 space-y-5">
                      {activeLookupRecord.pricingLocked && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200">
                          <Lock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                          <span>{activeLookupRecord.pricingLockedNotice}</span>
                        </div>
                      )}

                      <div className="space-y-4">
                        {(event.fields || [])
                          .filter((f) => !(activeLookupRecord.groupInfo && f.id === 'remittance_last5'))
                          .map((field) => {
                            const lockMemberEmail = Boolean(
                              activeLookupRecord.groupInfo?.isEditingOtherMember &&
                                (field.id === 'email' || field.type === 'email')
                            );
                            return (
                              <DynamicFormField
                                key={field.id}
                                field={field}
                                value={editAnswers[field.id]}
                                onChange={handleEditFieldChange}
                                onBlur={handleEditFieldBlur}
                                error={editFieldErrors[field.id]}
                                pricing={editPricing}
                                namePrefix="edit"
                                readOnly={lockMemberEmail}
                                labelBadge={lockMemberEmail ? '沿用團長信箱' : ''}
                              />
                            );
                          })}
                      </div>

                      <div className="rounded-xl border border-lime-400/35 bg-slate-950 p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Calculator className="h-5 w-5 text-amber-300" />
                          <span className="text-xs sm:text-sm font-bold text-slate-300">更新後應繳總金額：</span>
                          <span className="font-mono-num text-xl font-black text-amber-300">
                            NT$ {editPricing.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditMode(false)}
                            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                          >
                            取消
                          </button>
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60"
                          >
                            {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            <span>{savingEdit ? '儲存中...' : '儲存修改並寄送通知信'}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="p-6 space-y-5">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/75 divide-y divide-slate-800 text-xs sm:text-sm">
                        {(event.fields || [])
                          .filter((f) => f.type !== 'calculated')
                          .map((f) => {
                            const val = activeLookupRecord.registration.answers?.[f.id];
                            const isIdField = f.type === 'tw_id' || f.id === 'id_number';
                            const displayVal = isIdField
                              ? maskIdDisplay(val)
                              : Array.isArray(val)
                              ? val.join('、')
                              : val;
                            return (
                              <div key={f.id} className="grid grid-cols-3 gap-2 px-4 py-2.5">
                                <span className="text-slate-400">{f.label}</span>
                                <span className="col-span-2 text-white font-medium break-words">
                                  {displayVal || '—'}
                                </span>
                              </div>
                            );
                          })}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {!activeLookupRecord.canEdit ? (
                          <p className="text-xs text-amber-300">{activeLookupRecord.cannotEditReason}</p>
                        ) : (
                          <p className="text-xs text-slate-400">
                            {activeLookupRecord.groupInfo?.isLeader
                              ? '團長可點右側修改此成員資料，或於上方一次套用全團統一匯款後五碼。'
                              : '完成轉帳後可點右側按鈕補填匯款帳號後五碼，或修改其他報名資料。'}
                          </p>
                        )}
                        {activeLookupRecord.canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditMode(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>修改此筆報名資料</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          /* ==================== 線上報名表單分頁（個人 / 團報購物車） ==================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              {event.description && (
                <details className="tur-control-bar rounded-2xl px-5 py-3.5 group">
                  <summary className="cursor-pointer text-sm font-bold text-lime-300 select-none list-none flex items-center justify-between">
                    <span>📜 賽事簡介與活動簡章</span>
                    <span className="text-xs text-slate-400 group-open:hidden">展開</span>
                    <span className="text-xs text-slate-400 hidden group-open:inline">收合</span>
                  </summary>
                  <p className="mt-2.5 whitespace-pre-line text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {event.description}
                  </p>
                </details>
              )}

              {!canRegister ? (
                <div
                  className={`rounded-2xl border-2 p-8 text-center space-y-3 ${
                    status === 'preparing'
                      ? 'border-sky-500/40 bg-sky-950/25'
                      : 'border-slate-700 bg-slate-900/70'
                  }`}
                >
                  {status === 'preparing' ? (
                    <Hourglass className="mx-auto h-12 w-12 text-sky-400" />
                  ) : (
                    <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
                  )}
                  <h2 className="text-xl font-black text-white">
                    {status === 'preparing' ? '本活動目前籌備中' : '本活動已結案'}
                  </h2>
                  <p className="text-slate-300">{event.regState?.reason}</p>
                  {status === 'preparing' && event.reg_start_at && (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-sky-400/35 bg-slate-950/80 px-4 py-2 text-xs sm:text-sm font-bold text-sky-300">
                      <Clock className="h-4 w-4" />
                      <span>報名開放起始時間：{formatDt(event.reg_start_at)}</span>
                    </div>
                  )}
                  <div className="pt-2">
                    <Link
                      to="/"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      返回瀏覽其他活動
                    </Link>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleFormSubmit}
                  noValidate
                  className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-8 shadow-xl space-y-6"
                >
                  {/* 步驟 1：個人 / 團體報名雙切換卡（比照路跑管理系統） */}
                  <div className="space-y-3 border-b border-slate-800 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRegType('individual');
                          setSubmitError('');
                          setGroupToast('');
                        }}
                        className={`rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                          regType === 'individual'
                            ? 'border-lime-400 bg-lime-500/15 text-white shadow'
                            : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm sm:text-base font-black">
                            <User className={`h-4 w-4 ${regType === 'individual' ? 'text-lime-400' : 'text-slate-400'}`} />
                            個人報名
                          </span>
                          {regType === 'individual' && (
                            <span className="rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                              目前
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">單人填寫報名與各自繳費</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRegType('group');
                          setSubmitError('');
                        }}
                        className={`rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                          regType === 'group'
                            ? 'border-amber-400 bg-amber-500/15 text-white shadow'
                            : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-amber-400/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm sm:text-base font-black">
                            <Users className={`h-4 w-4 ${regType === 'group' ? 'text-amber-400' : 'text-slate-400'}`} />
                            團體報名
                          </span>
                          {regType === 'group' && (
                            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                              目前
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-amber-200/80 mt-1">
                          2～50 人・團長統一收信匯款與管理
                        </p>
                      </button>
                    </div>

                    {/* 個人匯款方式 */}
                    {regType === 'individual' && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <label
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer ${
                              individualPaymentMode === 'individual'
                                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
                                : 'border-slate-700 text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="indPayMode"
                              checked={individualPaymentMode === 'individual'}
                              onChange={() => setIndividualPaymentMode('individual')}
                              className="accent-emerald-400"
                            />
                            <span>個別匯款</span>
                          </label>
                          <label
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer ${
                              individualPaymentMode === 'group'
                                ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                                : 'border-slate-700 text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="indPayMode"
                              checked={individualPaymentMode === 'group'}
                              onChange={() => setIndividualPaymentMode('group')}
                              className="accent-amber-400"
                            />
                            <span>團體匯款</span>
                          </label>
                        </div>
                        {individualPaymentMode === 'group' && (
                          <input
                            type="text"
                            value={individualGroupName}
                            onChange={(e) => setIndividualGroupName(e.target.value)}
                            placeholder="團體名稱（選填，例：台北跑團）"
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                          />
                        )}
                      </div>
                    )}

                    {/* 團體報名專屬設定面板（比照路跑管理系統） */}
                    {regType === 'group' && (
                      <div className="rounded-xl border-2 border-amber-400/60 bg-amber-950/25 p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-amber-300 mb-1">
                            團體名稱 *（至少 2 字）
                          </label>
                          <input
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="例：台北超馬跑團"
                            className="w-full rounded-xl border border-amber-400/40 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        {!groupLeader ? (
                          <div className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/20 px-3.5 py-2.5 text-xs font-black text-amber-200">
                            <Crown className="h-4 w-4 shrink-0 text-amber-300" />
                            <span>第 1 位（團長）— 統一收信、匯款與管理（填完後按下方「加入團長」）</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl border border-sky-400/50 bg-sky-500/15 px-3.5 py-2.5 text-xs font-black text-sky-200">
                            <Users className="h-4 w-4 shrink-0 text-sky-300" />
                            <span>
                              第 {groupCart.length + 1} 位（組員）— 自動沿用團長信箱（{leaderEmail}）
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {groupToast && (
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3.5 text-xs sm:text-sm font-bold text-emerald-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                      <span>{groupToast}</span>
                    </div>
                  )}

                  {submitError && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 text-sm text-rose-200">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* 步驟 2：動態報名欄位 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-black text-white">
                        {regType === 'group'
                          ? !groupLeader
                            ? '填寫第 1 位團長資料'
                            : `填寫第 ${groupCart.length + 1} 位組員資料`
                          : '報名資料'}
                      </h3>
                      {regType === 'group' && (
                        <span className="rounded-lg bg-amber-500/15 border border-amber-400/35 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                          整團匯款末五碼於右側團報名單填寫
                        </span>
                      )}
                    </div>

                    {activeFormFields.map((field) => {
                      const isEmailField = field.id === 'email' || field.type === 'email';
                      const lockEmailForMember = isAddingGroupMember && isEmailField;
                      const badgeText =
                        regType === 'group' && isEmailField
                          ? groupLeader
                            ? '沿用團長信箱'
                            : '團長統一收信'
                          : '';
                      return (
                        <div key={field.id} id={`field-wrap-${field.id}`}>
                          <DynamicFormField
                            field={field}
                            value={lockEmailForMember ? leaderEmail : answers[field.id]}
                            onChange={handleFieldChange}
                            onBlur={handleFieldBlur}
                            error={fieldErrors[field.id]}
                            pricing={pricing}
                            readOnly={lockEmailForMember}
                            labelBadge={badgeText}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* 表單底部小計與送出／加入團報名單按鈕 */}
                  <div className="rounded-xl border border-lime-400/35 bg-slate-950 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-300">
                        {regType === 'group' ? '本位成員小計' : '本次報名應繳總金額'}
                      </span>
                      <span className="font-mono-num text-2xl sm:text-3xl font-black text-amber-300">
                        NT$ {pricing.total.toLocaleString()}
                      </span>
                    </div>

                    {regType === 'group' ? (
                      <button
                        type="submit"
                        disabled={groupCart.length >= 50}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-6 py-4 text-base font-black text-slate-950 disabled:opacity-50 transition shadow-lg shadow-amber-950/40"
                      >
                        {!groupLeader ? <Crown className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                        <span>
                          {!groupLeader
                            ? '👑 加入團長（第 1 位）'
                            : `➕ 加入組員（第 ${groupCart.length + 1} 位）`}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-6 py-4 text-base font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60 transition shadow-lg shadow-emerald-950/50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>送出中...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-5 w-5" />
                            <span>送出報名</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* 右側欄：團報名單購物車（團報時強制顯示含手機） + 名額狀態 + 費用試算 + 匯款帳戶 */}
            <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
              {/* 團報名單購物車卡片（比照路跑管理系統） */}
              {regType === 'group' && canRegister && (
                <div className="tur-card rounded-2xl border-2 border-amber-400/75 bg-slate-900/95 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
                      <Users className="h-4 w-4" />
                      <span>👥 團報名單</span>
                    </div>
                    <span className="rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 font-mono-num text-xs font-black text-amber-300">
                      {groupCart.length} / 50
                    </span>
                  </div>

                  {groupCart.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      尚無成員（請於左側填寫第 1 位團長資料後按「加入團長」，至少 2 人可送出團報）
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {groupCart.map((m, idx) => (
                        <div
                          key={`${m.idNumber}-${idx}`}
                          className={`flex items-start justify-between gap-2 rounded-xl border p-2.5 text-xs ${
                            idx === 0
                              ? 'border-amber-400/60 bg-amber-950/30'
                              : 'border-slate-700 bg-slate-950/70'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                                  idx === 0
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {idx === 0 ? '👑 團長' : `組員 #${idx}`}
                              </span>
                              <strong className="text-white truncate">{m.runnerName}</strong>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {m.categoryLabel || '已選組別'} ·{' '}
                              <span className="font-mono-num font-bold text-amber-300">
                                NT$ {Number(m.pricing?.total || 0).toLocaleString()}
                              </span>
                            </p>
                            {idx === 0 && (
                              <p className="text-[10px] text-amber-200/80 truncate">
                                ✉️ 統一收信：{m.email}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromGroupCart(idx)}
                            title="移除此成員"
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 整團統一匯款末五碼（選填，可事後補填） */}
                  <div className="border-t border-slate-800 pt-3 space-y-1.5">
                    <label className="block text-xs font-bold text-amber-300">
                      🏦 整團匯款末 5 碼（選填，可事後補填）
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={groupRemittanceLast5}
                      onChange={(e) => setGroupRemittanceLast5(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="5 位數字（可先留空）"
                      className="w-full rounded-xl border border-amber-400/40 bg-slate-950 px-3 py-2 font-mono-num text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div className="border-t border-slate-800 pt-3 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold text-slate-400">全團應繳總額</span>
                      <span className="font-mono-num text-2xl font-black text-amber-300">
                        NT$ {groupTotalAmount.toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={submitting || groupCart.length < 2}
                      onClick={handleSubmitGroupCart}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-3 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:bg-slate-800 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 transition shadow-lg"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>送出團報中...</span>
                        </>
                      ) : groupCart.length >= 2 ? (
                        <>
                          <Send className="h-4 w-4" />
                          <span>✅ 送出團報（{groupCart.length} 人）</span>
                        </>
                      ) : groupCart.length === 1 ? (
                        <span>➕ 請再加入至少 1 位組員 (1/2)</span>
                      ) : (
                        <span>✅ 送出團報（至少 2 人）</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="tur-control-bar rounded-2xl p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Users className="h-4 w-4 text-lime-400" />
                  <span>報名人員／名額上限</span>
                </div>
                <span className="font-mono-num text-base font-black text-lime-300">
                  {Number(event.registration_count || 0)} /{' '}
                  {Number(event.max_participants || 0) > 0 ? event.max_participants : '不限'}
                </span>
              </div>

              {canRegister && regType === 'individual' && (
                <div className="hidden lg:block tur-control-bar rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-amber-300 text-sm font-bold mb-3">
                    <Calculator className="h-4 w-4" />
                    <span>費用試算</span>
                  </div>

                  {pricing.breakdown.length > 0 ? (
                    <ul className="space-y-2 text-sm border-b border-slate-800 pb-3 mb-3">
                      {pricing.breakdown.map((item, i) => (
                        <li key={i} className="flex items-start justify-between gap-2">
                          <span className="font-medium text-slate-200">{item.itemLabel}</span>
                          <span className="font-mono-num font-bold text-amber-300 shrink-0">
                            NT$ {item.amount.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 border-b border-slate-800 pb-3 mb-3">
                      選擇組別後自動計算
                    </p>
                  )}

                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-slate-300">總計</span>
                    <span className="font-mono-num text-2xl font-black text-white">
                      NT$ {pricing.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {event.payment_info && (
                <div className="tur-card rounded-2xl border border-slate-800 bg-slate-900/85 p-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400 mb-2">
                    <CreditCard className="h-4 w-4" />
                    <span>匯款帳戶</span>
                  </div>
                  <p className="whitespace-pre-line text-xs text-slate-300 leading-relaxed">
                    {event.payment_info}
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>

      {pageMode === 'register' && canRegister && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-400">
                {regType === 'group' ? `團報購物車（${groupCart.length} 位）` : '應繳總金額'}
              </p>
              <p className="font-mono-num text-xl font-black text-amber-300">
                NT$ {(regType === 'group' ? groupTotalAmount : pricing.total).toLocaleString()}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {regType === 'group'
                ? groupCart.length >= 2
                  ? '可於下方團報名單送出'
                  : '至少 2 人可送出團報'
                : `已選 ${pricing.breakdown.length} 項計費項目`}
            </span>
          </div>
        </div>
      )}

      <TurFooter />
    </div>
  );
}
