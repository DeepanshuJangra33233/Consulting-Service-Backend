import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { UserEntity } from '../common/types';

@ApiTags('Authentication')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getMe(@CurrentUser() user: UserEntity) {
    const profile = await this.authService.getMe(user);
    return {
      success: true,
      data: profile,
      message: 'Profile retrieved successfully',
    };
  }

  @Post('sync-profile')
  @ApiOperation({ summary: 'Sync or update authenticated user profile in Firestore' })
  @ApiResponse({ status: 200, description: 'User profile synchronized' })
  async syncProfile(
    @CurrentUser() user: UserEntity,
    @Body() body: { name?: string; phone?: string; photoUrl?: string },
  ) {
    const profile = await this.authService.syncProfile(user, body || {});
    return {
      success: true,
      data: profile,
      message: 'Profile synchronized successfully',
    };
  }
}
