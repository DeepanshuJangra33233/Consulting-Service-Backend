import {
  Controller,
  Post,
  Headers,
  Req,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('razorpay')
  @ApiOperation({ summary: 'Razorpay webhook receiver with signature verification & idempotency' })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged' })
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: Request,
  ) {
    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    if (!rawBody) {
      throw new BadRequestException('Empty webhook payload');
    }
    return this.webhooksService.handleRazorpayWebhook(rawBody, signature || '');
  }

  @Public()
  @Post('razorpay/simulate-success/:bookingId')
  @ApiOperation({ summary: 'Dev helper: simulate a successful Razorpay payment for a booking' })
  async simulateSuccess(@Param('bookingId') bookingId: string) {
    const booking = await this.webhooksService.processSuccessfulPayment(
      bookingId,
      `pay_sim_${Date.now()}`,
      `order_sim_${Date.now()}`,
    );
    return {
      success: true,
      data: booking,
      message: 'Simulated Razorpay payment succeeded and booking confirmed',
    };
  }

  // Backwards compatibility for existing tests/scripts
  @Public()
  @Post('stripe')
  @ApiOperation({ summary: 'Stripe webhook receiver alias' })
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    return this.webhooksService.handleRazorpayWebhook(rawBody, signature || '');
  }

  @Public()
  @Post('stripe/simulate-success/:bookingId')
  @ApiOperation({ summary: 'Dev helper: simulate payment success (alias)' })
  async simulateStripeSuccess(@Param('bookingId') bookingId: string) {
    return this.simulateSuccess(bookingId);
  }
}
