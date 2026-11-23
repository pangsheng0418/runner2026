const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  syncAdminToCloud,
  deleteAdminFromCloud,
  syncEventToCloud,
} = require('../services/cloudStore');

const router = express.Router();
router.use(requireAdminAuth);

/**
 * 嚴格驗證必須為最高權限承辦人（super_admin），直接查表確保權限變更即時生效
 */
function requireSuperAdmin(req, res, next) {
  const me = db.prepare('SELECT id, username, display_name, role FROM admins WHERE id = ?').get(req.admin.id);
  if (!me || me.role !== 'super_admin') {
    return res.status(403).json({
      error: '權限不足：僅最高權限承辦人（系統總管）可檢視與修改所有承辦人權限資料。',
      code: 'SUPER_ADMIN_REQUIRED',
    });
  }
  req.adminRecord = me;
  return next();
}

router.use(requireSuperAdmin);

function formatAdminUser(row) {
  const stats = db
    .prepare('SELECT COUNT(*) as event_count FROM events WHERE owner_admin_id = ?')
    .get(row.id);
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role || 'organizer',
    event_count: stats?.event_count || 0,
    created_at: row.created_at,
  };
}

// GET /api/admin/users — 取得所有承辦人帳號與權限清單
router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id, username, display_name, role, created_at FROM admins ORDER BY id ASC')
    .all();
  return res.json({
    users: rows.map(formatAdminUser),
  });
});

// POST /api/admin/users — 最高權限直接建立新承辦人帳號
router.post('/', async (req, res) => {
  const { username, password, display_name, role } = req.body || {};
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanName = String(display_name || '').trim();
  const cleanPass = String(password || '');
  const nextRole = role === 'super_admin' ? 'super_admin' : 'organizer';

  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUser)) {
    return res.status(400).json({ error: '帳號需為 3~32 碼英文小寫、數字或 ._- 符號。' });
  }
  if (cleanPass.length < 6) {
    return res.status(400).json({ error: '密碼長度至少需 6 個字元。' });
  }
  if (!cleanName) {
    return res.status(400).json({ error: '請填寫承辦單位或承辦人顯示名稱。' });
  }

  const dup = db.prepare('SELECT id FROM admins WHERE lower(username) = ?').get(cleanUser);
  if (dup) {
    return res.status(409).json({ error: `帳號「${cleanUser}」已存在，請使用其他帳號。` });
  }

  const hash = bcrypt.hashSync(cleanPass, 10);
  const info = db
    .prepare('INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run(cleanUser, hash, cleanName, nextRole);

  const created = db.prepare('SELECT * FROM admins WHERE id = ?').get(info.lastInsertRowid);
  try {
    await syncAdminToCloud(created);
  } catch (err) {
    db.prepare('DELETE FROM admins WHERE id = ?').run(created.id);
    return res.status(503).json({ error: `同步承辦人至雲端資料庫失敗：${err.message}` });
  }

  return res.status(201).json({
    user: formatAdminUser(created),
    message: `已建立承辦人帳號「${cleanName}（${cleanUser}）」。`,
  });
});

// PATCH /api/admin/users/:id — 修改承辦人顯示名稱、權限角色或重設密碼
router.patch('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ error: '找不到指定的承辦人帳號。' });
  }

  const body = req.body || {};
  const nextDisplayName =
    body.display_name !== undefined ? String(body.display_name).trim() : target.display_name;
  if (!nextDisplayName) {
    return res.status(400).json({ error: '承辦人顯示名稱不可為空。' });
  }

  const nextRole =
    body.role !== undefined
      ? body.role === 'super_admin'
        ? 'super_admin'
        : 'organizer'
      : target.role || 'organizer';

  // 防呆：不可將全系統最後一位最高權限承辦人降級
  if (target.role === 'super_admin' && nextRole !== 'super_admin') {
    const superCount = db
      .prepare("SELECT COUNT(*) as cnt FROM admins WHERE role = 'super_admin'")
      .get();
    if ((superCount?.cnt || 0) <= 1) {
      return res.status(400).json({
        error: '系統至少必須保留一位最高權限承辦人，無法將最後一位總管降級。',
      });
    }
  }

  let nextHash = target.password_hash;
  if (body.password !== undefined && String(body.password).length > 0) {
    if (String(body.password).length < 6) {
      return res.status(400).json({ error: '新密碼長度至少需 6 個字元。' });
    }
    nextHash = bcrypt.hashSync(String(body.password), 10);
  }

  db.prepare('UPDATE admins SET display_name = ?, role = ?, password_hash = ? WHERE id = ?').run(
    nextDisplayName,
    nextRole,
    nextHash,
    targetId
  );

  // 若承辦人顯示名稱有變更，同步更新其名下活動的顯示主辦名稱
  if (nextDisplayName !== target.display_name) {
    db.prepare('UPDATE events SET owner_display_name = ? WHERE owner_admin_id = ?').run(
      nextDisplayName,
      targetId
    );
    const ownedEvents = db.prepare('SELECT * FROM events WHERE owner_admin_id = ?').all(targetId);
    for (const ev of ownedEvents) {
      await syncEventToCloud(ev).catch(() => {});
    }
  }

  const updated = db.prepare('SELECT * FROM admins WHERE id = ?').get(targetId);
  try {
    await syncAdminToCloud(updated);
  } catch (err) {
    return res.status(503).json({ error: `同步權限異動至雲端資料庫失敗：${err.message}` });
  }

  return res.json({
    user: formatAdminUser(updated),
    message: `已更新「${updated.display_name}（${updated.username}）」的權限資料！`,
  });
});

// DELETE /api/admin/users/:id — 刪除承辦人帳號（名下活動自動移交給目前操作的最高權限承辦人）
router.delete('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === Number(req.adminRecord.id)) {
    return res.status(400).json({ error: '不可刪除目前正在登入中的最高權限帳號。' });
  }

  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ error: '找不到指定的承辦人帳號。' });
  }

  if (target.role === 'super_admin') {
    const superCount = db
      .prepare("SELECT COUNT(*) as cnt FROM admins WHERE role = 'super_admin'")
      .get();
    if ((superCount?.cnt || 0) <= 1) {
      return res.status(400).json({ error: '無法刪除系統最後一位最高權限承辦人。' });
    }
  }

  // 若該承辦人名下仍有活動，安全移轉給執行刪除的最高權限承辦人，避免活動變成孤兒資料
  const ownedEvents = db.prepare('SELECT * FROM events WHERE owner_admin_id = ?').all(targetId);
  if (ownedEvents.length > 0) {
    db.prepare(
      'UPDATE events SET owner_admin_id = ?, owner_username = ?, owner_display_name = ? WHERE owner_admin_id = ?'
    ).run(req.adminRecord.id, req.adminRecord.username, req.adminRecord.display_name, targetId);
    const transferred = db
      .prepare('SELECT * FROM events WHERE owner_admin_id = ?')
      .all(req.adminRecord.id);
    for (const ev of transferred) {
      await syncEventToCloud(ev).catch(() => {});
    }
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(targetId);
  await deleteAdminFromCloud(targetId);

  return res.json({
    message:
      ownedEvents.length > 0
        ? `已刪除帳號「${target.username}」，其名下 ${ownedEvents.length} 場活動已自動移交給您保管。`
        : `已刪除承辦人帳號「${target.username}」。`,
  });
});

module.exports = router;
