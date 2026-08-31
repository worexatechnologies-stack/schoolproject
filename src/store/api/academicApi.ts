import { baseApi } from './baseApi';

export interface AcademicYearRecord {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  is_active: boolean;
  schoolId?: number;
}

export interface ClassRecord {
  id: number;
  name: string;
  code: string;
  sortOrder: number;
  subjectIds?: number[];
  subjects?: Array<number | { id?: number }>;
  schoolId?: number;
}

export interface SectionRecord {
  id: number;
  classId: number;
  name: string;
  schoolId?: number;
}

export interface SubjectRecord {
  id: number;
  name: string;
  schoolId?: number;
}

type Page<T> = { next?: string | null; results?: T[] } | T[];

function unwrapPage<T>(payload: Page<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

export const academicApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAcademicYears: build.query<AcademicYearRecord[], void>({
      query: () => ({ url: '/academic-years/' }),
      transformResponse: (response: Page<AcademicYearRecord>) => unwrapPage(response),
      providesTags: ['AcademicYear'],
    }),
    createAcademicYear: build.mutation<AcademicYearRecord, { name: string; startsOn: string; endsOn: string; is_active: boolean }>({
      query: (body) => ({ url: '/academic-years/', method: 'POST', body }),
      invalidatesTags: ['AcademicYear'],
    }),
    updateAcademicYear: build.mutation<AcademicYearRecord, { id: number; name: string; startsOn: string; endsOn: string; is_active: boolean }>({
      query: ({ id, ...body }) => ({ url: `/academic-years/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['AcademicYear'],
    }),
    deleteAcademicYear: build.mutation<void, number>({
      query: (id) => ({ url: `/academic-years/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['AcademicYear'],
    }),
    getClasses: build.query<ClassRecord[], void>({
      query: () => ({ url: '/classes/' }),
      transformResponse: (response: Page<ClassRecord>) => unwrapPage(response),
      providesTags: ['Class'],
    }),
    createClass: build.mutation<ClassRecord, { name: string; code: string; sortOrder: number; subjectIds: number[] }>({
      query: (body) => ({ url: '/classes/', method: 'POST', body }),
      invalidatesTags: ['Class'],
    }),
    updateClass: build.mutation<ClassRecord, { id: number; name: string; code: string; sortOrder: number; subjectIds: number[] }>({
      query: ({ id, ...body }) => ({ url: `/classes/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Class'],
    }),
    deleteClass: build.mutation<void, { id: number; cascade?: 'sections' }>({
      query: ({ id, cascade }) => ({
        url: `/classes/${id}/${cascade ? `?cascade=${cascade}` : ''}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Class', 'Section'],
    }),
    getSections: build.query<SectionRecord[], void>({
      query: () => ({ url: '/sections/' }),
      transformResponse: (response: Page<SectionRecord>) => unwrapPage(response),
      providesTags: ['Section'],
    }),
    createSection: build.mutation<SectionRecord, { classId: number; name: string }>({
      query: (body) => ({ url: '/sections/', method: 'POST', body: { classId: body.classId, name: body.name } }),
      invalidatesTags: ['Section'],
    }),
    updateSection: build.mutation<SectionRecord, { id: number; classId: number; name: string }>({
      query: ({ id, ...body }) => ({ url: `/sections/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Section'],
    }),
    deleteSection: build.mutation<void, number>({
      query: (id) => ({ url: `/sections/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Section'],
    }),
    getSubjects: build.query<SubjectRecord[], void>({
      query: () => ({ url: '/subjects/' }),
      transformResponse: (response: Page<SubjectRecord>) => unwrapPage(response),
      providesTags: ['Subject'],
    }),
    createSubject: build.mutation<SubjectRecord, { name: string }>({
      query: (body) => ({ url: '/subjects/', method: 'POST', body }),
      invalidatesTags: ['Subject'],
    }),
    updateSubject: build.mutation<SubjectRecord, { id: number; name: string }>({
      query: ({ id, name }) => ({ url: `/subjects/${id}/`, method: 'PATCH', body: { name } }),
      invalidatesTags: ['Subject'],
    }),
    deleteSubject: build.mutation<void, number>({
      query: (id) => ({ url: `/subjects/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Subject'],
    }),
  }),
});

export const {
  useGetAcademicYearsQuery,
  useCreateAcademicYearMutation,
  useUpdateAcademicYearMutation,
  useDeleteAcademicYearMutation,
  useGetClassesQuery,
  useCreateClassMutation,
  useUpdateClassMutation,
  useDeleteClassMutation,
  useGetSectionsQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useGetSubjectsQuery,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useDeleteSubjectMutation,
} = academicApi;