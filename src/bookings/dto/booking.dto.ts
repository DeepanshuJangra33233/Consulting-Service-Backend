import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CustomerDetailsDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: 'Discuss SaaS architecture and scalability roadmap.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  agenda: string;
}

export class ScheduleDetailsDto {
  @ApiProperty({ example: '2026-09-22' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsString()
  @IsOptional()
  timezone?: string = 'Asia/Kolkata';
}

export class CreateBookingDto {
  @ApiProperty({ example: 'svc_60min' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({ type: CustomerDetailsDto })
  @ValidateNested()
  @Type(() => CustomerDetailsDto)
  customer: CustomerDetailsDto;

  @ApiProperty({ type: ScheduleDetailsDto })
  @ValidateNested()
  @Type(() => ScheduleDetailsDto)
  schedule: ScheduleDetailsDto;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Schedule conflict with client presentation' })
  @IsString()
  @IsOptional()
  reason?: string;
}
