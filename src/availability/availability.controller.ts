import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import {
  CreateBlockedDateDto,
  GetSlotsQueryDto,
  UpdateWorkingHoursDto,
} from './dto/availability.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Public()
  @Get('working-hours')
  @ApiOperation({ summary: 'Get general weekly working hours' })
  async getWorkingHours() {
    const data = await this.availabilityService.getWorkingHours();
    return {
      success: true,
      data,
      message: 'Working hours retrieved successfully',
    };
  }

  @Public()
  @Get('blocked-dates')
  @ApiOperation({ summary: 'Get all blocked dates' })
  async getBlockedDates() {
    const data = await this.availabilityService.getBlockedDates();
    return {
      success: true,
      data,
      message: 'Blocked dates retrieved successfully',
    };
  }

  @Public()
  @Get('slots/:date')
  @ApiOperation({ summary: 'Get generated available time slots for a specific date' })
  @ApiResponse({ status: 200, description: 'Available slots returned' })
  async getSlots(
    @Param('date') date: string,
    @Query() query: GetSlotsQueryDto,
  ) {
    const data = await this.availabilityService.getAvailableSlots(
      date,
      query.serviceId,
      query.timezone,
    );
    return {
      success: true,
      data,
      message: 'Slots retrieved successfully',
    };
  }

  // Admin-only management endpoints
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('working-hours')
  @ApiOperation({ summary: 'Update working hours for a day of week (Admin only)' })
  async updateWorkingHours(@Body() dto: UpdateWorkingHoursDto) {
    const data = await this.availabilityService.updateWorkingHours(dto);
    return {
      success: true,
      data,
      message: 'Working hours updated successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('blocked-dates')
  @ApiOperation({ summary: 'Block a calendar date (Admin only)' })
  async addBlockedDate(@Body() dto: CreateBlockedDateDto) {
    const data = await this.availabilityService.addBlockedDate(dto);
    return {
      success: true,
      data,
      message: 'Date blocked successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('blocked-dates/:id')
  @ApiOperation({ summary: 'Unblock a date (Admin only)' })
  async removeBlockedDate(@Param('id') id: string) {
    const data = await this.availabilityService.removeBlockedDate(id);
    return {
      success: true,
      data,
      message: 'Date unblocked successfully',
    };
  }
}
