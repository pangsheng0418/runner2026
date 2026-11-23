import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Calculator, Calendar, Check, CheckCircle2 } from 'lucide-react';
import { getFieldValidBadge, isBirthDateField } from '../utils/validation';

function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!m) return 31;
  // 若尚未選年，2 月先提供 29 天，待選年後自動校正平閏年
  if (!y) {
    if (m === 2) return 29;
    return [4, 6, 9, 11].includes(m) ? 30 : 31;
  }
  return new Date(y, m, 0).getDate();
}

function parseIsoDate(raw) {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { year: '', month: '', day: '' };
  return { year: m[1], month: m[2], day: m[3] };
}

function LinkedDatePicker({ field, value, onChange, onBlur, baseInputClass }) {
  const isBirth = isBirthDateField(field);
  const now = new Date();
  const currentYear = now.getFullYear();
  const maxYear = isBirth ? currentYear : currentYear + 5;
  const minYear = isBirth ? currentYear - 95 : currentYear - 10;

  const [parts, setParts] = useState(() => parseIsoDate(value));
  const lastValueRef = useRef(value ?? '');
  const nativeInputRef = useRef(null);

  // 外部 value 變更（例如反向查詢帶入舊資料、表單重置、或透過日曆選取）時雙向同步三欄
  useEffect(() => {
    const strVal = String(value ?? '').trim();
    if (strVal !== lastValueRef.current) {
      lastValueRef.current = strVal;
      if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
        setParts(parseIsoDate(strVal));
      } else if (!strVal) {
        setParts({ year: '', month: '', day: '' });
      }
    }
  }, [value]);

  const maxDay = getDaysInMonth(parts.year, parts.month);
  const years = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, '0'));

  const emitDate = (nextParts) => {
    setParts(nextParts);
    if (nextParts.year && nextParts.month && nextParts.day) {
      const iso = `${nextParts.year}-${nextParts.month}-${nextParts.day}`;
      lastValueRef.current = iso;
      onChange(field.id, iso);
    } else {
      if (lastValueRef.current !== '') {
        lastValueRef.current = '';
        onChange(field.id, '');
      }
    }
  };

  const handlePartChange = (key, val) => {
    const next = { ...parts, [key]: val };
    // 年或月變動時，自動校正「日」不超過該月最大天數（如 3/31 切 2 月 → 自動連動為 2/28 或 2/29）
    if ((key === 'year' || key === 'month') && next.day) {
      const nextMaxDay = getDaysInMonth(next.year, next.month);
      if (Number(next.day) > nextMaxDay) {
        next.day = String(nextMaxDay).padStart(2, '0');
      }
    }
    emitDate(next);
  };

  const handleNativeDateChange = (e) => {
    const raw = String(e.target.value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parsed = parseIsoDate(raw);
      setParts(parsed);
      lastValueRef.current = raw;
      onChange(field.id, raw);
    } else if (!raw) {
      setParts({ year: '', month: '', day: '' });
      lastValueRef.current = '';
      onChange(field.id, '');
    }
  };

  const handleGroupBlur = (e) => {
    // 僅當焦點離開整個日期選擇元件時才觸發 blur 必填驗證，避免在年／月／日間切換就跳紅框
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const currentIso =
      parts.year && parts.month && parts.day
        ? `${parts.year}-${parts.month}-${parts.day}`
        : '';
    if (onBlur) onBlur(field.id, currentIso);
  };

  const openNativePicker = () => {
    const el = nativeInputRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        // 部分瀏覽器不支援程式開啟 showPicker，改由 focus 處理
      }
    }
  };

  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectClass = `${baseInputClass} px-3 py-3 cursor-pointer`;

  return (
    <div className="space-y-2" onBlur={handleGroupBlur}>
      {/* 年 / 月 / 日 三欄即時連動選單 */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5">
          <select
            aria-label={`${field.label}（西元年）`}
            value={parts.year}
            onChange={(e) => handlePartChange('year', e.target.value)}
            className={selectClass}
          >
            <option value="">西元年</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}{isBirth && y >= 1912 ? `（民${y - 1911}）` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-3">
          <select
            aria-label={`${field.label}（月）`}
            value={parts.month}
            onChange={(e) => handlePartChange('month', e.target.value)}
            className={selectClass}
          >
            <option value="">月</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {Number(m)} 月
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-4">
          <select
            aria-label={`${field.label}（日）`}
            value={parts.day}
            onChange={(e) => handlePartChange('day', e.target.value)}
            className={selectClass}
          >
            <option value="">日</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {Number(d)} 日
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 雙向同步日曆選擇器（支援點選日曆或直接鍵盤輸入 YYYY-MM-DD，兩邊即時連動） */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openNativePicker}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-300 hover:border-sky-400/70 hover:text-sky-300 transition"
        >
          <Calendar className="h-3.5 w-3.5" />
          日曆點選
        </button>
        <input
          ref={nativeInputRef}
          type="date"
          min={`${minYear}-01-01`}
          max={isBirth ? todayIso : `${maxYear}-12-31`}
          value={parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : ''}
          onChange={handleNativeDateChange}
          onInput={handleNativeDateChange}
          className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 font-mono-num text-xs text-slate-200 hover:border-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </div>
  );
}

export default function DynamicFormField({ field, value, onChange, onBlur, error, pricing, namePrefix = '' }) {
  if (field.type === 'calculated') {
    return (
      <div className="tur-card rounded-2xl border border-amber-400/40 bg-slate-950/90 p-5 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <Calculator className="h-5 w-5" />
            <span>{field.label || '應繳總金額'}</span>
          </div>
          <span className="font-mono-num text-2xl font-black text-white">
            NT$ {(pricing?.total || 0).toLocaleString()}
          </span>
        </div>
        {pricing?.breakdown?.length > 0 ? (
          <ul className="space-y-1.5 border-t border-slate-800 pt-3 text-sm text-slate-300">
            {pricing.breakdown.map((item, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {item.fieldLabel} — <strong className="text-slate-100">{item.itemLabel}</strong>
                </span>
                <span className="font-mono-num text-amber-300">+NT$ {item.amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">選擇組別後自動加總</p>
        )}
      </div>
    );
  }

  const validBadge = getFieldValidBadge(field, value, error);

  const baseInputClass = `w-full rounded-xl border bg-slate-950/90 px-4 py-3 text-sm sm:text-base text-white placeholder-slate-500 transition focus:outline-none focus:ring-2 ${
    error
      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30'
      : validBadge
      ? 'border-emerald-500/70 focus:border-emerald-400 focus:ring-emerald-400/25'
      : 'border-slate-700/90 hover:border-slate-500 focus:border-lime-400 focus:ring-lime-400/25'
  }`;

  const renderControl = () => {
    if (field.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={value || ''}
          onChange={(e) => onChange(field.id, e.target.value)}
          onBlur={(e) => onBlur && onBlur(field.id, e.target.value)}
          placeholder={field.placeholder || ''}
          className={baseInputClass}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(field.id, e.target.value)}
          onBlur={(e) => onBlur && onBlur(field.id, e.target.value)}
          className={baseInputClass}
        >
          <option value="">{field.placeholder || `請選擇${field.label}`}</option>
          {(field.options || []).map((opt, idx) => (
            <option key={idx} value={opt.value}>
              {opt.label}
              {opt.code ? ` [${opt.code}]` : ''}
              {Number(opt.price || 0) > 0 ? ` — NT$ ${Number(opt.price).toLocaleString()}` : ''}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'date') {
      return (
        <LinkedDatePicker
          field={field}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          baseInputClass={baseInputClass}
        />
      );
    }

    if (field.type === 'radio') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(field.options || []).map((opt, idx) => {
            const checked = String(value || '') === String(opt.value);
            return (
              <label
                key={idx}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
                  checked
                    ? 'border-lime-400 bg-lime-500/15 text-white ring-2 ring-lime-400/25'
                    : 'border-slate-700/90 bg-slate-950/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={namePrefix ? `${namePrefix}_${field.id}` : field.id}
                    value={opt.value}
                    checked={checked}
                    onChange={() => onChange(field.id, opt.value)}
                    className="h-4 w-4 accent-lime-400"
                  />
                  <span className="font-semibold">{opt.label}</span>
                </div>
                {Number(opt.price || 0) > 0 && (
                  <span className="font-mono-num text-xs font-bold text-amber-300">
                    NT$ {Number(opt.price).toLocaleString()}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const selectedArr = Array.isArray(value) ? value : [];
      const toggle = (optVal) => {
        const next = selectedArr.includes(optVal)
          ? selectedArr.filter((v) => v !== optVal)
          : [...selectedArr, optVal];
        onChange(field.id, next);
      };

      return (
        <div className="space-y-2.5">
          {(field.options || []).map((opt, idx) => {
            const checked = selectedArr.includes(opt.value);
            return (
              <label
                key={idx}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
                  checked
                    ? 'border-sky-400 bg-sky-500/15 text-white ring-2 ring-sky-400/25'
                    : 'border-slate-700/90 bg-slate-950/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border transition ${
                      checked
                        ? 'border-sky-400 bg-sky-400 text-slate-950'
                        : 'border-slate-500 bg-slate-950'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    className="sr-only"
                  />
                  <span className="font-medium">{opt.label}</span>
                </div>
                {Number(opt.price || 0) > 0 && (
                  <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 font-mono-num text-xs font-bold text-amber-300">
                    +NT$ {Number(opt.price).toLocaleString()}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      );
    }

    const inputType =
      field.type === 'tw_id'
        ? 'text'
        : ['number', 'date', 'email', 'tel'].includes(field.type)
        ? field.type
        : 'text';

    const isPhoneField = field.type === 'tel' || field.validation === 'phone';
    const isRemittanceField = field.id === 'remittance_last5' || field.validation === 'remittance_last5';

    return (
      <div className="relative">
        <input
          type={inputType}
          inputMode={isPhoneField || isRemittanceField ? 'numeric' : undefined}
          maxLength={isRemittanceField ? 5 : isPhoneField ? 12 : undefined}
          min={field.type === 'number' ? 0 : undefined}
          value={value ?? ''}
          onChange={(e) => {
            let nextVal = e.target.value;
            if (field.type === 'tw_id') nextVal = nextVal.toUpperCase();
            onChange(field.id, nextVal);
          }}
          onBlur={(e) => {
            let blurVal = e.target.value;
            if (field.type === 'tw_id') blurVal = blurVal.toUpperCase();
            if (onBlur) onBlur(field.id, blurVal);
          }}
          placeholder={field.placeholder || ''}
          className={baseInputClass}
        />
        {field.type === 'number' && Number(field.unitPrice || 0) > 0 && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-amber-500/20 px-2 py-0.5 font-mono-num text-xs font-bold text-amber-300">
            單價 NT$ {Number(field.unitPrice).toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  const displayHelper = isBirthDateField(field)
    ? '限 10～80 歲'
    : field.helperText && field.helperText.length <= 24
    ? field.helperText
    : '';

  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-sm font-bold text-slate-100">
        <span>
          {field.label}
          {field.required && <span className="ml-1 text-lime-400">*</span>}
        </span>
      </label>

      {renderControl()}

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : validBadge ? (
        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{validBadge}</span>
        </p>
      ) : displayHelper ? (
        <p className="text-xs text-slate-500">{displayHelper}</p>
      ) : null}
    </div>
  );
}
