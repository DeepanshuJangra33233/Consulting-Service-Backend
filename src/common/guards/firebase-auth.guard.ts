import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../firebase/firebase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ErrorCodes } from '../errors/error-codes';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebaseService: FirebaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        message: 'Authentication required. Missing Bearer token.',
        code: ErrorCodes.AUTH_REQUIRED,
      });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await this.firebaseService.verifyIdToken(token);

      // Check Firestore users collection to ensure role is up-to-date
      let userRecord = await this.firebaseService.getDoc('users', decodedToken.uid);
      if (!userRecord) {
        // Automatically link/store authenticated user profile
        userRecord = {
          id: decodedToken.uid,
          email: decodedToken.email,
          name: (decodedToken as any).name || decodedToken.email?.split('@')[0] || 'Customer',
          role: (decodedToken as any).role || 'customer',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.firebaseService.setDoc('users', decodedToken.uid, userRecord);
      }

      request.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        name: userRecord.name,
        role: userRecord.role || 'customer',
      };

      return true;
    } catch (error) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        message: 'Invalid or expired authentication token',
        code: ErrorCodes.AUTH_INVALID,
      });
    }
  }
}
