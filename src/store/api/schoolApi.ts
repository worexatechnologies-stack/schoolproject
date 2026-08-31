import { baseApi } from './baseApi';

export interface SchoolRecord {
  id: number;
  schoolName: string;
  code: string;
  subdomain?: string;
  logoIcon?: string;
  logoImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  theme?: string;
  is_active?: boolean;
  isDemo?: boolean;
}

type Page<T> = { next?: string | null; results?: T[] } | T[];

function unwrapPage<T>(payload: Page<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

export const schoolApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSchools: build.query<SchoolRecord[], void>({
      query: () => ({ url: '/schools/' }),
      transformResponse: (response: Page<SchoolRecord>) => unwrapPage(response),
      providesTags: ['School'],
    }),
    createSchool: build.mutation<SchoolRecord, FormData>({
      query: (body) => ({ url: '/schools/', method: 'POST', body }),
      invalidatesTags: ['School'],
    }),
    updateSchool: build.mutation<SchoolRecord, { id: number; body: FormData }>({
      query: ({ id, body }) => ({ url: `/schools/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['School'],
    }),
    deleteSchool: build.mutation<{ detail: string }, { id: number; confirmation: string }>({
      query: ({ id, confirmation }) => ({
        url: `/schools/${id}/`,
        method: 'DELETE',
        body: { confirmation },
      }),
      invalidatesTags: ['School'],
    }),
  }),
});

export const {
  useGetSchoolsQuery,
  useCreateSchoolMutation,
  useUpdateSchoolMutation,
  useDeleteSchoolMutation,
} = schoolApi;
