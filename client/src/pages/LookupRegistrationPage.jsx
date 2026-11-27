import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Save,
  Loader2,
  CreditCard,
  Mail,
  Calendar,
  MapPin,
  Calculator,
  ArrowLeft,
  Lock,
  Crown,
  Package,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';
import DynamicFormField from '../components/DynamicFormField';
import {
  calculatePricing,
  validateAllFields,
  validateFieldWithCrossChecks,
  validateRemittanceLast5,
} from '../utils/validation';

export default function LookupRegistrationPage() {
  const [idNumber, setIdNumber] = useState('');
  const [credential, setCredential] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [records, setRecords] = useState([]);
  const [activeRegCode, setActiveRegCode] = useState('');

  // 編輯表單狀態
  const [editMode, setEditMode] = useState(false);
  const [editAnswers, setEditAnswers] = useState({});
  const [editPaymentMode, setEditPaymentMode] = useState('individual');
  const [editGroupName, setEditGroupName] = useState('');
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState({ type: '', text: '' });

  // 團長整團末五碼 & 多場合併單末五碼快速更新
  const [quickGroupLast5, setQuickGroupLast5] = useState('');
  const [savingGroupLast5, setSavingGroupLast5] = useState(false);
  const [quickBundleLast5, setQuickBundleLast5] = useState('');
  const [savingBundleLast5, setSavingBundleLast5] = useState(false);

  const activeRecord = useMemo(() => {
    if (records.length === 0) return null;
    return records.find((r) => r.registration.reg_code === activeRegCode) || records[0];
  }, [records, activeRegCode]);

  // 登入者本人名下的場次（不含團長代管的其他組員）
  const ownEventRecords = useMemo(() => {
    const seen = new Set();
    return records.filter((rec) => {
      const isOtherMember = Boolean(rec.groupInfo?.isEditingOtherMember);
      if (isOtherMember) return false;
      const key = `${rec.event.id}::${rec.registration.reg_code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [records]);

  // 目前選定紀錄若屬團長管理的團報，取出同團所有成員紀錄供切換
  const activeGroupRecords = useMemo(() => {
    if (!activeRecord?.groupInfo?.isLeader) return [];
    const gc = activeRecord.groupInfo.group_code;
    const eid = activeRecord.event.id;
    return records.filter(
      (rec) => rec.event.id === eid && rec.registration.group_code === gc
    );
  }, [records, activeRecord]);

  const editPricing = useMemo(
    () => calculatePricing(activeRecord?.event?.fields || [], editAnswers),
    [activeRecord, editAnswers]
  );

  const selectRecord = (rec) => {
    if (!rec) return;
    setActiveRegCode(rec.registration.reg_code);
    setEditMode(false);
    setEditAnswers({ ...(rec.registration.answers || {}) });
    setEditPaymentMode(rec.registration.payment_mode || 'individual');
    setEditGroupName(rec.registration.group_name || '');
    setQuickGroupLast5(rec.groupInfo?.remittance_last5 || '');
    setQuickBundleLast5(rec.bundleInfo?.remittance_last5 || '');
    setEditFieldErrors({});
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setSearchError('');
    setSaveNotice({ type: '', text: '' });
    setEditMode(false);
    setSearching(true);
    try {
      const res = await apiRequest('/api/public/lookup', {
        method: 'POST',
        body: {
          idNumber: idNumber.trim(),
          credential: credential.trim(),
        },
      });
      const list = res.records || [];
      setRecords(list);
      const matchedRec =
        list.find((r) => r.registration.reg_code === res.matchedRegCode) || list[0];
      selectRecord(matchedRec);
    } catch (err) {
      setRecords([]);
      setActiveRegCode('');
      setSearchError(err.message || '查無符合條件的報名資料。');
    } finally {
      setSearching(false);
    }
  };

  const handleEditFieldChange = (fieldId, val) => {
    const nextAnswers = { ...editAnswers, [fieldId]: val };
    setEditAnswers(nextAnswers);
    setEditFieldErrors((prev) =>
      validateFieldWithCrossChecks(activeRecord?.event?.fields, nextAnswers, fieldId, prev, {
        checkRequired: false,
      })
    );
  };

  const handleEditFieldBlur = (fieldId, val) => {
    const nextAnswers = { ...editAnswers, [fieldId]: val };
    setEditFieldErrors((prev) =>
      validateFieldWithCrossChecks(activeRecord?.event?.fields, nextAnswers, fieldId, prev, {
        checkRequired: true,
      })
    );
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!activeRecord) return;
    setSaveNotice({ type: '', text: '' });

    const allowEmptyRemit = Boolean(
      activeRecord.registration.group_code || activeRecord.registration.bundle_code
    );
    const clientErrors = validateAllFields(activeRecord.event.fields || [], editAnswers, {
      allowEmptyRemittance: allowEmptyRemit,
    });
    if (Object.keys(clientErrors).length > 0) {
      setEditFieldErrors(clientErrors);
      setSaveNotice({
        type: 'error',
        text: '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示項目。',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest(
        `/api/public/events/${encodeURIComponent(activeRecord.event.slug)}/registrations/${encodeURIComponent(
          activeRecord.registration.reg_code
        )}`,
        {
          method: 'PUT',
          body: {
            editToken: activeRecord.editToken,
            payment_mode: editPaymentMode,
            group_name: editGroupName,
            answers: editAnswers,
          },
        }
      );

      setRecords((prev) =>
        prev.map((item) =>
          item.registration.reg_code === res.registration.reg_code ? res : item
        )
      );
      selectRecord(res);
      const emailTip = res.emailNotification?.notice ? ` ${res.emailNotification.notice}` : '';
      setSaveNotice({
        type: 'success',
        text: `${res.message}${emailTip}`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.fieldErrors) setEditFieldErrors(err.data.fieldErrors);
      setSaveNotice({
        type: 'error',
        text: err.message || '資料修改失敗，請稍後再試。',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGroupLast5 = async () => {
    const grp = activeRecord?.groupInfo;
    if (!grp?.groupRemitToken) return;
    const err5 = validateRemittanceLast5(quickGroupLast5);
    if (err5) {
      setSaveNotice({ type: 'error', text: err5 });
      return;
    }
    setSavingGroupLast5(true);
    setSaveNotice({ type: '', text: '' });
    try {
      const res = await apiRequest(
        `/api/public/groups/${encodeURIComponent(grp.group_code)}/remittance`,
        {
          method: 'PATCH',
          body: {
            eventId: activeRecord.event.id,
            remittance_last5: quickGroupLast5.trim(),
            groupRemitToken: grp.groupRemitToken,
          },
        }
      );
      setRecords((prev) =>
        prev.map((item) =>
          item.event.id === activeRecord.event.id && item.registration.group_code === grp.group_code
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
      setSaveNotice({ type: 'success', text: res.message });
    } catch (err) {
      setSaveNotice({ type: 'error', text: err.message || '更新整團末五碼失敗。' });
    } finally {
      setSavingGroupLast5(false);
    }
  };

  const handleSaveBundleLast5 = async () => {
    const bdl = activeRecord?.bundleInfo;
    if (!bdl?.bundleRemitToken) return;
    const err5 = validateRemittanceLast5(quickBundleLast5);
    if (err5) {
      setSaveNotice({ type: 'error', text: err5 });
      return;
    }
    setSavingBundleLast5(true);
    setSaveNotice({ type: '', text: '' });
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
      setRecords((prev) =>
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
      setSaveNotice({ type: 'success', text: res.message });
    } catch (err) {
      setSaveNotice({ type: 'error', text: err.message || '更新合併單末五碼失敗。' });
    } finally {
      setSavingBundleLast5(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title="報名查詢／修改"
        showHomeLink
        showMultiLink
        showAdminLink
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 pt-6 space-y-5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-lime-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回活動列表
        </Link>

        {/* 雙因子反向查詢表單（支援序號 / 團報碼 / 合併單號 / Email） */}
        <section className="tur-control-bar rounded-2xl p-5 space-y-4">
          <div>
            <h1 className="text-lg font-black text-white">🔍 查詢或修改報名</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              已繳費鎖定費用項目，聯絡資料仍可修改；團報由團長登入統一管理全團與補填末五碼
            </p>
          </div>

          <form onSubmit={handleLookup} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                身份證字號 *
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="A123456789"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white uppercase focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                序號 / 團報碼 / 合併單號 / Email *
              </label>
              <input
                type="text"
                required
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="TUR26-... / GRP... / TURM-... / Email"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60 transition"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{searching ? '查詢中...' : '查詢'}</span>
            </button>
          </form>

          {searchError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs sm:text-sm text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{searchError}</span>
            </div>
          )}
        </section>

        {/* 修改儲存結果提示 */}
        {saveNotice.text && (
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 text-sm ${
              saveNotice.type === 'success'
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
                : 'border-rose-500/50 bg-rose-950/40 text-rose-200'
            }`}
          >
            {saveNotice.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
            )}
            <span>{saveNotice.text}</span>
          </div>
        )}

        {/* 查詢結果與操作區 */}
        {activeRecord && (
          <section className="space-y-4">
            {/* 名下多場活動切換列 */}
            {ownEventRecords.length > 1 && (
              <div className="tur-control-bar rounded-2xl p-4 space-y-2.5 text-xs">
                <p className="font-black text-slate-200">
                  📋 您名下共有 <strong className="text-lime-400">{ownEventRecords.length}</strong> 場報名紀錄（點選切換查看或修改）：
                </p>
                <div className="flex flex-wrap gap-2">
                  {ownEventRecords.map((rec) => {
                    const isCurrentEvent =
                      rec.event.id === activeRecord.event.id &&
                      (rec.registration.reg_code === activeRecord.registration.reg_code ||
                        (rec.registration.group_code &&
                          rec.registration.group_code === activeRecord.registration.group_code));
                    return (
                      <button
                        key={rec.registration.reg_code}
                        type="button"
                        onClick={() => selectRecord(rec)}
                        className={`rounded-xl border px-3 py-1.5 text-left transition ${
                          isCurrentEvent
                            ? 'border-lime-400 bg-lime-400 text-slate-950 font-black'
                            : 'border-slate-700 bg-slate-950/80 text-slate-200 hover:border-sky-400 font-bold'
                        }`}
                      >
                        {rec.event.name}{' '}
                        <span className="font-mono-num opacity-80">
                          ({rec.registration.payment_status}
                          {rec.registration.bib_number ? `・${rec.registration.bib_number}` : ''})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 團長管理面板 */}
            {activeRecord.groupInfo?.isLeader && (
              <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-950/25 p-5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
                  <div>
                    <div className="flex items-center gap-2 text-base font-black text-amber-300">
                      <Crown className="h-5 w-5" />
                      <span>
                        團長管理：{activeRecord.groupInfo.group_name}（{activeRecord.groupInfo.group_code}）
                      </span>
                    </div>
                    <p className="text-amber-100/80 mt-0.5">
                      共 <strong>{activeRecord.groupInfo.member_count}</strong> 人 ｜ 整團總額{' '}
                      <strong className="font-mono-num text-amber-300">
                        NT$ {Number(activeRecord.groupInfo.total_amount || 0).toLocaleString()}
                      </strong>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 font-black ${
                      activeRecord.groupInfo.unpaid_count > 0
                        ? 'bg-rose-500/20 border border-rose-400/50 text-rose-300'
                        : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                    }`}
                  >
                    {activeRecord.groupInfo.unpaid_count > 0
                      ? `待對帳 (${activeRecord.groupInfo.unpaid_count}/${activeRecord.groupInfo.member_count})`
                      : '✅ 全團已繳費'}
                  </span>
                </div>

                {activeRecord.groupInfo.groupRemitToken && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-amber-200">🏦 整團末 5 碼：</span>
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

                {activeGroupRecords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activeGroupRecords.map((mRec, idx) => {
                      const isLdr = mRec.registration.group_role === 'leader';
                      const isCur = mRec.registration.reg_code === activeRecord.registration.reg_code;
                      return (
                        <button
                          key={mRec.registration.reg_code}
                          type="button"
                          onClick={() => selectRecord(mRec)}
                          className={`rounded-xl border px-3 py-1.5 font-bold transition ${
                            isCur
                              ? 'border-amber-400 bg-amber-400 text-slate-950 font-black'
                              : 'border-slate-700 bg-slate-950/80 text-slate-200 hover:border-amber-400/60'
                          }`}
                        >
                          {isLdr ? '👑' : `#${idx}`} {mRec.registration.runner_name}（
                          {mRec.registration.bib_number || mRec.registration.payment_status}）
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 組員唯讀提示 */}
            {activeRecord.groupInfo?.isMemberReadOnly && (
              <div className="rounded-2xl border-2 border-rose-500/60 bg-rose-950/30 p-4 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5">
                <Lock className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-black text-rose-300">🔒 組員唯讀（不可修改）</p>
                  <p className="mt-0.5">
                    本筆屬團體報名「{activeRecord.groupInfo.group_name}」（
                    {activeRecord.groupInfo.group_code}）。如需異動資料或補填末 5 碼，請洽團長「
                    <strong>{activeRecord.groupInfo.leader_name || '團長'}</strong>」登入修改。
                  </p>
                </div>
              </div>
            )}

            {/* 多場聯合報名合併單面板 */}
            {activeRecord.bundleInfo && (
              <div className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/25 p-5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-300">
                    <Package className="h-4 w-4" />
                    <span>
                      合併單 {activeRecord.bundleInfo.bundle_code}（共{' '}
                      {activeRecord.bundleInfo.event_count} 場・合計 NT${' '}
                      {Number(activeRecord.bundleInfo.total_amount || 0).toLocaleString()}）
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold ${
                      activeRecord.bundleInfo.unpaid_count > 0
                        ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200'
                        : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                    }`}
                  >
                    {activeRecord.bundleInfo.unpaid_count > 0
                      ? `待對帳 ${activeRecord.bundleInfo.unpaid_count} 場`
                      : '✅ 已全數入帳'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {activeRecord.bundleInfo.items.map((it) => (
                    <span
                      key={it.reg_code}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                        it.reg_code === activeRecord.registration.reg_code
                          ? 'border-emerald-400 bg-emerald-500/20 text-white font-bold'
                          : 'border-slate-700 bg-slate-950/70 text-slate-300'
                      }`}
                    >
                      {it.event_name}（{it.category_code || '—'}・NT${it.total_amount.toLocaleString()}・
                      {it.payment_status}）
                    </span>
                  ))}
                </div>

                {activeRecord.bundleInfo.bundleRemitToken && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
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

            {/* 主報名卡片 */}
            <div className="tur-card overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl">
              <div className="border-b border-slate-800 bg-slate-950/75 p-5 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                        activeRecord.registration.payment_status === '已繳費'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : activeRecord.registration.payment_status === '已取消'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {activeRecord.registration.payment_status}
                    </span>
                    <span className="font-mono-num text-sm font-black text-sky-300">
                      序號：{activeRecord.registration.reg_code}
                    </span>
                    {activeRecord.registration.group_code && (
                      <span className="rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-xs font-bold text-amber-200">
                        {activeRecord.registration.group_role === 'leader' ? '👑 團長' : '👥 組員'}：
                        {activeRecord.registration.group_name}（{activeRecord.registration.group_code}）
                      </span>
                    )}
                    {activeRecord.registration.bundle_code && (
                      <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-mono-num text-xs font-bold text-emerald-300">
                        📦 {activeRecord.registration.bundle_code}
                      </span>
                    )}
                    {activeRecord.registration.bib_number && (
                      <span className="rounded bg-lime-500/20 border border-lime-400/40 px-2 py-0.5 font-mono-num text-xs font-black text-lime-300">
                        參賽編號：{activeRecord.registration.bib_number}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white">{activeRecord.event.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-lime-400" />
                      賽事日期：{activeRecord.event.event_date}
                    </span>
                    {activeRecord.event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-sky-400" />
                        {activeRecord.event.location}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <p className="text-xs text-slate-400">本筆應繳金額</p>
                  <p className="font-mono-num text-2xl font-black text-amber-300">
                    NT$ {Number(activeRecord.registration.total_amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs font-mono-num">
                    後五碼：
                    {activeRecord.registration.remittance_last5 ? (
                      <strong className="text-emerald-300 ml-1">
                        {activeRecord.registration.remittance_last5}
                      </strong>
                    ) : (
                      <span className="text-rose-400 ml-1 font-bold">尚未填寫</span>
                    )}
                  </p>
                </div>
              </div>

              {editMode ? (
                <form onSubmit={handleSaveEdit} noValidate className="p-6 space-y-5">
                  {activeRecord.pricingLocked && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200">
                      <Lock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>{activeRecord.pricingLockedNotice}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {(activeRecord.event.fields || [])
                      .filter((f) => !(activeRecord.groupInfo && f.id === 'remittance_last5'))
                      .map((field) => {
                        const lockMemberEmail = Boolean(
                          activeRecord.groupInfo?.isEditingOtherMember &&
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
                            namePrefix="lookup_edit"
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
                        取消修改
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span>{saving ? '儲存並寄發通知信...' : '儲存修改並寄送通知信'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="p-5 sm:p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-slate-400">選手姓名：</span>
                      <strong className="text-white">{activeRecord.registration.runner_name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">證件號碼（隱碼）：</span>
                      <strong className="font-mono-num text-sky-300">{activeRecord.registration.id_masked}</strong>
                    </div>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-400">通知信箱：</span>
                      <span className="text-slate-200">{activeRecord.registration.runner_email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">報名時間：</span>
                      <span className="font-mono-num text-slate-300">{activeRecord.registration.created_at}</span>
                    </div>
                  </div>

                  {activeRecord.event.payment_info &&
                    activeRecord.registration.payment_status !== '已繳費' && (
                      <div className="rounded-xl border border-sky-500/35 bg-sky-950/20 p-4 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-sky-300 mb-1.5">
                          <CreditCard className="h-4 w-4" />
                          <span>匯款帳戶資訊</span>
                        </div>
                        <p className="whitespace-pre-line text-slate-300 leading-relaxed">
                          {activeRecord.event.payment_info}
                        </p>
                      </div>
                    )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    {!activeRecord.canEdit ? (
                      <p className="text-xs text-amber-300">{activeRecord.cannotEditReason}</p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {activeRecord.groupInfo?.isLeader
                          ? '團長可點擊右側修改此成員資料，或於上方一次補填整團匯款末五碼。'
                          : '如需修改報名資料、更換組別或補填匯款帳號後五碼，請點擊右側按鈕。'}
                      </p>
                    )}

                    {activeRecord.canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs sm:text-sm font-black text-slate-950 hover:from-sky-400 hover:to-cyan-300 transition"
                      >
                        <Edit3 className="h-4 w-4" />
                        <span>修改資料 ／ 補填匯款後五碼</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <TurFooter showOrganizerEntry />
    </div>
  );
}
