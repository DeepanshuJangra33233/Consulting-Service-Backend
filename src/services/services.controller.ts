import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active consulting services' })
  @ApiResponse({ status: 200, description: 'Services retrieved successfully' })
  async findAll() {
    const data = await this.servicesService.findAll();
    return {
      success: true,
      data,
      message: 'Services retrieved successfully',
    };
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get service details by slug' })
  @ApiResponse({ status: 200, description: 'Service retrieved successfully' })
  async findBySlug(@Param('slug') slug: string) {
    const data = await this.servicesService.findBySlug(slug);
    return {
      success: true,
      data,
      message: 'Service details retrieved successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  @ApiOperation({ summary: 'Create a new service (Admin only)' })
  @ApiResponse({ status: 201, description: 'Service created successfully' })
  async create(@Body() dto: CreateServiceDto) {
    const data = await this.servicesService.create(dto);
    return {
      success: true,
      data,
      message: 'Service created successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing service (Admin only)' })
  @ApiResponse({ status: 200, description: 'Service updated successfully' })
  async update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    const data = await this.servicesService.update(id, dto);
    return {
      success: true,
      data,
      message: 'Service updated successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service (Admin only)' })
  @ApiResponse({ status: 200, description: 'Service deleted successfully' })
  async remove(@Param('id') id: string) {
    const data = await this.servicesService.remove(id);
    return {
      success: true,
      data,
      message: 'Service deleted successfully',
    };
  }
}
