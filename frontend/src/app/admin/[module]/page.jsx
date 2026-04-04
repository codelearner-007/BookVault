import { notFound, redirect } from 'next/navigation';
import AdminRBACPage from '@/components/admin/modules/rbac/AdminRBACPage';
import AdminAuditPage from '@/components/admin/modules/audit/AdminAuditPage';
import { canAccessAdminModule, SUPER_ADMIN_ONLY_MODULES } from '@/lib/rbac/access';
import { getMe, getUserClaims } from '@/lib/server/me';
import AccessDenied from '@/components/common/AccessDenied';

export const dynamic = 'force-dynamic';

const MODULE_COMPONENTS = {
  rbac: AdminRBACPage,
  audit: AdminAuditPage,
};

export default async function AdminModulePage({ params }) {
  const { module } = await params;

  // Defense-in-depth: super_admin-only modules are not accessible via /admin/*
  if (SUPER_ADMIN_ONLY_MODULES.includes(module)) {
    redirect(`/super-admin/${module}`);
  }

  const Component = MODULE_COMPONENTS[module];

  if (!Component) {
    notFound();
  }

  const user = await getMe();
  if (!user) {
    redirect('/auth/login?returnTo=/admin');
  }

  const claims = getUserClaims(user);
  if (!canAccessAdminModule(claims, module)) {
    return (
      <AccessDenied
        message={`You do not have permission to access the ${module} module.`}
        returnTo="/admin"
        returnLabel="Back to Admin"
      />
    );
  }

  return <Component />;
}
