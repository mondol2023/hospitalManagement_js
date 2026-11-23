import { api } from '@/shared/api/client';
import type { Role } from '@/shared/lib/roles';
import type { User } from '@/shared/types/domain';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
}

/** Admin-only on the server. Read-only here: the pickers need to find people, not edit them. */
export const usersApi = {
  list: (params?: UserListParams) => api.page<User>('/users', { params }),

  get: (id: string) => api.get<User>(`/users/${id}`),
};
