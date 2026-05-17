import { StoredFileNamespace } from '../../generated/prisma/client';

export const FILE_NAMESPACE = {
  ONBOARDING_ICON: StoredFileNamespace.ONBOARDING_ICON,
  MENU_SCAN: StoredFileNamespace.MENU_SCAN,
  USER_AVATAR: StoredFileNamespace.USER_AVATAR,
  GENERIC: StoredFileNamespace.GENERIC,
} as const;

/** Legacy/local disk folder names (existing VPS uploads). */
export const NAMESPACE_LOCAL_DIR: Record<StoredFileNamespace, string> = {
  [StoredFileNamespace.ONBOARDING_ICON]: 'onboarding-icons',
  [StoredFileNamespace.MENU_SCAN]: 'menu-scan',
  [StoredFileNamespace.USER_AVATAR]: 'user-avatar',
  [StoredFileNamespace.GENERIC]: 'generic',
};

export type NamespacePolicy = {
  maxBytes: number;
  allowedMime: Set<string>;
  publicPath: string;
};

export const NAMESPACE_POLICIES: Record<StoredFileNamespace, NamespacePolicy> = {
  [StoredFileNamespace.ONBOARDING_ICON]: {
    maxBytes: 5 * 1024 * 1024,
    allowedMime: new Set([
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ]),
    publicPath: '/onboarding/icons',
  },
  [StoredFileNamespace.MENU_SCAN]: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
    publicPath: '/files/menu-scan',
  },
  [StoredFileNamespace.USER_AVATAR]: {
    maxBytes: 2 * 1024 * 1024,
    allowedMime: new Set(['image/png', 'image/jpeg', 'image/webp']),
    publicPath: '/files/user-avatar',
  },
  [StoredFileNamespace.GENERIC]: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: new Set(['application/octet-stream']),
    publicPath: '/files/generic',
  },
};

export const UUID_STORED_NAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z0-9]+)$/i;
