import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { UserEntity } from '../common/types';

@Injectable()
export class AuthService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async getMe(user: UserEntity): Promise<UserEntity> {
    const freshUser = await this.firebaseService.getDoc<UserEntity>('users', user.id);
    return freshUser || user;
  }
}
