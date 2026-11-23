import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Info,
  Loader2,
  Printer,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import TurHeader from '../components/TurHeader';
import TurFooter from '../components/TurFooter';
import BannerHero from '../components/BannerHero';
import DynamicFormField from '../components/DynamicFormField';
import { calculatePricing, validateAllFields } from '../utils/validation';

function maskIdDisplay(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '—';
  if (s.length <= 4) return s[0] + '*'.repeat(Math.max(0, s.length - 1));
  return s.slice(0, 4) + '****' + s.slice(-2);
}

export default function PublicRegisterPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [answers, setAnswers] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setConfirmation(null);
    apiRequest(`/api/public/events/${encodeURIComponent(slug)}`)
      .then((data) => {
        setEvent(data.event);
        setAnswers({});
        setFieldErrors({});
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const pricing = useMemo(
    () => calculatePricing(event?.fields || [], answers),
    [event, answers]
  );

  const handleFieldChange = (fieldId, val) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: val }));
    if (fieldErrors[fieldId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!event) return;
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
        body: { answers },
      });
      setConfirmation(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.fieldErrors) {
        setFieldErrors(err.data.fieldErrors);
      }
      setSubmitError(err.message || '報名送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
          <span>載入 TUR 賽事報名表單中...</span>
        </div>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="min-h-screen flex flex-col">
        <TurHeader title="找不到賽事" showHomeLink />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <ShieldAlert className="h-14 w-14 text-rose-400 mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">找不到此路跑活動</h1>
          <p className="text-slate-400 mb-6">{loadError || '請確認您開啟的報名連結是否正確。'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 TUR 賽事大廳
          </Link>
        </div>
      </div>
    );
  }

  // ==================== 報名成功確認畫面 ====================
  if (confirmation) {
    const reg = confirmation.registration;
    return (
      <div className="min-h-screen flex flex-col pb-16">
        <TurHeader
          title={event.name}
          subtitle="報名完成確認單 • 身份證字號全面隱碼保護"
          statusLabel="報名已登錄"
          showHomeLink
          timingUrl={event.timing_portal_url}
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
                    請妥善截圖或列印保存您的專屬報名序號與繳費資訊
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {/* 報名序號卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-700 bg-slate-950 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    專屬報名序號（Order No.）
                  </p>
                  <p className="mt-1 font-mono-num text-3xl font-black tracking-wider text-lime-400">
                    {reg.reg_code}
                  </p>
                  {reg.category_code && (
                    <span className="mt-1.5 inline-block rounded-md bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 font-mono-num text-xs font-bold text-sky-300">
                      晶片組別代碼：{reg.category_code}
                    </span>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    應繳總金額
                  </p>
                  <p className="mt-1 font-mono-num text-3xl font-black text-amber-300">
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

              {/* 費用明細 */}
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

              {/* 報名填寫明細（身分證自動隱碼顯示） */}
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

              {/* 繳費資訊提示 */}
              {confirmation.event?.payment_info && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/25 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-300 mb-2">
                    <CreditCard className="h-4 w-4" />
                    <span>繳費方式與配號說明</span>
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
                  <a
                    href={confirmation.event?.timing_portal_url || 'https://runchip-timing.vercel.app/'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25"
                  >
                    <ExternalLink className="h-4 w-4" />
                    前往晶片成績系統
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmation(null);
                      setAnswers({});
                    }}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/20"
                  >
                    再幫親友報名
                  </button>
                  <Link
                    to="/"
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"
                  >
                    返回大廳
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

  // ==================== 公開報名表單主畫面 ====================
  const canRegister = event.regState?.canRegister;

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-0">
      <TurHeader
        title={event.name}
        subtitle={event.english_name || 'TUR (Taiwan Ultra Runners) 官方線上報名'}
        statusLabel={canRegister ? '開放報名中' : '報名已暫停'}
        showHomeLink
        timingUrl={event.timing_portal_url}
      />

      <BannerHero event={event} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 左側：活動說明 + 動態報名表單 */}
          <div className="lg:col-span-8 space-y-6">
            {event.description && (
              <div className="tur-control-bar rounded-2xl p-5 sm:p-6">
                <h2 className="text-base sm:text-lg font-black text-lime-300 mb-2">賽事簡介與計時說明</h2>
                <p className="whitespace-pre-line text-sm sm:text-base text-slate-300 leading-relaxed">
                  {event.description}
                </p>
              </div>
            )}

            {!canRegister ? (
              <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-950/25 p-8 text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-amber-400 mb-3" />
                <h2 className="text-xl font-black text-white mb-2">目前無法進行線上報名</h2>
                <p className="text-slate-300">{event.regState?.reason}</p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-8 shadow-xl space-y-6"
              >
                <div className="border-b border-slate-800 pb-4">
                  <h2 className="text-2xl font-black text-white">跑者報名資料填寫</h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-400">
                    標記 <span className="text-lime-400 font-bold">*</span> 為必填欄位；身分證字號將作為 TUR 共用 NFC 晶片識別鍵，公開顯示時全面隱碼保護。
                  </p>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 text-sm text-rose-200">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="space-y-5">
                  {(event.fields || []).map((field) => (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                      <DynamicFormField
                        field={field}
                        value={answers[field.id]}
                        onChange={handleFieldChange}
                        error={fieldErrors[field.id]}
                        pricing={pricing}
                      />
                    </div>
                  ))}
                </div>

                {/* 表單底部應繳總金額與送出按鈕 */}
                <div className="rounded-xl border border-lime-400/35 bg-slate-950 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-300">本次報名應繳總金額</span>
                    <span className="font-mono-num text-2xl sm:text-3xl font-black text-amber-300">
                      NT$ {pricing.total.toLocaleString()}
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
                        <span>資料驗證與寫入試算表中...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        <span>確認資料並送出報名</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 右側：桌面端即時費用加總側欄 */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-24 space-y-5">
            <div className="tur-control-bar rounded-2xl p-6">
              <div className="flex items-center gap-2 text-amber-300 font-bold mb-4">
                <Calculator className="h-5 w-5" />
                <span>即時費用試算摘要</span>
              </div>

              {pricing.breakdown.length > 0 ? (
                <ul className="space-y-2.5 text-sm border-b border-slate-800 pb-4 mb-4">
                  {pricing.breakdown.map((item, i) => (
                    <li key={i} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-400">{item.fieldLabel}</p>
                        <p className="font-medium text-slate-100">{item.itemLabel}</p>
                      </div>
                      <span className="font-mono-num font-bold text-amber-300 shrink-0">
                        NT$ {item.amount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 border-b border-slate-800 pb-4 mb-4">
                  請於左側選擇「報名組別」或加購項目，系統將自動為您累計費用。
                </p>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-slate-300">應繳總金額</span>
                <span className="font-mono-num text-3xl font-black text-white">
                  NT$ {pricing.total.toLocaleString()}
                </span>
              </div>
            </div>

            {event.payment_info && (
              <div className="tur-card rounded-2xl border border-slate-800 bg-slate-900/85 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">
                  <CreditCard className="h-4 w-4" />
                  <span>繳費資訊預覽</span>
                </div>
                <p className="whitespace-pre-line text-xs text-slate-300 leading-relaxed">
                  {event.payment_info}
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* 手機端底部固定試算條 */}
      {canRegister && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-400">應繳總金額</p>
              <p className="font-mono-num text-xl font-black text-amber-300">
                NT$ {pricing.total.toLocaleString()}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              已選 {pricing.breakdown.length} 項計費項目
            </span>
          </div>
        </div>
      )}

      <TurFooter />
    </div>
  );
}
