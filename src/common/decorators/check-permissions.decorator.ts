import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const CheckPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
