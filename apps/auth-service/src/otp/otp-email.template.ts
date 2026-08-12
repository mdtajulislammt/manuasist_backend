import type { AuthOtpEmailPurpose } from './auth-otp.constants';

export type OtpEmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

type OtpEmailTemplateInput = {
  appName: string;
  otp: string;
  purpose: AuthOtpEmailPurpose;
  expiresInSeconds: number;
};

const PURPOSE_CONTENT: Record<
  AuthOtpEmailPurpose,
  { subject: string; heading: string; introduction: string }
> = {
  SIGNUP: {
    subject: 'Verify your email',
    heading: 'Verify your email address',
    introduction:
      'Welcome! Enter this verification code to finish creating your account.',
  },
  PASSWORD_RESET: {
    subject: 'Reset your password',
    heading: 'Reset your password',
    introduction:
      'Enter this verification code to continue resetting your password.',
  },
  CONTACT_CHANGE: {
    subject: 'Confirm your email change',
    heading: 'Confirm your email change',
    introduction:
      'Enter this verification code to confirm your new email address.',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildOtpEmailTemplate(
  input: OtpEmailTemplateInput,
): OtpEmailTemplate {
  const appName = input.appName.trim() || 'Menu Assist';
  const content = PURPOSE_CONTENT[input.purpose];
  const minutes = Math.max(1, Math.floor(input.expiresInSeconds / 60));
  const expiryText = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const subject = `${appName}: ${content.subject}`;
  const text = [
    content.heading,
    '',
    content.introduction,
    '',
    `Your verification code is: ${input.otp}`,
    `This code expires in ${expiryText}.`,
    '',
    `If you did not request this code, you can safely ignore this email. ${appName} will never ask you to share this code.`,
  ].join('\n');

  const escapedAppName = escapeHtml(appName);
  const escapedOtp = escapeHtml(input.otp);
  const escapedHeading = escapeHtml(content.heading);
  const escapedIntroduction = escapeHtml(content.introduction);
  const escapedExpiryText = escapeHtml(expiryText);
  const brand = `<span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:700;letter-spacing:0.2px;color:#eb3d4d;">${escapedAppName}</span>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#fff5f6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapedHeading}. Your code expires in ${escapedExpiryText}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#fff5f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #f5cbd0;border-radius:16px;">
          <tr>
            <td align="center" style="padding:32px 40px 24px;">${brand}</td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px;font-family:Arial,Helvetica,sans-serif;color:#3d2528;">
              <h1 style="margin:0 0 16px;font-size:28px;line-height:36px;font-weight:700;color:#3d2528;">${escapedHeading}</h1>
              <p style="margin:0 0 24px;font-size:16px;line-height:25px;color:#654d50;">${escapedIntroduction}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding:22px 16px;background-color:#fff0f2;border:1px solid #f3bac0;border-radius:12px;">
                    <div style="font-family:'Courier New',Courier,monospace;font-size:36px;line-height:44px;font-weight:700;letter-spacing:8px;color:#eb3d4d;">${escapedOtp}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:15px;line-height:24px;color:#654d50;">This code expires in <strong>${escapedExpiryText}</strong>.</p>
              <p style="margin:12px 0 0;font-size:14px;line-height:22px;color:#80696c;">If you did not request this code, you can safely ignore this email. ${escapedAppName} will never ask you to share this code.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f4dfe1;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#927b7e;text-align:center;">
              This is an automated security message from ${escapedAppName}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
