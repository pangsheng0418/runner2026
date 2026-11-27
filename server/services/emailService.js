const { stripWrappingQuotes, callGasWebhook } = require('./googleSheets');
const { maskIdNumber } = require('./chipBridge');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEmailProviderConfig() {
  const resendApiKey = stripWrappingQuotes(process.env.RESEND_API_KEY);
  const mailFrom = stripWrappingQuotes(process.env.MAIL_FROM) || 'TUR 活動報名平台 <onboarding@resend.dev>';
  const gasMailUrl = stripWrappingQuotes(process.env.EMAIL_GAS_URL || process.env.GOOGLE_MASTER_GAS_URL);

  if (resendApiKey) {
    return { configured: true, provider: 'resend', resendApiKey, mailFrom };
  }
  if (gasMailUrl) {
    return { configured: true, provider: 'gas', gasMailUrl, mailFrom };
  }
  return { configured: false, provider: 'none' };
}

function buildLookupUrl(siteOrigin, eventSlug, regCode) {
  const origin = stripWrappingQuotes(siteOrigin || process.env.PUBLIC_SITE_URL || '');
  if (!origin) return '';
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/register/${encodeURIComponent(eventSlug)}?mode=lookup&regCode=${encodeURIComponent(regCode)}`;
}

/**
 * 產生報名確認 / 改報更新 / 繳費對帳狀態通知信內容（HTML + 純文字）
 */
function buildRegistrationEmailContent({
  type = 'created', // 'created' | 'updated' | 'payment_updated'
  event,
  registration,
  answers = {},
  priceBreakdown = [],
  siteOrigin = '',
}) {
  const regCode = registration.reg_code || '';
  const runnerName = registration.runner_name || answers.full_name || '跑者';
  const totalAmount = Number(registration.total_amount || 0);
  const paymentStatus = registration.payment_status || '待繳費';
  const remittanceLast5 = registration.remittance_last5 || answers.remittance_last5 || '';
  const regTypeLabel = registration.reg_type === 'group' ? '團體報名' : '個人報名';
  const groupName = registration.group_name || '';
  const groupCode = registration.group_code || '';
  const paymentModeLabel = registration.payment_mode === 'group' ? '團體匯款' : '個別匯款';
  const bibNumber = registration.bib_number || '';
  const idMasked = maskIdNumber(registration.runner_id_number || answers.id_number || '');
  const lookupUrl = buildLookupUrl(siteOrigin, event.slug, regCode);

  const subjectPrefix =
    type === 'updated'
      ? '【報名資料更新確認】'
      : type === 'payment_updated'
      ? `【繳費狀態更新：${paymentStatus}】`
      : '【報名成功確認信】';

  const subject = `${subjectPrefix}${event.name}（序號：${regCode}）`;

  const headline =
    type === 'updated'
      ? '您的報名資料已更新完成！'
      : type === 'payment_updated'
      ? `您的報名繳費狀態已更新為「${paymentStatus}」`
      : '恭喜完成線上報名！我們賽道上見！';

  const statusColor =
    paymentStatus === '已繳費' ? '#10b981' : paymentStatus === '已取消' ? '#f43f5e' : '#f59e0b';

  const breakdownHtml =
    Array.isArray(priceBreakdown) && priceBreakdown.length > 0
      ? priceBreakdown
          .map(
            (item) =>
              `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(item.fieldLabel)}：<strong>${escapeHtml(item.itemLabel)}</strong></td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#0f172a;">NT$ ${Number(item.amount || 0).toLocaleString()}</td>
              </tr>`
          )
          .join('')
      : '';

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:'Noto Sans TC','Microsoft JhengHei',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cbd5e1;">
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;border-bottom:4px solid #84cc16;">
      <p style="margin:0;font-size:12px;color:#a3e635;font-weight:bold;letter-spacing:1px;">TUR 路跑活動線上報名平台</p>
      <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.3;">${escapeHtml(headline)}</h1>
      <p style="margin:0;font-size:14px;color:#cbd5e1;">${escapeHtml(event.name)}</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;font-size:15px;">親愛的 <strong>${escapeHtml(runnerName)}</strong> 您好，以下是您的最新個人報名狀況：</p>

      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;width:36%;">專屬報名序號</td>
          <td style="padding:10px 14px;font-size:16px;font-weight:900;color:#0284c7;">${escapeHtml(regCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">目前繳費狀態</td>
          <td style="padding:10px 14px;border-top:1px solid #e2e8f0;">
            <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${statusColor};color:#ffffff;font-size:12px;font-weight:bold;">${escapeHtml(paymentStatus)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">報名方式</td>
          <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#0f172a;border-top:1px solid #e2e8f0;">
            ${escapeHtml(regTypeLabel)}${groupName ? `（團體名稱：${escapeHtml(groupName)}${groupCode ? `｜代碼：${escapeHtml(groupCode)}` : ''}）` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">應繳總金額</td>
          <td style="padding:10px 14px;font-size:16px;font-weight:900;color:#d97706;border-top:1px solid #e2e8f0;">NT$ ${totalAmount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">匯款方式 / 後五碼</td>
          <td style="padding:10px 14px;font-size:14px;font-weight:bold;color:#0f172a;border-top:1px solid #e2e8f0;">
            [${escapeHtml(paymentModeLabel)}] ${remittanceLast5 ? escapeHtml(remittanceLast5) : '<span style="color:#dc2626;">尚未填寫（匯款後請點擊下方連結補填以利核帳）</span>'}
          </td>
        </tr>
        ${
          bibNumber
            ? `<tr>
                <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">參賽編號（Bib）</td>
                <td style="padding:10px 14px;font-size:15px;font-weight:900;color:#15803d;border-top:1px solid #e2e8f0;">${escapeHtml(bibNumber)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">證件號碼（隱碼）</td>
          <td style="padding:10px 14px;font-size:13px;color:#334155;border-top:1px solid #e2e8f0;">${escapeHtml(idMasked || '—')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">賽事日期 / 地點</td>
          <td style="padding:10px 14px;font-size:13px;color:#334155;border-top:1px solid #e2e8f0;">${escapeHtml(event.event_date)} ｜ ${escapeHtml(event.location || '詳見簡章')}</td>
        </tr>
      </table>

      ${
        breakdownHtml
          ? `<h3 style="margin:0 0 8px;font-size:14px;color:#334155;">報名費用明細</h3>
             <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:20px;font-size:13px;">${breakdownHtml}</table>`
          : ''
      }

      ${
        event.payment_info && paymentStatus !== '已繳費'
          ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
               <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#1d4ed8;">匯款與對帳說明</p>
               <p style="margin:0;font-size:13px;color:#1e3a8a;white-space:pre-line;line-height:1.6;">${escapeHtml(event.payment_info)}</p>
             </div>`
          : ''
      }

      ${
        lookupUrl
          ? `<div style="text-align:center;margin:24px 0 8px;">
               <a href="${escapeHtml(lookupUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#10b981;color:#0f172a;font-size:14px;font-weight:900;text-decoration:none;">
                 反向查詢報名狀況 ／ 修改資料 ／ 補填匯款後五碼
               </a>
               <p style="margin:10px 0 0;font-size:12px;color:#64748b;">
                 查詢時請輸入您的「報名序號（${escapeHtml(regCode)}）」或「電子信箱」搭配「身份證字號」即可檢視與修改。
               </p>
             </div>`
          : ''
      }
    </div>

    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;">
      此信件由 TUR 路跑活動線上報名平台系統自動發送，請妥善保留您的報名序號。
    </div>
  </div>
</body>
</html>`.trim();

  const textLines = [
    `${headline}`,
    `活動名稱：${event.name}`,
    `跑者姓名：${runnerName}`,
    `報名方式：${regTypeLabel}${groupName ? `（${groupName}${groupCode ? ` / ${groupCode}` : ''}）` : ''}`,
    `報名序號：${regCode}`,
    `繳費狀態：${paymentStatus}`,
    `應繳總金額：NT$ ${totalAmount.toLocaleString()}`,
    `匯款方式：${paymentModeLabel}`,
    `匯款帳號後五碼：${remittanceLast5 || '尚未填寫'}`,
    bibNumber ? `參賽編號：${bibNumber}` : '',
    `賽事日期：${event.event_date}`,
    event.location ? `賽事地點：${event.location}` : '',
    '',
    event.payment_info ? `【匯款說明】\n${event.payment_info}` : '',
    lookupUrl ? `\n【反向查詢／修改報名／補填後五碼連結】\n${lookupUrl}` : '',
  ].filter(Boolean);

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}

/**
 * 發送報名狀態通知信給跑者（支援 Resend API 與 GAS 內建 Gmail）
 */
async function sendRegistrationEmail({
  type = 'created',
  event,
  registration,
  answers = {},
  priceBreakdown = [],
  siteOrigin = '',
}) {
  const toEmail = String(registration.runner_email || answers.email || '').trim();
  if (!toEmail) {
    return { sent: false, skipped: true, reason: '未填寫電子信箱，略過寄信。' };
  }

  const cfg = getEmailProviderConfig();
  const content = buildRegistrationEmailContent({
    type,
    event,
    registration,
    answers,
    priceBreakdown,
    siteOrigin,
  });

  if (!cfg.configured) {
    console.log(
      `[EmailService] 尚未設定發信服務（RESEND_API_KEY 或 GOOGLE_MASTER_GAS_URL），模擬紀錄信件 -> To: ${toEmail} | Subject: ${content.subject}`
    );
    return {
      sent: false,
      provider: 'none',
      to: toEmail,
      subject: content.subject,
      notice:
        '報名資料已安全儲存（目前伺服器尚未設定 Email 發信金鑰 RESEND_API_KEY 或 GOOGLE_MASTER_GAS_URL，請截圖保存報名序號）。',
    };
  }

  try {
    if (cfg.provider === 'resend') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.mailFrom,
            to: [toEmail],
            subject: content.subject,
            html: content.html,
            text: content.text,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || `Resend 發信失敗（HTTP ${res.status}）`);
        }
        return {
          sent: true,
          provider: 'resend',
          to: toEmail,
          messageId: data.id || '',
          notice: `系統已寄送確認信至 ${toEmail}（含報名序號與反向查詢修改連結）。`,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    if (cfg.provider === 'gas') {
      await callGasWebhook(cfg.gasMailUrl, {
        action: 'send_email',
        to: toEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
        senderName: 'TUR 路跑活動線上報名平台',
      });
      return {
        sent: true,
        provider: 'gas',
        to: toEmail,
        notice: `系統已寄送確認信至 ${toEmail}（含報名序號與反向查詢修改連結）。`,
      };
    }

    return { sent: false, provider: 'none', to: toEmail };
  } catch (err) {
    console.warn(`[EmailService] 寄信給 ${toEmail} 失敗：`, err.message);
    return {
      sent: false,
      provider: cfg.provider,
      to: toEmail,
      error: err.message,
      notice: `您的報名已完成，但 Email 通知信寄送暫時異常（${err.message}），請務必截圖保存報名序號！`,
    };
  }
}

/**
 * 寄送純自訂主旨／HTML／文字信件（供團報團長合併信、多場聯合報名合併信共用）
 */
async function sendRawEmail({ toEmail, subject, html, text, successNotice = '' }) {
  const to = String(toEmail || '').trim();
  if (!to) {
    return { sent: false, skipped: true, reason: '未填寫電子信箱，略過寄信。' };
  }

  const cfg = getEmailProviderConfig();
  if (!cfg.configured) {
    console.log(
      `[EmailService] 尚未設定發信服務（RESEND_API_KEY 或 GOOGLE_MASTER_GAS_URL），模擬紀錄信件 -> To: ${to} | Subject: ${subject}`
    );
    return {
      sent: false,
      provider: 'none',
      to,
      subject,
      notice:
        '報名資料已安全儲存（目前伺服器尚未設定 Email 發信金鑰 RESEND_API_KEY 或 GOOGLE_MASTER_GAS_URL，請截圖保存單號）。',
    };
  }

  try {
    if (cfg.provider === 'resend') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.mailFrom,
            to: [to],
            subject,
            html,
            text,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || `Resend 發信失敗（HTTP ${res.status}）`);
        }
        return {
          sent: true,
          provider: 'resend',
          to,
          messageId: data.id || '',
          notice: successNotice || `系統已寄送確認信至 ${to}。`,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    if (cfg.provider === 'gas') {
      await callGasWebhook(cfg.gasMailUrl, {
        action: 'send_email',
        to,
        subject,
        html,
        text,
        senderName: 'TUR 路跑活動線上報名平台',
      });
      return {
        sent: true,
        provider: 'gas',
        to,
        notice: successNotice || `系統已寄送確認信至 ${to}。`,
      };
    }

    return { sent: false, provider: 'none', to };
  } catch (err) {
    console.warn(`[EmailService] 寄信給 ${to} 失敗：`, err.message);
    return {
      sent: false,
      provider: cfg.provider,
      to,
      error: err.message,
      notice: `您的報名已完成，但 Email 通知信寄送暫時異常（${err.message}），請務必截圖保存單號！`,
    };
  }
}

/**
 * 團報統一確認信（比照路跑管理系統：僅統一寄給第 1 位團長）
 */
async function sendGroupLeaderEmail({
  type = 'created', // 'created' | 'payment_updated'
  event,
  groupName,
  groupCode,
  members = [],
  totalAmount = 0,
  remittanceLast5 = '',
  paymentStatus = '待繳費',
  siteOrigin = '',
}) {
  const leader = members.find((m) => m.group_role === 'leader') || members[0];
  if (!leader) return { sent: false, skipped: true };
  const toEmail = String(leader.runner_email || '').trim();
  const origin = stripWrappingQuotes(siteOrigin || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const lookupUrl = origin ? `${origin}/lookup` : '';
  const isPayUpdate = type === 'payment_updated';
  const subject = isPayUpdate
    ? `【團報繳費狀態更新：${paymentStatus}】${event.name}（${groupName}｜${groupCode}）`
    : `【團體報名成功確認信】${event.name}（${groupName}｜${groupCode}）`;
  const headline = isPayUpdate
    ? `團體「${groupName}」繳費狀態已更新為「${paymentStatus}」`
    : `團體「${groupName}」共 ${members.length} 位跑者報名成功！`;

  const rowsHtml = members
    .map(
      (m, idx) =>
        `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${idx === 0 || m.group_role === 'leader' ? '👑 團長' : `組員 #${idx}`}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(m.runner_name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escapeHtml(m.reg_code)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(m.category_code || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">NT$ ${Number(m.total_amount || 0).toLocaleString()}</td>
        </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:'Noto Sans TC','Microsoft JhengHei',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cbd5e1;">
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;border-bottom:4px solid #f59e0b;">
      <p style="margin:0;font-size:12px;color:#fbbf24;font-weight:bold;">TUR 路跑活動線上報名平台・團體報名通知（僅寄給團長）</p>
      <h1 style="margin:8px 0 4px;font-size:21px;line-height:1.3;">${escapeHtml(headline)}</h1>
      <p style="margin:0;font-size:14px;color:#cbd5e1;">${escapeHtml(event.name)}</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 14px;font-size:15px;">團長 <strong>${escapeHtml(leader.runner_name)}</strong> 您好，本團採團長統一收信、匯款與管理：</p>
      <table style="width:100%;border-collapse:collapse;background:#fffbeb;border:1px solid #fde68a;margin-bottom:18px;font-size:13px;">
        <tr><td style="padding:8px 12px;color:#78350f;width:34%;">團體名稱 / 代碼</td><td style="padding:8px 12px;font-weight:900;">${escapeHtml(groupName)}（${escapeHtml(groupCode)}）</td></tr>
        <tr><td style="padding:8px 12px;color:#78350f;border-top:1px solid #fde68a;">團報人數 / 狀態</td><td style="padding:8px 12px;border-top:1px solid #fde68a;font-weight:bold;">共 ${members.length} 人 ｜ ${escapeHtml(paymentStatus)}</td></tr>
        <tr><td style="padding:8px 12px;color:#78350f;border-top:1px solid #fde68a;">全團應繳總金額</td><td style="padding:8px 12px;border-top:1px solid #fde68a;font-size:16px;font-weight:900;color:#b45309;">NT$ ${Number(totalAmount).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;color:#78350f;border-top:1px solid #fde68a;">整團匯款末五碼</td><td style="padding:8px 12px;border-top:1px solid #fde68a;font-weight:bold;">${remittanceLast5 ? escapeHtml(remittanceLast5) : '尚未填寫（匯款後請由團長登入查詢頁一次補填）'}</td></tr>
      </table>
      <h3 style="margin:0 0 8px;font-size:14px;">全團成員明細</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12px;margin-bottom:18px;">
        <thead style="background:#f8fafc;"><tr><th style="padding:8px 10px;text-align:left;">角色</th><th style="padding:8px 10px;text-align:left;">姓名</th><th style="padding:8px 10px;text-align:left;">序號</th><th style="padding:8px 10px;text-align:left;">組別</th><th style="padding:8px 10px;text-align:right;">金額</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${event.payment_info && paymentStatus !== '已繳費' ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:13px;"><strong>匯款與對帳說明：</strong><br /><span style="white-space:pre-line;">${escapeHtml(event.payment_info)}</span></div>` : ''}
      ${lookupUrl ? `<div style="text-align:center;margin:20px 0 6px;"><a href="${escapeHtml(lookupUrl)}" style="display:inline-block;padding:11px 22px;border-radius:10px;background:#f59e0b;color:#0f172a;font-weight:900;text-decoration:none;font-size:14px;">團長登入查詢 ／ 管理成員 ／ 補填整團末五碼</a><p style="margin:8px 0 0;font-size:12px;color:#64748b;">請輸入團長身分證字號搭配團報代碼（${escapeHtml(groupCode)}）或 Email 登入。</p></div>` : ''}
    </div>
  </div>
</body>
</html>`.trim();

  const text = [
    headline,
    `活動名稱：${event.name}`,
    `團體名稱：${groupName}（團報代碼：${groupCode}，共 ${members.length} 人）`,
    `全團總金額：NT$ ${Number(totalAmount).toLocaleString()}`,
    `繳費狀態：${paymentStatus}`,
    `整團末五碼：${remittanceLast5 || '尚未填寫（可由團長事後補填）'}`,
    '',
    '【成員清單】',
    ...members.map(
      (m, idx) =>
        `${idx === 0 || m.group_role === 'leader' ? '[團長]' : `[組員#${idx}]`} ${m.runner_name}｜${m.reg_code}｜${m.category_code || ''}｜NT$${Number(m.total_amount || 0).toLocaleString()}`
    ),
    lookupUrl ? `\n團長查詢與管理連結：${lookupUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return sendRawEmail({
    toEmail,
    subject,
    html,
    text,
    successNotice: `系統已統一寄送團報確認信給團長（${toEmail}），含團報代碼與全團明細。`,
  });
}

/**
 * 多場聯合報名合併確認信（合併寄發 1 封，內含合併單號與所有場次明細）
 */
async function sendMultiBundleEmail({
  type = 'created', // 'created' | 'payment_updated'
  bundleCode = '',
  runnerName = '',
  runnerEmail = '',
  organizerName = '',
  items = [], // [{ event, registration }]
  totalAmount = 0,
  remittanceLast5 = '',
  paymentStatus = '待繳費',
  paymentInfo = '',
  siteOrigin = '',
}) {
  const origin = stripWrappingQuotes(siteOrigin || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const lookupUrl = origin ? `${origin}/lookup` : '';
  const isBundle = Boolean(bundleCode);
  const isPayUpdate = type === 'payment_updated';
  const subject = isPayUpdate
    ? `【多場合併繳費更新：${paymentStatus}】${isBundle ? `合併單 ${bundleCode}` : items[0]?.event?.name || 'TUR 活動'}`
    : `【多場聯合報名成功確認信】${isBundle ? `合併單 ${bundleCode}（共 ${items.length} 場）` : items[0]?.event?.name || 'TUR 活動'}`;
  const headline = isPayUpdate
    ? `您的多場合併單（${bundleCode}）已更新為「${paymentStatus}」`
    : isBundle
    ? `多場聯合報名成功！（共 ${items.length} 場・合併單號 ${bundleCode}）`
    : `線上報名成功！`;

  const rowsHtml = items
    .map(
      (it, idx) =>
        `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(it.event?.name || '')}<br /><span style="font-size:11px;color:#64748b;font-weight:normal;">${escapeHtml(it.event?.event_date || '')}</span></td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escapeHtml(it.registration?.reg_code || '')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.registration?.category_code || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">NT$ ${Number(it.registration?.total_amount || 0).toLocaleString()}</td>
        </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:'Noto Sans TC','Microsoft JhengHei',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cbd5e1;">
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;border-bottom:4px solid #10b981;">
      <p style="margin:0;font-size:12px;color:#34d399;font-weight:bold;">TUR 路跑活動線上報名平台・多場聯合報名</p>
      <h1 style="margin:8px 0 4px;font-size:21px;line-height:1.3;">${escapeHtml(headline)}</h1>
      <p style="margin:0;font-size:13px;color:#cbd5e1;">承辦單位：${escapeHtml(organizerName || 'TUR 主辦單位')}</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 14px;font-size:15px;">親愛的 <strong>${escapeHtml(runnerName || '跑者')}</strong> 您好，以下是您的多場聯合報名明細：</p>
      <table style="width:100%;border-collapse:collapse;background:#ecfdf5;border:1px solid #a7f3d0;margin-bottom:18px;font-size:13px;">
        ${isBundle ? `<tr><td style="padding:8px 12px;color:#065f46;width:34%;">統一合併單號</td><td style="padding:8px 12px;font-family:monospace;font-size:15px;font-weight:900;color:#047857;">${escapeHtml(bundleCode)}</td></tr>` : ''}
        <tr><td style="padding:8px 12px;color:#065f46;border-top:1px solid #a7f3d0;">報名場數 / 狀態</td><td style="padding:8px 12px;border-top:1px solid #a7f3d0;font-weight:bold;">共 ${items.length} 場 ｜ ${escapeHtml(paymentStatus)}</td></tr>
        <tr><td style="padding:8px 12px;color:#065f46;border-top:1px solid #a7f3d0;">合併應繳總金額</td><td style="padding:8px 12px;border-top:1px solid #a7f3d0;font-size:16px;font-weight:900;color:#047857;">NT$ ${Number(totalAmount).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;color:#065f46;border-top:1px solid #a7f3d0;">合併匯款末五碼</td><td style="padding:8px 12px;border-top:1px solid #a7f3d0;font-weight:bold;">${remittanceLast5 ? escapeHtml(remittanceLast5) : '尚未填寫（匯款後請至查詢頁一次補填全單）'}</td></tr>
      </table>
      <h3 style="margin:0 0 8px;font-size:14px;">各場次報名明細</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12px;margin-bottom:18px;">
        <thead style="background:#f8fafc;"><tr><th style="padding:8px 10px;text-align:left;">#</th><th style="padding:8px 10px;text-align:left;">活動名稱</th><th style="padding:8px 10px;text-align:left;">報名序號</th><th style="padding:8px 10px;text-align:left;">組別</th><th style="padding:8px 10px;text-align:right;">小計</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${paymentInfo && paymentStatus !== '已繳費' ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:13px;"><strong>承辦人統一匯款說明（請合併匯入總金額）：</strong><br /><span style="white-space:pre-line;">${escapeHtml(paymentInfo)}</span></div>` : ''}
      ${lookupUrl ? `<div style="text-align:center;margin:20px 0 6px;"><a href="${escapeHtml(lookupUrl)}" style="display:inline-block;padding:11px 22px;border-radius:10px;background:#10b981;color:#0f172a;font-weight:900;text-decoration:none;font-size:14px;">前往查詢 ／ 補填合併單末五碼</a><p style="margin:8px 0 0;font-size:12px;color:#64748b;">請輸入身分證字號搭配合併單號（${escapeHtml(bundleCode || items[0]?.registration?.reg_code || '')}）或 Email 查詢。</p></div>` : ''}
    </div>
  </div>
</body>
</html>`.trim();

  const text = [
    headline,
    `跑者姓名：${runnerName}`,
    isBundle ? `合併單號：${bundleCode}` : '',
    `報名場數：共 ${items.length} 場`,
    `合併應繳總金額：NT$ ${Number(totalAmount).toLocaleString()}`,
    `繳費狀態：${paymentStatus}`,
    `匯款末五碼：${remittanceLast5 || '尚未填寫'}`,
    '',
    '【場次明細】',
    ...items.map(
      (it, idx) =>
        `${idx + 1}. ${it.event?.name}（${it.registration?.reg_code}｜${it.registration?.category_code || ''}）NT$ ${Number(it.registration?.total_amount || 0).toLocaleString()}`
    ),
    lookupUrl ? `\n查詢與補填末五碼連結：${lookupUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return sendRawEmail({
    toEmail: runnerEmail,
    subject,
    html,
    text,
    successNotice: `系統已寄送多場聯合報名合併確認信至 ${runnerEmail}。`,
  });
}

module.exports = {
  getEmailProviderConfig,
  buildRegistrationEmailContent,
  sendRegistrationEmail,
  sendGroupLeaderEmail,
  sendMultiBundleEmail,
};
