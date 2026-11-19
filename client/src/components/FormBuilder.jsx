import React, { useState } from 'react';
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Copy,
  RotateCcw,
  Table2,
  DollarSign,
} from 'lucide-react';
import { FIELD_TYPES, createBlankField } from '../utils/defaultFields';

const SYSTEM_HEADERS = ['報名序號', '報名時間', '應繳總金額', '繳費狀態'];

export default function FormBuilder({ fields, onChange, onLoadDefaultFields }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [newFieldType, setNewFieldType] = useState('text');

  const updateField = (idx, patch) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };

  const handleTypeChange = (idx, nextType) => {
    const meta = FIELD_TYPES.find((t) => t.value === nextType);
    const current = fields[idx];
    const patch = {
      type: nextType,
      validation:
        nextType === 'tw_id'
          ? 'tw_id_or_passport'
          : nextType === 'email'
          ? 'email'
          : nextType === 'tel'
          ? 'phone'
          : 'none',
    };
    if (meta?.hasOptions && (!current.options || current.options.length === 0)) {
      patch.options = [
        { label: '選項一', value: '選項一', price: 0 },
        { label: '選項二', value: '選項二', price: 0 },
      ];
    }
    if (nextType === 'calculated') {
      patch.required = false;
    }
    updateField(idx, patch);
  };

  const addField = () => {
    onChange([...fields, createBlankField(newFieldType)]);
  };

  const duplicateField = (idx) => {
    const target = fields[idx];
    const copy = {
      ...JSON.parse(JSON.stringify(target)),
      id: `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      label: `${target.label}（複製）`,
    };
    const next = [...fields];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };

  const removeField = (idx) => {
    onChange(fields.filter((_, i) => i !== idx));
  };

  const moveField = (from, to) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const addOption = (fieldIdx) => {
    const current = fields[fieldIdx];
    const count = (current.options || []).length + 1;
    const nextOptions = [
      ...(current.options || []),
      { label: `新選項 ${count}`, value: `新選項 ${count}`, price: 0 },
    ];
    updateField(fieldIdx, { options: nextOptions });
  };

  const updateOption = (fieldIdx, optIdx, patch) => {
    const current = fields[fieldIdx];
    const nextOptions = (current.options || []).map((opt, idx) => {
      if (idx !== optIdx) return opt;
      const merged = { ...opt, ...patch };
      if (patch.label !== undefined && patch.value === undefined) {
        merged.value = patch.label;
      }
      return merged;
    });
    updateField(fieldIdx, { options: nextOptions });
  };

  const removeOption = (fieldIdx, optIdx) => {
    const current = fields[fieldIdx];
    updateField(fieldIdx, {
      options: (current.options || []).filter((_, idx) => idx !== optIdx),
    });
  };

  const previewHeaders = [
    ...SYSTEM_HEADERS,
    ...fields.filter((f) => f.type !== 'calculated').map((f) => f.label || f.id),
  ];

  return (
    <div className="space-y-6">
      {/* 即時試算表表頭預覽列 */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300 mb-2">
          <Table2 className="h-4 w-4" />
          <span>Google 試算表第一列（表頭）即時預覽 — 儲存後自動同步對齊</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {previewHeaders.map((h, i) => (
            <span
              key={i}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                i < SYSTEM_HEADERS.length
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'bg-slate-800 text-slate-200 border border-slate-700'
              }`}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* 欄位列表（支援拖曳與上下鈕排序） */}
      <div className="space-y-3">
        {fields.map((field, idx) => {
          const typeMeta = FIELD_TYPES.find((t) => t.value === field.type) || FIELD_TYPES[0];
          const isDragging = dragIndex === idx;

          return (
            <div
              key={field.id || idx}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== idx) {
                  moveField(dragIndex, idx);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`rounded-xl border bg-slate-900/90 p-4 transition ${
                isDragging
                  ? 'border-orange-500 opacity-60 scale-[0.99]'
                  : 'border-slate-700/80 hover:border-slate-600'
              }`}
            >
              {/* 頂部工具列 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    title="按住拖曳調整順序"
                    className="cursor-grab text-slate-500 hover:text-orange-400 active:cursor-grabbing"
                  >
                    <GripVertical className="h-5 w-5" />
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-orange-400">
                    #{idx + 1}
                  </span>
                  <span className="font-bold text-sm text-white">{field.label || '未命名欄位'}</span>
                  {field.required && (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                      必填
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveField(idx, idx - 1)}
                    disabled={idx === 0}
                    title="上移"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(idx, idx + 1)}
                    disabled={idx === fields.length - 1}
                    title="下移"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateField(idx)}
                    title="複製欄位"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-sky-400"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    title="刪除欄位"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 欄位基本屬性 */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    欄位標題（同步為試算表表頭）
                  </label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">欄位格式</label>
                  <select
                    value={field.type}
                    onChange={(e) => handleTypeChange(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 flex items-end pb-1.5">
                  {field.type !== 'calculated' && (
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span>設為必填</span>
                    </label>
                  )}
                </div>

                {typeMeta.hasUnitPrice && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-orange-300 mb-1">
                      單價（NT$）
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={field.unitPrice || 0}
                      onChange={(e) => updateField(idx, { unitPrice: Number(e.target.value || 0) })}
                      className="w-full rounded-lg border border-orange-500/40 bg-slate-950 px-3 py-2 font-mono text-sm text-orange-300 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 提示文字 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {field.type !== 'calculated' && field.type !== 'checkbox' && field.type !== 'radio' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      輸入提示（Placeholder）
                    </label>
                    <input
                      type="text"
                      value={field.placeholder || ''}
                      onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                      placeholder="例如：請輸入..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                )}
                <div className={field.type === 'calculated' ? 'md:col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    欄位補充說明（顯示於欄位下方）
                  </label>
                  <input
                    type="text"
                    value={field.helperText || ''}
                    onChange={(e) => updateField(idx, { helperText: e.target.value })}
                    placeholder="選填說明文字"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 選項與金額設定（Select / Radio / Checkbox） */}
              {typeMeta.hasOptions && (
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                      <DollarSign className="h-3.5 w-3.5 text-orange-400" />
                      選項清單與對應加總金額（設為 0 則不計費）
                    </span>
                    <button
                      type="button"
                      onClick={() => addOption(idx)}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-slate-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新增選項
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(field.options || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => updateOption(idx, optIdx, { label: e.target.value })}
                          placeholder="選項名稱（例如：全馬 42K）"
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400">NT$</span>
                          <input
                            type="number"
                            min={0}
                            value={opt.price || 0}
                            onChange={(e) =>
                              updateOption(idx, optIdx, { price: Number(e.target.value || 0) })
                            }
                            className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-orange-300 focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOption(idx, optIdx)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-950 hover:text-rose-400"
                          title="刪除此選項"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部新增欄位與載入預設列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newFieldType}
            onChange={(e) => setNewFieldType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addField}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400 transition"
          >
            <Plus className="h-4 w-4" />
            新增表單欄位
          </button>
        </div>

        {onLoadDefaultFields && (
          <button
            type="button"
            onClick={onLoadDefaultFields}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            套用路跑標準預設欄位
          </button>
        )}
      </div>
    </div>
  );
}
