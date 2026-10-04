import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  isFullAdminAccess,
  permissionMatches,
} from '../../shared/rbacPermissions.js';

describe('RBAC permission helpers', () => {
  it('lets settings admins open notification templates', () => {
    expect(permissionMatches(['settings.manage'], 'templates.manage')).toBe(true);
    expect(permissionMatches(['events.view'], 'templates.manage')).toBe(false);
  });

  it('treats legacy admin and Super Admin role as full access', () => {
    expect(isFullAdminAccess({ role: 'admin' })).toBe(true);
    expect(isFullAdminAccess({ role: 'user', roles: [{ slug: 'super_admin' }] })).toBe(true);
    expect(isFullAdminAccess({ role: 'user', roles: [{ slug: 'content_manager' }] })).toBe(false);
  });

  it('includes templates.manage in the current catalog', () => {
    expect(ALL_PERMISSION_KEYS).toContain('templates.manage');
  });

  it('includes campaign permissions and lets events.manage edit but not send', () => {
    expect(ALL_PERMISSION_KEYS).toContain('campaigns.view');
    expect(ALL_PERMISSION_KEYS).toContain('campaigns.manage');
    expect(ALL_PERMISSION_KEYS).toContain('campaigns.send');
    expect(permissionMatches(['events.manage'], 'campaigns.view')).toBe(true);
    expect(permissionMatches(['events.manage'], 'campaigns.manage')).toBe(true);
    expect(permissionMatches(['events.manage'], 'campaigns.send')).toBe(false);
    expect(permissionMatches(['campaigns.send'], 'campaigns.view')).toBe(true);
    expect(permissionMatches(['campaigns.view'], 'campaigns.send')).toBe(false);
  });
});
