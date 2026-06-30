import { extractSocialProfileHints } from './social-profile.util';

describe('extractSocialProfileHints', () => {
  it('reads Google-style name and picture claims', () => {
    expect(
      extractSocialProfileHints({
        name: 'Jane Doe',
        picture: 'https://lh3.googleusercontent.com/a/avatar',
      }),
    ).toEqual({
      fullName: 'Jane Doe',
      avatarUrl: 'https://lh3.googleusercontent.com/a/avatar',
    });
  });

  it('builds full name from given_name and family_name', () => {
    expect(
      extractSocialProfileHints({
        given_name: 'Jane',
        family_name: 'Doe',
      }),
    ).toEqual({
      fullName: 'Jane Doe',
    });
  });

  it('prefers client overrides for Apple first-time sign-in', () => {
    expect(
      extractSocialProfileHints(
        { email: 'hidden@privaterelay.appleid.com' },
        { fullName: 'Jane Doe' },
      ),
    ).toEqual({
      fullName: 'Jane Doe',
    });
  });
});
