import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, Edit, FileText, KeyRound, Mail, Phone, Plus, Search, ShieldCheck, Trash2, UploadCloud, UserRoundCheck, XCircle } from 'lucide-react';
import { emitNotification } from '../services/notificationBus';
import { apiDownload } from '../services/api';
import AuthenticatedImage from './AuthenticatedImage';
import { formatBytes, optimizeImageForUpload } from '../services/imageOptimizer';
import {
  ACADEMIC_STRUCTURE_CHANGED_EVENT,
  AcademicClass,
  AcademicSection,
  AcademicSubject,
  loadAcademicStructure,
} from '../services/academicStructure';
import { announceTeacherAssignmentsChanged } from '../services/teacherAssignments';
import {
  useGetTeachersQuery,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useDeleteTeacherMutation,
  useAddTeachingAssignmentMutation,
  useUploadTeacherDocumentMutation,
  useDeleteTeacherDocumentMutation,
} from '../store/api/teacherApi';
import { useResetCredentialsMutation } from '../store/api/authApi';

interface TeacherRecord {
  id: string;
  userId?: number;
  name: string;
  email: string;
  phone: string;
  subjects: string[];
  subjectIds: number[];
  assignedSections: string[];
  assignedSectionIds: number[];
  teachingAssignments: TeachingAssignment[];
  joiningDate: string;
  qualification: string;
  documents: TeacherDocument[];
  status: 'Active' | 'Inactive';
  username: string;
  photoUrl?: string;
  photoFile?: File;
}

interface TeachingAssignment {
  id?: number;
  sectionId: number;
  subjectId: number;
  classId?: number;
  className?: string;
  sectionName?: string;
  subjectName?: string;
}

interface TeacherDocument {
  id: number;
  name: string;
  status: 'Uploaded' | 'Pending' | 'Verified';
  fileType: string;
  downloadUrl?: string;
}

type Paginated<T> = { results?: T[] } | T[];
type TeacherCreationResponse = TeacherRecord & {
  loginCredentials: { username: string; password: string; userId: number; mustChangePassword: boolean };
  photoUrl?: string;
};

const collection = <T,>(payload: Paginated<T>): T[] => Array.isArray(payload) ? payload : payload.results || [];

const STORAGE_KEY = 'erp_teachers';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return fallback;

  const data = (error as { data?: unknown }).data;
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return fallback;

  const messages = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(messages);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.detail === 'string') return [record.detail];
      return Object.values(record).flatMap(messages);
    }
    return [];
  };

  const extracted = messages(data);
  return extracted.length ? extracted.join(' ') : fallback;
}

function loadTeachers(): TeacherRecord[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((teacher: any) => ({
      id: teacher.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: teacher.name || 'Unnamed Teacher',
      email: teacher.email || '',
      phone: teacher.phone || '',
      subjects: Array.isArray(teacher.subjects) ? teacher.subjects : Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects : [],
      subjectIds: Array.isArray(teacher.subjectIds) ? teacher.subjectIds.map(Number) : [],
      assignedSections: Array.isArray(teacher.assignedSections) ? teacher.assignedSections : [],
      assignedSectionIds: Array.isArray(teacher.assignedSectionIds) ? teacher.assignedSectionIds.map(Number) : [],
      teachingAssignments: Array.isArray(teacher.teachingAssignments) ? teacher.teachingAssignments.map((assignment: any) => ({
        ...assignment,
        sectionId: Number(assignment.sectionId),
        subjectId: Number(assignment.subjectId),
      })) : [],
      joiningDate: teacher.joiningDate || new Date().toISOString().slice(0, 10),
      qualification: teacher.qualification || '',
      documents: Array.isArray(teacher.documents) ? teacher.documents : [],
      status: teacher.status === 'Inactive' ? 'Inactive' : 'Active',
      username: teacher.username || teacher.email || '',
      photoUrl: teacher.photoUrl || '',
    }));
  } catch {
    return [];
  }
}

function loadLoginUsers(): any[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('sa_users') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function TeacherDirectory() {
  // Never flash a previous tenant's cached directory while the authenticated
  // school-scoped API is loading.
  const [teachers, setTeachers] = useState<TeacherRecord[]>(() => (
    localStorage.getItem('school_erp_api_token') ? [] : loadTeachers()
  ));
  const [loginUsers, setLoginUsers] = useState<any[]>(loadLoginUsers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    subjectIds: [] as number[],
    assignedSectionIds: [] as number[],
    teachingAssignments: [] as TeachingAssignment[],
    joiningDate: new Date().toISOString().slice(0, 10),
    qualification: '',
    status: 'Active' as 'Active' | 'Inactive',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoSummary, setPhotoSummary] = useState('');
  const [documentsTeacherId, setDocumentsTeacherId] = useState<string | null>(null);
  const [teacherDocumentName, setTeacherDocumentName] = useState('Qualification Certificate');
  const [teacherDocumentFile, setTeacherDocumentFile] = useState<File | null>(null);
  const [isDocumentUploading, setIsDocumentUploading] = useState(false);
  const [academicClasses, setAcademicClasses] = useState<AcademicClass[]>([]);
  const [academicSections, setAcademicSections] = useState<AcademicSection[]>([]);
  const [academicSubjects, setAcademicSubjects] = useState<AcademicSubject[]>([]);
  const [academicStructureError, setAcademicStructureError] = useState('');
  const [teacherListError, setTeacherListError] = useState('');
  const isServerBacked = Boolean(localStorage.getItem('school_erp_api_token'));
  const classOptions = academicClasses;
  const sectionOptions = academicSections;
  const sectionLabel = (section: AcademicSection) => {
    const classroom = classOptions.find((item) => item.id === section.classId);
    return `${classroom?.name || 'Class'}-${section.name}`;
  };
  const buildTeachingAssignments = (sectionIds: number[], subjectIds: number[]): TeachingAssignment[] => {
    const uniqueAssignments = new Map<string, TeachingAssignment>();
    sectionIds.forEach((sectionId) => {
      const section = sectionOptions.find((item) => item.id === sectionId);
      const classroom = classOptions.find((item) => item.id === section?.classId);
      if (!classroom) return;
      subjectIds
        .filter((subjectId) => (classroom.subjectIds || []).includes(subjectId))
        .forEach((subjectId) => uniqueAssignments.set(`${sectionId}:${subjectId}`, { sectionId, subjectId }));
    });
    return Array.from(uniqueAssignments.values());
  };

  const updateAssignedSections = (sectionIds: number[]) => {
    const assignedSectionIds = Array.from(new Set(sectionIds));
    setForm((current) => ({
      ...current,
      assignedSectionIds,
      teachingAssignments: buildTeachingAssignments(assignedSectionIds, current.subjectIds),
    }));
  };

  const updateSubjectIds = (subjectIds: number[]) => {
    const uniqueSubjectIds = Array.from(new Set(subjectIds));
    setForm((current) => ({
      ...current,
      subjectIds: uniqueSubjectIds,
      teachingAssignments: buildTeachingAssignments(current.assignedSectionIds, uniqueSubjectIds),
    }));
  };

  const availableTeacherSubjects = academicSubjects.filter((subject) =>
    form.assignedSectionIds.some((sectionId) => {
      const section = sectionOptions.find((s) => s.id === sectionId);
      if (!section) return false;
      const classroom = classOptions.find((c) => c.id === section.classId);
      return (classroom?.subjectIds || []).includes(subject.id);
    })
  );

  const { data: serverTeacherRows = [], error: teachersApiError } = useGetTeachersQuery(undefined, { skip: !isServerBacked });
  const [createTeacherMutation] = useCreateTeacherMutation();
  const [updateTeacherMutation] = useUpdateTeacherMutation();
  const [deleteTeacherMutation] = useDeleteTeacherMutation();
  const [addTeachingAssignmentMutation] = useAddTeachingAssignmentMutation();
  const [uploadTeacherDocMutation] = useUploadTeacherDocumentMutation();
  const [deleteTeacherDocMutation] = useDeleteTeacherDocumentMutation();
  const [resetCredentialsMutation] = useResetCredentialsMutation();

  useEffect(() => {
    if (!isServerBacked || !serverTeacherRows.length) return;
    const serverTeachers: TeacherRecord[] = serverTeacherRows.map((teacher) => ({
      id: String(teacher.id),
      userId: teacher.userId,
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [],
      subjectIds: Array.isArray(teacher.subjectIds) ? teacher.subjectIds.map(Number) : [],
      assignedSections: Array.isArray(teacher.assignedSections) ? teacher.assignedSections : [],
      assignedSectionIds: Array.isArray(teacher.assignedSectionIds) ? teacher.assignedSectionIds.map(Number) : [],
      teachingAssignments: (teacher.teachingAssignments || []).map((assignment) => ({
        ...assignment,
        sectionId: Number(assignment.sectionId),
        subjectId: Number(assignment.subjectId),
      })),
      joiningDate: teacher.joiningDate,
      qualification: teacher.qualification,
      documents: (teacher.documents || []).map((doc) => ({
        id: doc.id,
        name: doc.name,
        status: (doc.status === 'Uploaded' || doc.status === 'Pending' || doc.status === 'Verified' ? doc.status : 'Uploaded') as TeacherDocument['status'],
        fileType: doc.fileType,
        downloadUrl: doc.downloadUrl,
      })),
      status: teacher.status,
      username: teacher.username || teacher.email,
      photoUrl: teacher.photoUrl || '',
    }));
    saveTeachers(serverTeachers);
    setTeacherListError('');
  }, [isServerBacked, serverTeacherRows]);

  useEffect(() => {
    if (teachersApiError) {
      setTeacherListError(
        teachersApiError instanceof Error ? teachersApiError.message : 'Could not load teacher profiles.',
      );
    }
  }, [teachersApiError]);

  useEffect(() => {
    if (!isServerBacked) return;
    const load = () => loadAcademicStructure()
      .then(({ classes, sections, subjects }) => {
        setAcademicClasses(classes);
        setAcademicSections(sections);
        setAcademicSubjects(subjects);
        setAcademicStructureError('');
      })
      .catch((error) => setAcademicStructureError(error instanceof Error ? error.message : 'Could not load classes and sections.'));
    void load();
    window.addEventListener(ACADEMIC_STRUCTURE_CHANGED_EVENT, load);
    return () => window.removeEventListener(ACADEMIC_STRUCTURE_CHANGED_EVENT, load);
  }, [isServerBacked]);

  const filtered = useMemo(() => teachers.filter((teacher) => {
    const query = search.toLowerCase();
    const subjects = Array.isArray(teacher.subjects) ? teacher.subjects : [];
    const assignedSections = Array.isArray(teacher.assignedSections) ? teacher.assignedSections : [];
    const matchesSearch = [teacher.name, teacher.email, teacher.phone, subjects.join(' '), assignedSections.join(' ')].join(' ').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'All' || teacher.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [teachers, search, statusFilter]);
  const documentsTeacher = teachers.find((teacher) => teacher.id === documentsTeacherId) || null;

  const saveTeachers = (next: TeacherRecord[]) => {
    setTeachers(next);
    if (!isServerBacked) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveLoginUsers = (next: any[]) => {
    setLoginUsers(next);
    localStorage.setItem('sa_users', JSON.stringify(next));
  };

  const getTeacherLogin = (teacher: TeacherRecord) => (
    loginUsers.find((user: any) => (
      String(user.email || '').toLowerCase() === teacher.email.toLowerCase() &&
      user.role === 'Teacher'
    ))
  );

  const copyTeacherCredentials = (teacher: TeacherRecord) => {
    navigator.clipboard?.writeText(`Login ID: ${teacher.email}`);
  };

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      password: '',
      phone: '',
      subjectIds: [],
      assignedSectionIds: [],
      teachingAssignments: [],
      joiningDate: new Date().toISOString().slice(0, 10),
      qualification: '',
      status: 'Active',
    });
    setPhotoFile(null);
    setPhotoPreview('');
    setPhotoSummary('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const teachingAssignments = form.teachingAssignments.map(({ sectionId, subjectId }) => ({ sectionId, subjectId }));
    const selectedSubjects = academicSubjects.filter((subject) => form.subjectIds.includes(subject.id));
    const subjects = selectedSubjects.map((subject) => subject.name);
    const assignedSectionRecords = sectionOptions.filter((section) => form.assignedSectionIds.includes(section.id));
    const assignedSections = assignedSectionRecords.map(sectionLabel);
    const { password: _manualPassword, ...teacherProfileForm } = form;

    if (!teachingAssignments.length) {
      alert('Add at least one exact class-section and subject assignment for this teacher.');
      return;
    }
    const invalidAssignment = teachingAssignments.some((assignment) => {
      const section = sectionOptions.find((item) => item.id === assignment.sectionId);
      const classroom = classOptions.find((item) => item.id === section?.classId);
      return !section || !classroom || !(classroom.subjectIds || []).includes(assignment.subjectId);
    });
    if (invalidAssignment) {
      alert('A selected subject is no longer assigned to that class. Refresh Academic Setup and choose the exact assignment again.');
      return;
    }

    if (editingId) {
      const trimmedPhone = form.phone.trim();
      if (trimmedPhone) {
        const phoneExists = teachers.some(
          (teacher) => teacher.id !== editingId && teacher.phone && teacher.phone.trim().replace(/\s+/g, '') === trimmedPhone.replace(/\s+/g, '')
        );
        if (phoneExists) {
          alert('Phone number already exists.');
          return;
        }
      }
      if (form.password && form.password.length < 8) {
        alert('New permanent password must be at least 8 characters.');
        return;
      }
      if (isServerBacked) {
        try {
          const body = new FormData();
          body.append('phone', form.phone);
          body.append('subjectIds', JSON.stringify(form.subjectIds));
          body.append('assignedSectionIds', JSON.stringify(form.assignedSectionIds));
          body.append('teachingAssignments', JSON.stringify(teachingAssignments));
          body.append('joiningDate', form.joiningDate);
          body.append('qualification', form.qualification);
          body.append('status', form.status);
          if (photoFile) body.append('photo', photoFile);
          const saved = await updateTeacherMutation({ id: Number(editingId), body }).unwrap();
          const current = teachers.find((teacher) => teacher.id === editingId);
          const serverTeacher: TeacherRecord = {
            ...current,
            ...saved,
            id: String(saved.id),
            assignedSectionIds: Array.isArray(saved.assignedSectionIds) ? saved.assignedSectionIds.map(Number) : form.assignedSectionIds,
            assignedSections: Array.isArray(saved.assignedSections) ? saved.assignedSections : assignedSections,
            subjectIds: Array.isArray(saved.subjectIds) ? saved.subjectIds.map(Number) : form.subjectIds,
            subjects: Array.isArray(saved.subjects) ? saved.subjects : subjects,
            teachingAssignments: Array.isArray(saved.teachingAssignments) ? saved.teachingAssignments.map((assignment) => ({
              ...assignment,
              sectionId: Number(assignment.sectionId),
              subjectId: Number(assignment.subjectId),
            })) : teachingAssignments,
            documents: Array.isArray(saved.documents) ? saved.documents.map((doc) => ({
              id: doc.id,
              name: doc.name,
              status: (doc.status === 'Uploaded' || doc.status === 'Pending' || doc.status === 'Verified' ? doc.status : 'Uploaded') as TeacherDocument['status'],
              fileType: doc.fileType,
              downloadUrl: doc.downloadUrl,
            })) : current?.documents || [],
            username: current?.username || saved.email || saved.username || '',
          };
          saveTeachers(teachers.map((teacher) => teacher.id === editingId ? serverTeacher : teacher));
          announceTeacherAssignmentsChanged();
          emitNotification({ title: 'Teacher updated', message: `${form.name}'s teacher profile was updated.`, tone: 'success', source: 'teachers' });
          resetForm();
        } catch (error) {
          alert(getApiErrorMessage(error, 'Teacher profile could not be updated.'));
        }
        return;
      }
      const updated = teachers.map((teacher) => teacher.id === editingId ? {
        ...teacher,
        ...teacherProfileForm,
        subjects,
        assignedSections,
        photoUrl: photoPreview || teacher.photoUrl,
        photoFile: photoFile || undefined,
      } : teacher);
      saveTeachers(updated);
      const users = loadLoginUsers();
      saveLoginUsers(users.map((user: any) => (
        String(user.email).toLowerCase() === form.email.toLowerCase()
          ? {
              ...user,
              name: form.name,
              password: form.password || user.password,
              status: form.status,
              locked: form.status === 'Inactive',
              forceReset: false,
          }
          : user
      )));
      emitNotification({ title: 'Teacher updated', message: `${form.name}'s teacher profile${form.password ? ' and permanent password' : ''} was updated.`, tone: 'success', source: 'teachers' });
      resetForm();
      return;
    }

    const trimmedEmail = form.email.trim();
    if (trimmedEmail) {
      const emailExists = teachers.some((teacher) => teacher.email && teacher.email.trim().toLowerCase() === trimmedEmail.toLowerCase());
      if (emailExists) {
        alert('Email already exists.');
        return;
      }
    }

    const trimmedPhone = form.phone.trim();
    if (trimmedPhone) {
      const phoneExists = teachers.some((teacher) => teacher.phone && teacher.phone.trim().replace(/\s+/g, '') === trimmedPhone.replace(/\s+/g, ''));
      if (phoneExists) {
        alert('Phone number already exists.');
        return;
      }
    }

    if (!isServerBacked && !editingId && (!form.password || form.password.length < 8)) {
      alert('Please enter a permanent password with at least 8 characters.');
      return;
    }

    const username = `teacher-${form.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || Date.now()}`;
    const password = form.password;
    if (isServerBacked) {
      try {
        const body = new FormData();
        body.append('name', form.name);
        if (form.email) body.append('email', form.email);
        if (form.password) body.append('password', form.password);
        body.append('phone', form.phone);
        body.append('subjectIds', JSON.stringify(form.subjectIds));
        body.append('assignedSectionIds', JSON.stringify(form.assignedSectionIds));
        body.append('teachingAssignments', JSON.stringify(teachingAssignments));
        body.append('joiningDate', form.joiningDate);
        if (form.qualification) body.append('qualification', form.qualification);
        body.append('status', form.status);
        if (photoFile) body.append('photo', photoFile);
        const created = await createTeacherMutation(body).unwrap();
        const credentials = created.loginCredentials;
        const serverTeacher: TeacherRecord = {
          ...created,
          id: String(created.id),
          userId: credentials?.userId,
          username: credentials?.username || created.email,
          subjectIds: Array.isArray(created.subjectIds) ? created.subjectIds.map(Number) : form.subjectIds,
          assignedSectionIds: Array.isArray(created.assignedSectionIds) ? created.assignedSectionIds.map(Number) : form.assignedSectionIds,
          subjects: Array.isArray(created.subjects) ? created.subjects : subjects,
          assignedSections: Array.isArray(created.assignedSections) ? created.assignedSections : assignedSections,
          documents: Array.isArray(created.documents) ? created.documents.map((doc) => ({
            id: doc.id,
            name: doc.name,
            status: (doc.status === 'Uploaded' || doc.status === 'Pending' || doc.status === 'Verified' ? doc.status : 'Uploaded') as TeacherDocument['status'],
            fileType: doc.fileType,
            downloadUrl: doc.downloadUrl,
          })) : [],
          teachingAssignments: Array.isArray(created.teachingAssignments) ? created.teachingAssignments.map((assignment) => ({
            ...assignment,
            sectionId: Number(assignment.sectionId),
            subjectId: Number(assignment.subjectId),
          })) : teachingAssignments,
          photoUrl: created.photoUrl || photoPreview || undefined,
        };
        saveTeachers([serverTeacher, ...teachers.filter((teacher) => teacher.id !== serverTeacher.id)]);
        announceTeacherAssignmentsChanged();
        setCreatedCredentials({
          username: credentials?.username || created.email,
          password: credentials?.password || '',
          name: created.name,
        });
        emitNotification({ title: 'Teacher login created', message: `${created.name}'s verified login credentials are ready.`, tone: 'success', source: 'teachers' });
        resetForm();
        return;
      } catch (error) {
        alert(getApiErrorMessage(
          error,
          'Teacher account could not be saved to the server. Please check the API connection and try again.',
        ));
        return;
      }
    }
    const newTeacher: TeacherRecord = {
      id: `t-${Date.now()}`,
      ...teacherProfileForm,
      subjects,
      subjectIds: form.subjectIds,
      assignedSections,
      assignedSectionIds: form.assignedSectionIds,
      teachingAssignments,
      username,
      photoUrl: photoPreview || undefined,
      photoFile: photoFile || undefined,
      documents: [],
    };

    const users = loadLoginUsers();
    users.push({
      email: form.email,
      password,
      name: form.name,
      role: 'Teacher',
      schoolId: 'school-default',
      status: 'Active',
      locked: false,
      forceReset: false,
      permissions: ['view_students', 'mark_attendance', 'manage_lessons', 'submit_grades', 'chat_parents'],
    });
    saveLoginUsers(users);

    saveTeachers([newTeacher, ...teachers]);
    setCreatedCredentials({ username: form.email, password, name: form.name });
    emitNotification({ title: 'Teacher login created', message: `${form.name}'s teacher account was created and credentials are ready.`, tone: 'success', source: 'teachers' });
    resetForm();
  };

  const resetTeacherCredentials = async (teacher: TeacherRecord) => {
    if (!isServerBacked || !teacher.userId) {
      alert('This teacher does not have a server-linked account. Refresh the page and try again.');
      return;
    }
    try {
      const credentials = await resetCredentialsMutation(teacher.userId).unwrap();
      setCreatedCredentials({ username: credentials.loginId, password: credentials.temporaryPassword, name: teacher.name });
      emitNotification({ title: 'Teacher credentials reset', message: `A new temporary password was generated for ${teacher.name}.`, tone: 'success', source: 'teachers' });
    } catch (error) {
      alert(error instanceof Error ? `Could not reset teacher credentials: ${error.message}` : 'Could not reset teacher credentials.');
    }
  };

  const updateTeacherDocuments = (teacherId: string, documents: TeacherDocument[]) => {
    saveTeachers(teachers.map((teacher) => teacher.id === teacherId ? { ...teacher, documents } : teacher));
  };

  const uploadTeacherDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!documentsTeacher || !teacherDocumentFile) return;
    if (!isServerBacked) {
      alert('Teacher document upload is available when connected to the server.');
      return;
    }
    setIsDocumentUploading(true);
    try {
      const body = new FormData();
      body.append('name', teacherDocumentName.trim() || teacherDocumentFile.name);
      body.append('file', teacherDocumentFile);
      const uploaded = await uploadTeacherDocMutation({ teacherId: Number(documentsTeacher.id), body }).unwrap();
      const normalizedDoc: TeacherDocument = {
        id: uploaded.id,
        name: uploaded.name,
        status: (uploaded.status === 'Uploaded' || uploaded.status === 'Pending' || uploaded.status === 'Verified' ? uploaded.status : 'Uploaded') as TeacherDocument['status'],
        fileType: uploaded.fileType,
        downloadUrl: uploaded.downloadUrl,
      };
      updateTeacherDocuments(documentsTeacher.id, [normalizedDoc, ...documentsTeacher.documents]);
      setTeacherDocumentFile(null);
      const input = document.getElementById('teacher-document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      alert(`Document "${uploaded.name}" uploaded securely for ${documentsTeacher.name}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Teacher document upload failed.');
    } finally {
      setIsDocumentUploading(false);
    }
  };

  const downloadTeacherDocument = async (teacherDocument: TeacherDocument) => {
    if (!teacherDocument.downloadUrl) return;
    try {
      const { blob, filename } = await apiDownload(teacherDocument.downloadUrl);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Teacher document download failed.');
    }
  };

  const deleteTeacherDocument = async (document: TeacherDocument) => {
    if (!documentsTeacher || !confirm(`Delete "${document.name}"?`)) return;
    try {
      await deleteTeacherDocMutation({ teacherId: Number(documentsTeacher.id), docId: document.id }).unwrap();
      updateTeacherDocuments(documentsTeacher.id, documentsTeacher.documents.filter((item) => item.id !== document.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Teacher document deletion failed.');
    }
  };

  const startEdit = (teacher: TeacherRecord) => {
    const legacySectionIds = teacher.assignedSectionIds?.length
      ? teacher.assignedSectionIds
      : sectionOptions.filter((section) => teacher.assignedSections.includes(sectionLabel(section))).map((section) => section.id);
    const legacySubjectIds = teacher.subjectIds?.length
      ? teacher.subjectIds
      : academicSubjects.filter((subject) => teacher.subjects.includes(subject.name)).map((subject) => subject.id);
    const teachingAssignments = teacher.teachingAssignments?.length
      ? teacher.teachingAssignments.map(({ sectionId, subjectId }) => ({ sectionId, subjectId }))
      : (legacySectionIds.length === 1 || legacySubjectIds.length === 1)
        ? legacySectionIds.flatMap((sectionId) => {
            const section = sectionOptions.find((item) => item.id === sectionId);
            const classroom = classOptions.find((item) => item.id === section?.classId);
            return legacySubjectIds
              .filter((subjectId) => (classroom?.subjectIds || []).includes(subjectId))
              .map((subjectId) => ({ sectionId, subjectId }));
          })
        : [];
    setEditingId(teacher.id);
    setIsAdding(true);
    setForm({
      name: teacher.name,
      email: teacher.email,
      password: '',
      phone: teacher.phone,
      subjectIds: Array.from(new Set(teachingAssignments.map((assignment) => assignment.subjectId))),
      assignedSectionIds: Array.from(new Set(teachingAssignments.map((assignment) => assignment.sectionId))),
      teachingAssignments,
      joiningDate: teacher.joiningDate,
      qualification: teacher.qualification,
      status: teacher.status,
    });
    setPhotoFile(null);
    setPhotoPreview(teacher.photoUrl || '');
    setPhotoSummary('');

    const scrollToTop = () => {
      const pageEl = document.getElementById('teacher-profiles-page');
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    scrollToTop();
    setTimeout(scrollToTop, 50);
  };

  const toggleStatus = async (teacher: TeacherRecord) => {
    const nextStatus = teacher.status === 'Active' ? 'Inactive' : 'Active';
    if (isServerBacked) {
      try {
        const body = new FormData();
        body.append('status', nextStatus);
        const saved = await updateTeacherMutation({ id: Number(teacher.id), body }).unwrap();
        saveTeachers(teachers.map((item) => item.id === teacher.id ? {
          ...item,
          ...saved,
          id: String(saved.id),
          documents: Array.isArray(saved.documents) ? saved.documents.map((doc) => ({
            id: doc.id,
            name: doc.name,
            status: (doc.status === 'Uploaded' || doc.status === 'Pending' || doc.status === 'Verified' ? doc.status : 'Uploaded') as TeacherDocument['status'],
            fileType: doc.fileType,
            downloadUrl: doc.downloadUrl,
          })) : item.documents,
        } : item));
        announceTeacherAssignmentsChanged();
        emitNotification({ title: `Teacher ${nextStatus.toLowerCase()}`, message: `${teacher.name}'s login is now ${nextStatus.toLowerCase()}.`, tone: nextStatus === 'Active' ? 'success' : 'warning', source: 'teachers' });
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Teacher status could not be updated.');
      }
      return;
    }
    saveTeachers(teachers.map((item) => item.id === teacher.id ? { ...item, status: nextStatus } : item));
    const users = loadLoginUsers();
    saveLoginUsers(users.map((user: any) => (
      String(user.email).toLowerCase() === teacher.email.toLowerCase()
        ? { ...user, status: nextStatus, locked: nextStatus === 'Inactive' }
        : user
    )));
    emitNotification({ title: `Teacher ${nextStatus.toLowerCase()}`, message: `${teacher.name}'s login is now ${nextStatus.toLowerCase()}.`, tone: nextStatus === 'Active' ? 'success' : 'warning', source: 'teachers' });
  };

  const deleteTeacher = async (teacher: TeacherRecord) => {
    if (!confirm(`Delete teacher profile for ${teacher.name}? This will also remove their login from this system.`)) return;

    if (isServerBacked) {
      try {
        await deleteTeacherMutation(Number(teacher.id)).unwrap();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Teacher profile could not be deleted from the server.');
        return;
      }
    }

    saveTeachers(teachers.filter((item) => item.id !== teacher.id));
    const users = loadLoginUsers();
    saveLoginUsers(users.filter((user: any) => (
      String(user.email).toLowerCase() !== teacher.email.toLowerCase()
    )));
    emitNotification({ title: 'Teacher deleted', message: `${teacher.name}'s profile and login were removed.`, tone: 'warning', source: 'teachers' });
  };

  return (
    <section className="space-y-5 animate-fade-in" id="teacher-profiles-page">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">School Admin</p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Teacher Profiles</h1>
            <p className="mt-1 text-sm text-slate-500">Create teacher profiles with verified, server-generated login credentials.</p>
          </div>
          <button onClick={() => { resetForm(); setIsAdding(true); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            Create Teacher Profile
          </button>
        </div>
      </header>

      {teacherListError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          Teacher profiles could not be loaded from the school database: {teacherListError}
        </div>
      )}

      {createdCredentials && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-extrabold">Teacher login credentials</h2>
              <p className="mt-1 text-xs">Share securely with {createdCredentials.name}. This temporary password is shown once and must be changed after sign-in.</p>
              <div className="mt-3 grid gap-2 rounded-xl bg-white p-3 text-xs font-mono sm:grid-cols-2">
                <span>Email: {createdCredentials.username}</span>
                <span>Password: {createdCredentials.password}</span>
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(`Email: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`)}
                className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Copy credentials
              </button>
            </div>
            <button onClick={() => setCreatedCredentials(null)} className="text-xs font-bold text-emerald-700">Dismiss</button>
          </div>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900">{editingId ? 'Edit teacher profile' : 'Teacher profile & login creation'}</h2>
          {!editingId && (
            <p className="mt-1 text-xs text-slate-500">This creates the teacher profile and a secure Teacher login. The generated password is shown once after creation.</p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Profile Photo</label>
              <div className="flex items-center gap-3">
                {photoPreview ? <AuthenticatedImage src={photoPreview} alt="Teacher preview" className="h-12 w-12 rounded-full border border-slate-200 object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">Photo</span>}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) { setPhotoFile(null); setPhotoPreview(''); setPhotoSummary(''); return; }
                  try {
                    const optimized = await optimizeImageForUpload(file);
                    setPhotoFile(optimized.file);
                    setPhotoPreview(optimized.previewUrl);
                    setPhotoSummary(`${optimized.width}×${optimized.height} WebP · ${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)}`);
                  } catch (error) {
                    alert(error instanceof Error ? error.message : 'Photo optimization failed.');
                    event.target.value = '';
                  }
                }} className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700" />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">JPEG, PNG, or WebP.</p>
            </div>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Teacher name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input required type="email" disabled={!!editingId} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
            <div className="flex gap-2">
              <input
                required={!editingId}
                type="text"
                minLength={8}
                disabled={Boolean(editingId && isServerBacked)}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingId && isServerBacked ? 'Use Reset credentials' : editingId ? 'New permanent password (optional)' : 'Permanent password'}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: generatePassword() })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                title="Generate strong password"
              >
                Generate
              </button>
            </div>
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <div className="md:col-span-3">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Assigned classes and sections *</label>
              <p className="mb-3 text-[10px] text-slate-500">Select any number of classes and sections. Selecting a class assigns all its current sections.</p>
              {academicStructureError && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{academicStructureError}</p>}
              {!classOptions.length ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">No classes exist. Create classes and sections in Academic Setup first.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {classOptions.map((classroom) => {
                    const classSections = sectionOptions.filter((section) => section.classId === classroom.id);
                    const sectionIds = classSections.map((section) => section.id);
                    const allSelected = Boolean(sectionIds.length) && sectionIds.every((id) => form.assignedSectionIds.includes(id));
                    return (
                      <div key={classroom.id} className="rounded-xl border border-slate-200 p-3">
                        <label className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                          <input
                            type="checkbox"
                            disabled={!sectionIds.length}
                            checked={allSelected}
                            onChange={() => updateAssignedSections(
                              allSelected
                                ? form.assignedSectionIds.filter((id) => !sectionIds.includes(id))
                                : Array.from(new Set([...form.assignedSectionIds, ...sectionIds])),
                            )}
                          />
                          {classroom.name} <span className="font-normal text-slate-400">(all sections)</span>
                        </label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {classSections.length ? classSections.map((section) => (
                            <label key={section.id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                              <input
                                type="checkbox"
                                checked={form.assignedSectionIds.includes(section.id)}
                                onChange={(event) => updateAssignedSections(
                                  event.target.checked
                                    ? [...form.assignedSectionIds, section.id]
                                    : form.assignedSectionIds.filter((id) => id !== section.id),
                                )}
                              />
                              {section.name}
                            </label>
                          )) : <span className="text-[10px] text-slate-400">No sections</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Assigned subjects *</label>
              <p className="mb-2 text-[10px] text-slate-500">Subjects are limited to those assigned to the selected classes in Academic Setup.</p>
              {availableTeacherSubjects.length ? (
                <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 p-3">
                  {availableTeacherSubjects.map((subject) => (
                    <label key={subject.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.subjectIds.includes(subject.id)}
                        onChange={(event) => updateSubjectIds(
                          event.target.checked
                            ? [...form.subjectIds, subject.id]
                            : form.subjectIds.filter((id) => id !== subject.id),
                        )}
                      />
                      {subject.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Select at least one class section above. If no subjects appear, assign subjects to that class in Academic Setup.</p>
              )}
              {form.teachingAssignments.length > 0 && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Teaching assignments to be created</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.teachingAssignments.map((assignment) => {
                      const section = sectionOptions.find((item) => item.id === assignment.sectionId);
                      const subject = academicSubjects.find((item) => item.id === assignment.subjectId);
                      return (
                        <span key={`${assignment.sectionId}-${assignment.subjectId}`} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-indigo-800">
                          {section ? sectionLabel(section) : 'Section'} · {subject?.name || 'Subject'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <input required type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="Qualification" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">{editingId ? 'Save changes' : 'Create teacher login'}</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teacher, subject, section..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option>All</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Teacher</th>
                <th className="px-4 py-3">Subjects</th>
                <th className="px-4 py-3">Assigned Sections</th>
                <th className="px-4 py-3">Login Details</th>
                <th className="px-4 py-3">Qualification</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No teacher profiles created yet.</td></tr>
              ) : filtered.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {teacher.photoUrl ? (
                        <AuthenticatedImage src={teacher.photoUrl} alt={teacher.name} className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 border border-indigo-100">
                          {teacher.name.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <p className="font-extrabold text-slate-900">{teacher.name}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Mail className="h-3 w-3" /> {teacher.email}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" /> {teacher.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{(teacher.subjects || []).join(', ') || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{(teacher.assignedSections || []).join(', ') || '-'}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      return (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] text-slate-700">
                          <p><span className="font-extrabold text-slate-900">Login ID:</span> {teacher.email}</p>
                          <p className="mt-1"><span className="font-extrabold text-slate-900">Password:</span> shown once only</p>
                          <button
                            onClick={() => copyTeacherCredentials(teacher)}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
                          >
                            <Copy className="h-3 w-3" />
                            Copy
                          </button>
                          {isServerBacked && teacher.userId && (
                            <button onClick={() => resetTeacherCredentials(teacher)} className="ml-2 mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100">
                              <KeyRound className="h-3 w-3" />
                              Reset credentials
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{teacher.qualification || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${teacher.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {teacher.status === 'Active' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {teacher.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setDocumentsTeacherId(teacher.id)} className="mr-2 rounded-lg border border-indigo-200 p-2 text-indigo-600 hover:bg-indigo-50" title={`Documents (${teacher.documents.length})`}><FileText className="h-4 w-4" /></button>
                    <button onClick={() => startEdit(teacher)} className="mr-2 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Edit teacher details"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => toggleStatus(teacher)} className="mr-2 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Toggle status"><UserRoundCheck className="h-4 w-4" /></button>
                    <button onClick={() => deleteTeacher(teacher)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete teacher"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {documentsTeacher && (
        <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm" aria-labelledby="teacher-documents-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Teacher documents</p>
              <h2 id="teacher-documents-title" className="mt-1 text-base font-extrabold text-slate-900">{documentsTeacher.name}</h2>
              <p className="mt-1 text-xs text-slate-500">PDF, JPEG, or PNG · maximum 5 MB. Files are stored securely in the database.</p>
            </div>
            <button type="button" onClick={() => setDocumentsTeacherId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Close</button>
          </div>

          <form onSubmit={uploadTeacherDocument} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Document name
              <select value={teacherDocumentName} onChange={(event) => setTeacherDocumentName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case text-slate-800">
                <option>Qualification Certificate</option>
                <option>Experience Certificate</option>
                <option>Identity Proof</option>
                <option>Address Proof</option>
                <option>Background Verification</option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              File
              <input id="teacher-document-file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required onChange={(event) => setTeacherDocumentFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal normal-case" />
            </label>
            <button type="submit" disabled={isDocumentUploading || !teacherDocumentFile} className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <UploadCloud className="h-3.5 w-3.5" />
              {isDocumentUploading ? 'Uploading...' : 'Upload to database'}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {documentsTeacher.documents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">No teacher documents uploaded yet.</p>
            ) : documentsTeacher.documents.map((teacherDocument) => (
              <div key={teacherDocument.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <div><p className="font-bold text-slate-800">{teacherDocument.name}</p><p className="text-[9px] uppercase text-slate-400">{teacherDocument.fileType} · {teacherDocument.status}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void downloadTeacherDocument(teacherDocument)} className="rounded-lg border border-slate-200 p-2 text-indigo-600" title="Download"><Download className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void deleteTeacherDocument(teacherDocument)} className="rounded-lg border border-red-200 p-2 text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
