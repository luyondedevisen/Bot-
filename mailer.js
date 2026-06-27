// mailer.js
// Sends signal alert emails via Resend (https://resend.com).
// Free tier covers light personal use comfortably.

import { Resend } from "resend";

let resendClient = null;

function getClient() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set in environment variables.");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Send a signal alert email.
 * @param {object} opts
 * @param {string} opts.to recipient email
 * @param {string} opts.symbol e.g. "EUR/USD"
 * @param {object} opts.event the structure event (BOS/CHoCH)
 */
export async function sendSignalEmail({ to, symbol, event }) {
  const resend = getClient();

  const directionWord = event.direction === "bullish" ? "Bullish 📈" : "Bearish 📉";
  const subject = `${symbol} ${event.type} — ${directionWord}`;

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">${symbol}: ${event.type} (${directionWord})</h2>
      <p style="color: #555; margin-top: 0;">${event.note}</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 6px 0; color: #888;">Price at break</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${event.price}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #888;">Level broken</td>
          <td style="padding: 6px 0; text-align: right;">${event.brokenLevel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #888;">Time</td>
          <td style="padding: 6px 0; text-align: right;">${new Date(event.time).toLocaleString()}</td>
        </tr>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Automated structure alert — not financial advice. Verify on your own chart before acting.
      </p>
    </div>
  `;

  return resend.emails.send({
    from: process.env.FROM_EMAIL || "alerts@yourdomain.com",
    to,
    subject,
    html,
  });
}
