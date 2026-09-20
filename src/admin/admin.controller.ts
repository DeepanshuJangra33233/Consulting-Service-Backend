import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { QueryAdminBookingsDto, UpdateAdminBookingDto } from './dto/admin.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregated dashboard analytics and revenue KPIs' })
  @ApiResponse({ status: 200, description: 'Analytics data returned' })
  async getDashboard() {
    const data = await this.adminService.getDashboardAnalytics();
    return {
      success: true,
      data,
      message: 'Dashboard analytics retrieved successfully',
    };
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings with optional filters' })
  @ApiResponse({ status: 200, description: 'Bookings list returned' })
  async getBookings(@Query() query: QueryAdminBookingsDto) {
    const data = await this.adminService.getBookings(query);
    return {
      success: true,
      data,
      message: 'Admin bookings retrieved successfully',
    };
  }

  @Patch('bookings/:id')
  @ApiOperation({ summary: 'Update booking status or payment status' })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  async updateBooking(
    @Param('id') id: string,
    @Body() dto: UpdateAdminBookingDto,
  ) {
    const data = await this.adminService.updateBooking(id, dto);
    return {
      success: true,
      data,
      message: 'Booking updated successfully',
    };
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customer directory with total bookings & spent' })
  @ApiResponse({ status: 200, description: 'Customer directory returned' })
  async getCustomers() {
    const data = await this.adminService.getCustomers();
    return {
      success: true,
      data,
      message: 'Customers retrieved successfully',
    };
  }
}
