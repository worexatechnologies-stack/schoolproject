import { baseApi } from './baseApi';

export interface TeacherApiDocument {
  id: number;
  name: string;
  status: string;
  fileType: string;
  downloadUrl?: string;
}

export interface TeacherApiAssignment {
  id?: number;
  sectionId: number;
  subjectId: number;
  classId?: number;
  className?: string;
  sectionName?: string;
  subjectName?: string;
}

export interface TeacherRecord {
  id: number;
  userId?: number;
  name: string;
  email: string;
  phone: string;
  subjects: string[];
  subjectIds?: number[];
  assignedSections: string[];
  assignedSectionIds?: number[];
  qualification: string;
  joiningDate: string;
  status: 'Active' | 'Inactive';
  isOnline?: boolean;
  photoUrl?: string;
  username?: string;
  teachingAssignments?: TeacherApiAssignment[];
  documents?: TeacherApiDocument[];
}

export interface TeacherCredentials {
  username: string;
  password: string;
  userId: number;
  mustChangePassword: boolean;
}

export interface TeacherCreationResponse extends TeacherRecord {
  loginCredentials?: TeacherCredentials;
  photoUrl?: string;
}

type Page<T> = { next?: string | null; results?: T[] } | T[];

function unwrapPage<T>(payload: Page<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

export const teacherApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTeachers: build.query<TeacherRecord[], void>({
      query: () => ({ url: '/teachers/' }),
      transformResponse: (response: Page<TeacherRecord>) => unwrapPage(response),
      providesTags: ['Teacher'],
    }),
    getTeacher: build.query<TeacherRecord, number>({
      query: (id) => ({ url: `/teachers/${id}/` }),
      providesTags: ['Teacher'],
    }),
    createTeacher: build.mutation<TeacherCreationResponse, FormData>({
      query: (body) => ({ url: '/teachers/', method: 'POST', body }),
      invalidatesTags: ['Teacher', 'Auth'],
    }),
    updateTeacher: build.mutation<TeacherRecord, { id: number; body: FormData }>({
      query: ({ id, body }) => ({ url: `/teachers/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Teacher'],
    }),
    deleteTeacher: build.mutation<void, number>({
      query: (id) => ({ url: `/teachers/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Teacher', 'Auth'],
    }),
    addTeachingAssignment: build.mutation<TeacherRecord, { teacherId: number; sectionId: number; subjectId: number }>({
      query: ({ teacherId, sectionId, subjectId }) => ({
        url: `/teachers/${teacherId}/teaching-assignments/`,
        method: 'POST',
        body: { sectionId, subjectId },
      }),
      invalidatesTags: ['Teacher'],
    }),
    uploadTeacherDocument: build.mutation<TeacherApiDocument, { teacherId: number; body: FormData }>({
      query: ({ teacherId, body }) => ({ url: `/teachers/${teacherId}/documents/`, method: 'POST', body }),
      invalidatesTags: ['Teacher'],
    }),
    deleteTeacherDocument: build.mutation<void, { teacherId: number; docId: number }>({
      query: ({ teacherId, docId }) => ({ url: `/teachers/${teacherId}/documents/${docId}/`, method: 'DELETE' }),
      invalidatesTags: ['Teacher'],
    }),
  }),
});

export const {
  useGetTeachersQuery,
  useGetTeacherQuery,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useDeleteTeacherMutation,
  useAddTeachingAssignmentMutation,
  useUploadTeacherDocumentMutation,
  useDeleteTeacherDocumentMutation,
} = teacherApi;
