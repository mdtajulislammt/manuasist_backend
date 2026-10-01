export type SocialProfileHints = {
  fullName?: string;
  avatarUrl?: string;
};

export function extractSocialProfileHints(
  claims: Record<string, unknown>,
  overrides?: SocialProfileHints,
): SocialProfileHints {
  const overrideName = overrides?.fullName?.trim();
  const overrideAvatar = overrides?.avatarUrl?.trim();

  let fullName = overrideName;
  if (!fullName) {
    if (typeof claims.name === 'string' && claims.name.trim()) {
      fullName = claims.name.trim();
    } else {
      const parts = [claims.given_name, claims.family_name].filter(
        (part): part is string =>
          typeof part === 'string' && part.trim().length > 0,
      );
      if (parts.length > 0) {
        fullName = parts.map((part) => part.trim()).join(' ');
      }
    }
  }

  let avatarUrl = overrideAvatar;
  if (
    !avatarUrl &&
    typeof claims.picture === 'string' &&
    claims.picture.trim()
  ) {
    avatarUrl = claims.picture.trim();
  }

  return {
    ...(fullName ? { fullName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}
