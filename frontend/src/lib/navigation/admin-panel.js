// The Admin Panel: the super admin's one extra tab inside the shared /admin interface.
export const ADMIN_PANEL_PATH = '/admin/panel';

export function isAdminPanelPath(pathname) {
  return pathname === ADMIN_PANEL_PATH || pathname.startsWith(`${ADMIN_PANEL_PATH}/`);
}
