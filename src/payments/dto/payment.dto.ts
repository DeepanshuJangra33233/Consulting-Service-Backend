import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @ApiProperty({ example: 'bk_1716123456_abcd' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}

export class VerifyRazorpayPaymentDto {
  @ApiProperty({ example: 'bk_1716123456_abcd' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({ example: 'order_EKwxwAgItmmMnv' })
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @ApiProperty({ example: 'pay_29QQoUBi66xm2f' })
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @ApiProperty({ example: '9ef57431184ff2fdd8181fcd962d6a749f59634c802527aa09e8fb13d783ecda' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}
