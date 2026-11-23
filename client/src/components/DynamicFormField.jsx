import React from 'react';
import { AlertCircle, Calculator, Check, CheckCircle2 } from 'lucide-react';
import { getFieldValidBadge } from '../utils/validation';

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
          <p className="text-xs text-slate-400">尚未選擇計費項目，選擇報名組別或加購裝備後將即時加總。</p>
        )}
        {field.helperText && <p className="mt-2 text-xs text-slate-400">{field.helperText}</p>}
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
          onBlur={() => onBlur && onBlur(field.id, value)}
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

  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-sm font-bold text-slate-100">
        <span>
          {field.label}
          {field.required && <span className="ml-1 text-lime-400">*</span>}
        </span>
        {field.type === 'tw_id' && (
          <span className="text-[11px] font-semibold text-sky-400">個資全面隱碼保護</span>
        )}
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
      ) : field.helperText ? (
        <p className="text-xs text-slate-400">{field.helperText}</p>
      ) : null}
    </div>
  );
}
