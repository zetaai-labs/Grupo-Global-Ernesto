import nodemailer from 'nodemailer'
import { config } from '../config/env.js'

export function smtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.user)
}

let transporter = null
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  }
  return transporter
}

/** Sends a plain-text email, optionally with attachments. Throws if SMTP is not configured or delivery fails. */
export async function sendMail({ to, subject, text, attachments }) {
  if (!smtpConfigured()) throw new Error('SMTP is not configured.')
  await getTransporter().sendMail({ from: config.smtp.from, to, subject, text, ...(attachments ? { attachments } : {}) })
}

export default { sendMail, smtpConfigured }
