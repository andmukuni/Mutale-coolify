/**
 * Seed admin RBAC permissions, default roles, and assign Super Admin to all users with role=admin.
 *
 * Usage: node server/scripts/seed-rbac.js
 *        npm run seed:rbac
 */
import pool from '../db.js';
import { seedRbac, listRolesWithPermissions } from '../rbacService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const force = process.argv.includes('--force');
  console.log('[rbac] Seeding permissions and roles…');
  await seedRbac(pool, { forcePermissions: force });
  const roles = await listRolesWithPermissions(pool);
  console.log(`[rbac] Done. ${roles.length} roles configured.`);
  for (const role of roles) {
    console.log(`  - ${role.name} (${role.slug}): ${role.permissions.length} permissions`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[rbac] Seed failed:', err.message);
  process.exit(1);
});
