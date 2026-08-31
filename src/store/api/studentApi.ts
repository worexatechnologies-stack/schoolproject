import { baseApi } from './baseApi';
import type { Student, StudentDocument } from '../../types';

type Page<T> = { next?: string | null; results?: T[] } | T[];

function unwrapPage<T>(payload: Page<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

export interface StudentApiRecord {
  id: string | number;
  admissionNo: string;
  name: string;
  class?: string;
  class_?: string;
  classId?: number;
  section?: string;
  sectionId?: number;
  rollNo: number;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  dob: string;
  gender: string;
  address?: string;
  medicalConditions?: string;
  medical_conditions?: string;
  qrCodeData?: string;
  status: 'Active' | 'Promoted' | 'TC_Issued';
  academicYear: string;
  attendancePercentage?: string | number | null;
  feeTotal?: string | number | null;
  feePaid?: string | number | null;
  gpa?: string | number | null;
  documents?: Student['documents'];
  history?: Student['history'];
  photoUrl?: string;
  bloodGroup?: string;
  aadhaar?: string;
  fatherName?: string;
  motherName?: string;
}

function normalizeStudent(student: StudentApiRecord): Student {
  return {
    id: String(student.id),
    admissionNo: student.admissionNo,
    name: student.name,
    class: student.class || student.class_ || '',
    classId: student.classId,
    section: student.section || '',
    sectionId: student.sectionId,
    rollNo: student.rollNo,
    parentName: student.parentName,
    parentPhone: student.parentPhone,
    parentEmail: student.parentEmail,
    dob: student.dob,
    gender: student.gender,
    address: student.address || '',
    medicalConditions: student.medicalConditions || student.medical_conditions || '',
    qrCodeData: student.qrCodeData || `SCH-ERP-${student.id}`,
    status: student.status,
    academicYear: student.academicYear,
    attendancePercentage: student.attendancePercentage == null ? undefined : Number(student.attendancePercentage),
    feeTotal: student.feeTotal == null ? undefined : Number(student.feeTotal),
    feePaid: student.feePaid == null ? undefined : Number(student.feePaid),
    gpa: student.gpa == null ? undefined : Number(student.gpa),
    documents: student.documents,
    history: student.history,
    photoUrl: student.photoUrl,
    bloodGroup: student.bloodGroup,
    aadhaar: student.aadhaar,
    fatherName: student.fatherName,
    motherName: student.motherName,
  };
}

export const studentApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getStudents: build.query<Student[], void>({
      query: () => ({ url: '/students/' }),
      transformResponse: (response: Page<StudentApiRecord>) => unwrapPage(response).map(normalizeStudent),
      providesTags: ['Student'],
    }),
    getStudent: build.query<Student, string>({
      query: (id) => ({ url: `/students/${id}/` }),
      transformResponse: (response: StudentApiRecord) => normalizeStudent(response),
      providesTags: ['Student'],
    }),
    createStudent: build.mutation<StudentApiRecord, FormData>({
      query: (body) => ({ url: '/students/', method: 'POST', body }),
      invalidatesTags: ['Student', 'Auth'],
    }),
    updateStudent: build.mutation<StudentApiRecord, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `/students/${id}/`, method: 'PATCH', body }),
      invalidatesTags: ['Student'],
    }),
    deleteStudent: build.mutation<void, string>({
      query: (id) => ({ url: `/students/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Student', 'Auth'],
    }),
    getStudentDocuments: build.query<StudentDocument[], string>({
      query: (studentId) => ({ url: `/students/${studentId}/documents/` }),
      providesTags: ['Student'],
    }),
    uploadStudentDocument: build.mutation<StudentDocument, { studentId: string; body: FormData }>({
      query: ({ studentId, body }) => ({ url: `/students/${studentId}/documents/`, method: 'POST', body }),
      invalidatesTags: ['Student'],
    }),
    deleteStudentDocument: build.mutation<void, { studentId: string; docId: number }>({
      query: ({ studentId, docId }) => ({ url: `/students/${studentId}/documents/${docId}/`, method: 'DELETE' }),
      invalidatesTags: ['Student'],
    }),
    getStudentResults: build.query<unknown[], string>({
      query: (studentId) => ({ url: `/students/${studentId}/results/` }),
    }),
  }),
});

export const {
  useGetStudentsQuery,
  useGetStudentQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  useGetStudentDocumentsQuery,
  useUploadStudentDocumentMutation,
  useDeleteStudentDocumentMutation,
  useGetStudentResultsQuery,
} = studentApi;