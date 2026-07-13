import nodemailer, { Transporter } from 'nodemailer'

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  }
  return _transporter
}

export interface MailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const transporter = getTransporter()
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  })
}
