import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateWorkingHoursDto {
  @ApiProperty({ example: 1, description: '0 for Sunday, 1 for Monday, ..., 6 for Saturday' })
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: 'Monday' })
  @IsString()
  @IsNotEmpty()
  dayName: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime: string;
}

export class CreateBlockedDateDto {
  @ApiProperty({ example: '2026-09-25' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  @ApiPropertyOptional({ example: 'National Holiday' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class GetSlotsQueryDto {
  @ApiProperty({ example: 'svc_60min', description: 'ID of the consulting service' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsString()
  @IsOptional()
  timezone?: string = 'Asia/Kolkata';
}
