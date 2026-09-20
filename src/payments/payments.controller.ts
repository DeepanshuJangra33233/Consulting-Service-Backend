import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateCheckoutSessionDto, VerifyRazorpayPaymentDto } from './dto/payment.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('checkout')
  @ApiOperation({ summary: 'Create Razorpay Order for a pending booking' })
  @ApiResponse({ status: 201, description: 'Order created with Razorpay order details' })
  async createCheckout(@Body() dto: CreateCheckoutSessionDto) {
    const data = await this.paymentsService.createCheckoutSession(dto.bookingId);
    return {
      success: true,
      data,
      message: 'Razorpay order created successfully',
    };
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Verify Razorpay payment signature & confirm booking' })
  @ApiResponse({ status: 200, description: 'Payment verified and booking confirmed' })
  async verifyPayment(@Body() dto: VerifyRazorpayPaymentDto) {
    const data = await this.paymentsService.verifyPayment(dto);
    return {
      success: true,
      data,
      message: 'Payment verified and consultation confirmed successfully',
    };
  }

  @Public()
  @Get(':bookingId')
  @ApiOperation({ summary: 'Get payment status of a booking' })
  @ApiResponse({ status: 200, description: 'Payment status returned' })
  async getStatus(@Param('bookingId') bookingId: string) {
    const data = await this.paymentsService.getPaymentDetails(bookingId);
    return {
      success: true,
      data,
      message: 'Payment details retrieved successfully',
    };
  }
}
