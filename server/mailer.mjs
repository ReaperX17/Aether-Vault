import tls from 'node:tls';

/**
 * AetherVault Email Delivery Service (Verification & Password Recovery)
 *
 * Supports out-of-the-box delivery via:
 *   1. Gmail App Password (GMAIL_APP_PASSWORD + optional GMAIL_USER, defaults to bostain1992@gmail.com)
 *   2. Brevo / Sendinblue (BREVO_API_KEY)
 *   3. Resend (RESEND_API_KEY)
 *   4. SendGrid (SENDGRID_API_KEY)
 *   5. Custom Webhook (EMAIL_WEBHOOK_URL)
 *
 * Security Guarantee: Verification and password-recovery codes are NEVER returned to the browser UI.
 */

const DEFAULT_GMAIL = process.env.GMAIL_USER || 'bostain1992@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'AetherVault <noreply@aether-vault.com>';

export function isEmailProviderConfigured() {
  return Boolean(
    process.env.GMAIL_APP_PASSWORD ||
      process.env.BREVO_API_KEY ||
      process.env.RESEND_API_KEY ||
      process.env.SENDGRID_API_KEY ||
      process.env.EMAIL_WEBHOOK_URL
  );
}

/**
 * Built-in zero-dependency SMTPS client over TLS (smtp.gmail.com:465)
 */
function sendViaGmailSmtps({ gmailUser, appPassword, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const cleanPass = String(appPassword).replace(/\s+/g, '');
    const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    let buffer = '';
    let step = 0;
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        socket.destroy();
        reject(new Error('Gmail SMTP connection timed out'));
      }
    }, 15000);

    function done(err, res) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try {
        socket.end();
      } catch {}
      if (err) reject(err);
      else resolve(res);
    }

    function sendCmd(cmd) {
      socket.write(`${cmd}\r\n`);
    }

    socket.on('error', err => done(err));

    socket.on('data', chunk => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        // Multi-line SMTP responses have a hyphen at index 3 (e.g. "250-..."); wait for the final line ("250 ...")
        if (line.length >= 4 && line[3] === '-') continue;
        const code = Number(line.slice(0, 3));

        if (code >= 400) {
          return done(new Error(`SMTP Error (${code}): ${line}`));
        }

        if (step === 0 && code === 220) {
          step = 1;
          sendCmd('EHLO aether-vault.com');
        } else if (step === 1 && code === 250) {
          step = 2;
          sendCmd('AUTH LOGIN');
        } else if (step === 2 && code === 334) {
          step = 3;
          sendCmd(Buffer.from(gmailUser, 'utf-8').toString('base64'));
        } else if (step === 3 && code === 334) {
          step = 4;
          sendCmd(Buffer.from(cleanPass, 'utf-8').toString('base64'));
        } else if (step === 4 && code === 235) {
          step = 5;
          sendCmd(`MAIL FROM:<${gmailUser}>`);
        } else if (step === 5 && code === 250) {
          step = 6;
          sendCmd(`RCPT TO:<${to}>`);
        } else if (step === 6 && code === 250) {
          step = 7;
          sendCmd('DATA');
        } else if (step === 7 && code === 354) {
          step = 8;
          const msg = [
            `From: "AetherVault" <${gmailUser}>`,
            `To: <${to}>`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            html,
            '.'
          ].join('\r\n');
          sendCmd(msg);
        } else if (step === 8 && code === 250) {
          step = 9;
          sendCmd('QUIT');
          return done(null, { delivered: true, provider: 'gmail-smtps' });
        }
      }
    });
  });
}

async function dispatchEmail({ to, subject, html, text }) {
  // 1. Gmail App Password via SMTPS (port 465)
  if (process.env.GMAIL_APP_PASSWORD) {
    return await sendViaGmailSmtps({
      gmailUser: DEFAULT_GMAIL,
      appPassword: process.env.GMAIL_APP_PASSWORD,
      to,
      subject,
      html
    });
  }

  // 2. Brevo (Sendinblue) HTTPS API (https://brevo.com)
  if (process.env.BREVO_API_KEY) {
    const brevoFrom = process.env.EMAIL_FROM || `AetherVault <${DEFAULT_GMAIL}>`;
    const fromMatch = brevoFrom.match(/^(.*?)\s*<([^>]+)>$/);
    const sender = fromMatch
      ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
      : { name: 'AetherVault', email: brevoFrom.trim() };
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

  // 3. Resend HTTPS API (https://resend.com)
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

  // 4. SendGrid HTTPS API
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

  // 5. Custom Webhook
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

  // No provider configured
  console.warn(`[AetherVault Email] Email provider not configured yet. Could not send email to ${to}.`);
  return { delivered: false, provider: 'unconfigured' };
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
