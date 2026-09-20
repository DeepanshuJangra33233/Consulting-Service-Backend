import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserEntity } from '../types';

export const CurrentUser = createParamDecorator(
  (data: keyof UserEntity | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data && user ? user[data] : user;
  },
);
