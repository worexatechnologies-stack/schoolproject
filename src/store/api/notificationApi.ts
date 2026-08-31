import { baseApi } from './baseApi';

export interface NotificationRecord {
  id: number;
  title: string;
  body: string;
  category: string;
  channel: string;
  read_at: string | null;
  created_at: string;
  sender?: {
    id: number;
    name: string;
    role: string;
  };
}

export interface NotificationComposerPayload {
  recipientMode: 'all' | 'subject' | 'section' | 'individual';
  recipients?: string[];
  category: string;
  title: string;
  body: string;
}

export const notificationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query<NotificationRecord[], void>({
      query: () => ({ url: '/notifications/' }),
      providesTags: ['Notification'],
    }),
    markNotificationRead: build.mutation<NotificationRecord, number>({
      query: (id) => ({ url: `/notifications/${id}/read/`, method: 'PATCH' }),
      invalidatesTags: ['Notification'],
    }),
    notifyTeachers: build.mutation<{ created: number }, NotificationComposerPayload>({
      query: (body) => ({ url: '/notifications/school-to-teachers/', method: 'POST', body }),
      invalidatesTags: ['Notification'],
    }),
    notifyParents: build.mutation<{ created: number }, NotificationComposerPayload>({
      query: (body) => ({ url: '/notifications/teacher-to-parents/', method: 'POST', body }),
      invalidatesTags: ['Notification'],
    }),
    notifyStudents: build.mutation<{ created: number }, NotificationComposerPayload>({
      query: (body) => ({ url: '/notifications/teacher-to-students/', method: 'POST', body }),
      invalidatesTags: ['Notification'],
    }),
    notifyAdmin: build.mutation<{ created: number }, NotificationComposerPayload>({
      query: (body) => ({ url: '/notifications/teacher-to-admin/', method: 'POST', body }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useNotifyTeachersMutation,
  useNotifyParentsMutation,
  useNotifyStudentsMutation,
  useNotifyAdminMutation,
} = notificationApi;
