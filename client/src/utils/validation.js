const TW_ID_LETTERS = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34,
  J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25,
  S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

export function validateTaiwanIdOrPassport(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '請填寫身分證字號或護照號碼';

  if (/^[A-Z]\d{9}$/.test(value)) {
    if (!/^[A-Z][1289]\d{8}$/.test(value)) {
      return '台灣身分證字號格式不正確，請重新確認';
    }
    const code = TW_ID_LETTERS[value[0]];
    const nums = [Math.floor(code / 10), code % 10, ...value.slice(1).split('').map(Number)];
    const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
    const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
    if (sum % 10 !== 0) {
      return '台灣身分證字號檢核碼錯誤，請檢查是否輸入有誤';
    }
    return '';
  }

  if (/^[A-Z0-9-]{6,15}$/.test(value) && /\d/.test(value)) {
    return '';
  }
  return '請輸入正確的台灣身分證字號（10碼）或外籍護照號碼（6~15碼英數字）';
}

export function validateEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || '').trim())
    ? ''
    : '請輸入正確的電子信箱格式';
}

export function validatePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  return /^\+?\d{8,15}$/.test(digits)
    ? ''
    : '請輸入正確的聯絡電話（例如 0912-345678）';
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
    if (field.type === 'calculated') continue;
    const val = answers?.[field.id];

    if (field.type === 'checkbox') {
      const arr = Array.isArray(val) ? val : [];
      if (field.required && arr.length === 0) {
        errors[field.id] = `請至少選擇一項「${field.label}」`;
      }
      continue;
    }

    const strVal = val === undefined || val === null ? '' : String(val).trim();
    if (field.required && !strVal) {
      errors[field.id] = `請填寫「${field.label}」`;
      continue;
    }
    if (!strVal) continue;

    if (field.type === 'email' || field.validation === 'email') {
      const msg = validateEmail(strVal);
      if (msg) errors[field.id] = msg;
    } else if (field.type === 'tel' || field.validation === 'phone') {
      const msg = validatePhone(strVal);
      if (msg) errors[field.id] = msg;
    } else if (field.type === 'tw_id' || field.validation === 'tw_id_or_passport') {
      const msg = validateTaiwanIdOrPassport(strVal);
      if (msg) errors[field.id] = msg;
    } else if (field.type === 'number') {
      const num = Number(strVal);
      if (Number.isNaN(num) || num < 0) {
        errors[field.id] = `「${field.label}」須為有效正整數或 0`;
      }
    }
  }

  return errors;
}
