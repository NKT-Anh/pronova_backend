import { User, UserSetting } from '@prisma/client';

export type UserWithSetting = User & { setting?: UserSetting | null };

export function toUserResponse(user: UserWithSetting) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    googleId: user.googleId,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    setting: user.setting,
  };
}
