/**
 * 統一計算活動報名狀態（三大類：open 開放中 / preparing 籌備中 / closed 已結報）
 *
 * event.event_status 可為：
 * - 'auto'      ：自動依報名起始/截止日期與人數上限判斷（預設）
 * - 'preparing' ：強制設為「籌備中」
 * - 'open'      ：強制設為「開放中」（若人數已達上限仍自動轉為「已結報」）
 * - 'closed'    ：強制設為「已結報」
 */

function parseLocalDateTime(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // 若為 YYYY-MM-DDTHH:mm（無時區），在伺服器環境（含 UTC 的 Vercel）統一視為台灣時間 +08:00
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const normalized = s.replace(' ', 'T');
    const withSec = normalized.length === 16 ? `${normalized}:00` : normalized;
    const d = new Date(`${withSec}+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatReadableDateTime(val) {
  if (!val) return '';
  return String(val).trim().replace('T', ' ').slice(0, 16);
}

function computeEventRegistrationState(event, currentCount = 0) {
  const now = new Date();
  const start = parseLocalDateTime(event.reg_start_at);
  const end = parseLocalDateTime(event.reg_end_at);
  const max = Number(event.max_participants || 0);
  const manualStatus = String(event.event_status || 'auto').trim().toLowerCase();

  // 1. 強制設為「籌備中」
  if (manualStatus === 'preparing') {
    const startText = formatReadableDateTime(event.reg_start_at);
    return {
      canRegister: false,
      status: 'preparing',
      label: '籌備中',
      subLabel: startText ? `預計 ${startText} 開放` : '活動籌備中',
      reason: startText
        ? `本活動目前籌備中，預計於 ${startText} 開放線上報名，敬請期待！`
        : '本活動目前籌備中，報名開放時間將另行公告，敬請期待！',
    };
  }

  // 2. 強制設為「已結案」或未啟用
  if (manualStatus === 'closed' || !event.is_active) {
    return {
      canRegister: false,
      status: 'closed',
      label: '已結案',
      subLabel: '報名已結束',
      reason: '本活動已結案，感謝各位跑者的熱情參與與關注！',
    };
  }

  // 3. 強制設為「開放中」（僅檢查名額上限）
  if (manualStatus === 'open') {
    if (max > 0 && currentCount >= max) {
      return {
        canRegister: false,
        status: 'closed',
        label: '已結案',
        subLabel: '名額已額滿',
        reason: '本活動名額已全數額滿結案！歡迎關注其他開放中賽事。',
      };
    }
    return {
      canRegister: true,
      status: 'open',
      label: '開放中',
      subLabel: '現正熱烈報名中',
      reason: '',
    };
  }

  // 4. 自動模式（auto）：依報名起始日期、截止日期與人數上限判斷
  if (start && now < start) {
    const startText = formatReadableDateTime(event.reg_start_at);
    return {
      canRegister: false,
      status: 'preparing',
      label: '籌備中',
      subLabel: `${startText} 開放報名`,
      reason: `本活動目前籌備中，將於 ${startText} 正式開放線上報名！`,
    };
  }

  if (end && now > end) {
    return {
      canRegister: false,
      status: 'closed',
      label: '已結案',
      subLabel: '報名時間已截止',
      reason: '本活動線上報名時間已截止結案，感謝您的關注！',
    };
  }

  if (max > 0 && currentCount >= max) {
    return {
      canRegister: false,
      status: 'closed',
      label: '已結案',
      subLabel: '名額已額滿',
      reason: '本活動名額已全數額滿結案！歡迎關注後續賽事。',
    };
  }

  return {
    canRegister: true,
    status: 'open',
    label: '開放中',
    subLabel: '現正熱烈報名中',
    reason: '',
  };
}

module.exports = {
  parseLocalDateTime,
  formatReadableDateTime,
  computeEventRegistrationState,
};
