import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
