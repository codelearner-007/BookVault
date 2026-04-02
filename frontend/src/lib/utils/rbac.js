export function hasPermission(userPermissions, required) {
  return userPermissions.includes(required);
}

export function hasAnyPermission(userPermissions, required) {
  return required.some(perm => userPermissions.includes(perm));
}

export function hasAllPermissions(userPermissions, required) {
  return required.every(perm => userPermissions.includes(perm));
}

export function checkHierarchy(userLevel, requiredLevel) {
  return userLevel >= requiredLevel;
}
