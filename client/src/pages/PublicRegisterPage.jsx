import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Mail,
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

  const [pageMode, setPageMode] = useState(initialMode); // 'register' | 'lookup'
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ==================== 個人 / 團體報名狀態 ====================
  const [regType, setRegType] = useState('individual'); // 'individual' | 'group'

  // 個人報名欄位
  const [answers, setAnswers] = useState({});
  const [individualPaymentMode, setIndividualPaymentMode] = useState('individual'); // 'individual' | 'group'
  const [individualGroupName, setIndividualGroupName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // 團體報名欄位
  const [groupName, setGroupName] = useState('');
  const [groupPaymentMode, setGroupPaymentMode] = useState('group'); // 'group' | 'individual'
  const [groupRemittanceLast5, setGroupRemittanceLast5] = useState('');
  const [groupMembers, setGroupMembers] = useState([{}, {}]);
  const [memberErrors, setMemberErrors] = useState({});

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // ==================== 活動內反向查詢與改報狀態 ====================
  const [lookupBy, setLookupBy] = useState('regCode');
  const [lookupIdNumber, setLookupIdNumber] = useState('');
  const [lookupRegCode, setLookupRegCode] = useState(initialRegCode);
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editAnswers, setEditAnswers] = useState({});
  const [editPaymentMode, setEditPaymentMode] = useState('individual');
  const [editGroupName, setEditGroupName] = useState('');
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNotice, setEditNotice] = useState({ type: '', text: '' });

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setConfirmation(null);
    setLookupResult(null);
    setEditMode(false);
    apiRequest(`/api/public/events/${encodeURIComponent(slug)}`)
      .then((data) => {
        setEvent(data.event);
        setAnswers({});
        setFieldErrors({});
        setGroupMembers([{}, {}]);
        setMemberErrors({});
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const pricing = useMemo(
    () => calculatePricing(event?.fields || [], answers),
    [event, answers]
  );

  const groupPricingList = useMemo(
    () => groupMembers.map((m) => calculatePricing(event?.fields || [], m)),
    [event, groupMembers]
  );

  const groupTotalAmount = useMemo(
    () => groupPricingList.reduce((acc, p) => acc + Number(p.total || 0), 0),
    [groupPricingList]
  );

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

  const handleGroupMemberFieldChange = (memberIdx, fieldId, val) => {
    const nextMemberAns = { ...(groupMembers[memberIdx] || {}), [fieldId]: val };
    setGroupMembers((prev) =>
      prev.map((m, idx) => (idx === memberIdx ? nextMemberAns : m))
    );
    setMemberErrors((prev) => ({
      ...prev,
      [memberIdx]: validateFieldWithCrossChecks(
        event?.fields,
        nextMemberAns,
        fieldId,
        prev[memberIdx] || {},
        { checkRequired: false }
      ),
    }));
  };

  const handleGroupMemberFieldBlur = (memberIdx, fieldId, val) => {
    const nextMemberAns = { ...(groupMembers[memberIdx] || {}), [fieldId]: val };
    setMemberErrors((prev) => ({
      ...prev,
      [memberIdx]: validateFieldWithCrossChecks(
        event?.fields,
        nextMemberAns,
        fieldId,
        prev[memberIdx] || {},
        { checkRequired: true }
      ),
    }));
  };

  const addGroupMember = () => {
    if (groupMembers.length >= 50) return;
    setGroupMembers((prev) => [...prev, {}]);
  };

  const removeGroupMember = (idx) => {
    if (groupMembers.length <= 1) return;
    setGroupMembers((prev) => prev.filter((_, i) => i !== idx));
    setMemberErrors({});
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

  // 送出個人報名或團體報名
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!event) return;
    setSubmitError('');

    // -------------------- 個人報名送出 --------------------
    if (regType === 'individual') {
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
      return;
    }

    // -------------------- 團體報名送出 --------------------
    if (!groupName.trim()) {
      setSubmitError('請先填寫「團體名稱」（例如：台北超馬大隊）。');
      window.scrollTo({ top: 200, behavior: 'smooth' });
      return;
    }

    const remittanceField = (event?.fields || []).find(
      (f) => f.id === 'remittance_last5' || f.validation === 'remittance_last5'
    );
    if (groupPaymentMode === 'group') {
      if (remittanceField?.required && !groupRemittanceLast5.trim()) {
        setSubmitError('請填寫團體匯款帳號尾五碼（5 位純數字）。');
        window.scrollTo({ top: 200, behavior: 'smooth' });
        return;
      }
      if (groupRemittanceLast5.trim()) {
        const err5 = validateRemittanceLast5(groupRemittanceLast5);
        if (err5) {
          setSubmitError(`團體${err5}`);
          return;
        }
      }
    }

    const nextMemberErrors = {};
    for (let i = 0; i < groupMembers.length; i++) {
      const mAnswers = {
        ...groupMembers[i],
        ...(groupPaymentMode === 'group' ? { remittance_last5: groupRemittanceLast5.trim() } : {}),
      };
      const errs = validateAllFields(event.fields, mAnswers);
      if (Object.keys(errs).length > 0) {
        nextMemberErrors[i] = errs;
      }
    }
    if (Object.keys(nextMemberErrors).length > 0) {
      setMemberErrors(nextMemberErrors);
      const errNums = Object.keys(nextMemberErrors).map((k) => Number(k) + 1).join('、');
      setSubmitError(`第 ${errNums} 位團員欄位格式不正確或尚未填寫完整，請檢查紅色提示。`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/public/events/${encodeURIComponent(slug)}/register-group`, {
        method: 'POST',
        body: {
          group_name: groupName.trim(),
          payment_mode: groupPaymentMode,
          group_remittance_last5: groupPaymentMode === 'group' ? groupRemittanceLast5.trim() : '',
          members: groupMembers.map((m) => ({ answers: m })),
        },
      });
      setConfirmation(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.memberErrors) setMemberErrors(err.data.memberErrors);
      setSubmitError(err.message || '團體報名送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    setEditNotice({ type: '', text: '' });
    setEditMode(false);
    setLookupBusy(true);
    try {
      const payload =
        lookupBy === 'regCode'
          ? { idNumber: lookupIdNumber.trim(), regCode: lookupRegCode.trim() }
          : { idNumber: lookupIdNumber.trim(), email: lookupEmail.trim() };

      const res = await apiRequest(`/api/public/events/${encodeURIComponent(slug)}/lookup`, {
        method: 'POST',
        body: payload,
      });
      setLookupResult(res);
      setEditAnswers({ ...(res.registration?.answers || {}) });
      setEditPaymentMode(res.registration?.payment_mode || 'individual');
      setEditGroupName(res.registration?.group_name || '');
    } catch (err) {
      setLookupResult(null);
      setLookupError(err.message || '查無符合的報名紀錄。');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!lookupResult) return;
    setEditNotice({ type: '', text: '' });

    const clientErrors = validateAllFields(event?.fields || [], editAnswers);
    if (Object.keys(clientErrors).length > 0) {
      setEditFieldErrors(clientErrors);
      setEditNotice({ type: 'error', text: '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示。' });
      return;
    }

    setSavingEdit(true);
    try {
      const res = await apiRequest(
        `/api/public/events/${encodeURIComponent(slug)}/registrations/${encodeURIComponent(
          lookupResult.registration.reg_code
        )}`,
        {
          method: 'PUT',
          body: {
            editToken: lookupResult.editToken,
            payment_mode: editPaymentMode,
            group_name: editGroupName,
            answers: editAnswers,
          },
        }
      );
      setLookupResult(res);
      setEditAnswers({ ...(res.registration?.answers || {}) });
      setEditPaymentMode(res.registration?.payment_mode || 'individual');
      setEditGroupName(res.registration?.group_name || '');
      setEditMode(false);
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
        <TurHeader title="找不到賽事活動" showHomeLink showLookupLink />
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
          subtitle="團體報名完成確認單 • 身份證字號全面隱碼保護"
          statusLabel="團體報名已登錄"
          showHomeLink
          showLookupLink
        />

        <div className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 mt-8">
          <div className="tur-card overflow-hidden rounded-2xl border border-emerald-400/50 bg-slate-900/95 shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-lime-500 px-6 py-6 text-slate-950">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-10 w-10 shrink-0" />
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black">
                    團體「{grp.group_name}」報名成功！（共 {grp.member_count} 位）
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-0.5">
                    請截圖或列印保存團報代碼與每位團員的專屬報名序號
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
                  <p className="font-mono-num text-sm font-bold text-lime-400">{grp.group_code}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">匯款方式 / 後五碼</p>
                  <p className="mt-1 text-sm font-black text-sky-300">
                    {grp.payment_mode === 'group' ? '團體匯款（統一轉帳）' : '個別匯款（各團員自匯）'}
                  </p>
                  {grp.payment_mode === 'group' && (
                    <p className="font-mono-num text-sm text-white mt-0.5">
                      後五碼：{grp.group_remittance_last5 || '尚未填寫（可日後補填）'}
                    </p>
                  )}
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
                        <th className="px-4 py-2.5">#</th>
                        <th className="px-4 py-2.5">專屬報名序號</th>
                        <th className="px-4 py-2.5">姓名 / 隱碼證號</th>
                        <th className="px-4 py-2.5">組別</th>
                        <th className="px-4 py-2.5">匯款後五碼</th>
                        <th className="px-4 py-2.5 text-right">個人金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {regs.map((r, i) => (
                        <tr key={r.reg_code}>
                          <td className="px-4 py-2.5 font-mono-num text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-mono-num font-black text-lime-400">{r.reg_code}</td>
                          <td className="px-4 py-2.5 text-white font-bold">
                            {r.runner_name}
                            <span className="ml-2 font-mono-num text-xs text-slate-400">{r.id_masked}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-emerald-300">{r.category_code || '—'}</td>
                          <td className="px-4 py-2.5 font-mono-num text-sky-300">{r.remittance_last5 || '未填'}</td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-bold text-amber-300">
                            NT$ {Number(r.total_amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
                >
                  <Printer className="h-4 w-4" />
                  列印 / 存成 PDF
                </button>
                <div className="flex items-center gap-2">
                  <Link
                    to="/lookup"
                    className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/25"
                  >
                    查詢 / 修改報名
                  </Link>
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
          statusLabel="報名已登錄"
          showHomeLink
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
                      setLookupRegCode(reg.reg_code);
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
  // 團體報名若選「團體匯款」，各成員表單內隱藏個別後五碼欄位（統一由最上方團體後五碼欄位輸入）
  const groupMemberFields = (event.fields || []).filter(
    (f) => !(groupPaymentMode === 'group' && f.id === 'remittance_last5')
  );

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-0">
      <TurHeader
        title={event.name}
        showHomeLink
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
          /* ==================== 活動內反向查詢與改報分頁 ==================== */
          <section className="max-w-4xl space-y-5">
            <div className="tur-control-bar rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black text-white">查詢／修改報名</h2>
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setLookupBy('regCode')}
                    className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                      lookupBy === 'regCode' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    報名序號
                  </button>
                  <button
                    type="button"
                    onClick={() => setLookupBy('email')}
                    className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                      lookupBy === 'email' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Email
                  </button>
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
                {lookupBy === 'regCode' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">報名序號 *</label>
                    <input
                      type="text"
                      required
                      value={lookupRegCode}
                      onChange={(e) => setLookupRegCode(e.target.value)}
                      placeholder="例如：TUR26-0001"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white uppercase focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">報名電子信箱 *</label>
                    <input
                      type="email"
                      required
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      placeholder="runner@example.com"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                )}
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

            {lookupResult && (
              <div className="tur-card rounded-2xl border border-slate-800 bg-slate-900/95 overflow-hidden">
                <div className="border-b border-slate-800 bg-slate-950/80 p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                          lookupResult.registration.payment_status === '已繳費'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : lookupResult.registration.payment_status === '已取消'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {lookupResult.registration.payment_status}
                      </span>
                      <span className="font-mono-num text-sm font-black text-sky-300">
                        序號：{lookupResult.registration.reg_code}
                      </span>
                      {lookupResult.registration.reg_type === 'group' && (
                        <span className="rounded bg-purple-500/20 border border-purple-400/40 px-2 py-0.5 text-xs font-bold text-purple-200">
                          團報：{lookupResult.registration.group_name} ({lookupResult.registration.group_code})
                        </span>
                      )}
                      {lookupResult.registration.bib_number && (
                        <span className="rounded bg-lime-500/20 border border-lime-400/40 px-2 py-0.5 font-mono-num text-xs font-black text-lime-300">
                          參賽編號：{lookupResult.registration.bib_number}
                        </span>
                      )}
                    </div>
                    <p className="text-base font-black text-white">
                      {lookupResult.registration.runner_name}（{lookupResult.registration.id_masked}）
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="font-mono-num text-xl font-black text-amber-300">
                      NT$ {Number(lookupResult.registration.total_amount || 0).toLocaleString()}
                    </p>
                    <p className="text-xs font-mono-num text-slate-300">
                      [{lookupResult.registration.payment_mode === 'group' ? '團體匯款' : '個別匯款'}] 後五碼：
                      {lookupResult.registration.remittance_last5 ? (
                        <strong className="text-emerald-300 ml-1">{lookupResult.registration.remittance_last5}</strong>
                      ) : (
                        <span className="text-rose-400 font-bold ml-1">尚未填寫</span>
                      )}
                    </p>
                  </div>
                </div>

                {editMode ? (
                  <form onSubmit={handleSaveEdit} noValidate className="p-6 space-y-5">
                    {lookupResult.pricingLocked && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200">
                        <Lock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                        <span>{lookupResult.pricingLockedNotice}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">匯款方式</label>
                        <select
                          value={editPaymentMode}
                          onChange={(e) => setEditPaymentMode(e.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:border-lime-400 focus:outline-none"
                        >
                          <option value="individual">個別匯款（本人轉帳）</option>
                          <option value="group">團體匯款（由團體統一轉帳）</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">團體名稱（選填）</label>
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          placeholder="若屬團體報名或團體匯款可填寫"
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-lime-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {(event.fields || []).map((field) => (
                        <DynamicFormField
                          key={field.id}
                          field={field}
                          value={editAnswers[field.id]}
                          onChange={handleEditFieldChange}
                          onBlur={handleEditFieldBlur}
                          error={editFieldErrors[field.id]}
                          pricing={editPricing}
                          namePrefix="edit"
                        />
                      ))}
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
                          <span>{savingEdit ? '儲存中...' : '儲存修改並寄送更新確認信'}</span>
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
                          const val = lookupResult.registration.answers?.[f.id];
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
                      {!lookupResult.canEdit ? (
                        <p className="text-xs text-amber-300">{lookupResult.cannotEditReason}</p>
                      ) : (
                        <p className="text-xs text-slate-400">
                          完成轉帳後可點右側按鈕補填匯款帳號後五碼，或修改其他報名資料。
                        </p>
                      )}
                      {lookupResult.canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditMode(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300"
                        >
                          <Edit3 className="h-4 w-4" />
                          <span>修改報名資料 ／ 補填匯款後五碼</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          /* ==================== 線上報名表單分頁（個人 / 團報） ==================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              {event.description && (
                <details className="tur-control-bar rounded-2xl px-5 py-3.5 group">
                  <summary className="cursor-pointer text-sm font-bold text-lime-300 select-none list-none flex items-center justify-between">
                    <span>賽事簡介</span>
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
                  onSubmit={handleSubmit}
                  noValidate
                  className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-8 shadow-xl space-y-6"
                >
                  {/* 步驟 1：報名與匯款方式 */}
                  <div className="space-y-3 border-b border-slate-800 pb-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setRegType('individual');
                          setSubmitError('');
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black transition ${
                          regType === 'individual'
                            ? 'border-lime-400 bg-lime-500/15 text-white ring-2 ring-lime-400/25'
                            : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <User className={`h-4 w-4 ${regType === 'individual' ? 'text-lime-400' : 'text-slate-400'}`} />
                        <span>個人報名</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRegType('group');
                          setSubmitError('');
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black transition ${
                          regType === 'group'
                            ? 'border-sky-400 bg-sky-500/15 text-white ring-2 ring-sky-400/25'
                            : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <Users className={`h-4 w-4 ${regType === 'group' ? 'text-sky-400' : 'text-slate-400'}`} />
                        <span>團體報名</span>
                      </button>
                    </div>

                    {/* 個人匯款方式 */}
                    {regType === 'individual' && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer ${individualPaymentMode === 'individual' ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-300'}`}>
                            <input
                              type="radio"
                              name="indPayMode"
                              checked={individualPaymentMode === 'individual'}
                              onChange={() => setIndividualPaymentMode('individual')}
                              className="accent-emerald-400"
                            />
                            <span>個別匯款</span>
                          </label>
                          <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer ${individualPaymentMode === 'group' ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-slate-700 text-slate-300'}`}>
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

                    {/* 團體設定 */}
                    {regType === 'group' && (
                      <div className="rounded-xl border border-sky-500/35 bg-sky-950/20 p-3.5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-bold text-sky-300 mb-1">團體名稱 *</label>
                            <input
                              type="text"
                              required
                              value={groupName}
                              onChange={(e) => setGroupName(e.target.value)}
                              placeholder="自訂團體名稱"
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-sky-300 mb-1">匯款方式 *</label>
                            <select
                              value={groupPaymentMode}
                              onChange={(e) => setGroupPaymentMode(e.target.value)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-sky-400 focus:outline-none"
                            >
                              <option value="group">團體匯款（共用尾五碼）</option>
                              <option value="individual">個別匯款（各自填尾五碼）</option>
                            </select>
                          </div>
                        </div>

                        {groupPaymentMode === 'group' && (
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-amber-300">團體匯款帳號尾五碼 *</label>
                            <input
                              type="text"
                              required
                              inputMode="numeric"
                              maxLength={5}
                              value={groupRemittanceLast5}
                              onChange={(e) => setGroupRemittanceLast5(e.target.value.replace(/[^\d]/g, ''))}
                              placeholder="請輸入 5 位數字"
                              className={`w-full rounded-xl border bg-slate-950 px-3 py-2 font-mono-num text-sm text-white focus:outline-none ${
                                groupRemittanceLast5 && validateRemittanceLast5(groupRemittanceLast5)
                                  ? 'border-rose-500 focus:border-rose-500'
                                  : groupRemittanceLast5.length === 5
                                  ? 'border-emerald-500 focus:border-emerald-400'
                                  : 'border-amber-500/40 focus:border-amber-400'
                              }`}
                            />
                            {groupRemittanceLast5 && validateRemittanceLast5(groupRemittanceLast5) ? (
                              <p className="text-xs font-bold text-rose-400">
                                {validateRemittanceLast5(groupRemittanceLast5)}
                              </p>
                            ) : groupRemittanceLast5.length === 5 ? (
                              <p className="text-xs font-bold text-emerald-400">✓ 尾五碼正確</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 text-sm text-rose-200">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* 步驟 2：個人或團體成員資料填寫 */}
                  {regType === 'individual' ? (
                    <div className="space-y-4">
                      <h3 className="text-base font-black text-white">報名資料</h3>
                      {(event.fields || []).map((field) => (
                        <div key={field.id} id={`field-wrap-${field.id}`}>
                          <DynamicFormField
                            field={field}
                            value={answers[field.id]}
                            onChange={handleFieldChange}
                            onBlur={handleFieldBlur}
                            error={fieldErrors[field.id]}
                            pricing={pricing}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-black text-white">
                          團員資料（{groupMembers.length} 位）
                        </h3>
                        <button
                          type="button"
                          onClick={addGroupMember}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/15 px-3.5 py-2 text-xs font-extrabold text-sky-300 hover:bg-sky-500/25"
                        >
                          <Plus className="h-4 w-4" />
                          <span>新增團員</span>
                        </button>
                      </div>

                      {groupMembers.map((memberAns, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-slate-700/90 bg-slate-950/60 overflow-hidden"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-xs font-black text-slate-950">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-black text-white">
                                第 {idx + 1} 位團員{memberAns.full_name ? `：${memberAns.full_name}` : ''}
                              </span>
                              <span className="font-mono-num text-xs font-bold text-amber-300">
                                小計 NT$ {Number(groupPricingList[idx]?.total || 0).toLocaleString()}
                              </span>
                            </div>
                            {groupMembers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeGroupMember(idx)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-400 hover:border-rose-500/50 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                移除
                              </button>
                            )}
                          </div>

                          <div className="p-4 sm:p-5 space-y-4">
                            {groupMemberFields.map((field) => (
                              <DynamicFormField
                                key={`${idx}-${field.id}`}
                                field={field}
                                value={memberAns[field.id]}
                                onChange={(fid, val) => handleGroupMemberFieldChange(idx, fid, val)}
                                onBlur={(fid, val) => handleGroupMemberFieldBlur(idx, fid, val)}
                                error={memberErrors[idx]?.[field.id]}
                                pricing={groupPricingList[idx]}
                                namePrefix={`member_${idx}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addGroupMember}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-500/50 bg-sky-950/20 py-3 text-xs font-extrabold text-sky-300 hover:bg-sky-950/40 transition"
                      >
                        <Plus className="h-4 w-4" />
                        <span>＋ 再新增一位團員</span>
                      </button>
                    </div>
                  )}

                  {/* 表單底部總金額與送出按鈕 */}
                  <div className="rounded-xl border border-lime-400/35 bg-slate-950 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-300">
                        {regType === 'group'
                          ? `團體「${groupName.trim() || '未命名'}」（${groupMembers.length} 位）應繳總金額`
                          : '本次報名應繳總金額'}
                      </span>
                      <span className="font-mono-num text-2xl sm:text-3xl font-black text-amber-300">
                        NT$ {(regType === 'group' ? groupTotalAmount : pricing.total).toLocaleString()}
                      </span>
                    </div>

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
                          <span>
                            {regType === 'group'
                              ? `送出團體報名（${groupMembers.length} 位）`
                              : '送出報名'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* 右側：費用試算 + 匯款帳戶 */}
            <aside className="hidden lg:block lg:col-span-4 sticky top-20 space-y-4">
              {canRegister && (
                <div className="tur-control-bar rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-amber-300 text-sm font-bold mb-3">
                    <Calculator className="h-4 w-4" />
                    <span>費用試算</span>
                  </div>

                  {regType === 'group' ? (
                    <ul className="space-y-2 text-sm border-b border-slate-800 pb-3 mb-3">
                      {groupMembers.map((m, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-2">
                          <span className="text-slate-200 truncate">
                            #{idx + 1} {m.full_name || '未填姓名'}
                          </span>
                          <span className="font-mono-num font-bold text-amber-300 shrink-0">
                            NT$ {Number(groupPricingList[idx]?.total || 0).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : pricing.breakdown.length > 0 ? (
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
                      NT$ {(regType === 'group' ? groupTotalAmount : pricing.total).toLocaleString()}
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
                {regType === 'group' ? `團體總金額（${groupMembers.length} 位）` : '應繳總金額'}
              </p>
              <p className="font-mono-num text-xl font-black text-amber-300">
                NT$ {(regType === 'group' ? groupTotalAmount : pricing.total).toLocaleString()}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {regType === 'group' ? '團體報名模式' : `已選 ${pricing.breakdown.length} 項計費項目`}
            </span>
          </div>
        </div>
      )}

      <TurFooter />
    </div>
  );
}
