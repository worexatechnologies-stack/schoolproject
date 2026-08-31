import { baseApi } from './baseApi';
import type { AuthUser } from '../../utils/auth';
import type { UserRole } from '../../types';

export interface LoginResponse {
  access: string;
  // The refresh token is delivered ONLY as an HttpOnly cookie by the server.
  // It is never returned in the JSON body, so we do not type it here.
  user: AuthUser & { role: string };
}

export interface LoginRequest {
  email: string;
  password: string;
  role?: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login/',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth'],
      transformResponse: (data: LoginResponse) => ({
        ...data,
        user: {
          ...data.user,
          role: (roleMap[data.user.role] || data.user.role) as UserRole,
        },
      }),
    }),
    getCurrentUser: build.query<AuthUser, void>({
      query: () => ({ url: '/auth/me/' }),
      providesTags: ['Auth'],
      transformResponse: (data: AuthUser & { role: string }) => ({
        email: data.email,
        name: data.name || data.email,
        role: (roleMap[data.role] || data.role) as UserRole,
        schoolId: data.schoolId,
        schoolName: data.schoolName,
        studentId: data.studentId,
        parentStudentIds: data.parentStudentIds || [],
        permissions: data.permissions || [],
        mustChangePassword: Boolean(data.mustChangePassword),
      }),
    }),
    changePassword: build.mutation<void, { password: string }>({
      query: (body) => ({
        url: '/auth/change-password/',
        method: 'POST',
        body,
      }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({
        url: '/auth/logout/',
        method: 'POST',
      }),
      invalidatesTags: ['Auth'],
    }),
    resetCredentials: build.mutation<{ loginId: string; temporaryPassword: string }, number>({
      query: (userId) => ({
        url: `/auth/users/${userId}/reset-credentials/`,
        method: 'POST',
      }),
      invalidatesTags: ['Auth'],
    }),
    getUsers: build.query<Array<{
      id: number;
      email: string;
      name: string;
      role: string;
      schoolId?: string;
      schoolName?: string;
      isActive?: boolean;
      mustChangePassword?: boolean;
      studentId?: string;
      parentStudentIds?: string[];
      permissions?: string[];
    }>, void>({
      query: () => ({ url: '/auth/users/' }),
      providesTags: ['User'],
    }),
  }),
});

const roleMap: Record<string, string> = {
  super_admin: 'Super Admin',
  school_admin: 'School Admin',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  public_learner: 'Public Learner',
};

export const {
  useLoginMutation,
  useGetCurrentUserQuery,
  useChangePasswordMutation,
  useLogoutMutation,
  useResetCredentialsMutation,
  useGetUsersQuery,
} = authApi;