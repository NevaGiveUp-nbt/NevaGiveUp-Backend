import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  EnrollmentStatus,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  generatePaymentCode,
  generateQrCodeUrl,
  parseSePayDate,
  verifySePaySignature,
} from '@/helpers/Payment.util';
import { ConfigService } from '@nestjs/config';
import { SePayWebhookDto } from './dto/sepay-webhook.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createPayment(userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Đơn hàng không tồn tại');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Đơn hàng không còn tồn tại');
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      // Cập nhật order sang EXPIRED nếu chưa được cập nhật
      await this.prisma.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.EXPIRED,
        },
      });
      throw new ConflictException('Đơn hàng đã hết hạn');
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingPayment) {
      // Nếu payment đã hết hạn, đánh dấu EXPIRED và tạo payment mới
      if (
        existingPayment.expiresAt &&
        existingPayment.expiresAt <= new Date()
      ) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: PaymentStatus.EXPIRED },
        });
      } else {
        return existingPayment;
      }
    }

    const paymentCode = await generatePaymentCode(this.prisma);

    const config = {
      account: this.configService.getOrThrow<string>('SEPAY_BANK_ACCOUNT'),
      bank: this.configService.getOrThrow<string>('SEPAY_BANK_CODE'),
    };

    const qrCodeUrl = generateQrCodeUrl(paymentCode, order.totalAmount, config);

    return this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.SEPAY,
        method: PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
        amount: order.totalAmount,
        currency: order.currency,
        paymentCode,
        qrCodeUrl,
        expiresAt: order.expiresAt,
      },
    });
  }

  async handleSePayWebhook(
    data: SePayWebhookDto,
    rawBody?: Buffer,
    signature?: string,
    timestamp?: string,
  ) {
    const secret = this.configService.getOrThrow<string>(
      'SEPAY_WEBHOOK_SECRET',
    );

    verifySePaySignature(rawBody, signature, timestamp, secret);

    if (data.transferType !== 'in') {
      return;
    }
    if (!data.code) {
      this.logger.warn(
        `[SePay] Missing payment code: transactionId=${data.id}`,
      );
      return;
    }

    // Tìm payment theo Payment code
    const payment = await this.prisma.payment.findUnique({
      where: {
        paymentCode: data.code,
      },
      include: {
        order: {
          include: {
            orderItems: true,
          },
        },
      },
    });

    if (!payment) {
      this.logger.warn(`[SePay] Payment not found: transactionId=${data.id}`);
      return;
    }

    //hien tai chi ho tro sepay provider
    if (payment.provider !== PaymentProvider.SEPAY) {
      this.logger.warn(
        `[SePay] Unexpected payment provider: transactionId=${data.id}, paymentId=${payment.id}`,
      );
      return;
    }

    //da mua roi
    if (payment.status === PaymentStatus.PAID) {
      return;
    }

    // Payment đã bị đánh dấu FAILED (ví dụ: số tiền không khớp lần trước)
    if (payment.status === PaymentStatus.FAILED) {
      return;
    }

    // Dùng transactionDate (thời điểm user thực sự chuyển tiền) để quyết định
    // Nếu user chuyển tiền TRƯỚC lúc hết hạn → chấp nhận, dù webhook đến muộn
    const txDate = parseSePayDate(data.transactionDate);
    if (Number.isNaN(txDate.getTime())) {
      throw new BadRequestException('Invalid SePay transaction date');
    }

    // Check payment expired — so sánh với thời điểm giao dịch thực tế
    if (payment.expiresAt && payment.expiresAt <= new Date()) {
      if (txDate > payment.expiresAt) {
        this.logger.warn(
          `[SePay] Transfer after payment expiry: transactionId=${data.id}, paymentId=${payment.id}`,
        );
        return;
      }
    }

    // Kiem tra order status — cho phép EXPIRED nếu user đã thanh toán trước hạn
    const validOrderStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.EXPIRED,
    ];
    if (!validOrderStatuses.includes(payment.order.status)) {
      this.logger.warn(
        `[SePay] Order cannot accept payment: transactionId=${data.id}, orderId=${payment.orderId}, status=${payment.order.status}`,
      );
      return;
    }

    if (payment.order.expiresAt && payment.order.expiresAt <= new Date()) {
      if (txDate > payment.order.expiresAt) {
        this.logger.warn(
          `[SePay] Transfer after order expiry: transactionId=${data.id}, orderId=${payment.orderId}`,
        );
        return;
      }
    }
    //kiem tra transaction payment exist

    const transactionExist = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerTransactionId: {
          provider: PaymentProvider.SEPAY,
          providerTransactionId: String(data.id),
        },
      },
    });

    if (transactionExist) {
      return;
    }

    //check số tiền giao dịch có khớp trong payment của hệ thống khong
    const transferAmount = new Prisma.Decimal(data.transferAmount);

    if (!transferAmount.equals(payment.amount)) {
      this.logger.warn(
        `[SePay] Amount mismatch: transactionId=${data.id}, paymentId=${payment.id}, received=${transferAmount.toString()}, expected=${payment.amount.toString()}`,
      );
      // Ghi nhận transaction nhưng đánh dấu payment là FAILED
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            provider: PaymentProvider.SEPAY,
            providerTransactionId: String(data.id),
            referenceCode: data.referenceCode ?? null,
            amount: transferAmount,
            transferType: data.transferType,
            transactionDate: parseSePayDate(data.transactionDate),
            content: data.content,
            rawPayload: data as unknown as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });

        await tx.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            status: PaymentStatus.FAILED,
          },
        });
      });
      return; // Trả 200 cho SePay để không retry
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        try {
          await tx.paymentTransaction.create({
            data: {
              paymentId: payment.id,
              provider: PaymentProvider.SEPAY,
              providerTransactionId: String(data.id),
              referenceCode: data.referenceCode ?? null,
              amount: transferAmount,
              transferType: data.transferType,
              transactionDate: parseSePayDate(data.transactionDate),
              content: data.content,
              rawPayload: data as unknown as Prisma.InputJsonValue,
              processedAt: new Date(),
            },
          });
        } catch (error: any) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            // Transaction đã được xử lý bởi request khác.
            return;
          }

          throw error;
        }

        // Prisma updateMany không hỗ trợ relation filter,
        // nhưng order đã được validate ở trên nên chỉ cần filter payment status
        // Bao gồm cả EXPIRED để xử lý trường hợp cron đã expire nhưng user đã thanh toán
        const updatedPayment = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: {
              in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
            },
          },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });
        if (updatedPayment.count === 0) {
          return;
        }

        //thay đổi trạng thái order (bao gồm cả EXPIRED → PAID trong grace period)
        const updatedOrder = await tx.order.updateMany({
          where: {
            id: payment.orderId,
            status: {
              in: [OrderStatus.PENDING, OrderStatus.EXPIRED],
            },
          },
          data: {
            status: OrderStatus.PAID,
            paidAt: new Date(),
          },
        });

        // Đơn hàng đã được xử lý bởi một payment khác
        if (updatedOrder.count === 0) {
          this.logger.warn(
            `[SePay] Order status changed during payment: transactionId=${data.id}, orderId=${payment.orderId}`,
          );
          return;
        }

        //cập nhật trạng thái order item và tạo enrollment
        for (const item of payment.order.orderItems) {
          // Kiểm tra enrollment đã tồn tại chưa trước khi upsert
          const existingEnrollment = await tx.enrollment.findUnique({
            where: {
              userId_courseId: {
                userId: payment.order.userId,
                courseId: item.courseId,
              },
            },
          });

          await tx.enrollment.upsert({
            where: {
              userId_courseId: {
                userId: payment.order.userId,
                courseId: item.courseId,
              },
            },
            update: {
              orderId: payment.orderId,
              status: EnrollmentStatus.ENROLLED,
            },
            create: {
              userId: payment.order.userId,
              courseId: item.courseId,
              orderId: payment.orderId,
              status: EnrollmentStatus.ENROLLED,
            },
          });

          // Chỉ increment studentCount khi tạo enrollment mới
          if (!existingEnrollment) {
            await tx.course.update({
              where: {
                id: item.courseId,
              },
              data: {
                studentCount: {
                  increment: 1,
                },
              },
            });
          }
        }
      });
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Duplicate webhook do race condition.
        // Trả success để SePay không retry.
        return;
      }

      throw error;
    }
  }

  findAll() {
    return '123';
  }

  async findOne(userId: string, orderNumber: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        order: {
          orderNumber,
          userId,
        },
      },
      select: {
        id: true,
        orderId: true,
        provider: true,
        method: true,
        status: true,
        amount: true,
        currency: true,
        paymentCode: true,
        expiresAt: true,
        paidAt: true,
        failureReason: true,
        qrCodeUrl: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const bankInfo = {
      account: this.configService.getOrThrow<string>('SEPAY_BANK_ACCOUNT'),
      bank: this.configService.getOrThrow<string>('SEPAY_BANK_CODE'),
    };

    return {
      ...payment,
      bank: {
        accountNumber: bankInfo.account,
        bankName: bankInfo.bank,
      },
    };
  }

  update(id: number, updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }

  /**
   * Cron job chạy mỗi 5 phút để cleanup:
   * - Order PENDING đã hết hạn → EXPIRED
   * - Payment PENDING/PROCESSING đã hết hạn → EXPIRED
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredOrdersAndPayments() {
    const now = new Date();

    // 1. Check order expired
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
      },
    });

    for (const order of expiredOrders) {
      await this.prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.updateMany({
          where: {
            id: order.id,
            status: OrderStatus.PENDING,
            expiresAt: {
              lte: now,
            },
          },
          data: {
            status: OrderStatus.EXPIRED,
          },
        });

        if (updatedOrder.count === 0) {
          return;
        }

        await tx.payment.updateMany({
          where: {
            orderId: order.id,
            status: {
              in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
            },
          },
          data: {
            status: PaymentStatus.EXPIRED,
            failureReason: 'Order expired',
          },
        });
      });
      this.logger.log(`Đã dọn dẹp các order và payment hết hạn`);
    }
  }
}
