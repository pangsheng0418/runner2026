import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Package,
  Printer,
  Send,
  ShoppingCart,
  Users,
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

// 共用選手基本欄位定義（一次填寫套用到所有勾選場次）
const SHARED_PROFILE_FIELDS = [
  {
    id: 'full_name',
    label: '姓名',
    type: 'text',
    required: true,
    placeholder: '真實姓名',
    validation: 'none',
  },
  {
    id: 'gender',
    label: '性別',
    type: 'radio',
    required: true,
    options: [
      { label: '男', value: '男', price: 0 },
      { label: '女', value: '女', price: 0 },
    ],
    validation: 'none',
  },
  {
    id: 'id_number',
    label: '身份證字號',
    type: 'tw_id',
    required: true,
    placeholder: '例：A123456789',
    validation: 'tw_id_or_passport',
  },
  {
    id: 'birth_date',
    label: '出生年月日',
    type: 'date',
    required: true,
    helperText: '限 10～80 歲',
    validation: 'age_10_80',
  },
  {
    id: 'phone',
    label: '連絡電話',
    type: 'tel',
    required: true,
    placeholder: '0912345678（手機 10 碼）',
    validation: 'phone',
  },
  {
    id: 'email',
    label: '電子信箱',
    type: 'email',
    required: true,
    placeholder: 'name@example.com',
    validation: 'email',
  },
  {
    id: 'diet_preference',
    label: '飲食習慣',
    type: 'radio',
    required: true,
    options: [
      { label: '葷', value: '葷', price: 0 },
      { label: '素', value: '素', price: 0 },
    ],
    validation: 'none',
  },
  {
    id: 'emergency_name',
    label: '緊急聯絡人姓名',
    type: 'text',
    required: true,
    placeholder: '不可與本人同名',
    validation: 'none',
  },
  {
    id: 'emergency_phone',
    label: '緊急聯絡人電話',
    type: 'tel',
    required: true,
    placeholder: '0912345678（不可同本人手機）',
    validation: 'phone',
  },
  {
    id: 'notes',
    label: '備考 / 跑團',
    type: 'textarea',
    required: false,
    placeholder: '選填',
    validation: 'none',
  },
];

function isSharedBasicField(field) {
  if (!field) return true;
  if (field.type === 'calculated') return true;
  const id = String(field.id || '');
  const lbl = String(field.label || '');
  if (
    [
      'full_name',
      'name',
      'gender',
      'id_number',
      'tw_id',
      'birth_date',
      'phone',
      'mobile',
      'email',
      'emergency_name',
      'emergency_phone',
      'diet_preference',
      'notes',
      'remittance_last5',
    ].includes(id)
  ) {
    return true;
  }
  if (
    lbl === '姓名' ||
    lbl.includes('性別') ||
    lbl.includes('身份證') ||
    lbl.includes('身分證') ||
    (field.type === 'date' && lbl.includes('出生')) ||
    lbl.includes('電子信箱') ||
    lbl.includes('緊急') ||
    lbl.includes('飲食') ||
    lbl.includes('尾五碼') ||
    lbl.includes('後五碼') ||
    lbl === '備考' ||
    lbl === '備註'
  ) {
    return true;
  }
  return false;
}

function getEventOwnerKey(ev) {
  return String(ev?.owner_admin_id || ev?.owner_username || ev?.organizer_name || 'default');
}

export default function MultiRegisterPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 先鎖定單一承辦人（不同承辦人收款帳戶不同不可混單）
  const [selectedOwnerKey, setSelectedOwnerKey] = useState('');
  // 各場次選擇狀態：{ [eventId]: { selected: boolean, answers: { ... } } }
  const [selections, setSelections] = useState({});

  // 選手共用基本資料
  const [profile, setProfile] = useState({});
  const [profileErrors, setProfileErrors] = useState({});
  const [remittanceLast5, setRemittanceLast5] = useState('');
  const [consent, setConsent] = useState(false);

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiRequest('/api/public/events')
      .then((data) => {
        const list = (data.events || [])
          .filter((e) => e.regState?.status === 'open')
          .sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')));
        setEvents(list);

        // 初始化每場的預設組別（預設選第一個組別但未勾選場次）
        const initSel = {};
        for (const ev of list) {
          const catField =
            (ev.fields || []).find((f) => f.id === 'race_category') ||
            (ev.fields || []).find((f) => String(f.label || '').includes('組別'));
          const firstOpt = catField?.options?.[0]?.value || '';
          initSel[ev.id] = {
            selected: false,
            answers: catField && firstOpt ? { [catField.id]: firstOpt } : {},
          };
        }
        setSelections(initSel);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 依承辦人分組（依開放場數由多至少排序）
  const organizers = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const key = getEventOwnerKey(ev);
      if (!map.has(key)) {
        map.set(key, {
          ownerKey: key,
          organizerName: ev.organizer_name || ev.owner_username || '主辦單位',
          events: [],
        });
      }
      map.get(key).events.push(ev);
    }
    return Array.from(map.values()).sort((a, b) => b.events.length - a.events.length);
  }, [events]);

  useEffect(() => {
    if (organizers.length > 0 && !organizers.some((o) => o.ownerKey === selectedOwnerKey)) {
      setSelectedOwnerKey(organizers[0].ownerKey);
    }
  }, [organizers, selectedOwnerKey]);

  const activeOrganizer = useMemo(
    () => organizers.find((o) => o.ownerKey === selectedOwnerKey) || organizers[0] || null,
    [organizers, selectedOwnerKey]
  );

  const ownerEvents = activeOrganizer?.events || [];

  // 取得每場專屬欄位（報名組別、加購服務、自訂欄位）
  const getEventSpecificFields = (ev) =>
    (ev.fields || []).filter((f) => !isSharedBasicField(f));

  const toggleEventSelected = (evId, checked) => {
    setSelections((prev) => ({
      ...prev,
      [evId]: {
        ...(prev[evId] || { answers: {} }),
        selected: checked,
      },
    }));
  };

  const updateEventFieldAnswer = (evId, fieldId, value, autoSelect = true) => {
    setSelections((prev) => {
      const cur = prev[evId] || { selected: false, answers: {} };
      return {
        ...prev,
        [evId]: {
          selected: autoSelect ? true : cur.selected,
          answers: {
            ...(cur.answers || {}),
            [fieldId]: value,
          },
        },
      };
    });
  };

  const handleProfileChange = (fieldId, val) => {
    const next = { ...profile, [fieldId]: val };
    setProfile(next);
    setProfileErrors((prev) =>
      validateFieldWithCrossChecks(SHARED_PROFILE_FIELDS, next, fieldId, prev, { checkRequired: false })
    );
  };

  const handleProfileBlur = (fieldId, val) => {
    const next = { ...profile, [fieldId]: val };
    setProfile(next);
    setProfileErrors((prev) =>
      validateFieldWithCrossChecks(SHARED_PROFILE_FIELDS, next, fieldId, prev, { checkRequired: true })
    );
  };

  // 計算已勾選的場次明細與合併總額
  const pickedItems = useMemo(() => {
    return ownerEvents
      .filter((ev) => selections[ev.id]?.selected)
      .map((ev) => {
        const specificFields = getEventSpecificFields(ev);
        const evAns = selections[ev.id]?.answers || {};
        const pr = calculatePricing(specificFields, evAns);
        const catField =
          specificFields.find((f) => f.id === 'race_category') ||
          specificFields.find((f) => String(f.label || '').includes('組別'));
        return {
          event: ev,
          specificFields,
          answers: evAns,
          pricing: pr,
          categoryLabel: catField ? String(evAns[catField.id] || '') : '',
        };
      });
  }, [ownerEvents, selections]);

  const grandTotal = useMemo(
    () => pickedItems.reduce((sum, it) => sum + Number(it.pricing?.total || 0), 0),
    [pickedItems]
  );

  const ownerPaymentInfo = useMemo(() => {
    const firstPicked = pickedItems.find((it) => it.event.payment_info)?.event.payment_info;
    if (firstPicked) return firstPicked;
    return ownerEvents.find((ev) => ev.payment_info)?.payment_info || '';
  }, [pickedItems, ownerEvents]);

  // 即時檢查待完成清單（顯示在右側結帳明細）
  const liveHints = useMemo(() => {
    const hints = [];
    if (pickedItems.length === 0) hints.push('請至少勾選 1 場活動');
    for (const it of pickedItems) {
      const errs = validateAllFields(it.specificFields, it.answers, { allowEmptyRemittance: true });
      for (const msg of Object.values(errs)) {
        hints.push(`「${it.event.name}」${msg}`);
      }
    }
    const pErrs = validateAllFields(SHARED_PROFILE_FIELDS, profile, { allowEmptyRemittance: true });
    for (const msg of Object.values(pErrs)) {
      hints.push(msg);
    }
    const pName = String(profile.full_name || '').trim();
    const pPhone = String(profile.phone || '').replace(/[\s\-()]/g, '');
    const eName = String(profile.emergency_name || '').trim();
    const ePhone = String(profile.emergency_phone || '').replace(/[\s\-()]/g, '');
    if (pName && eName && pName === eName) hints.push('緊急聯絡人姓名不可與本人同名');
    if (pPhone && ePhone && pPhone === ePhone) hints.push('緊急聯絡人電話不可與本人手機相同');
    if (remittanceLast5.trim()) {
      const e5 = validateRemittanceLast5(remittanceLast5);
      if (e5) hints.push(e5);
    }
    if (!consent) hints.push('須勾選同意所選活動簡章與合併計費');
    return hints;
  }, [pickedItems, profile, remittanceLast5, consent]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSubmitError('');

    const pErrs = validateAllFields(SHARED_PROFILE_FIELDS, profile, { allowEmptyRemittance: true });
    const pName = String(profile.full_name || '').trim();
    const pPhone = String(profile.phone || '').replace(/[\s\-()]/g, '');
    const eName = String(profile.emergency_name || '').trim();
    const ePhone = String(profile.emergency_phone || '').replace(/[\s\-()]/g, '');
    if (pName && eName && pName === eName) pErrs.emergency_name = '緊急聯絡人姓名不可與本人相同';
    if (pPhone && ePhone && pPhone === ePhone) pErrs.emergency_phone = '緊急聯絡人電話不可與本人手機相同';
    setProfileErrors(pErrs);

    if (liveHints.length > 0) {
      setSubmitError(liveHints[0]);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest('/api/public/register-multi', {
        method: 'POST',
        body: {
          profile,
          remittance_last5: remittanceLast5.trim(),
          selections: pickedItems.map((it) => ({
            eventId: it.event.id,
            answers: it.answers,
          })),
        },
      });
      setReceipt(res);
      setConsent(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err.message || '多場聯合報名送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== 多場聯合報名完成確認單 ====================
  if (receipt) {
    return (
      <div className="min-h-screen flex flex-col pb-16">
        <TurHeader
          title="多場聯合報名完成確認單"
          showHomeLink
          showLookupLink
        />

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 mt-8">
          <div className="tur-card overflow-hidden rounded-2xl border border-emerald-400/55 bg-slate-900/95 shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 via-teal-500 to-lime-400 px-6 py-6 text-slate-950">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-10 w-10 shrink-0" />
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black">
                    {receipt.isBundle
                      ? `多場聯合報名成功！（共 ${receipt.items.length} 場）`
                      : '報名成功！'}
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-0.5">
                    請截圖或列印保存合併單號與各場次報名序號
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {receipt.emailNotification?.notice && (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 text-xs sm:text-sm text-sky-200">
                  <Mail className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{receipt.emailNotification.notice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-slate-700 bg-slate-950 p-5">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    {receipt.isBundle ? '統一合併單號' : '報名序號'}
                  </p>
                  <p className="mt-1 font-mono-num text-xl font-black text-emerald-400">
                    {receipt.bundle_code || receipt.items[0]?.reg_code}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    選手：{receipt.runner_name}（{receipt.id_masked}）
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">合併匯款後五碼</p>
                  <p className="mt-1 font-mono-num text-lg font-black text-sky-300">
                    {receipt.remittance_last5 || '尚未填寫（可事後一次補填全單）'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">承辦單位：{receipt.organizer_name}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase text-slate-400">合併應繳總金額</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-amber-300">
                    NT$ {Number(receipt.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-300 mb-2">各場次報名明細</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-slate-800 bg-slate-900/90 text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">#</th>
                        <th className="px-4 py-2.5">活動名稱 / 日期</th>
                        <th className="px-4 py-2.5">專屬報名序號</th>
                        <th className="px-4 py-2.5">組別</th>
                        <th className="px-4 py-2.5 text-right">本場小計</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(receipt.items || []).map((it, idx) => (
                        <tr key={it.reg_code}>
                          <td className="px-4 py-2.5 font-mono-num text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-white">{it.event_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono-num">{it.event_date}</div>
                          </td>
                          <td className="px-4 py-2.5 font-mono-num font-black text-lime-400">{it.reg_code}</td>
                          <td className="px-4 py-2.5 font-mono-num text-emerald-300">{it.category_code || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-bold text-amber-300">
                            NT$ {Number(it.total_amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {receipt.payment_info && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/25 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-300 mb-2">
                    <CreditCard className="h-4 w-4" />
                    <span>承辦人統一匯款帳戶（請合併匯入總金額 NT$ {Number(receipt.total_amount || 0).toLocaleString()}）</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-200 leading-relaxed">
                    {receipt.payment_info}
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
                  <Link
                    to="/lookup"
                    className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25"
                  >
                    查詢 / 補填合併單末五碼
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
        </main>
        <TurFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-12">
      <TurHeader
        title="多場聯合報名"
        subtitle="同承辦人多場活動一次填表、合併繳費"
        showHomeLink
        showLookupLink
        showAdminLink
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 pt-5 space-y-5">
        {/* 頂部橫幅 */}
        <section className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 p-5 sm:p-6 shadow-xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-black/35 hover:bg-black/55 px-3 py-1 text-xs font-bold text-slate-200 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回活動列表
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <ShoppingCart className="h-6 w-6 text-emerald-400" />
                <span>🛒 多場聯合報名</span>
              </h1>
              <p className="text-xs sm:text-sm text-emerald-200/85 mt-1">
                先選擇同一位承辦人，勾選多場開放中活動一次填寫個人資料，自動產生統一合併單號（TURM-...）合併匯款！
              </p>
            </div>
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-300">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mr-2" />
            載入開放中賽事清單...
          </div>
        )}

        {loadError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-300">
            無法載入活動清單：{loadError}
          </div>
        )}

        {!loading && !loadError && organizers.length === 0 && (
          <div className="tur-control-bar rounded-2xl p-10 text-center space-y-2">
            <p className="text-base font-bold text-slate-300">目前暫無開放報名的賽事活動</p>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 mt-2"
            >
              返回首頁
            </Link>
          </div>
        )}

        {!loading && !loadError && organizers.length > 0 && (
          <>
            {/* 步驟 0：選擇承辦人（不同承辦人收款帳戶不同，不可混單） */}
            <section className="tur-control-bar rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  <Building2 className="h-4 w-4 text-emerald-400" />
                  <span>👤 選擇承辦人（限同承辦人合併繳費）</span>
                </div>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  {organizers.length} 位承辦人
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {organizers.map((org) => {
                  const active = org.ownerKey === activeOrganizer?.ownerKey;
                  return (
                    <button
                      key={org.ownerKey}
                      type="button"
                      onClick={() => setSelectedOwnerKey(org.ownerKey)}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/15 text-white shadow'
                          : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-emerald-400/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-sm truncate">👤 {org.organizerName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono-num text-[11px] font-black shrink-0 ${
                            active
                              ? 'bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {org.events.length} 場
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {org.events.length >= 2
                          ? '支援同帳戶多場合併匯款'
                          : '目前 1 場開放中（可直接報名）'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 左側主區：1. 勾選活動與組別 ＋ 2. 選手共用資料 */}
              <div className="lg:col-span-8 space-y-5">
                {/* 1. 勾選活動與組別 */}
                <section className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h2 className="text-base font-black text-white">
                      1. 勾選活動與組別（{activeOrganizer?.organizerName}）
                    </h2>
                    <span className="text-xs font-bold text-emerald-300">
                      已勾選 {pickedItems.length} / {ownerEvents.length} 場
                    </span>
                  </div>

                  <div className="space-y-3">
                    {ownerEvents.map((ev) => {
                      const st = selections[ev.id] || { selected: false, answers: {} };
                      const specificFields = getEventSpecificFields(ev);
                      const evPricing = calculatePricing(specificFields, st.answers);
                      const isFull =
                        Number(ev.max_participants || 0) > 0 &&
                        Number(ev.registration_count || 0) >= Number(ev.max_participants);

                      const catField =
                        specificFields.find((f) => f.id === 'race_category') ||
                        specificFields.find((f) => String(f.label || '').includes('組別'));
                      const otherSpecificFields = specificFields.filter((f) => f !== catField);

                      return (
                        <div
                          key={ev.id}
                          className={`rounded-2xl border-2 transition overflow-hidden ${
                            st.selected
                              ? 'border-emerald-400 bg-emerald-950/20 shadow-md'
                              : 'border-slate-800 bg-slate-950/75'
                          }`}
                        >
                          <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                            <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-[220px]">
                              <input
                                type="checkbox"
                                checked={Boolean(st.selected)}
                                disabled={isFull}
                                onChange={(e) => toggleEventSelected(ev.id, e.target.checked)}
                                className="mt-1 h-4 w-4 accent-emerald-400"
                              />
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-sm sm:text-base text-white">
                                    {ev.name}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      ev.event_type === 'lap_timed'
                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40'
                                        : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                                    }`}
                                  >
                                    {ev.event_type === 'lap_timed' ? '🔁 繞圈賽' : '🏃 距離賽'}
                                  </span>
                                  {isFull && (
                                    <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                                      已額滿
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                  <span className="inline-flex items-center gap-1 font-mono-num">
                                    <Calendar className="h-3 w-3 text-lime-400" />
                                    {ev.event_date}
                                  </span>
                                  {ev.location && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="h-3 w-3 text-emerald-400" />
                                      {ev.location}
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 font-mono-num text-lime-300">
                                    <Users className="h-3 w-3" />
                                    {ev.registration_count} / {ev.max_participants > 0 ? ev.max_participants : '不限'}
                                  </span>
                                </div>
                              </div>
                            </label>

                            <div className="text-right shrink-0">
                              <p className="text-[11px] text-slate-400">本場小計</p>
                              <p
                                className={`font-mono-num text-base font-black ${
                                  st.selected ? 'text-emerald-300' : 'text-slate-500'
                                }`}
                              >
                                NT$ {evPricing.total.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="border-t border-slate-800/90 bg-slate-900/60 px-4 py-3.5 space-y-3">
                            {/* 報名組別下拉（切換即自動勾選該場） */}
                            {catField && (
                              <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                  {catField.label} *
                                </label>
                                <select
                                  value={st.answers?.[catField.id] || ''}
                                  onChange={(e) =>
                                    updateEventFieldAnswer(ev.id, catField.id, e.target.value, true)
                                  }
                                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs sm:text-sm font-bold text-white focus:border-emerald-400 focus:outline-none"
                                >
                                  <option value="">請選擇組別</option>
                                  {(catField.options || []).map((opt, idx) => (
                                    <option key={idx} value={opt.value}>
                                      {opt.label}
                                      {Number(opt.price || 0) > 0
                                        ? ` — NT$ ${Number(opt.price).toLocaleString()}`
                                        : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* 勾選後展開該場加購與專屬自訂欄位 */}
                            {st.selected && otherSpecificFields.length > 0 && (
                              <div className="space-y-3 pt-1">
                                {otherSpecificFields.map((field) => (
                                  <DynamicFormField
                                    key={`${ev.id}-${field.id}`}
                                    field={field}
                                    value={st.answers?.[field.id]}
                                    onChange={(fid, val) => updateEventFieldAnswer(ev.id, fid, val, true)}
                                    pricing={evPricing}
                                    namePrefix={`multi_${ev.id}`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 2. 選手共用資料 */}
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="tur-card rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 space-y-5"
                >
                  <div className="border-b border-slate-800 pb-3">
                    <h2 className="text-base font-black text-white">2. 選手共用基本資料（一次填寫）</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      以下資料將自動帶入所有勾選場次，免重複輸入
                    </p>
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 text-sm text-rose-200">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {SHARED_PROFILE_FIELDS.map((field) => (
                      <DynamicFormField
                        key={field.id}
                        field={field}
                        value={profile[field.id]}
                        onChange={handleProfileChange}
                        onBlur={handleProfileBlur}
                        error={profileErrors[field.id]}
                        namePrefix="multi_profile"
                      />
                    ))}
                  </div>

                  {/* 合併匯款末五碼（選填，可事後補填） */}
                  <div className="rounded-xl border border-amber-400/40 bg-amber-950/20 p-4 space-y-2">
                    <label className="block text-xs font-black text-amber-300">
                      🏦 合併匯款帳號後 5 碼（選填，可事後於查詢頁一次補填全單）
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={remittanceLast5}
                      onChange={(e) => setRemittanceLast5(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="例：12345（未匯款可先留空）"
                      className="w-full sm:w-80 rounded-xl border border-amber-400/40 bg-slate-950 px-3.5 py-2.5 font-mono-num text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-emerald-400"
                    />
                    <span>我已詳閱並同意所選活動簡章、健康切結與多場合併計費說明 *</span>
                  </label>
                </form>
              </div>

              {/* 右側：結帳明細 */}
              <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
                <div className="tur-card rounded-2xl border-2 border-emerald-400/75 bg-slate-900/95 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>🧾 聯合報名結帳明細</span>
                    </h3>
                    <span className="font-mono-num text-xs font-bold text-slate-400">
                      {pickedItems.length} 場
                    </span>
                  </div>

                  {pickedItems.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      尚未勾選任何活動，請於左側勾選欲報名場次
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {pickedItems.map((it, idx) => (
                        <div
                          key={it.event.id}
                          className="rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-2.5 flex items-start justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">
                              {idx + 1}. {it.event.name}
                            </p>
                            <p className="text-[11px] text-slate-300 truncate">
                              {it.categoryLabel || '尚未選組別'}
                            </p>
                          </div>
                          <span className="font-mono-num font-black text-emerald-300 shrink-0">
                            NT$ {it.pricing.total.toLocaleString()}
                          </span>
                        </div>
                      ))}

                      {pickedItems.length >= 2 ? (
                        <div className="rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-[11px] font-bold text-amber-200">
                          📦 已勾選 {pickedItems.length} 場：送出將產生 1 組統一合併單號（TURM-...），一次匯款記帳！
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-800/80 px-3 py-2 text-[11px] text-slate-300">
                          💡 再多勾選 1 場同承辦人活動即可合併為 1 筆匯款！
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-slate-800 pt-3 flex items-baseline justify-between">
                    <span className="text-xs font-bold text-slate-400">合併應繳總額</span>
                    <span className="font-mono-num text-2xl font-black text-amber-300">
                      NT$ {grandTotal.toLocaleString()}
                    </span>
                  </div>

                  {ownerPaymentInfo && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-300 space-y-1">
                      <p className="font-bold text-sky-300">
                        🏦 {activeOrganizer?.organizerName} — 統一匯款帳戶
                      </p>
                      <p className="whitespace-pre-line leading-relaxed">{ownerPaymentInfo}</p>
                    </div>
                  )}

                  {liveHints.length > 0 && (
                    <div className="space-y-1 text-[11px] font-bold text-rose-400">
                      {liveHints.slice(0, 4).map((h, i) => (
                        <div key={i}>• {h}</div>
                      ))}
                      {liveHints.length > 4 && (
                        <div>• 另有 {liveHints.length - 4} 項待填（請見左側表單）</div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={submitting || liveHints.length > 0}
                    onClick={handleSubmit}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-3.5 text-sm font-black text-slate-950 hover:from-emerald-400 hover:to-lime-300 disabled:bg-slate-800 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 transition shadow-lg"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>送出聯合報名中...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>
                          {pickedItems.length >= 2
                            ? `✅ 送出多場聯合報名（${pickedItems.length} 場・NT$ ${grandTotal.toLocaleString()}）`
                            : `✅ 送出報名（NT$ ${grandTotal.toLocaleString()}）`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      <TurFooter />
    </div>
  );
}
