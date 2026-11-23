const TW_ID_LETTERS = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34,
  J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25,
  S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

export const MIN_REGISTRATION_AGE = 10;
export const MAX_REGISTRATION_AGE = 80;

export function validateTaiwanIdOrPassport(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '請填寫身份證字號或護照號碼';

  if (/^[A-Z]\d{9}$/.test(value)) {
    if (!/^[A-Z][1289]\d{8}$/.test(value)) {
      return '台灣身份證字號第 2 碼須為 1、2、8 或 9，請重新確認';
    }
    const code = TW_ID_LETTERS[value[0]];
    const nums = [Math.floor(code / 10), code % 10, ...value.slice(1).split('').map(Number)];
    const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
    const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
    if (sum % 10 !== 0) {
      return '台灣身份證字號檢核碼錯誤，請檢查是否輸入有誤';
    }
    return '';
  }

  // 外籍護照號碼：6~15 碼英數字（含至少一個數字，且不可為不完整的台灣身分證開頭純 1 英文+數字非 9 碼）
  if (/^[A-Z]\d{1,8}$/.test(value)) {
    return `台灣身份證字號須為 1 碼英文 + 9 碼數字（目前共 ${value.length} 碼）；外籍護照請輸入完整護照號碼`;
  }

  if (/^[A-Z0-9-]{6,15}$/.test(value) && /\d/.test(value)) {
    return '';
  }
  return '請輸入正確的台灣身份證字號（10 碼，例：A123456789）或外籍護照號碼（6~15 碼英數字）';
}

export function calculateAge(birthDateStr, referenceDate = new Date()) {
  const s = String(birthDateStr || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dob = new Date(year, month - 1, day);
  if (
    Number.isNaN(dob.getTime()) ||
    dob.getFullYear() !== year ||
    dob.getMonth() !== month - 1 ||
    dob.getDate() !== day
  ) {
    return null;
  }
  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < day)) {
    age -= 1;
  }
  return age;
}

export function validateBirthDateAge(raw, minAge = MIN_REGISTRATION_AGE, maxAge = MAX_REGISTRATION_AGE) {
  const age = calculateAge(raw);
  if (age === null) {
    return '請選擇有效的出生年月日';
  }
  if (age < minAge || age > maxAge) {
    return `年齡限 ${minAge}～${maxAge} 歲（目前實歲 ${age} 歲，請確認是否輸入有誤）`;
  }
  return '';
}

export function validateEmail(raw) {
  const val = String(raw || '').trim();
  if (/\s/.test(val)) {
    return '電子信箱不可包含空白字元';
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)
    ? ''
    : '請輸入正確的電子信箱格式（例如 runner@example.com）';
}

export function validatePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  if (!/^\d+$/.test(digits)) {
    return '連絡電話統一為手機 10 碼數字（例：0912345678），請勿輸入英文字母或符號';
  }
  if (!digits.startsWith('09')) {
    return '連絡電話統一為台灣手機號碼（須為 09 開頭共 10 碼，例：0912345678）';
  }
  if (digits.length !== 10) {
    return `連絡電話須為手機 10 碼（目前輸入 ${digits.length} 碼，例：0912345678）`;
  }
  return '';
}

export function validateRemittanceLast5(raw) {
  const val = String(raw || '').trim();
  if (!/^\d+$/.test(val)) {
    return '匯款帳號尾五碼僅限輸入數字（共 5 碼）';
  }
  if (val.length !== 5) {
    return `匯款帳號尾五碼須為 5 位數字（目前輸入 ${val.length} 碼）`;
  }
  return '';
}

export function isBirthDateField(field) {
  return (
    field?.id === 'birth_date' ||
    field?.validation === 'age_10_80' ||
    field?.validation === 'min_age_16' ||
    (field?.type === 'date' && String(field?.label || '').includes('出生'))
  );
}

/**
 * 單一欄位即時檢核（輸入當下呼叫，isSubmit=false 時空值不報必填錯誤，只檢核已輸入格式）
 */
export function validateSingleField(field, val, { checkRequired = false } = {}) {
  if (!field || field.type === 'calculated') return '';

  if (field.type === 'checkbox') {
    const arr = Array.isArray(val) ? val : [];
    if (checkRequired && field.required && arr.length === 0) {
      return `請至少選擇一項「${field.label}」`;
    }
    return '';
  }

  const strVal = val === undefined || val === null ? '' : String(val).trim();
  if (!strVal) {
    return checkRequired && field.required ? `請填寫「${field.label}」` : '';
  }

  if (field.type === 'tw_id' || field.validation === 'tw_id_or_passport') {
    return validateTaiwanIdOrPassport(strVal);
  }
  if (isBirthDateField(field)) {
    return validateBirthDateAge(strVal, MIN_REGISTRATION_AGE, MAX_REGISTRATION_AGE);
  }
  if (field.type === 'tel' || field.validation === 'phone') {
    return validatePhone(strVal);
  }
  if (field.type === 'email' || field.validation === 'email') {
    return validateEmail(strVal);
  }
  if (field.id === 'remittance_last5' || field.validation === 'remittance_last5') {
    return validateRemittanceLast5(strVal);
  }
  if (field.type === 'number') {
    const num = Number(strVal);
    if (Number.isNaN(num) || num < 0) {
      return `「${field.label}」須為有效正整數或 0`;
    }
  }
  return '';
}

/**
 * 回傳即時驗證通過時的友善綠字訊息（僅針對有格式驗證的欄位）
 */
export function getFieldValidBadge(field, val, error) {
  if (error || !field) return '';
  const strVal = val === undefined || val === null ? '' : String(val).trim();
  if (!strVal) return '';

  if (field.type === 'tw_id' || field.validation === 'tw_id_or_passport') {
    return /^[A-Z]\d{9}$/.test(strVal.toUpperCase()) ? '身分證通過' : '護照通過';
  }
  if (isBirthDateField(field)) {
    const age = calculateAge(strVal);
    return age !== null ? `實歲 ${age} 歲（符合 10～80 歲）` : '';
  }
  if (field.type === 'tel' || field.validation === 'phone') {
    return '手機格式正確';
  }
  if (field.type === 'email' || field.validation === 'email') {
    return 'Email 格式正確';
  }
  if (field.id === 'remittance_last5' || field.validation === 'remittance_last5') {
    return '尾五碼正確';
  }
  return '';
}

/**
 * 即時計算費用明細與應繳總金額
 */
export function calculatePricing(fields, answers) {
  const breakdown = [];
  let total = 0;

  for (const field of fields || []) {
    if (field.type === 'calculated') continue;
    const val = answers?.[field.id];

    if (field.type === 'select' || field.type === 'radio') {
      const opt = (field.options || []).find((o) => String(o.value) === String(val));
      const price = Number(opt?.price || 0);
      if (opt && price > 0) {
        total += price;
        breakdown.push({
          fieldLabel: field.label,
          itemLabel: opt.label || opt.value,
          amount: price,
        });
      }
    } else if (field.type === 'checkbox') {
      const selected = Array.isArray(val) ? val : [];
      for (const s of selected) {
        const opt = (field.options || []).find((o) => String(o.value) === String(s));
        const price = Number(opt?.price || 0);
        if (opt && price > 0) {
          total += price;
          breakdown.push({
            fieldLabel: field.label,
            itemLabel: opt.label || opt.value,
            amount: price,
          });
        }
      }
    } else if (field.type === 'number') {
      const num = Number(val || 0);
      const unitPrice = Number(field.unitPrice || 0);
      if (!Number.isNaN(num) && num > 0 && unitPrice > 0) {
        const subtotal = Math.round(num * unitPrice);
        total += subtotal;
        breakdown.push({
          fieldLabel: field.label,
          itemLabel: `${num} × NT$${unitPrice.toLocaleString()}`,
          amount: subtotal,
        });
      }
    }
  }

  return { total, breakdown };
}

/**
 * 前端送出前全欄位防呆檢查
 */
export function validateAllFields(fields, answers) {
  const errors = {};
  for (const field of fields || []) {
    const msg = validateSingleField(field, answers?.[field.id], { checkRequired: true });
    if (msg) errors[field.id] = msg;
  }
  return errors;
}
