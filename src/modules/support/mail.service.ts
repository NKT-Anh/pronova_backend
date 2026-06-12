import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

// ============================================================
// mail.service.ts — Gửi email qua SMTP (nodemailer)
// ============================================================

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Pronova Support" <${this.config.get('SMTP_USER')}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}`, err);
      throw err;
    }
  }

  // ── Template: xác nhận ticket đã nhận ────────────────────────
  buildTicketConfirmHtml(data: {
    name: string;
    ticketId: string;
    subject: string;
    message: string;
    category: string;
    createdAt: Date;
  }): string {
    const categoryLabel: Record<string, string> = {
      GENERAL: 'Chung',
      PRONUNCIATION: 'Phát âm',
      ACCOUNT: 'Tài khoản',
      PAYMENT: 'Thanh toán',
      BUG_REPORT: 'Báo cáo lỗi',
      FEATURE_REQUEST: 'Góp ý tính năng',
    };
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Xác nhận yêu cầu hỗ trợ</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6C63FF,#4facfe);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">🎙️ Pronova</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Trung tâm hỗ trợ</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;">Chúng tôi đã nhận được yêu cầu của bạn ✅</h2>
            <p style="margin:0 0 24px;color:#5a5a7a;font-size:14px;line-height:1.6;">
              Xin chào <strong>${data.name}</strong>,<br/>
              Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi trong vòng <strong>24–48 giờ</strong> làm việc.
            </p>
            <!-- Ticket info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8fc;border-radius:12px;padding:20px;margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;">
                  <span style="color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Mã ticket</span><br/>
                  <span style="color:#6C63FF;font-size:14px;font-weight:700;font-family:monospace;">#${data.ticketId.slice(-8).toUpperCase()}</span>
                </td>
              </tr>
              <tr><td style="padding:10px 0;border-top:1px solid #e8e8f0;">
                <span style="color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Chủ đề</span><br/>
                <span style="color:#1a1a2e;font-size:14px;">${data.subject}</span>
              </td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #e8e8f0;">
                <span style="color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Danh mục</span><br/>
                <span style="color:#1a1a2e;font-size:14px;">${categoryLabel[data.category] ?? data.category}</span>
              </td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #e8e8f0;">
                <span style="color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Nội dung</span><br/>
                <span style="color:#5a5a7a;font-size:13px;line-height:1.6;">${data.message.replace(/\n/g, '<br/>')}</span>
              </td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #e8e8f0;">
                <span style="color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Ngày gửi</span><br/>
                <span style="color:#1a1a2e;font-size:14px;">${data.createdAt.toLocaleDateString('vi-VN', { dateStyle: 'full', timeStyle: 'short' })}</span>
              </td></tr>
            </table>
            <p style="margin:0;color:#9898b8;font-size:12px;text-align:center;">
              Nếu bạn có thêm thông tin, hãy reply email này hoặc liên hệ 
              <a href="mailto:support@pronova.app" style="color:#6C63FF;">support@pronova.app</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f4f4f8;padding:20px 40px;text-align:center;border-top:1px solid #e8e8f0;">
            <p style="margin:0;color:#9898b8;font-size:12px;">© 2026 Pronova </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // ── Template: thông báo cho admin ────────────────────────────
  buildAdminNotifyHtml(data: {
    ticketId: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    category: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"/><title>Ticket mới</title></head>
<body style="font-family:Arial,sans-serif;padding:20px;background:#f4f4f8;">
  <div style="background:#fff;border-radius:12px;padding:24px;max-width:600px;margin:auto;">
    <h2 style="color:#6C63FF;margin-top:0;">🎫 Ticket hỗ trợ mới #${data.ticketId.slice(-8).toUpperCase()}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px;color:#666;width:120px;">Từ:</td><td style="padding:8px;"><strong>${data.name}</strong> &lt;${data.email}&gt;</td></tr>
      <tr style="background:#f8f8fc;"><td style="padding:8px;color:#666;">Danh mục:</td><td style="padding:8px;">${data.category}</td></tr>
      <tr><td style="padding:8px;color:#666;">Chủ đề:</td><td style="padding:8px;">${data.subject}</td></tr>
      <tr style="background:#f8f8fc;"><td style="padding:8px;color:#666;vertical-align:top;">Nội dung:</td>
        <td style="padding:8px;line-height:1.6;">${data.message.replace(/\n/g, '<br/>')}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#999;">ID đầy đủ: ${data.ticketId}</p>
  </div>
</body>
</html>`;
  }

  // ── Template: OTP quên mật khẩu ──────────────────────────────
  buildForgotPasswordOtpHtml(data: { email: string; code: string }): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Khôi phục mật khẩu - Pronova</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6C63FF,#4facfe);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">🎙️ Pronova</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Khôi phục mật khẩu tài khoản</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;text-align:center;">Mã xác thực OTP của bạn 🔑</h2>
            <p style="margin:0 0 24px;color:#5a5a7a;font-size:14px;line-height:1.6;text-align:center;">
              Xin chào <strong>${data.email}</strong>,<br/>
              Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản của bạn.
              Dưới đây là mã OTP xác thực của bạn. Mã này có hiệu lực trong vòng <strong>5 phút</strong>.
            </p>
            <!-- OTP Box -->
            <div style="background:#f8f8fc;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;border: 1px dashed #6C63FF;">
              <span style="display:block;color:#9898b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">MÃ OTP CỦA BẠN</span>
              <span style="color:#6C63FF;font-size:36px;font-weight:800;letter-spacing:6px;font-family:monospace;">${data.code}</span>
            </div>
            <p style="margin:0 0 16px;color:#e11d48;font-size:13px;line-height:1.6;text-align:center;font-weight:500;">
              Lưu ý: Tuyệt đối không chia sẻ mã này với bất kỳ ai để bảo mật tài khoản.
            </p>
            <p style="margin:0;color:#9898b8;font-size:12px;text-align:center;">
              Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f4f4f8;padding:20px 40px;text-align:center;border-top:1px solid #e8e8f0;">
            <p style="margin:0;color:#9898b8;font-size:12px;">© 2026 Pronova Coach. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
