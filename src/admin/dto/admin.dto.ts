import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BookingStatus, PaymentStatus } from '../../common/types';

export class UpdateAdminBookingDto {
  @ApiPropertyOptional({
    enum: ['pending_payment', 'paid', 'confirmed', 'cancelled', 'completed'],
  })
  @IsEnum(['pending_payment', 'paid', 'confirmed', 'cancelled', 'completed'])
  @IsOptional()
  status?: BookingStatus;

  @ApiPropertyOptional({
    enum: ['pending', 'paid', 'failed', 'refunded'],
  })
  @IsEnum(['pending', 'paid', 'failed', 'refunded'])
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ example: 'Client attended successfully' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryAdminBookingsDto {
  @ApiPropertyOptional({
    enum: ['pending_payment', 'paid', 'confirmed', 'cancelled', 'completed'],
  })
  @IsOptional()
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  search?: string;
}
