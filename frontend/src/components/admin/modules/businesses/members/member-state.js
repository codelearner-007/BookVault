import { ACCESS_MODE_FULL } from '@/lib/constants/access-rights';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';

const MEMBER_STATUS_DISABLED = 'disabled';

// A member is shown as disabled when the account is disabled (banned) or the membership is.
export function accountDisabled(member, bannedUserIds) {
  return bannedUserIds.has(member.user_id) || member.status === MEMBER_STATUS_DISABLED;
}

export function accessLabel(member) {
  return member.is_owner || member.access_mode === ACCESS_MODE_FULL ? COPY.access.full : COPY.access.custom;
}
