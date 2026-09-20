import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { EmailService } from '../email/email.service';
import { UserEntity, UserRole } from '../common/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly emailService: EmailService,
  ) {}

  async getMe(user: UserEntity): Promise<UserEntity> {
    const freshUser = await this.firebaseService.getDoc<UserEntity>('users', user.id);
    return freshUser || user;
  }

  async syncProfile(user: UserEntity, data: { name?: string; phone?: string; photoUrl?: string }): Promise<UserEntity> {
    const existing = await this.firebaseService.getDoc<UserEntity>('users', user.id);
    const isDesignatedAdmin = this.firebaseService.isAdminEmail(user.email);
    
    // Strict Admin Enforcement:
    // Sign-up or new account creation NEVER grants admin.
    // Admin role is ONLY preserved for pre-existing designated admin accounts (admin@gmail.com / admin@gmaiil.com).
    // All newly registered accounts and all other emails are strictly role: 'user'.
    const role: UserRole = (existing && isDesignatedAdmin) ? 'admin' : 'user';

    // Check if welcome email has ever been sent to this user
    const shouldSendWelcome = (!existing || !existing.welcomeEmailSent) && role === 'user';

    const updated: UserEntity = {
      id: user.id,
      email: user.email,
      name: data.name || user.name || existing?.name || user.email.split('@')[0],
      phone: data.phone || existing?.phone,
      photoUrl: data.photoUrl || user.photoUrl || existing?.photoUrl,
      role,
      welcomeEmailSent: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.firebaseService.setDoc('users', user.id, updated);

    // Send welcome registration email if user has not received it yet
    if (shouldSendWelcome) {
      this.emailService.sendRegistrationWelcome(updated.email, updated.name).catch((err) => {
        this.logger.error(`Failed to send welcome registration email to ${updated.email}: ${err.message}`);
      });
    }

    return updated;
  }
}

