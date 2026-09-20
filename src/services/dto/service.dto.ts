import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: '60 Minute Consultation' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '60-minute-consultation' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiProperty({ example: 'Comprehensive one-on-one consulting session.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 60, description: 'Duration in minutes' })
  @IsNumber()
  @IsPositive()
  @Min(15)
  durationMinutes: number;

  @ApiProperty({ example: 2500, description: 'Price in INR' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsString()
  @IsOptional()
  currency?: 'INR' = 'INR';

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean = true;
}

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: '60 Minute Consultation' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '60-minute-consultation' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'Comprehensive one-on-one consulting session.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 2500 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
