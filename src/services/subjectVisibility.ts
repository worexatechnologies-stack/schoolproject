import { apiRequest } from './api';

export interface VisibleSubjectScope {
  classId: number;
  className: string;
  sectionId: number;
  sectionName: string;
}

export interface VisibleSubject {
  id: number;
  name: string;
  scopes: VisibleSubjectScope[];
}

export interface SubjectVisibility {
  role: string;
  scopeKind: 'school_catalog' | 'teacher_assignment' | 'student_class' | 'linked_students_classes' | 'none';
  teacherId: number | null;
  subjects: VisibleSubject[];
  semantics: {
    assigned: string;
    scheduled: string;
  };
}

export function loadVisibleSubjects(): Promise<SubjectVisibility> {
  return apiRequest<SubjectVisibility>('/subjects/visible/');
}
