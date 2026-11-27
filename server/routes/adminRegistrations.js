const express = require('express');
const { db } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  getMasterDatabaseConfig,
  appendRegistrationToSheet,
  pullRowsFromSheet,
  updatePaymentStatusInSheet,
  updateRegistrationInSheet,
  updateBibInSheet,
  buildExpectedHeaders,
} = require('../services/googleSheets');
const {
  syncRegistrationToCloud,
  syncAllRegistrationsToCloud,
  syncEventToCloud,
} = require('../services/cloudStore');
const {
  sendRegistrationEmail,
  sendGroupLeaderEmail,
  sendMultiBundleEmail,
} = require('../services/emailService');
const { extractRunnerSummary } = require('../services/validation');
const { buildExcelWorkbookBuffer } = require('../services/excelExport');
const {
  maskIdNumber,
  buildChipImportCsv,
  autoAssignBibNumbers,
  pushRosterToChipSystem,
  toChipTimingRegistration,
  resolveCategoryMeta,
} = require('../services/chipBridge');

const router = express.Router();
router.use(requireAdminAuth);

function getOwnedEventOrDeny(req, res, eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(eventId));
  if (!event) {
    res.status(404).json({ error: '找不到指定的活動。' });
    return null;
  }
  const me = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(req.admin.id);
  if (me?.role === 'super_admin') {
    return event;
  }
  const isOwner =
    Number(event.owner_admin_id) === Number(req.admin.id) ||
    (event.owner_username && event.owner_username.toLowerCase() === String(req.admin.username || '').toLowerCase());
  if (!isOwner) {
    res.status(403).json({
      error: '權限不足：此活動報名表屬於其他承辦人，僅建立者本人或最高權限管理者可檢視或修改報名資料。',
      code: 'FORBIDDEN_NOT_OWNER',
    });
    return null;
  }
  return event;
}

function formatRegistrationRow(row) {
  return {
    ...row,
    id_masked: maskIdNumber(row.runner_id_number),
    answers: JSON.parse(row.answers_json || '{}'),
    priceBreakdown: JSON.parse(row.price_breakdown_json || '[]'),
  };
}

// GET /api/admin/events/:eventId/registrations
router.get('/events/:eventId/registrations', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(event.id);

  return res.json({
    registrations: rows.map(formatRegistrationRow),
    total: rows.length,
  });
});

/**
 * 承辦人修改報名資料時，依據動態欄位計算費用明細與總額（允許承辦人不受一般前台年齡/格式強制攔截，彈性協助選手修正）
 */
function calculateAdminPricing(fields, answers) {
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
          fieldId: field.id,
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
            fieldId: field.id,
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
          fieldId: field.id,
          fieldLabel: field.label,
          itemLabel: `${num} × NT$${unitPrice.toLocaleString()}`,
          amount: subtotal,
        });
      }
    }
  }
  return { total, breakdown };
}

// PUT /api/admin/registrations/:id — 承辦人修改報名者所有資料（動態欄位、組別、配號、團報、匯款與繳費狀態）
router.put('/registrations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, existing.event_id);
  if (!event) return;

  const body = req.body || {};
  const fields = JSON.parse(event.fields_json || '[]');
  const existingAnswers = JSON.parse(existing.answers_json || '{}');
  const rawAnswers = body.answers && typeof body.answers === 'object' ? body.answers : existingAnswers;

  // 正規化答案
  const cleanAnswers = { ...existingAnswers };
  for (const field of fields) {
    if (field.type === 'calculated') continue;
    if (rawAnswers[field.id] === undefined) continue;
    const rawVal = rawAnswers[field.id];
    if (field.type === 'checkbox') {
      cleanAnswers[field.id] = Array.isArray(rawVal)
        ? rawVal.map((v) => String(v).trim()).filter(Boolean)
        : [];
    } else if (field.type === 'tw_id' || field.validation === 'tw_id_or_passport') {
      cleanAnswers[field.id] = String(rawVal ?? '').trim().toUpperCase();
    } else if (field.type === 'number') {
      cleanAnswers[field.id] = rawVal === '' || rawVal === null ? '' : Number(rawVal);
    } else {
      cleanAnswers[field.id] = String(rawVal ?? '').trim();
    }
  }
  // 保留其他自訂鍵值
  for (const [k, v] of Object.entries(rawAnswers)) {
    if (cleanAnswers[k] === undefined) {
      cleanAnswers[k] = v;
    }
  }

  const summary = extractRunnerSummary(fields, cleanAnswers);
  const catMeta = resolveCategoryMeta(fields, cleanAnswers);
  const pricing = calculateAdminPricing(fields, cleanAnswers);

  const nextBib =
    body.bib_number !== undefined
      ? String(body.bib_number || '').trim().toUpperCase()
      : existing.bib_number || '';

  if (nextBib) {
    const dupBib = db
      .prepare('SELECT id, runner_name FROM registrations WHERE event_id = ? AND bib_number = ? AND id != ?')
      .get(existing.event_id, nextBib, id);
    if (dupBib) {
      return res.status(409).json({
        error: `參賽編號「${nextBib}」已分配給 ${dupBib.runner_name}，請使用其他編號。`,
      });
    }
  }

  const nextPaymentStatus = ['待繳費', '已繳費', '已取消'].includes(body.payment_status)
    ? body.payment_status
    : existing.payment_status;
  const nextRegType = body.reg_type === 'group' ? 'group' : body.reg_type === 'individual' ? 'individual' : existing.reg_type || 'individual';
  const nextPaymentMode =
    body.payment_mode === 'group'
      ? 'group'
      : body.payment_mode === 'bundle'
      ? 'bundle'
      : body.payment_mode === 'individual'
      ? 'individual'
      : existing.payment_mode || 'individual';
  const nextGroupName =
    body.group_name !== undefined ? String(body.group_name || '').trim() : existing.group_name || '';
  const nextGroupCode =
    body.group_code !== undefined ? String(body.group_code || '').trim().toUpperCase() : existing.group_code || '';
  const nextGroupRole =
    body.group_role !== undefined
      ? ['leader', 'member', ''].includes(String(body.group_role || '').toLowerCase())
        ? String(body.group_role || '').toLowerCase()
        : existing.group_role || ''
      : existing.group_role || '';
  const nextBundleCode =
    body.bundle_code !== undefined ? String(body.bundle_code || '').trim().toUpperCase() : existing.bundle_code || '';
  const nextRemittanceLast5 =
    body.remittance_last5 !== undefined
      ? String(body.remittance_last5 || '').trim()
      : summary.remittanceLast5 || existing.remittance_last5 || '';

  // 確保動態答案裡的匯款帳號尾五碼與主欄一致
  if (fields.some((f) => f.id === 'remittance_last5')) {
    cleanAnswers.remittance_last5 = nextRemittanceLast5;
  }

  const nextCategoryCode =
    body.category_code !== undefined && String(body.category_code).trim() !== ''
      ? String(body.category_code).trim()
      : catMeta.categoryCode || existing.category_code || '';

  const nextTotalAmount =
    body.total_amount !== undefined && body.total_amount !== '' && Number.isFinite(Number(body.total_amount))
      ? Math.max(0, Math.round(Number(body.total_amount)))
      : pricing.total;

  db.prepare(`
    UPDATE registrations SET
      bib_number = ?,
      category_code = ?,
      runner_name = ?,
      runner_id_number = ?,
      runner_email = ?,
      runner_phone = ?,
      remittance_last5 = ?,
      reg_type = ?,
      group_name = ?,
      group_code = ?,
      group_role = ?,
      bundle_code = ?,
      payment_mode = ?,
      answers_json = ?,
      price_breakdown_json = ?,
      total_amount = ?,
      payment_status = ?
    WHERE id = ?
  `).run(
    nextBib,
    nextCategoryCode,
    summary.runnerName || existing.runner_name || '',
    summary.runnerIdNumber || existing.runner_id_number || '',
    summary.runnerEmail || existing.runner_email || '',
    summary.runnerPhone || existing.runner_phone || '',
    nextRemittanceLast5,
    nextRegType,
    nextGroupName,
    nextGroupCode,
    nextGroupRole,
    nextBundleCode,
    nextPaymentMode,
    JSON.stringify(cleanAnswers),
    JSON.stringify(pricing.breakdown),
    nextTotalAmount,
    nextPaymentStatus,
    id
  );

  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  await syncRegistrationToCloud(updated);

  const master = getMasterDatabaseConfig();
  if (master.configured || event.sheet_sync_mode !== 'local') {
    await updateRegistrationInSheet(event, fields, updated).catch(() => {});
  }

  return res.json({
    registration: formatRegistrationRow(updated),
    message: `已更新「${updated.runner_name || updated.reg_code}」的報名資料！`,
  });
});

// DELETE /api/admin/registrations/:id — 承辦人刪除單筆報名資料
router.delete('/registrations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, existing.event_id);
  if (!event) return;

  db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  await syncAllRegistrationsToCloud();

  return res.json({
    deletedId: id,
    message: `已刪除「${existing.runner_name || existing.reg_code}（${existing.reg_code}）」的報名資料。`,
  });
});

// DELETE /api/admin/events/:eventId/registrations — 一鍵清空本活動所有報名名單
router.delete('/events/:eventId/registrations', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const deletedCount = countRow?.cnt || 0;

  db.prepare('DELETE FROM registrations WHERE event_id = ?').run(event.id);
  await syncAllRegistrationsToCloud();

  return res.json({
    deletedCount,
    message:
      deletedCount > 0
        ? `已一鍵清空本活動共 ${deletedCount} 筆報名名單。`
        : '本活動目前沒有任何報名名單。',
  });
});

// PATCH /api/admin/registrations/:id/payment-status
router.patch('/registrations/:id/payment-status', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.payment_status || '').trim();
  if (!['待繳費', '已繳費', '已取消'].includes(status)) {
    return res.status(400).json({ error: '無效的繳費狀態。' });
  }

  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, reg.event_id);
  if (!event) return;

  db.prepare('UPDATE registrations SET payment_status = ? WHERE id = ?').run(status, id);
  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

  // 1. 同步至統一資料庫 _DB_Registrations
  await syncRegistrationToCloud(updated);

  // 2. 同步回寫繳費狀態到活動專屬分頁
  const master = getMasterDatabaseConfig();
  let sheetUpdate = { skipped: true };
  if (master.configured || event.sheet_sync_mode !== 'local') {
    sheetUpdate = await updatePaymentStatusInSheet(event, reg.reg_code, status);
  }

  // 3. 若承辦人改為「已繳費」或「已取消」，自動發送 Email 通知選手最新對帳狀態
  let emailResult = { skipped: true };
  if (status === '已繳費' || status === '已取消') {
    const siteOrigin = `${req.protocol}://${req.get('host')}`;
    emailResult = await sendRegistrationEmail({
      type: 'payment_updated',
      event,
      registration: updated,
      answers: JSON.parse(updated.answers_json || '{}'),
      priceBreakdown: JSON.parse(updated.price_breakdown_json || '[]'),
      siteOrigin,
    });
  }

  return res.json({
    registration: formatRegistrationRow(updated),
    sheetUpdate,
    emailNotification: emailResult,
    message: `已更新繳費狀態為「${status}」${sheetUpdate.synced ? '（已同步至統一試算表）' : ''}${
      emailResult.sent ? '，並已寄出 Email 通知選手！' : ''
    }`,
  });
});

// PATCH /api/admin/events/:eventId/groups/:groupCode/payment-status — 同團一鍵批量對帳（團體匯款核對專用，統一通知團長）
router.patch('/events/:eventId/groups/:groupCode/payment-status', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const groupCode = String(req.params.groupCode || '').trim().toUpperCase();
  const status = String(req.body?.payment_status || '').trim();
  if (!['待繳費', '已繳費', '已取消'].includes(status)) {
    return res.status(400).json({ error: '無效的繳費狀態。' });
  }

  const members = db
    .prepare(
      "SELECT * FROM registrations WHERE event_id = ? AND upper(group_code) = ? AND payment_status != '已取消' ORDER BY id ASC"
    )
    .all(event.id, groupCode);
  if (members.length === 0) {
    return res.status(404).json({ error: `找不到團報代碼「${groupCode}」的有效報名成員。` });
  }

  db.prepare(
    "UPDATE registrations SET payment_status = ? WHERE event_id = ? AND upper(group_code) = ? AND payment_status != '已取消'"
  ).run(status, event.id, groupCode);

  const updatedMembers = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? AND upper(group_code) = ? ORDER BY id ASC')
    .all(event.id, groupCode);

  const master = getMasterDatabaseConfig();
  for (const m of updatedMembers) {
    if (master.configured || event.sheet_sync_mode !== 'local') {
      await updatePaymentStatusInSheet(event, m.reg_code, status).catch(() => {});
    }
  }

  let mailSent = false;
  if (status === '已繳費' || status === '已取消') {
    const siteOrigin = `${req.protocol}://${req.get('host')}`;
    const totalAmt = updatedMembers.reduce((s, m) => s + Number(m.total_amount || 0), 0);
    const last5 = updatedMembers.find((m) => m.remittance_last5)?.remittance_last5 || '';
    const mailRes = await sendGroupLeaderEmail({
      type: 'payment_updated',
      event,
      groupName: updatedMembers[0].group_name || groupCode,
      groupCode,
      members: updatedMembers,
      totalAmount: totalAmt,
      remittanceLast5: last5,
      paymentStatus: status,
      siteOrigin,
    });
    mailSent = Boolean(mailRes.sent);
  }

  await syncAllRegistrationsToCloud();

  return res.json({
    groupCode,
    updatedCount: updatedMembers.length,
    registrations: updatedMembers.map(formatRegistrationRow),
    message: `已將團體「${updatedMembers[0].group_name || groupCode}」共 ${updatedMembers.length} 位成員批次設為「${status}」${
      mailSent ? '（已統一寄發通知信給團長）' : ''
    }！`,
  });
});

// ==================== 多場聯合報名合併單 (TURM-...) 彙總、匯出與跨場一次入帳 ====================
function summarizeBundlesForEvent(eventId, adminUser) {
  const bundleCodesRows = db
    .prepare(
      `SELECT DISTINCT upper(bundle_code) as bundle_code
       FROM registrations
       WHERE event_id = ? AND bundle_code != '' AND payment_status != '已取消'`
    )
    .all(Number(eventId));

  const codes = bundleCodesRows
    .map((r) => String(r.bundle_code || '').trim().toUpperCase())
    .filter((c) => /^TURM-[A-Z0-9-]+$/i.test(c));

  if (codes.length === 0) return [];

  const isSuperAdmin = adminUser?.role === 'super_admin';
  const out = [];

  for (const code of codes) {
    const rows = db
      .prepare(
        `SELECT r.*, e.name as event_name, e.event_date as event_date, e.slug as event_slug,
                e.owner_admin_id as event_owner_id, e.owner_username as event_owner_username
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE upper(r.bundle_code) = ? AND r.payment_status != '已取消'
         ORDER BY r.id ASC`
      )
      .all(code);
    if (rows.length === 0) continue;

    const first = rows[0];
    const paidCount = rows.filter((r) => r.payment_status === '已繳費').length;
    const unpaidCount = rows.length - paidCount;
    const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const last5 = rows.find((r) => r.remittance_last5)?.remittance_last5 || '';
    const canCrossConfirm =
      isSuperAdmin ||
      rows.every(
        (r) =>
          Number(r.event_owner_id) === Number(adminUser?.id) ||
          String(r.event_owner_username || '').toLowerCase() === String(adminUser?.username || '').toLowerCase()
      );

    out.push({
      bundle_code: code,
      runner_name: first.runner_name || '',
      id_masked: maskIdNumber(first.runner_id_number),
      runner_id_number: first.runner_id_number || '',
      runner_phone: first.runner_phone || '',
      runner_email: first.runner_email || '',
      remittance_last5: last5,
      created_at: first.created_at || '',
      total_amount: totalAmount,
      paid_count: paidCount,
      unpaid_count: unpaidCount,
      all_paid: rows.length > 0 && unpaidCount === 0,
      can_cross_confirm: canCrossConfirm,
      items: rows.map((r) => ({
        id: r.id,
        event_id: r.event_id,
        event_slug: r.event_slug,
        event_name: r.event_name,
        event_date: r.event_date,
        reg_code: r.reg_code,
        category_code: r.category_code || '',
        bib_number: r.bib_number || '',
        total_amount: Number(r.total_amount || 0),
        payment_status: r.payment_status,
      })),
    });
  }

  return out.sort(
    (a, b) =>
      (b.unpaid_count > 0 ? 1 : 0) - (a.unpaid_count > 0 ? 1 : 0) ||
      String(b.created_at).localeCompare(String(a.created_at))
  );
}

// GET /api/admin/events/:eventId/bundles — 取得包含本活動的多場聯合報名合併單彙總
router.get('/events/:eventId/bundles', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const me = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(req.admin.id);
  const bundles = summarizeBundlesForEvent(event.id, me);
  return res.json({ bundles, total: bundles.length });
});

// GET /api/admin/events/:eventId/bundles/export-excel — 匯出多場合併繳費對帳總表 (.xlsx)
router.get('/events/:eventId/bundles/export-excel', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const me = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(req.admin.id);
  const bundles = summarizeBundlesForEvent(event.id, me);

  const headers = [
    '序號',
    '合併單號',
    '選手姓名',
    '身分證(隱碼)',
    '手機',
    'Email',
    '匯款末五碼',
    '合併場次數',
    '合併總金額',
    '對帳狀態',
    '包含場次與各場明細',
  ];

  const dataRows = bundles.map((b, idx) => [
    idx + 1,
    b.bundle_code,
    b.runner_name,
    b.id_masked,
    b.runner_phone,
    b.runner_email,
    b.remittance_last5 || '',
    b.items.length,
    Number(b.total_amount || 0),
    b.all_paid ? '已全數入帳' : `待對帳 (${b.unpaid_count}/${b.items.length}場)`,
    b.items
      .map(
        (it) =>
          `${it.event_name}[${it.category_code || '—'}] NT$${it.total_amount}(${it.payment_status}${
            it.bib_number ? `/${it.bib_number}` : ''
          })`
      )
      .join('；'),
  ]);

  const buffer = buildExcelWorkbookBuffer({
    sheetName: '多場合併繳費對帳總表',
    headers,
    rows: dataRows,
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.name}-多場合併對帳總表.xlsx`)}`
  );
  return res.send(buffer);
});

// PATCH /api/admin/bundles/:bundleCode/payment-status — 一鍵跨場整單入帳（合併單全部場次同步更新）
router.patch('/bundles/:bundleCode/payment-status', async (req, res) => {
  const bundleCode = String(req.params.bundleCode || '').trim().toUpperCase();
  const status = String(req.body?.payment_status || '已繳費').trim();
  if (!['待繳費', '已繳費', '已取消'].includes(status)) {
    return res.status(400).json({ error: '無效的繳費狀態。' });
  }

  const rows = db
    .prepare(
      `SELECT r.*, e.owner_admin_id as event_owner_id, e.owner_username as event_owner_username
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE upper(r.bundle_code) = ? AND r.payment_status != '已取消'
       ORDER BY r.id ASC`
    )
    .all(bundleCode);

  if (rows.length === 0) {
    return res.status(404).json({ error: `找不到合併單「${bundleCode}」的有效報名紀錄。` });
  }

  const me = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(req.admin.id);
  const isSuperAdmin = me?.role === 'super_admin';
  const canAll =
    isSuperAdmin ||
    rows.every(
      (r) =>
        Number(r.event_owner_id) === Number(req.admin.id) ||
        String(r.event_owner_username || '').toLowerCase() === String(req.admin.username || '').toLowerCase()
    );
  if (!canAll) {
    return res.status(403).json({
      error: '此合併單包含其他承辦人的活動，僅最高權限管理員或同承辦人可執行整單跨場對帳。',
    });
  }

  db.prepare(
    "UPDATE registrations SET payment_status = ? WHERE upper(bundle_code) = ? AND payment_status != '已取消'"
  ).run(status, bundleCode);

  const refreshedRows = db
    .prepare('SELECT * FROM registrations WHERE upper(bundle_code) = ? ORDER BY id ASC')
    .all(bundleCode);

  const master = getMasterDatabaseConfig();
  const eventItems = [];
  for (const r of refreshedRows) {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(r.event_id);
    if (!ev) continue;
    eventItems.push({ event: ev, registration: r });
    if (master.configured || ev.sheet_sync_mode !== 'local') {
      await updatePaymentStatusInSheet(ev, r.reg_code, status).catch(() => {});
    }
  }

  let mailSent = false;
  if ((status === '已繳費' || status === '已取消') && eventItems.length > 0) {
    const siteOrigin = `${req.protocol}://${req.get('host')}`;
    const first = eventItems[0];
    const totalAmt = refreshedRows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const last5 = refreshedRows.find((r) => r.remittance_last5)?.remittance_last5 || '';
    const mailRes = await sendMultiBundleEmail({
      type: 'payment_updated',
      bundleCode,
      runnerName: first.registration.runner_name,
      runnerEmail: first.registration.runner_email,
      organizerName: first.event.owner_display_name || '主辦單位',
      items: eventItems,
      totalAmount: totalAmt,
      remittanceLast5: last5,
      paymentStatus: status,
      paymentInfo: first.event.payment_info || '',
      siteOrigin,
    });
    mailSent = Boolean(mailRes.sent);
  }

  await syncAllRegistrationsToCloud();

  return res.json({
    bundleCode,
    updatedCount: refreshedRows.length,
    registrations: refreshedRows.map(formatRegistrationRow),
    message: `合併單 ${bundleCode} 共 ${refreshedRows.length} 場已整單跨場設為「${status}」${
      mailSent ? '，並已寄發合併通知信！' : '！'
    }`,
  });
});

// POST /api/admin/events/:eventId/registrations/retry-sync
router.post('/events/:eventId/registrations/retry-sync', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const master = getMasterDatabaseConfig();
  if (!master.configured && event.sheet_sync_mode === 'local') {
    return res.status(400).json({ error: '尚未設定平台統一 Google 試算表資料庫，無法補送同步。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const pendingRows = db
    .prepare("SELECT * FROM registrations WHERE event_id = ? AND sheet_sync_status != 'synced' ORDER BY id ASC")
    .all(event.id);

  let successCount = 0;
  let failCount = 0;
  let lastError = '';

  for (const reg of pendingRows) {
    try {
      const result = await appendRegistrationToSheet(event, fields, reg);
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
      ).run(result.rowNumber || null, reg.id);
      successCount += 1;
    } catch (err) {
      failCount += 1;
      lastError = err.message;
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
      ).run(err.message, reg.id);
    }
  }

  if (successCount > 0) {
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    attempted: pendingRows.length,
    successCount,
    failCount,
    lastError: lastError || undefined,
    message:
      pendingRows.length === 0
        ? '所有報名資料均已同步至統一試算表，無待補送項目。'
        : `補送完成：成功 ${successCount} 筆，失敗 ${failCount} 筆。${lastError ? `（錯誤：${lastError}）` : ''}`,
  });
});

// POST /api/admin/events/:eventId/registrations/pull-from-sheet
router.post('/events/:eventId/registrations/pull-from-sheet', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const pulled = await pullRowsFromSheet(event);
    let updatedCount = 0;
    let importedCount = 0;

    for (const item of pulled.rows) {
      const data = item.data || {};
      const regCode = String(data['報名序號'] || '').trim();
      const paymentStatus = String(data['繳費狀態'] || '').trim();
      const bibNumber = String(data['參賽編號'] || '').trim().toUpperCase();
      const totalAmount = Number(String(data['應繳總金額'] || '0').replace(/[^\d.-]/g, '')) || 0;

      const answers = {};
      for (const field of fields) {
        if (field.type === 'calculated') continue;
        const label = String(field.label || field.id).trim();
        if (data[label] !== undefined) {
          if (field.type === 'checkbox') {
            answers[field.id] = String(data[label])
              .split(/[、,]/)
              .map((s) => s.trim())
              .filter(Boolean);
          } else {
            answers[field.id] = data[label];
          }
        }
      }

      if (regCode) {
        const existing = db
          .prepare('SELECT * FROM registrations WHERE event_id = ? AND reg_code = ?')
          .get(event.id, regCode);
        if (existing) {
          const nextStatus = paymentStatus || existing.payment_status;
          const nextBib = bibNumber || existing.bib_number || '';
          db.prepare(
            "UPDATE registrations SET payment_status = ?, bib_number = ?, sheet_sync_status = 'synced', sheet_row_number = ? WHERE id = ?"
          ).run(nextStatus, nextBib, item.rowNumber, existing.id);
          updatedCount += 1;
          continue;
        }
      }

      const summary = extractRunnerSummary(fields, answers);
      if (!summary.runnerName && !regCode) continue;

      const generatedCode =
        regCode || `SHEET-${event.id}-${item.rowNumber}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      db.prepare(`
        INSERT INTO registrations (
          event_id, reg_code, bib_number, runner_name, runner_id_number, runner_email, runner_phone,
          answers_json, price_breakdown_json, total_amount, payment_status,
          sheet_sync_status, sheet_row_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
      `).run(
        event.id,
        generatedCode,
        bibNumber,
        summary.runnerName || '試算表匯入跑者',
        summary.runnerIdNumber,
        summary.runnerEmail,
        summary.runnerPhone,
        JSON.stringify(answers),
        JSON.stringify([]),
        totalAmount,
        paymentStatus || '待繳費',
        item.rowNumber
      );
      importedCount += 1;
    }

    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
    await syncAllRegistrationsToCloud();

    return res.json({
      totalSheetRows: pulled.rows.length,
      updatedCount,
      importedCount,
      message: `雙向拉取完成！共讀取 ${pulled.rows.length} 列（更新 ${updatedCount} 筆、匯入 ${importedCount} 筆新資料）。`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/events/:eventId/registrations/export-csv
router.get('/events/:eventId/registrations/export-csv', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  const headers = buildExpectedHeaders(fields);
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC')
    .all(event.id);

  const escapeCsv = (val) => {
    const str = val === undefined || val === null ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeCsv).join(',')];
  for (const reg of rows) {
    const answers = JSON.parse(reg.answers_json || '{}');
    const rowMap = {
      '報名序號': reg.reg_code,
      '報名類型': reg.reg_type === 'group' ? '團體報名' : reg.bundle_code ? '多場聯合報名' : '個人報名',
      '團體名稱': reg.group_name || '',
      '團報代碼': reg.group_code || '',
      '團報角色': reg.group_role === 'leader' ? '團長' : reg.group_role === 'member' ? '組員' : '',
      '合併單號': reg.bundle_code || '',
      '參賽編號': reg.bib_number || '',
      '分組代碼': reg.category_code || '',
      '報名時間': reg.created_at,
      '應繳總金額': reg.total_amount,
      '匯款方式': reg.payment_mode === 'group' ? '團體匯款' : reg.payment_mode === 'bundle' ? '合併匯款' : '個別匯款',
      '匯款後五碼': reg.remittance_last5 || '',
      '繳費狀態': reg.payment_status,
    };
    for (const f of fields) {
      if (f.type === 'calculated') continue;
      const val = answers[f.id];
      rowMap[String(f.label || f.id).trim()] = Array.isArray(val) ? val.join('、') : val ?? '';
    }
    lines.push(headers.map((h) => escapeCsv(rowMap[h])).join(','));
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.name}-報名名單.csv`)}`
  );
  return res.send(csvContent);
});

// GET /api/admin/events/:eventId/registrations/export-excel — 匯出報名選手資料 Excel (.xlsx)
router.get('/events/:eventId/registrations/export-excel', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  const headers = buildExpectedHeaders(fields);
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC')
    .all(event.id);

  const dataRows = rows.map((reg) => {
    const answers = JSON.parse(reg.answers_json || '{}');
    const rowMap = {
      '報名序號': reg.reg_code,
      '報名類型': reg.reg_type === 'group' ? '團體報名' : reg.bundle_code ? '多場聯合報名' : '個人報名',
      '團體名稱': reg.group_name || '',
      '團報代碼': reg.group_code || '',
      '團報角色': reg.group_role === 'leader' ? '團長' : reg.group_role === 'member' ? '組員' : '',
      '合併單號': reg.bundle_code || '',
      '參賽編號': reg.bib_number || '',
      '分組代碼': reg.category_code || '',
      '報名時間': reg.created_at,
      '應繳總金額': Number(reg.total_amount || 0),
      '匯款方式': reg.payment_mode === 'group' ? '團體匯款' : reg.payment_mode === 'bundle' ? '合併匯款' : '個別匯款',
      '匯款後五碼': reg.remittance_last5 || '',
      '繳費狀態': reg.payment_status,
    };
    for (const f of fields) {
      if (f.type === 'calculated') continue;
      const val = answers[f.id];
      rowMap[String(f.label || f.id).trim()] = Array.isArray(val) ? val.join('、') : val ?? '';
    }
    return headers.map((h) => (rowMap[h] !== undefined ? rowMap[h] : ''));
  });

  const buffer = buildExcelWorkbookBuffer({
    sheetName: event.name || '報名選手資料',
    headers,
    rows: dataRows,
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.name}-報名選手資料.xlsx`)}`
  );
  return res.send(buffer);
});

// PATCH /api/admin/registrations/:id/bib — 手動修改參賽編號（號碼布）與晶片分組代碼
router.patch('/registrations/:id/bib', async (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, reg.event_id);
  if (!event) return;

  const bib = String(req.body?.bib_number ?? reg.bib_number ?? '').trim().toUpperCase();
  const cat = String(req.body?.category_code ?? reg.category_code ?? '').trim();

  if (bib) {
    const dup = db
      .prepare('SELECT id, runner_name FROM registrations WHERE event_id = ? AND bib_number = ? AND id != ?')
      .get(reg.event_id, bib, id);
    if (dup) {
      return res.status(409).json({
        error: `參賽編號「${bib}」已分配給 ${dup.runner_name}，請使用其他編號。`,
      });
    }
  }

  db.prepare('UPDATE registrations SET bib_number = ?, category_code = ? WHERE id = ?').run(bib, cat, id);
  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

  await syncRegistrationToCloud(updated);
  await updateBibInSheet(event, updated.reg_code, bib, cat).catch(() => {});

  return res.json({
    registration: formatRegistrationRow(updated),
    message: bib ? `已更新參賽編號為 ${bib}` : '已清除參賽編號',
  });
});

// POST /api/admin/events/:eventId/registrations/auto-assign-bibs — 依報名組別一鍵自動配號
router.post('/events/:eventId/registrations/auto-assign-bibs', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  const paidOnly = Boolean(req.body?.paidOnly);
  const overwrite = Boolean(req.body?.overwrite);

  const result = autoAssignBibNumbers(db, event, fields, { paidOnly, overwrite });
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(event.id);

  if (result.assignedCount > 0) {
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    ...result,
    registrations: rows.map(formatRegistrationRow),
    message:
      result.assignedCount > 0
        ? `自動配號完成！本次共為 ${result.assignedCount} 位跑者分配專屬參賽編號（Bib）。`
        : '所有符合條件的跑者皆已有參賽編號，無需重複分配。',
  });
});

// GET /api/admin/events/:eventId/registrations/export-chip-csv — 匯出晶片系統專用名單 CSV
router.get('/events/:eventId/registrations/export-chip-csv', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  const csvContent = buildChipImportCsv(event, fields, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.timing_event_id || event.slug}-TUR晶片系統匯入名單.csv`)}`
  );
  return res.send(csvContent);
});

// GET /api/admin/events/:eventId/registrations/chip-preview
router.get('/events/:eventId/registrations/chip-preview', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  return res.json({
    eventId: event.timing_event_id || event.slug,
    count: rows.length,
    registrations: rows.map((r) => toChipTimingRegistration(event, fields, r)),
  });
});

// POST /api/admin/events/:eventId/registrations/push-to-chip
router.post('/events/:eventId/registrations/push-to-chip', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = req.body?.paidOnly !== false;
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  try {
    const result = await pushRosterToChipSystem(event, fields, rows, {
      gasUrl: req.body?.timing_gas_url || event.timing_gas_url,
      username: req.body?.chip_admin_username,
      password: req.body?.chip_admin_password,
    });
    return res.json({
      ...result,
      message: `已成功將 ${result.pushedCount} 位跑者名單推送至晶片計時系統！`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
