import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { permissionMatches } from '../../shared/rbacPermissions.js';

export function useAdminPermission(required = '') {
  const { permissions, hasPermission } = useAuth();
  const allowed = useMemo(
    () => (required ? hasPermission(required) : true),
    [required, hasPermission, permissions],
  );
  return allowed;
}

export function useAdminPermissions() {
  const { permissions, hasPermission, refreshPermissions } = useAuth();
  const can = useCallback(
    (key) => hasPermission(key),
    [hasPermission, permissions],
  );
  return { permissions, hasPermission: can, refreshPermissions };
}

export { permissionMatches };
