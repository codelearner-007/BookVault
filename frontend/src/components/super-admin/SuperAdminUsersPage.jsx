'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  listRoles,
  getUserStats,
  listUsersWithRoles,
  banUser,
  unbanUser,
  deleteUser,
  resendVerificationEmail,
  sendPasswordResetEmail,
  assignRoleToUser,
  removeRoleFromUser,
} from '@/lib/services/rbac.service';
import { UserStatsCards } from '@/components/admin/modules/users/UserStatsCards';
import { UserFiltersPanel } from '@/components/admin/modules/users/UserFilters';
import { UserTable } from '@/components/admin/modules/users/UserTable';
import { UserActionDialogs } from '@/components/admin/modules/users/UserActionDialogs';

function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function SuperAdminUsersPage() {
  // Core data state
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [stats, setStats] = useState(null);

  // Pagination state
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter state
  const [filters, setFilters] = useState({ page: 1, page_size: 20 });
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  // Dialog state
  const [assignRoleDialog, setAssignRoleDialog] = useState({ user: null, roleId: '' });
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [banDialog, setBanDialog] = useState(null);

  // Super admin always has all permissions
  const canAssignRoles = true;
  const canUpdateAll = true;
  const canDeleteAll = true;
  const hasAnyAction = true;

  // Helper: check if user is superadmin (protect super_admin accounts from action)
  const isSuperAdmin = useCallback((user) => {
    return user.roles.some((role) => role.role.name === 'super_admin');
  }, []);

  // Sync debounced search into filters
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      search: debouncedSearch || undefined,
      page: 1,
    }));
  }, [debouncedSearch]);

  // Load stats
  useEffect(() => {
    async function loadStats() {
      try {
        setLoadingStats(true);
        const data = await getUserStats();
        setStats(data);
      } catch (err) {
        toast.error('Failed to load user statistics');
        console.error('Failed to load stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }
    loadStats();
  }, []);

  // Load roles (include all roles for super admin)
  useEffect(() => {
    async function loadRoles() {
      try {
        setLoadingRoles(true);
        const data = await listRoles();
        setRoles(data);
      } catch (err) {
        toast.error('Failed to load roles');
        console.error('Failed to load roles:', err);
      } finally {
        setLoadingRoles(false);
      }
    }
    loadRoles();
  }, []);

  // Load users
  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        setError(null);
        const response = await listUsersWithRoles(filters);
        setUsers(response.items);
        setTotalPages(response.total_pages);
        setTotal(response.total);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load users';
        setError(message);
        toast.error('Failed to load users', { description: 'Please try again.' });
        console.error('Error loading users:', err);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [filters]);

  // Filter handlers
  const handleFilterChange = useCallback((key, value) => {
    if (key === 'search') {
      setSearchQuery(value || '');
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [key]: value === '' || value === 'all' ? undefined : value,
      page: 1,
    }));
  }, []);

  const handleRemoveFilter = useCallback((key) => {
    if (key === 'search') {
      setSearchQuery('');
      return;
    }
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return { ...next, page: 1 };
    });
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilters((prev) => ({ page: 1, page_size: prev.page_size }));
  }, []);

  const setPage = useCallback((page) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const reloadUsers = useCallback(() => {
    setFilters((prev) => ({ ...prev }));
  }, []);

  // Computed active filters
  const activeFilters = [
    ...Object.entries(filters).filter(
      ([key, value]) =>
        value !== undefined &&
        key !== 'page' &&
        key !== 'page_size' &&
        key !== 'search' &&
        value !== ''
    ),
    ...(searchQuery ? [['search', searchQuery]] : []),
  ];
  const hasActiveFilters = activeFilters.length > 0;

  // Action handlers
  const handleBanUser = useCallback(
    async (user) => {
      try {
        setActionLoading(user.id);
        await banUser(user.id);
        toast.success('User banned', { description: `${user.email} has been banned.` });
        reloadUsers();
        setBanDialog(null);
      } catch (err) {
        toast.error('Failed to ban user', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [reloadUsers]
  );

  const handleUnbanUser = useCallback(
    async (user) => {
      try {
        setActionLoading(user.id);
        await unbanUser(user.id);
        toast.success('User unbanned', { description: `${user.email} has been unbanned.` });
        reloadUsers();
      } catch (err) {
        toast.error('Failed to unban user', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [reloadUsers]
  );

  const handleDeleteUser = useCallback(
    async (user) => {
      try {
        setActionLoading(user.id);
        await deleteUser(user.id);
        toast.success('User deleted', {
          description: `${user.email} has been deleted permanently.`,
        });
        reloadUsers();
        setDeleteDialog(null);
      } catch (err) {
        toast.error('Failed to delete user', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [reloadUsers]
  );

  const handleResendVerification = useCallback(async (user) => {
    try {
      setActionLoading(user.id);
      await resendVerificationEmail(user.id);
      toast.success('Verification email sent', { description: `Sent to ${user.email}` });
    } catch (err) {
      toast.error('Failed to send verification email', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleResetPassword = useCallback(async (user) => {
    try {
      setActionLoading(user.id);
      await sendPasswordResetEmail(user.id);
      toast.success('Password reset email sent', { description: `Sent to ${user.email}` });
    } catch (err) {
      toast.error('Failed to send password reset email', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleAssignRole = useCallback(async () => {
    if (!assignRoleDialog.user || !assignRoleDialog.roleId) return;
    try {
      setActionLoading(assignRoleDialog.user.id);
      await assignRoleToUser(assignRoleDialog.user.id, assignRoleDialog.roleId);
      toast.success('Role assigned', { description: 'Role assigned successfully.' });
      reloadUsers();
      setAssignRoleDialog({ user: null, roleId: '' });
    } catch (err) {
      toast.error('Failed to assign role', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActionLoading(null);
    }
  }, [assignRoleDialog, reloadUsers]);

  const handleRemoveRole = useCallback(
    async (user, roleId) => {
      try {
        setActionLoading(user.id);
        await removeRoleFromUser(user.id, roleId);
        toast.success('Role removed', { description: 'Role removed successfully.' });
        reloadUsers();
      } catch (err) {
        toast.error('Failed to remove role', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [reloadUsers]
  );

  return (
    <div className="space-y-8 max-w-[1600px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manage Admins</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage all users and their roles.
        </p>
      </div>

      {/* Stats */}
      <UserStatsCards stats={stats} loading={loadingStats} />

      {/* Filters */}
      <UserFiltersPanel
        filters={filters}
        searchQuery={searchQuery}
        roles={roles}
        loadingRoles={loadingRoles}
        activeFilters={activeFilters}
        hasActiveFilters={hasActiveFilters}
        onFilterChange={handleFilterChange}
        onRemoveFilter={handleRemoveFilter}
        onClearAllFilters={handleClearAllFilters}
      />

      {/* Users Table */}
      <UserTable
        users={users}
        filters={filters}
        total={total}
        totalPages={totalPages}
        loading={loading}
        error={error}
        actionLoading={actionLoading}
        hasActiveFilters={hasActiveFilters}
        hasAnyAction={hasAnyAction}
        canAssignRoles={canAssignRoles}
        canUpdateAll={canUpdateAll}
        canDeleteAll={canDeleteAll}
        isSuperAdmin={isSuperAdmin}
        onSetPage={setPage}
        onBanUser={(user) => setBanDialog(user)}
        onUnbanUser={handleUnbanUser}
        onDeleteUser={(user) => setDeleteDialog(user)}
        onResendVerification={handleResendVerification}
        onResetPassword={handleResetPassword}
        onAssignRole={(user) => setAssignRoleDialog({ user, roleId: '' })}
        onRemoveRole={handleRemoveRole}
      />

      {/* Action Dialogs */}
      <UserActionDialogs
        assignRoleDialog={assignRoleDialog}
        onAssignRoleDialogChange={setAssignRoleDialog}
        onAssignRole={handleAssignRole}
        roles={roles}
        banDialog={banDialog}
        onBanDialogChange={setBanDialog}
        onBanUser={handleBanUser}
        deleteDialog={deleteDialog}
        onDeleteDialogChange={setDeleteDialog}
        onDeleteUser={handleDeleteUser}
        actionLoading={actionLoading}
      />
    </div>
  );
}
