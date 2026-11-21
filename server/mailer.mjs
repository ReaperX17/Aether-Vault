/**
 * AetherVault Email Delivery Service (Verification & Password Recovery)
 *
 * Supports out-of-the-box delivery via:
 *   1. Resend (RESEND_API_KEY) — Recommended for aether-vault.com / aether-vault.net
 *   2. SendGrid (SENDGRID_API_KEY)
 *   3. Brevo / Sendinblue (BREVO_API_KEY)
 *   4. Custom Webhook (EMAIL_WEBHOOK_URL)
 *
 * If no external email API key is configured yet, falls back to console logging + devPreviewCode
 * so users and admins can still test and verify accounts without getting locked out.
 */

const EMAIL_FROM = process.env.EMAIL_FROM || 'AetherVault <noreply@aether-vault.com>';

export function isEmailProviderConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY ||
      process.env.SENDGRID_API_KEY ||
      process.env.BREVO_API_KEY ||
      process.env.EMAIL_WEBHOOK_URL
  );
}

async function dispatchEmail({ to, subject, html, text }) {
  // 1. Resend API (https://resend.com)
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Resend API error (${res.status}): ${errText}`);
    }
    return { delivered: true, provider: 'resend' };
  }

  // 2. SendGrid API
  if (process.env.SENDGRID_API_KEY) {
    const fromMatch = EMAIL_FROM.match(/^(.*?)\s*<([^>]+)>$/);
    const fromObj = fromMatch
      ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
      : { email: EMAIL_FROM.trim() };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: fromObj,
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SendGrid API error (${res.status}): ${errText}`);
    }
    return { delivered: true, provider: 'sendgrid' };
  }

  // 3. Brevo (Sendinblue) API
  if (process.env.BREVO_API_KEY) {
    const fromMatch = EMAIL_FROM.match(/^(.*?)\s*<([^>]+)>$/);
    const sender = fromMatch
      ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
      : { name: 'AetherVault', email: EMAIL_FROM.trim() };
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Brevo API error (${res.status}): ${errText}`);
    }
    return { delivered: true, provider: 'brevo' };
  }

  // 4. Custom Webhook
  if (process.env.EMAIL_WEBHOOK_URL) {
    const res = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, from: EMAIL_FROM, subject, html, text })
    });
    if (!res.ok) {
      throw new Error(`Email webhook returned status ${res.status}`);
    }
    return { delivered: true, provider: 'webhook' };
  }

  // 5. Fallback when no external email provider key is configured yet
  console.log(`\n📧 [AetherVault Email Dispatch]`);
  console.log(`   To:      ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body:    ${text.replace(/\n+/g, ' ')}\n`);
  return { delivered: false, provider: 'console-preview' };
}

export async function sendVerificationEmail(toEmail, username, code) {
  const subject = `${code} is your AetherVault verification code`;
  const text = `Hello ${username},\n\nYour AetherVault email verification code is: ${code}\n\nThis code expires in 15 minutes. Once verified, you can use this email address to recover your password anytime on aether-vault.com and aether-vault.net.\n\n— AetherVault`;
  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; background: #020617; color: #f1f5f9; border: 1px solid #1e293b; border-radius: 16px; padding: 28px;">
      <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin-bottom: 8px;">✨ AetherVault</div>
      <h2 style="font-size: 18px; color: #f8fafc; margin: 0 0 12px 0;">Verify your email address</h2>
      <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 20px;">
        Hi <strong style="color: #e2e8f0;">${username}</strong>, enter the 6-digit verification code below in AetherVault to verify your email address for password recovery:
      </p>
      <div style="background: #0f172a; border: 1px solid #f59e0b; border-radius: 12px; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #fbbf24; margin-bottom: 20px;">
        ${code}
      </div>
      <p style="font-size: 12px; color: #64748b; margin: 0;">
        This code expires in 15 minutes. If you did not create an AetherVault account, you can safely ignore this email.
      </p>
    </div>
  `;
  return dispatchEmail({ to: toEmail, subject, html, text });
}

export async function sendPasswordResetEmail(toEmail, username, code) {
  const subject = `${code} is your AetherVault password recovery code`;
  const text = `Hello ${username},\n\nWe received a request to reset the password for your AetherVault account (${username}).\n\nYour 6-digit password recovery code is: ${code}\n\nThis code expires in 15 minutes. Enter this code on the AetherVault Sign-In screen to set a new password.\n\n— AetherVault`;
  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; background: #020617; color: #f1f5f9; border: 1px solid #1e293b; border-radius: 16px; padding: 28px;">
      <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin-bottom: 8px;">✨ AetherVault</div>
      <h2 style="font-size: 18px; color: #f8fafc; margin: 0 0 12px 0;">Password Recovery Code</h2>
      <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 20px;">
        Hi <strong style="color: #e2e8f0;">${username}</strong>, use the 6-digit recovery code below to reset the password for your AetherVault account:
      </p>
      <div style="background: #0f172a; border: 1px solid #38bdf8; border-radius: 12px; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #38bdf8; margin-bottom: 20px;">
        ${code}
      </div>
      <p style="font-size: 12px; color: #64748b; margin: 0;">
        This recovery code expires in 15 minutes. If you did not request a password reset, your vault remains secure and no changes have been made.
      </p>
    </div>
  `;
  return dispatchEmail({ to: toEmail, subject, html, text });
}
