import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MailService } from './mail.service';
import { CreateSupportTicketDto } from './dto/support.dto';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { ConfigService } from '@nestjs/config';

// ============================================================
// support.service.ts — Quản lý support ticket + gửi SMTP
// ============================================================

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ── Tạo ticket mới ───────────────────────────────────────────
  async createTicket(owner: UserOrGuestContext, dto: CreateSupportTicketDto) {
    // Lấy thông tin user nếu đã đăng nhập
    let userName = dto.name;
    let userEmail = dto.email;

    if (owner.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: owner.userId },
        select: { name: true, email: true },
      });
      if (user) {
        userName = userName ?? user.name ?? 'Người dùng';
        userEmail = user.email;
      }
    }

    // Lưu ticket vào DB
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: owner.userId ?? null,
        email: userEmail,
        name: userName,
        subject: dto.subject,
        message: dto.message,
        category: dto.category ?? 'GENERAL',
      },
    });

    // Gửi email xác nhận cho user (không throw nếu lỗi mail)
    try {
      await this.mail.sendMail({
        to: ticket.email,
        subject: `[Pronova] Đã nhận yêu cầu hỗ trợ #${ticket.id.slice(-8).toUpperCase()}`,
        html: this.mail.buildTicketConfirmHtml({
          name: ticket.name ?? 'Bạn',
          ticketId: ticket.id,
          subject: ticket.subject,
          message: ticket.message,
          category: ticket.category,
          createdAt: ticket.createdAt,
        }),
      });
    } catch (_) {
      // Log đã được xử lý trong MailService, không crash request
    }

    // Thông báo admin
    const adminEmail = this.config.get<string>('SUPPORT_ADMIN_EMAIL');
    if (adminEmail) {
      try {
        await this.mail.sendMail({
          to: adminEmail,
          subject: `[Admin] Ticket mới: ${ticket.subject}`,
          html: this.mail.buildAdminNotifyHtml({
            ticketId: ticket.id,
            name: ticket.name ?? 'Ẩn danh',
            email: ticket.email,
            subject: ticket.subject,
            message: ticket.message,
            category: ticket.category,
          }),
          replyTo: ticket.email,
        });
      } catch (_) {}
    }

    return {
      id: ticket.id,
      ticketCode: ticket.id.slice(-8).toUpperCase(),
      status: ticket.status,
      createdAt: ticket.createdAt,
      message: 'Yêu cầu đã được gửi. Vui lòng kiểm tra email của bạn.',
    };
  }

  // ── Lấy danh sách ticket của user đăng nhập ─────────────────
  async getMyTickets(owner: UserOrGuestContext) {
    if (!owner.userId) {
      return [];
    }

    return this.prisma.supportTicket.findMany({
      where: { userId: owner.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        category: true,
        status: true,
        message: true,
        adminReply: true,
        repliedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ── Xem chi tiết 1 ticket ────────────────────────────────────
  async getTicketById(owner: UserOrGuestContext, ticketId: string) {
    if (!owner.userId) {
      throw new NotFoundException('Ticket not found');
    }

    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId: owner.userId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }
}
