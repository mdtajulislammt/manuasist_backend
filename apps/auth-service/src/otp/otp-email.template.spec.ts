import type { AuthOtpEmailPurpose } from './auth-otp.constants';
import { buildOtpEmailTemplate } from './otp-email.template';

describe('buildOtpEmailTemplate', () => {
  it.each<[AuthOtpEmailPurpose, string, string]>([
    ['SIGNUP', 'Verify your email', 'Verify your email address'],
    ['PASSWORD_RESET', 'Reset your password', 'Reset your password'],
    [
      'CONTACT_CHANGE',
      'Confirm your email change',
      'Confirm your email change',
    ],
  ])(
    'renders purpose-specific content for %s',
    (purpose, subjectText, heading) => {
      const result = buildOtpEmailTemplate({
        appName: 'Menu Assist',
        otp: '123456',
        purpose,
        expiresInSeconds: 600,
      });

      expect(result.subject).toBe(`Menu Assist: ${subjectText}`);
      expect(result.text).toContain(heading);
      expect(result.text).toContain('123456');
      expect(result.html).toContain(heading);
      expect(result.html).toContain('123456');
    },
  );

  it('renders expiry and the branded app-name wordmark', () => {
    const result = buildOtpEmailTemplate({
      appName: 'Menu Assist',
      otp: '654321',
      purpose: 'SIGNUP',
      expiresInSeconds: 90,
    });

    expect(result.text).toContain('expires in 1 minute.');
    expect(result.html).toContain('expires in <strong>1 minute</strong>');
    expect(result.html).toContain('>Menu Assist</span>');
    expect(result.html).toContain('color:#eb3d4d');
    expect(result.html).toContain('<table role="presentation"');
    expect(result.html).toContain('align="center"');
    expect(result.html).not.toContain('<img');
  });

  it('escapes configurable and generated values before HTML interpolation', () => {
    const result = buildOtpEmailTemplate({
      appName: '<Menu & Assist>',
      otp: '<123456>',
      purpose: 'SIGNUP',
      expiresInSeconds: 600,
    });

    expect(result.html).toContain('&lt;Menu &amp; Assist&gt;');
    expect(result.html).toContain('&lt;123456&gt;');
    expect(result.html).not.toContain('<Menu & Assist>');
    expect(result.html).not.toContain('<123456>');
  });
});
