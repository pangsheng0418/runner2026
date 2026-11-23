import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ShieldCheck,
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
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';
import DynamicFormField from '../components/DynamicFormField';
import { calculatePricing, validateAllFields, validateSingleField } from '../utils/validation';

export default function LookupRegistrationPage() {
  const [verifyBy, setVerifyBy] = useState('regCode'); // 'regCode' | 'email'
  const [idNumber, setIdNumber] = useState('');
  const [regCode, setRegCode] = useState('');
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [records, setRecords] = useState([]);

  // 正在編輯的那筆報名紀錄
  const [editingIdx, setEditingIdx] = useState(null);
  const [editAnswers, setEditAnswers] = useState({});
  const [editPaymentMode, setEditPaymentMode] = useState('individual');
  const [editGroupName, setEditGroupName] = useState('');
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState({ type: '', text: '' });

  const activeRecord = editingIdx !== null ? records[editingIdx] : null;
  const editPricing = useMemo(
    () => calculatePricing(activeRecord?.event?.fields || [], editAnswers),
    [activeRecord, editAnswers]
  );

  const handleLookup = async (e) => {
    e.preventDefault();
    setSearchError('');
    setSaveNotice({ type: '', text: '' });
    setEditingIdx(null);
    setSearching(true);
    try {
      const payload =
        verifyBy === 'regCode'
          ? { idNumber: idNumber.trim(), regCode: regCode.trim() }
          : { idNumber: idNumber.trim(), email: email.trim() };

      const res = await apiRequest('/api/public/lookup', {
        method: 'POST',
        body: payload,
      });
      setRecords(res.records || []);
    } catch (err) {
      setRecords([]);
      setSearchError(err.message || '查無符合條件的報名資料。');
    } finally {
      setSearching(false);
    }
  };

  const startEditing = (idx) => {
    const rec = records[idx];
    if (!rec || !rec.canEdit) return;
    setEditingIdx(idx);
    setEditAnswers({ ...(rec.registration.answers || {}) });
    setEditPaymentMode(rec.registration.payment_mode || 'individual');
    setEditGroupName(rec.registration.group_name || '');
    setEditFieldErrors({});
    setSaveNotice({ type: '', text: '' });
  };

  const handleEditFieldChange = (fieldId, val) => {
    setEditAnswers((prev) => ({ ...prev, [fieldId]: val }));
    const fieldDef = (activeRecord?.event?.fields || []).find((f) => f.id === fieldId);
    const liveErr = validateSingleField(fieldDef, val, { checkRequired: false });
    setEditFieldErrors((prev) => {
      const next = { ...prev };
      if (liveErr) next[fieldId] = liveErr;
      else delete next[fieldId];
      return next;
    });
  };

  const handleEditFieldBlur = (fieldId, val) => {
    const fieldDef = (activeRecord?.event?.fields || []).find((f) => f.id === fieldId);
    const blurErr = validateSingleField(fieldDef, val, { checkRequired: true });
    setEditFieldErrors((prev) => {
      const next = { ...prev };
      if (blurErr) next[fieldId] = blurErr;
      else delete next[fieldId];
      return next;
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!activeRecord) return;
    setSaveNotice({ type: '', text: '' });

    const clientErrors = validateAllFields(activeRecord.event.fields || [], editAnswers);
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
        prev.map((item, idx) =>
          idx === editingIdx
            ? {
                ...item,
                editToken: res.editToken,
                canEdit: res.canEdit,
                pricingLocked: res.pricingLocked,
                registration: res.registration,
              }
            : item
        )
      );
      setEditingIdx(null);
      const emailTip = res.emailNotification?.notice ? ` ${res.emailNotification.notice}` : '';
      setSaveNotice({
        type: 'success',
        text: `${res.message}${emailTip}`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.fieldErrors) {
        setEditFieldErrors(err.data.fieldErrors);
      }
      setSaveNotice({
        type: 'error',
        text: err.message || '資料修改失敗，請稍後再試。',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TurHeader
        title="報名查詢／修改"
        showHomeLink
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

        {/* 雙因子反向查詢表單 */}
        <section className="tur-control-bar rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-black text-white">查詢或修改報名</h1>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setVerifyBy('regCode')}
                className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                  verifyBy === 'regCode'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                報名序號
              </button>
              <button
                type="button"
                onClick={() => setVerifyBy('email')}
                className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                  verifyBy === 'email'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Email
              </button>
            </div>
          </div>

          <form onSubmit={handleLookup} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                身份證字號 / 護照 *
              </label>
              <input
                type="text"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="A123456789"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white uppercase focus:border-lime-400 focus:outline-none"
              />
            </div>

            {verifyBy === 'regCode' ? (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  報名序號 *
                </label>
                <input
                  type="text"
                  required
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                  placeholder="TUR26-0001"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white uppercase focus:border-lime-400 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  電子信箱 *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-lime-400 focus:outline-none"
                />
              </div>
            )}

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

        {/* 查詢結果列表 */}
        {records.length > 0 && (
          <section className="space-y-5">
            <p className="text-xs font-bold text-slate-400">
              共找到 <strong className="text-lime-400 font-mono-num">{records.length}</strong> 筆報名紀錄
            </p>

            {records.map((rec, idx) => {
              const r = rec.registration;
              const ev = rec.event;
              const isEditingThis = editingIdx === idx;

              return (
                <div
                  key={r.reg_code}
                  className="tur-card overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl"
                >
                  {/* 報名摘要標頭 */}
                  <div className="border-b border-slate-800 bg-slate-950/75 p-5 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                            r.payment_status === '已繳費'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : r.payment_status === '已取消'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {r.payment_status}
                        </span>
                        <span className="font-mono-num text-sm font-black text-sky-300">
                          序號：{r.reg_code}
                        </span>
                        {r.bib_number && (
                          <span className="rounded bg-lime-500/20 border border-lime-400/40 px-2 py-0.5 font-mono-num text-xs font-black text-lime-300">
                            參賽編號：{r.bib_number}
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg sm:text-xl font-black text-white">{ev.name}</h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-lime-400" />
                          賽事日期：{ev.event_date}
                        </span>
                        {ev.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-sky-400" />
                            {ev.location}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right space-y-1">
                      <p className="text-xs text-slate-400">應繳總金額</p>
                      <p className="font-mono-num text-2xl font-black text-amber-300">
                        NT$ {Number(r.total_amount || 0).toLocaleString()}
                      </p>
                      <p className="text-xs font-mono-num">
                        [{r.payment_mode === 'group' ? '團體匯款' : '個別匯款'}] 後五碼：
                        {r.remittance_last5 ? (
                          <strong className="text-emerald-300 ml-1">{r.remittance_last5}</strong>
                        ) : (
                          <span className="text-rose-400 ml-1 font-bold">尚未填寫</span>
                        )}
                      </p>
                      {r.reg_type === 'group' && (
                        <p className="text-[11px] font-bold text-sky-300">
                          團體報名：{r.group_name}（{r.group_code}）
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 編輯模式 vs 檢視模式 */}
                  {isEditingThis ? (
                    <form onSubmit={handleSaveEdit} noValidate className="p-6 space-y-5">
                      {rec.pricingLocked && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200">
                          <Lock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                          <span>{rec.pricingLockedNotice}</span>
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
                        {(ev.fields || []).map((field) => (
                          <DynamicFormField
                            key={field.id}
                            field={field}
                            value={editAnswers[field.id]}
                            onChange={handleEditFieldChange}
                            onBlur={handleEditFieldBlur}
                            error={editFieldErrors[field.id]}
                            pricing={editPricing}
                            namePrefix="lookup_edit"
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
                            onClick={() => setEditingIdx(null)}
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
                            <span>{saving ? '儲存並寄發通知信...' : '儲存修改並寄送更新確認信'}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="p-5 sm:p-6 space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs sm:text-sm">
                        <div>
                          <span className="text-slate-400">選手姓名：</span>
                          <strong className="text-white">{r.runner_name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">證件號碼（隱碼）：</span>
                          <strong className="font-mono-num text-sky-300">{r.id_masked}</strong>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-slate-400">通知信箱：</span>
                          <span className="text-slate-200">{r.runner_email || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">報名時間：</span>
                          <span className="font-mono-num text-slate-300">{r.created_at}</span>
                        </div>
                      </div>

                      {ev.payment_info && r.payment_status !== '已繳費' && (
                        <div className="rounded-xl border border-sky-500/35 bg-sky-950/20 p-4 text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-sky-300 mb-1.5">
                            <CreditCard className="h-4 w-4" />
                            <span>匯款帳戶資訊（轉帳完成請點下方按鈕補填後五碼）</span>
                          </div>
                          <p className="whitespace-pre-line text-slate-300 leading-relaxed">
                            {ev.payment_info}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        {!rec.canEdit ? (
                          <p className="text-xs text-amber-300">{rec.cannotEditReason}</p>
                        ) : (
                          <p className="text-xs text-slate-400">
                            如需修改報名資料、更換組別或補填「匯款帳號後五碼」，請點擊右側按鈕。
                          </p>
                        )}

                        {rec.canEdit && (
                          <button
                            type="button"
                            onClick={() => startEditing(idx)}
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
              );
            })}
          </section>
        )}
      </main>

      <TurFooter showOrganizerEntry />
    </div>
  );
}
