/**
 * 台灣身分證字號 / 居留證 / 外籍護照驗證與動態表單資料防呆計算
 */

const TW_ID_LETTERS = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34,
  J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25,
  S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

function isValidTaiwanId(raw) {
  const value = String(raw || '').trim().toUpperCase();
  // 本國身分證 (A123456789) 或新式外來人口居留證 (A8/A9...)
  if (!/^[A-Z][1289]\d{8}$/.test(value)) return false;

  const code = TW_ID_LETTERS[value[0]];
  if (!code) return false;

  const n1 = Math.floor(code / 10);
  const n2 = code % 10;
  const digits = value.slice(1).split('').map(Number);
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  const nums = [n1, n2, ...digits];
  const sum = nums.reduce((acc, num, idx) => acc + num * weights[idx], 0);
  return sum % 10 === 0;
}

function isValidTaiwanIdOrPassport(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return { valid: false, message: '請填寫身分證字號或護照號碼' };

  // 若符合「1 碼英文 + 9 碼數字」格式，視為台灣身分證並嚴格檢查檢核碼
  if (/^[A-Z]\d{9}$/.test(value)) {
    if (isValidTaiwanId(value)) {
      return { valid: true };
    }
    return {
      valid: false,
      message: '台灣身分證字號格式或檢核碼不正確，請重新確認',
    };
  }

  // 外籍護照號碼：6~15 碼英數字（至少包含一個數字）
  if (/^[A-Z0-9-]{6,15}$/.test(value) && /\d/.test(value)) {
    return { valid: true };
  }

  return {
    valid: false,
    message: '請輸入正確的台灣身分證字號（10碼）或外籍護照號碼（6~15碼英數字）',
  };
}

const MIN_REGISTRATION_AGE = 10;
const MAX_REGISTRATION_AGE = 80;

function isValidEmail(raw) {
  const value = String(raw || '').trim();
  if (/\s/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isValidPhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  // 連絡電話統一為台灣手機 10 碼（09 開頭共 10 碼純數字）
  return /^09\d{8}$/.test(digits);
}

function calculateAge(birthDateStr, referenceDate = new Date()) {
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

function validateBirthDateAge(raw, minAge = MIN_REGISTRATION_AGE, maxAge = MAX_REGISTRATION_AGE) {
  const age = calculateAge(raw);
  if (age === null) {
    return { valid: false, message: '請選擇有效的出生年月日' };
  }
  if (age < minAge || age > maxAge) {
    return {
      valid: false,
      message: `年齡限 ${minAge}～${maxAge} 歲（目前實歲 ${age} 歲，請確認是否輸入有誤）`,
    };
  }
  return { valid: true, age };
}

function isValidRemittanceLast5(raw) {
  const value = String(raw || '').trim();
  return /^\d{5}$/.test(value);
}

/**
 * 依據活動的動態欄位設定，驗證前台填寫資料並計算應繳總金額
 */
function validateAndCalculateRegistration(fields, rawAnswers) {
  const errors = {};
  const cleanAnswers = {};
  const priceBreakdown = [];
  let totalAmount = 0;

  for (const field of fields) {
    // 計算欄位本身不需使用者輸入
    if (field.type === 'calculated') continue;

    const rawVal = rawAnswers ? rawAnswers[field.id] : undefined;

    if (field.type === 'checkbox') {
      const selectedValues = Array.isArray(rawVal)
        ? rawVal.map((v) => String(v).trim()).filter(Boolean)
        : [];

      if (field.required && selectedValues.length === 0) {
        errors[field.id] = `請至少選擇一項「${field.label}」`;
        continue;
      }

      const validOptionMap = new Map(
        (field.options || []).map((opt) => [String(opt.value), opt])
      );

      const cleanSelected = [];
      for (const val of selectedValues) {
        const opt = validOptionMap.get(val);
        if (!opt && validOptionMap.size > 0) {
          errors[field.id] = `「${field.label}」包含無效的選項：${val}`;
          continue;
        }
        cleanSelected.push(val);
        const price = Number(opt?.price || 0);
        if (price > 0) {
          totalAmount += price;
          priceBreakdown.push({
            fieldId: field.id,
            fieldLabel: field.label,
            itemLabel: opt.label || val,
            amount: price,
          });
        }
      }
      cleanAnswers[field.id] = cleanSelected;
      continue;
    }

    const strVal = rawVal === undefined || rawVal === null ? '' : String(rawVal).trim();

    if (field.required && !strVal) {
      errors[field.id] = `「${field.label}」為必填欄位`;
      continue;
    }

    if (!strVal) {
      cleanAnswers[field.id] = '';
      continue;
    }

    // 格式驗證
    if (field.type === 'email' || field.validation === 'email') {
      if (!isValidEmail(strVal)) {
        errors[field.id] = '請輸入正確的電子信箱格式（例如 runner@example.com）';
        continue;
      }
    }

    if (field.type === 'tel' || field.validation === 'phone') {
      if (!isValidPhone(strVal)) {
        errors[field.id] = '連絡電話統一為台灣手機 10 碼（09 開頭共 10 碼，例如 0912345678）';
        continue;
      }
    }

    if (
      field.id === 'birth_date' ||
      field.validation === 'age_10_80' ||
      field.validation === 'min_age_16' ||
      (field.type === 'date' && String(field.label || '').includes('出生'))
    ) {
      const ageCheck = validateBirthDateAge(strVal, MIN_REGISTRATION_AGE, MAX_REGISTRATION_AGE);
      if (!ageCheck.valid) {
        errors[field.id] = ageCheck.message;
        continue;
      }
    }

    if (field.id === 'remittance_last5' || field.validation === 'remittance_last5') {
      if (!isValidRemittanceLast5(strVal)) {
        errors[field.id] = '匯款帳號尾五碼需為 5 位純數字（例如 12345）';
        continue;
      }
    }

    if (field.type === 'tw_id' || field.validation === 'tw_id_or_passport') {
      const check = isValidTaiwanIdOrPassport(strVal);
      if (!check.valid) {
        errors[field.id] = check.message;
        continue;
      }
      cleanAnswers[field.id] = strVal.toUpperCase();
    } else if (field.type === 'number') {
      const num = Number(strVal);
      if (Number.isNaN(num)) {
        errors[field.id] = `「${field.label}」必須為數字`;
        continue;
      }
      if (num < 0) {
        errors[field.id] = `「${field.label}」不可為負數`;
        continue;
      }
      cleanAnswers[field.id] = num;
      const unitPrice = Number(field.unitPrice || 0);
      if (unitPrice > 0 && num > 0) {
        const subtotal = Math.round(num * unitPrice);
        totalAmount += subtotal;
        priceBreakdown.push({
          fieldId: field.id,
          fieldLabel: field.label,
          itemLabel: `${num} × NT$${unitPrice.toLocaleString()}`,
          amount: subtotal,
        });
      }
      continue;
    } else if (field.type === 'select' || field.type === 'radio') {
      const opt = (field.options || []).find((o) => String(o.value) === strVal);
      if (!opt && (field.options || []).length > 0) {
        errors[field.id] = `「${field.label}」所選項目無效`;
        continue;
      }
      cleanAnswers[field.id] = strVal;
      const price = Number(opt?.price || 0);
      if (price > 0) {
        totalAmount += price;
        priceBreakdown.push({
          fieldId: field.id,
          fieldLabel: field.label,
          itemLabel: opt.label || strVal,
          amount: price,
        });
      }
      continue;
    } else {
      cleanAnswers[field.id] = strVal;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    cleanAnswers,
    priceBreakdown,
    totalAmount,
  };
}

/**
 * 協助從動態欄位回答中擷取常用核心資訊（姓名、證號、Email、電話）便於後台檢索
 */
function extractRunnerSummary(fields, cleanAnswers) {
  const findByKeys = (ids, labelKeywords) => {
    for (const id of ids) {
      if (cleanAnswers[id]) return String(cleanAnswers[id]);
    }
    const matchedField = fields.find((f) =>
      labelKeywords.some((kw) => String(f.label || '').includes(kw))
    );
    if (matchedField && cleanAnswers[matchedField.id]) {
      return String(cleanAnswers[matchedField.id]);
    }
    return '';
  };

  return {
    runnerName: findByKeys(['full_name', 'name'], ['姓名']),
    runnerIdNumber: findByKeys(['id_number', 'tw_id'], ['身份證', '身分證', '護照']),
    runnerEmail: findByKeys(['email'], ['信箱', 'Email', 'email']),
    runnerPhone: findByKeys(['phone', 'mobile'], ['連絡電話', '聯絡電話', '手機', '電話']),
    remittanceLast5: findByKeys(['remittance_last5'], ['尾五碼', '後五碼', '匯款帳號']),
  };
}

module.exports = {
  isValidTaiwanId,
  isValidTaiwanIdOrPassport,
  isValidEmail,
  isValidPhone,
  isValidRemittanceLast5,
  validateAndCalculateRegistration,
  extractRunnerSummary,
};
