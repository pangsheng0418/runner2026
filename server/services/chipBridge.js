const crypto = require('crypto');

/**
 * 身分證字號 / 護照號碼隱碼（與 TUR 晶片系統一致，例：A123456789 -> A123****89）
 */
function maskIdNumber(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.length <= 4) return s[0] + '*'.repeat(Math.max(0, s.length - 1));
  if (s.length <= 7) return s.slice(0, 2) + '***' + s.slice(-2);
  return s.slice(0, 4) + '****' + s.slice(-2);
}

/**
 * 產生身分證字號 SHA-256 雜湊（與 TUR 晶片系統 idHash 相容）
 */
function hashIdNumber(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * 將性別正規化為 TUR 晶片系統使用的 M / F（若未填則由台灣身分證第 2 碼推算）
 */
function normalizeGender(rawGender, idNumber = '') {
  const g = String(rawGender || '').trim().toUpperCase();
  if (['M', 'MALE', '男', '男性', '1'].includes(g)) return 'M';
  if (['F', 'FEMALE', '女', '女性', '2'].includes(g)) return 'F';
  const id = String(idNumber || '').trim().toUpperCase();
  if (/^[A-Z][18]\d{8}$/.test(id)) return 'M';
  if (/^[A-Z][29]\d{8}$/.test(id)) return 'F';
  return '';
}

/**
 * 從動態欄位設定與回答中解析報名組別的晶片分組代碼與配號前綴
 */
function resolveCategoryMeta(fields, answers) {
  const catField =
    (fields || []).find((f) => f.id === 'race_category') ||
    (fields || []).find((f) => String(f.label || '').includes('報名組別') || String(f.label || '').includes('組別'));

  if (!catField) {
    return { categoryLabel: '', categoryCode: '', bibPrefix: 'R' };
  }

  const selectedVal = String(answers?.[catField.id] || '').trim();
  const matchedOpt = (catField.options || []).find(
    (opt) => String(opt.value) === selectedVal || String(opt.label) === selectedVal
  );

  // 優先使用選項設定的晶片代碼 (code)，否則由文字自動萃取（如 "全馬 42K" -> "42K"）
  let categoryCode = String(matchedOpt?.code || '').trim();
  if (!categoryCode && selectedVal) {
    const m = selectedVal.match(/(\d+(?:\.\d+)?\s*[KkHh]|100K|50K|42K|21K|10K|5K|\d+小時|\d+H)/i);
    categoryCode = m ? m[1].replace(/\s+/g, '').toUpperCase() : selectedVal;
  }

  let bibPrefix = String(matchedOpt?.bibPrefix || '').trim().toUpperCase();
  if (!bibPrefix && matchedOpt) {
    const idx = (catField.options || []).indexOf(matchedOpt);
    bibPrefix = idx >= 0 && idx < 26 ? String.fromCharCode(65 + idx) : 'R';
  }

  return {
    categoryLabel: selectedVal,
    categoryCode: categoryCode || selectedVal,
    bibPrefix: bibPrefix || 'R',
  };
}

/**
 * 將單筆報名資料轉換為 100% 相容 TUR 晶片計時系統 (runchip-timing) 的標準格式
 */
function toChipTimingRegistration(event, fields, reg) {
  const answers =
    typeof reg.answers_json === 'string'
      ? JSON.parse(reg.answers_json || '{}')
      : reg.answers || {};

  const idNumber = String(reg.runner_id_number || answers.id_number || '').trim().toUpperCase();
  const fullName = String(reg.runner_name || answers.full_name || '').trim();
  const lastName = String(answers.last_name || '').trim();
  const firstName = String(answers.first_name || '').trim();
  const gender = normalizeGender(answers.gender, idNumber);
  const dob = String(answers.birth_date || answers.dob || '').trim();
  const city = String(answers.city || '').trim();
  const country = String(answers.country || 'TPE').trim().toUpperCase() || 'TPE';
  const catMeta = resolveCategoryMeta(fields, answers);
  const categoryId = String(reg.category_code || catMeta.categoryCode || '').trim();
  const bib = String(reg.bib_number || '').trim();
  const timingEventId = String(event.timing_event_id || event.slug).trim();

  return {
    regId: `${timingEventId}__${idNumber || bib || reg.reg_code}`,
    eventId: timingEventId,
    regCode: reg.reg_code,
    bib,
    name: fullName,
    lastName,
    firstName,
    idNumber,
    idMasked: maskIdNumber(idNumber),
    idHash: hashIdNumber(idNumber),
    categoryId,
    categoryLabel: catMeta.categoryLabel,
    gender,
    dob,
    city,
    country,
    paymentStatus: reg.payment_status || '待繳費',
    totalAmount: Number(reg.total_amount || 0),
    penaltySec: 0,
    updatedAt: reg.created_at,
  };
}

/**
 * 產生 100% 符合 TUR 晶片計時系統匯入格式 (importRegistrationsRows) 的 CSV
 * 標頭：參賽編號,姓名,身份證字號,分組代碼,性別,出生年月日,縣市,國家,姓氏,名字
 */
function buildChipImportCsv(event, fields, registrations) {
  const headers = [
    '參賽編號',
    '姓名',
    '身份證字號',
    '分組代碼',
    '性別',
    '出生年月日',
    '縣市',
    '國家',
    '姓氏',
    '名字',
  ];

  const escapeCsv = (val) => {
    const str = val === undefined || val === null ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const reg of registrations) {
    const item = toChipTimingRegistration(event, fields, reg);
    const row = [
      item.bib || item.regCode,
      item.name,
      item.idNumber,
      item.categoryId,
      item.gender,
      item.dob,
      item.city,
      item.country,
      item.lastName,
      item.firstName,
    ];
    lines.push(row.map(escapeCsv).join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 依報名組別前綴自動分配參賽編號（Bib），例如 A001, A002, B001...
 */
function autoAssignBibNumbers(db, event, fields, { paidOnly = false, overwrite = false } = {}) {
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC')
    .all(event.id);

  // 統計各前綴目前已使用的最大序號
  const prefixMax = new Map();
  if (!overwrite) {
    for (const r of rows) {
      const existingBib = String(r.bib_number || '').trim().toUpperCase();
      const m = existingBib.match(/^([A-Z]+)(\d+)$/);
      if (m) {
        const prev = prefixMax.get(m[1]) || 0;
        prefixMax.set(m[1], Math.max(prev, Number(m[2])));
      }
    }
  }

  const updateStmt = db.prepare(
    'UPDATE registrations SET bib_number = ?, category_code = ? WHERE id = ?'
  );

  let assignedCount = 0;
  for (const r of rows) {
    if (paidOnly && r.payment_status !== '已繳費') continue;
    const answers = JSON.parse(r.answers_json || '{}');
    const catMeta = resolveCategoryMeta(fields, answers);

    if (!overwrite && String(r.bib_number || '').trim()) {
      // 若已有號碼布但缺 category_code，順手補齊
      if (!r.category_code && catMeta.categoryCode) {
        updateStmt.run(r.bib_number, catMeta.categoryCode, r.id);
      }
      continue;
    }

    const prefix = catMeta.bibPrefix || 'R';
    const nextNum = (prefixMax.get(prefix) || 0) + 1;
    prefixMax.set(prefix, nextNum);
    const bib = `${prefix}${String(nextNum).padStart(3, '0')}`;

    updateStmt.run(bib, catMeta.categoryCode || '', r.id);
    assignedCount += 1;
  }

  return { assignedCount };
}

/**
 * 透過晶片系統的 GAS 同步網址（upsertRegistrations）單向推送已確認名單（雙系統獨立資料庫架構）
 */
async function pushRosterToChipSystem(event, fields, registrations, { gasUrl, username, password }) {
  const targetUrl = String(gasUrl || event.timing_gas_url || '').trim();
  if (!targetUrl) {
    throw new Error('請先填入 TUR 晶片計時系統的 GAS 雲端同步網址。');
  }
  if (!username || !password) {
    throw new Error('請輸入 TUR 晶片計時系統的管理員帳號與密碼以進行授權驗證。');
  }

  const records = registrations
    .map((r) => toChipTimingRegistration(event, fields, r))
    .filter((item) => item.bib && item.name);

  if (records.length === 0) {
    throw new Error('沒有可推送的選手名單（請先執行「一鍵自動配號」確保每位選手皆有參賽編號）。');
  }

  const payload = {
    action: 'upsertRegistrations',
    auth: {
      mode: 'admin',
      username: String(username).trim(),
      password: String(password),
    },
    registrations: records.map((r) => ({
      regId: r.regId,
      eventId: r.eventId,
      bib: r.bib,
      name: r.name,
      lastName: r.lastName,
      firstName: r.firstName,
      gender: r.gender,
      dob: r.dob,
      city: r.city,
      country: r.country,
      idNumber: r.idNumber,
      idMasked: r.idMasked,
      idHash: r.idHash,
      categoryId: r.categoryId,
      penaltySec: 0,
      updatedAt: new Date().toISOString(),
    })),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`晶片系統回傳非 JSON 格式（HTTP ${res.status}），請確認 GAS 網址正確。`);
    }
    if (!res.ok || data.ok === false || data.error) {
      throw new Error(data.error || data.message || `推送失敗（HTTP ${res.status}）`);
    }
    return {
      pushedCount: records.length,
      remoteResponse: data,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('連線至 TUR 晶片系統逾時（20 秒），請稍後重試。');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  maskIdNumber,
  hashIdNumber,
  normalizeGender,
  resolveCategoryMeta,
  toChipTimingRegistration,
  buildChipImportCsv,
  autoAssignBibNumbers,
  pushRosterToChipSystem,
};
