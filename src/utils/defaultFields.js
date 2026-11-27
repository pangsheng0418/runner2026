export const FIELD_TYPES = [
  { value: 'text', label: '單行文字 (Text)', hasOptions: false, hasUnitPrice: false },
  { value: 'textarea', label: '多行文字 (Textarea)', hasOptions: false, hasUnitPrice: false },
  { value: 'number', label: '數字 / 數量計價 (Number)', hasOptions: false, hasUnitPrice: true },
  { value: 'date', label: '日期選擇器 (Date)', hasOptions: false, hasUnitPrice: false },
  { value: 'tel', label: '電話號碼 (Tel)', hasOptions: false, hasUnitPrice: false },
  { value: 'email', label: '電子信箱 (Email)', hasOptions: false, hasUnitPrice: false },
  { value: 'tw_id', label: '身份證字號驗證 (ID)', hasOptions: false, hasUnitPrice: false },
  { value: 'select', label: '下拉選單 (Select・可計價)', hasOptions: true, hasUnitPrice: false },
  { value: 'radio', label: '單選按鈕 (Radio・可計價)', hasOptions: true, hasUnitPrice: false },
  { value: 'checkbox', label: '多選核取方塊 (Checkbox・可計價)', hasOptions: true, hasUnitPrice: false },
  { value: 'calculated', label: '自動加總金額顯示區塊 (Calculated)', hasOptions: false, hasUnitPrice: false },
];

export function createBlankField(type = 'text') {
  const id = `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const meta = FIELD_TYPES.find((t) => t.value === type) || FIELD_TYPES[0];

  return {
    id,
    label: type === 'calculated' ? '應繳總金額（自動試算）' : '新欄位名稱',
    type,
    required: type === 'calculated' ? false : false,
    placeholder: '',
    helperText: type === 'calculated' ? '系統將依據上方選擇的組別與加購項目自動加總金額' : '',
    options: meta.hasOptions
      ? [
          { label: '選項一', value: '選項一', price: 0 },
          { label: '選項二', value: '選項二', price: 0 },
        ]
      : [],
    unitPrice: 0,
    validation: type === 'tw_id' ? 'tw_id_or_passport' : type === 'email' ? 'email' : type === 'tel' ? 'phone' : 'none',
  };
}
