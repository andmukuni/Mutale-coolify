import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  DEFAULT_ADMIN_ROLES,
  RBAC_SUPER_ADMIN_SLUG,
  permissionMatches,
} from '../shared/rbacPermissions.js';

export {
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  RBAC_SUPER_ADMIN_SLUG,
  permissionMatches,
};

export async function ensureRbacTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      id VARCHAR(90) PRIMARY KEY,
      perm_key VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      perm_group VARCHAR(60) DEFAULT 'General',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id VARCHAR(90) PRIMARY KEY,
      slug VARCHAR(60) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      is_system TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_role_permissions (
      role_id VARCHAR(90) NOT NULL,
      permission_key VARCHAR(80) NOT NULL,
      PRIMARY KEY (role_id, permission_key),
      INDEX idx_admin_role_permissions_perm (permission_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_admin_roles (
      user_id VARCHAR(90) NOT NULL,
      role_id VARCHAR(90) NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_id),
      INDEX idx_user_admin_roles_role (role_id)
    )
  `);
}

function generateRbacId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function seedRbac(pool, { forcePermissions = false } = {}) {
  await ensureRbacTables(pool);

  for (const perm of ADMIN_PERMISSIONS) {
    await pool.query(
      `INSERT INTO admin_permissions (id, perm_key, name, perm_group, description)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), perm_group = VALUES(perm_group)`,
      [generateRbacId('perm'), perm.key, perm.name, perm.group || 'General', perm.description || ''],
    );
  }

  for (const roleDef of DEFAULT_ADMIN_ROLES) {
    const roleId = generateRbacId('role');
    await pool.query(
      `INSERT INTO admin_roles (id, slug, name, description, is_system)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = VALUES(is_system)`,
      [roleId, roleDef.slug, roleDef.name, roleDef.description || '', roleDef.is_system ? 1 : 0],
    );

    const [[roleRow]] = await pool.query('SELECT id FROM admin_roles WHERE slug = ? LIMIT 1', [roleDef.slug]);
    if (!roleRow?.id) continue;

    if (forcePermissions) {
      await pool.query('DELETE FROM admin_role_permissions WHERE role_id = ?', [roleRow.id]);
    }

    for (const permKey of roleDef.permissions) {
      await pool.query(
        `INSERT IGNORE INTO admin_role_permissions (role_id, permission_key) VALUES (?, ?)`,
        [roleRow.id, permKey],
      );
    }
  }

  const [[superRole]] = await pool.query(
    'SELECT id FROM admin_roles WHERE slug = ? LIMIT 1',
    [RBAC_SUPER_ADMIN_SLUG],
  );
  if (superRole?.id) {
    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await pool.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [admin.id, superRole.id],
      );
    }
  }

  return { ok: true };
}

export async function loadUserAdminPermissions(pool, userId, { legacyRole = '' } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const [rows] = await pool.query(
    `SELECT DISTINCT arp.permission_key
     FROM user_admin_roles uar
     INNER JOIN admin_role_permissions arp ON arp.role_id = uar.role_id
     WHERE uar.user_id = ?`,
    [uid],
  );

  const keys = rows.map((r) => String(r.permission_key || '').trim()).filter(Boolean);

  if (keys.length === 0 && String(legacyRole || '').toLowerCase() === 'admin') {
    return [...ALL_PERMISSION_KEYS];
  }

  return keys;
}

export async function loadUserAdminRoles(pool, userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.slug, r.name, r.description, r.is_system
     FROM user_admin_roles uar
     INNER JOIN admin_roles r ON r.id = uar.role_id
     WHERE uar.user_id = ?
     ORDER BY r.name ASC`,
    [userId],
  );
  return rows;
}

/** @returns {Map<string, Array<{ id: string, slug: string, name: string, description: string, is_system: number }>>} */
export async function loadAdminRolesByUserIds(pool, userIds = []) {
  const ids = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT uar.user_id, r.id, r.slug, r.name, r.description, r.is_system
     FROM user_admin_roles uar
     INNER JOIN admin_roles r ON r.id = uar.role_id
     WHERE uar.user_id IN (${placeholders})
     ORDER BY r.name ASC`,
    ids,
  );

  for (const row of rows) {
    const uid = String(row.user_id || '');
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid).push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      is_system: row.is_system,
    });
  }
  return map;
}

export function userCanAccessAdmin(legacyRole, permissions = []) {
  if (String(legacyRole || '').toLowerCase() === 'admin') return true;
  return Array.isArray(permissions) && permissions.length > 0;
}

export function resolveRouteAdminPermission(req) {
  const path = String(req.path || '');
  const method = String(req.method || '').toUpperCase();

  if (path.startsWith('/api/admin/rbac')) return 'rbac.manage';

  if (path.startsWith('/api/settings/')) return 'settings.manage';
  if (path.startsWith('/api/finance/')) return method === 'GET' ? 'finance.view' : 'finance.payouts';
  if (path === '/api/payments/lenco/dashboard') return 'finance.view';
  if (path.startsWith('/api/payments/lenco/')) return 'finance.payouts';
  if (path === '/api/admin/receipts') return 'receipts.view';
  if (path === '/api/account/receipts') return null;
  if (path.startsWith('/api/receipts/')) return 'receipts.view';
  if (path.startsWith('/api/admin/cv')) return 'cv.view';
  if (path.startsWith('/api/cv/') && method !== 'GET') return 'cv.view';
  if (path.startsWith('/api/contact-messages')) return 'messages.view';
  if (path.startsWith('/api/users')) return method === 'GET' ? 'users.view' : 'users.manage';
  if (path.startsWith('/api/registrations')) return method === 'GET' ? 'events.view' : 'events.manage';
  if (path.startsWith('/api/events')) return method === 'GET' ? 'events.view' : 'events.manage';
  if (path.startsWith('/api/blog')) return method === 'GET' ? 'blog.view' : 'blog.manage';
  if (path.startsWith('/api/publications')) return method === 'GET' ? 'publications.view' : 'publications.manage';
  if (path.startsWith('/api/books/orders')) return 'shop.orders';
  if (path.startsWith('/api/books')) return method === 'GET' ? 'shop.view' : 'shop.manage';
  if (path.startsWith('/api/product-types')) return 'shop.manage';
  if (path.startsWith('/api/shipping/')) return 'shop.manage';
  if (path.startsWith('/api/website-pages')) return 'website.manage';
  if (path.startsWith('/api/partner-logos')) return 'website.manage';
  if (path.startsWith('/api/menu-items')) return 'website.manage';
  if (path.startsWith('/api/event-coupons') || path.includes('/coupons')) return 'coupons.manage';
  if (path.startsWith('/api/certificates') || path.includes('/certificate')) return 'certificates.manage';
  if (path === '/api/db-test' || path === '/api/notifications/test') return 'settings.manage';

  return 'dashboard.view';
}

export async function listRolesWithPermissions(pool) {
  const [roles] = await pool.query('SELECT * FROM admin_roles ORDER BY name ASC');
  const [permRows] = await pool.query('SELECT role_id, permission_key FROM admin_role_permissions');
  const permMap = new Map();
  for (const row of permRows) {
    const list = permMap.get(row.role_id) || [];
    list.push(row.permission_key);
    permMap.set(row.role_id, list);
  }
  return roles.map((role) => ({
    ...role,
    is_system: Boolean(role.is_system),
    permissions: permMap.get(role.id) || [],
  }));
}

export async function getRoleById(pool, roleId) {
  const [[role]] = await pool.query('SELECT * FROM admin_roles WHERE id = ?', [roleId]);
  if (!role) return null;
  const [permRows] = await pool.query(
    'SELECT permission_key FROM admin_role_permissions WHERE role_id = ?',
    [roleId],
  );
  return {
    ...role,
    is_system: Boolean(role.is_system),
    permissions: permRows.map((r) => r.permission_key),
  };
}

export async function setRolePermissions(pool, roleId, permissionKeys = []) {
  const keys = [...new Set(permissionKeys.map((k) => String(k).trim()).filter(Boolean))];
  await pool.query('DELETE FROM admin_role_permissions WHERE role_id = ?', [roleId]);
  for (const key of keys) {
    await pool.query(
      'INSERT INTO admin_role_permissions (role_id, permission_key) VALUES (?, ?)',
      [roleId, key],
    );
  }
}

export async function setUserAdminRoles(pool, userId, roleIds = []) {
  const ids = [...new Set(roleIds.map((id) => String(id).trim()).filter(Boolean))];
  await pool.query('DELETE FROM user_admin_roles WHERE user_id = ?', [userId]);
  for (const roleId of ids) {
    await pool.query(
      'INSERT INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleId],
    );
  }
}
