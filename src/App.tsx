import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Route, Routes } from 'react-router';
import {
  Grid,
  Users,
  GraduationCap,
  CheckSquare,
  BookOpen,
  CreditCard,
  FileText,
  MessageSquare,
  Library,
  Truck,
  Terminal,
  LogOut,
  Menu,
  ChevronDown,
  Clock,
  ShieldCheck,
  UserCheck,
  School,
  Sparkles,
  Calendar,
  Lock,
  Palette,
  Settings,
  Bell,
  Globe2
} from 'lucide-react';

// Custom Modules Components
import Dashboard from './components/Dashboard';
import StudentModule from './components/StudentModule';
import AcademicModule from './components/AcademicModule';
import AttendanceModule from './components/AttendanceModule';
import ParentAttendance from './components/ParentAttendance';
import ParentNotifications from './components/ParentNotifications';
import LearningModule from './components/LearningModule';
import FeesModule from './components/FeesModule';
import FamilyFees from './components/FamilyFees';
import ExamModule from './components/ExamModule';
import CommunicationModule from './components/CommunicationModule';
import LibraryModule from './components/LibraryModule';
import TransportModule from './components/TransportModule';
import TeacherDirectory from './components/TeacherDirectory';
import NotificationComposerPage from './components/NotificationComposerPage';
import CommunityEventsModule from './components/CommunityEventsModule';
import AcademicSetupManager from './components/AcademicSetupManager';

// Newly Added Components
import LoginScreen from './components/LoginScreen';
import ForcedPasswordChange from './components/ForcedPasswordChange';
import SuperAdminModule from './components/SuperAdminModule';
import PromotionModule from './components/PromotionModule';
import { renderBrandIcon } from './components/SuperAdminSettings';
import PublicLearningModule from './components/PublicLearningModule';
import NotificationCenter from './components/NotificationCenter';
import PushNotificationManager from './components/PushNotificationManager';
import WorexaLogo from './components/WorexaLogo';
import { emitNotification } from './services/notificationBus';
import { BRAND } from './config/branding';

// Custom Types and Auth
import { Student, StudentDocument, UserRole, BrandSettings } from './types';

import { ACCESS_TOKEN_STORAGE_KEY, AUTH_SESSION_EXPIRED_EVENT, AuthUser, clearAuthenticatedSession, clearAuthenticatedUser, getStoredAuthenticatedUser, storeAuthenticatedUser } from './utils/auth';
import { apiRequest, getCurrentUser, logoutWithApi } from './services/api';
import { deactivateFcmDeviceToken } from './services/firebaseMessaging';
import {
  AcademicClass,
  AcademicYear,
  announceAcademicStructureChanged,
  loadAcademicStructure,
} from './services/academicStructure';
import { useAppDispatch, useAppSelector } from './store';
import { logout as reduxLogout, setAccessToken as reduxSetAccessToken, setCredentials as reduxSetCredentials, setUser as reduxSetUser } from './store/slices/authSlice';
import { setActiveTab as reduxSetActiveTab, setCredentialSlip as reduxSetCredentialSlip } from './store/slices/uiSlice';

function adjustColorBrightness(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(2.55 * percent);
  let b = (num & 0x0000ff) + Math.round(2.55 * percent);

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function AuthenticatedApp() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.accessToken);
  const user = useAppSelector((state) => state.auth.user);
  const activeTab = useAppSelector((state) => state.ui.activeTab);
  const credentialSlip = useAppSelector((state) => state.ui.credentialSlip);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // White-Label / Brand settings state
  const [brandSettings, setBrandSettings] = useState<BrandSettings>(() => {
    const saved = localStorage.getItem('erp_brand_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.primaryColor === '#4f46e5' || !parsed.primaryColor || parsed.primaryColor === '#1e3a8a') {
          parsed.primaryColor = '#6366f1';
          parsed.secondaryColor = '#10b981';
        }
        if (!parsed.theme || parsed.theme === 'playful-school' || parsed.theme === 'glass-academy') {
          parsed.theme = 'default';
        }
        return parsed;
      } catch (e) {
        // ignore
      }
    }
    return {
      schoolName: BRAND.displayName,
      logoType: 'icon',
      logoIcon: 'School',
      logoImageUrl: '',
      logoMonogram: 'S',
      primaryColor: '#6366f1',
      secondaryColor: '#10b981',
      theme: 'default'
    };
  });

  // Save brand settings whenever updated
  const handleUpdateBrandSettings = (newSettings: BrandSettings) => {
    setBrandSettings(newSettings);
    localStorage.setItem('erp_brand_settings', JSON.stringify(newSettings));
    setLogs(prev => [`[System branding] Base school white-label colors & assets compiled and saved.`, ...prev]);
  };

  // Authentication states come from Redux. Local state is only for UI-only
  // concerns that do not need to be shared across components.
  const [accountDirectory, setAccountDirectory] = useState<Array<{ id: number; email: string; role: string; studentId?: string; parentStudentIds?: string[] }>>([]);
  const [isPublicMode, setIsPublicMode] = useState(false);

  // Student rosters are security-sensitive and always come from the
  // role-scoped PostgreSQL API. Never restore another session's roster from
  // browser storage while the current user's permissions are being resolved.
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const storedToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (storedToken && !token) {
      dispatch(reduxSetAccessToken(storedToken));
    }
  }, [token]);

  // Academic structure is tenant-scoped and comes only from PostgreSQL.
  const [currentAcademicYear, setCurrentAcademicYear] = useState('');
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicClasses, setAcademicClasses] = useState<AcademicClass[]>([]);

  const getDefaultTabForRole = (role: UserRole) => {
    return role === 'Super Admin' ? 'super-admin-dashboard' : 'dashboard';
  };

  // Validate the backend-issued access token before restoring a session.
  useEffect(() => {
    if (!token) return;
    const storedUser = getStoredAuthenticatedUser();
    if (storedUser?.mustChangePassword) {
      dispatch(reduxSetUser(storedUser));
      return;
    }
    getCurrentUser()
      .then((authenticatedUser) => {
        storeAuthenticatedUser(authenticatedUser);
        dispatch(reduxSetUser(authenticatedUser));
        dispatch(reduxSetActiveTab(getDefaultTabForRole(authenticatedUser.role)));
      })
      .catch(() => {
        clearAuthenticatedSession();
        dispatch(reduxLogout());
      });
  }, [token]);

  // Each operational portal receives only the students allowed by the API:
  // all in-school students for an admin, linked wards for a parent, and the
  // logged-in student’s own record for a student account.
  useEffect(() => {
    if (!token || !user || !['School Admin', 'Parent', 'Student', 'Teacher'].includes(user.role)) {
      if (!token && user && ['School Admin', 'Parent', 'Student', 'Teacher'].includes(user.role)) {
        try {
          const stored = localStorage.getItem('erp_students');
          if (stored) {
            setStudents(JSON.parse(stored));
            return;
          }
        } catch { }
      }
      setStudents([]);
      return;
    }
    apiRequest<{ results?: any[] } | any[]>('/students/')
      .then((serverStudents) => {
        const rows = Array.isArray(serverStudents) ? serverStudents : serverStudents.results || [];
        setStudents(rows.map((student) => ({
          ...student,
          id: String(student.id),
          class: student.class || student.class_,
          medicalConditions: student.medicalConditions || student.medical_conditions || '',
          qrCodeData: student.qrCodeData || `SCH-ERP-${student.id}`,
          // Decimal fields from DRF are strings by default. Normalize them
          // once when the roster arrives so every dashboard/module receives
          // real numeric values.
          attendancePercentage: student.attendancePercentage == null ? undefined : Number(student.attendancePercentage),
          feeTotal: student.feeTotal == null ? undefined : Number(student.feeTotal),
          feePaid: student.feePaid == null ? undefined : Number(student.feePaid),
        })) as Student[]);
      })
      .catch(() => {
        setStudents([]);
      });
  }, [token, user?.email, user?.schoolId, user?.role]);

  const refreshAcademicContext = async () => {
    const structure = await loadAcademicStructure();
    setAcademicYears(structure.years);
    setAcademicClasses(structure.classes);
    const selectedYear = structure.years.find((year) => year.is_active) || structure.years[0];
    setCurrentAcademicYear(selectedYear?.name || '');
    return structure;
  };

  const handleAcademicSetupChanged = async () => {
    announceAcademicStructureChanged();
    await refreshAcademicContext();
  };

  useEffect(() => {
    if (!token || !user || user.role === 'Super Admin') {
      setAcademicYears([]);
      setAcademicClasses([]);
      setCurrentAcademicYear('');
      return;
    }
    let active = true;
    loadAcademicStructure()
      .then((structure) => {
        if (!active) return;
        setAcademicYears(structure.years);
        setAcademicClasses(structure.classes);
        const selectedYear = structure.years.find((year) => year.is_active) || structure.years[0];
        setCurrentAcademicYear(selectedYear?.name || '');
      })
      .catch(() => {
        if (!active) return;
        setAcademicYears([]);
        setAcademicClasses([]);
        setCurrentAcademicYear('');
      });
    return () => { active = false; };
  }, [token, user?.schoolId, user?.role]);

  useEffect(() => {
    if (!token || user?.role !== 'School Admin') {
      setAccountDirectory([]);
      return;
    }
    apiRequest<Array<{ id: number; email: string; role: string; studentId?: string; parentStudentIds?: string[] }>>('/auth/users/')
      .then(setAccountDirectory)
      .catch(() => setAccountDirectory([]));
  }, [token, user?.email, user?.schoolId, user?.role]);

  useEffect(() => {
    const expireSession = () => {
      clearAuthenticatedSession();
      dispatch(reduxLogout());
      setStudents([]);
      setAccountDirectory([]);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  // Login handler
  const handleLogin = (newUser: AuthUser, newToken: string) => {
    setStudents([]);
    if (newToken) {
      dispatch(reduxSetAccessToken(newToken));
    }
    dispatch(reduxSetUser(newUser));
    storeAuthenticatedUser(newUser);
    setLogs(prev => [`[Authentication] User ${newUser.name} authenticated via JWT. Access Granted.`, ...prev]);
    emitNotification({
      title: 'Login successful',
      message: `${newUser.name} signed in as ${newUser.role}.`,
      tone: 'success',
      source: 'auth',
    });

    dispatch(reduxSetActiveTab(getDefaultTabForRole(newUser.role)));
  };

  // Logout handler
  const handleLogout = async () => {
    // Local cleanup must happen even when the network is unavailable.  When
    // reachable, the API blacklists the refresh token before it is discarded.
    try {
      await deactivateFcmDeviceToken();
    } catch {
      // The token is also replaced on the next login and invalid Firebase
      // tokens are removed by the backend after delivery feedback.
    }
    try {
      await logoutWithApi();
    } catch {
      // The session is still removed from this device below.
    }
    clearAuthenticatedSession();
    dispatch(reduxLogout());
    setStudents([]);
    setAccountDirectory([]);
    dispatch(reduxSetActiveTab('dashboard'));
  };

  const handleTemporaryPasswordChanged = () => {
    if (!user) return;
    const updatedUser = { ...user, mustChangePassword: false };
    storeAuthenticatedUser(updatedUser);
    dispatch(reduxSetUser(updatedUser));
    dispatch(reduxSetActiveTab(getDefaultTabForRole(updatedUser.role)));
  };

  // Simulation handlers
  const readLocalUsers = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem('sa_users') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveLocalUsers = (usersList: any[]) => {
    localStorage.setItem('sa_users', JSON.stringify(usersList));
  };

  const createPermanentPassword = (prefix: string, seed: string) => {
    const clean = seed.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const suffix = (clean.slice(-4) || '2026').padStart(4, 'X');
    return `${prefix}@${suffix}9`;
  };

  const makeLoginId = (name: string, fallback: string, domain: string) => {
    const base = (name || fallback || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.+/g, '.')
      .slice(0, 42) || 'user';
    return `${base}@${domain}`;
  };

  const getParentLoginName = (student: Student) => (
    student.fatherName ||
    student.motherName ||
    student.parentName ||
    student.name
  );

  const createStudentAndParentLogins = (student: Student, showCredentials = true) => {
    const usersList = readLocalUsers();
    const studentEmail = makeLoginId(student.name, student.admissionNo, 'students.volpehub.education');
    const parentLoginName = getParentLoginName(student);
    const parentEmail = makeLoginId(parentLoginName, student.parentPhone || student.admissionNo, 'parents.volpehub.education');
    const parentExists = usersList.some((account: any) => (
      account.role === 'Parent' && String(account.email || '').toLowerCase() === parentEmail.toLowerCase()
    ));
    const studentExists = usersList.some((account: any) => (
      account.role === 'Student' && account.studentId === student.id
    ));
    const studentPassword = createPermanentPassword('Student', student.name || student.admissionNo);
    const parentPassword = createPermanentPassword('Parent', parentLoginName || student.parentPhone || student.admissionNo);
    const nextUsers = [...usersList];

    const legacyStudentEmail = `${student.admissionNo.toLowerCase().replace(/[^a-z0-9]/g, '')}@students.volpehub.education`;
    const legacyParentEmail = student.parentEmail || `${student.parentPhone.replace(/\D/g, '') || student.admissionNo.toLowerCase()}@parents.volpehub.education`;

    nextUsers.forEach((account: any) => {
      if (account.role === 'Student' && (account.studentId === student.id || String(account.email || '').toLowerCase() === legacyStudentEmail.toLowerCase())) {
        account.email = studentEmail;
        account.name = student.name;
        account.studentId = student.id;
      }
      if (account.role === 'Parent' && (
        account.studentId === student.id ||
        (account.linkedStudentIds || []).includes(student.id) ||
        String(account.email || '').toLowerCase() === legacyParentEmail.toLowerCase()
      )) {
        account.email = parentEmail;
        account.name = parentLoginName;
        account.linkedStudentIds = Array.from(new Set([...(account.linkedStudentIds || []), student.id]));
        account.studentId = account.studentId || student.id;
      }
    });

    if (!studentExists) {
      nextUsers.push({
        email: studentEmail,
        password: studentPassword,
        name: student.name,
        role: 'Student',
        schoolId: 'school-default',
        studentId: student.id,
        status: 'Active',
        locked: false,
        forceReset: false,
        permissions: ['view_schedules', 'access_lms', 'take_quizzes', 'view_my_grades'],
      });
    }

    if (!parentExists) {
      nextUsers.push({
        email: parentEmail,
        password: parentPassword,
        name: parentLoginName,
        role: 'Parent',
        schoolId: 'school-default',
        studentId: student.id,
        linkedStudentIds: [student.id],
        status: 'Active',
        locked: false,
        forceReset: false,
        permissions: ['view_child_records', 'pay_fees', 'view_report_cards', 'chat_teachers'],
      });
    } else {
      nextUsers.forEach((account: any) => {
        if (account.role === 'Parent' && String(account.email || '').toLowerCase() === parentEmail.toLowerCase()) {
          account.linkedStudentIds = Array.from(new Set([...(account.linkedStudentIds || []), student.id]));
          account.studentId = account.studentId || student.id;
          account.status = 'Active';
          account.locked = false;
        }
      });
    }

    saveLocalUsers(nextUsers);
    if (showCredentials) {
      dispatch(reduxSetCredentialSlip({
        title: 'Student and parent login created',
        lines: [
          `Student Email: ${studentEmail}`,
          `Student Password: ${studentExists ? 'Already exists' : studentPassword}`,
          `Parent Email: ${parentEmail}`,
          `Parent Password: ${parentExists ? 'Existing parent account reused' : parentPassword}`,
        ],
      }));
    }
  };

  useEffect(() => {
    // API-backed accounts own credentials on the server. Never replace them
    // with locally invented values for display.
    if (token) return;
    if (!user || students.length === 0) return;
    if (!['Super Admin', 'School Admin'].includes(user.role)) return;
    students.forEach(student => createStudentAndParentLogins(student, false));
  }, [token, user?.email, user?.role, students.length]);

  const handleAddStudent = async (newS: Student): Promise<Student> => {
    const enriched: Student = {
      ...newS,
      academicYear: newS.academicYear || currentAcademicYear
    };
    if (token) {
      const body = new FormData();
      const fields: Record<string, string | number | undefined> = {
        admissionNo: enriched.admissionNo, name: enriched.name, class_: enriched.class, sectionId: enriched.sectionId,
        section: enriched.section, rollNo: enriched.rollNo, parentName: enriched.parentName,
        parentPhone: enriched.parentPhone, parentEmail: enriched.parentEmail, dob: enriched.dob,
        gender: enriched.gender, address: enriched.address, medical_conditions: enriched.medicalConditions,
        status: enriched.status, academicYear: enriched.academicYear,
        attendancePercentage: enriched.attendancePercentage, feeTotal: enriched.feeTotal, feePaid: enriched.feePaid,
      };
      Object.entries(fields).forEach(([key, value]) => { if (value !== undefined) body.append(key, String(value)); });
      if (enriched.photoFile) body.append('photo', enriched.photoFile);
      const created = await apiRequest<any>('/students/', {
        method: 'POST',
        body,
      });
      const serverStudent: Student = {
        ...enriched,
        ...created,
        id: String(created.id),
        class: created.class || enriched.class,
        medicalConditions: created.medicalConditions || enriched.medicalConditions,
      };
      setStudents(prev => [serverStudent, ...prev.filter(student => student.id !== serverStudent.id)]);
      const credentials = created.loginCredentials;
      if (credentials?.student?.temporaryPassword) {
        const studentEmail = credentials.student.email;
        const parentEmail = credentials.parent?.created ? (credentials.parent.email || enriched.parentEmail) : 'Existing parent account';
        setAccountDirectory((current) => {
          const withoutNewStudent = current.filter((account) => !(
            (account.role === 'student' && account.studentId === serverStudent.id) ||
            (account.role === 'parent' && account.parentStudentIds?.includes(serverStudent.id))
          ));
          const next = [
            ...withoutNewStudent,
            { id: credentials.student.userId, email: credentials.student.email, role: 'student', studentId: serverStudent.id },
          ];
          if (credentials.parent?.userId) {
            next.push({ id: credentials.parent.userId, email: credentials.parent.email, role: 'parent', parentStudentIds: [serverStudent.id] });
          }
          return next;
        });
        dispatch(reduxSetCredentialSlip({
          title: 'Student and parent login created',
          lines: [
            `Student Email: ${studentEmail}`,
            `Student Password: ${credentials.student.temporaryPassword}`,
            `Parent Email: ${parentEmail}`,
            `Parent Password: ${credentials.parent?.temporaryPassword || credentials.parent?.message || 'Existing parent account reused'}`,
          ],
        }));
      }
      setLogs(prev => [`[Admissions] Enrolled ${serverStudent.name} on the server.`, ...prev]);
      return serverStudent;
    }

    setStudents(prev => {
      const next = [enriched, ...prev.filter(item => item.id !== enriched.id)];
      try {
        localStorage.setItem('erp_students', JSON.stringify(next));
      } catch { }
      return next;
    });
    createStudentAndParentLogins(enriched);
    setLogs(prev => [`[Admissions] Enrolled student: ${enriched.name} (${enriched.class}) into ${currentAcademicYear} term`, ...prev]);
    emitNotification({
      title: 'Student admitted',
      message: `${enriched.name} was enrolled into ${currentAcademicYear}.`,
      tone: 'success',
      source: 'admissions',
    });
    return enriched;
  };

  const resetChildCredentials = async (userId: number) => {
    const credentials = await apiRequest<{ loginId: string; temporaryPassword: string }>(`/auth/users/${userId}/reset-credentials/`, { method: 'POST' });
    setAccountDirectory((current) => current.map((account) => account.id === userId ? { ...account, email: credentials.loginId } : account));
    return credentials;
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    if (token) {
      const body = new FormData();
      const fields: Record<string, string | number | undefined> = {
        name: updatedStudent.name, class_: updatedStudent.class, section: updatedStudent.section, sectionId: updatedStudent.sectionId,
        rollNo: updatedStudent.rollNo, parentName: updatedStudent.parentName,
        parentPhone: updatedStudent.parentPhone, parentEmail: updatedStudent.parentEmail,
        dob: updatedStudent.dob, gender: updatedStudent.gender, address: updatedStudent.address,
        medical_conditions: updatedStudent.medicalConditions, status: updatedStudent.status,
        academicYear: updatedStudent.academicYear, attendancePercentage: updatedStudent.attendancePercentage,
        feeTotal: updatedStudent.feeTotal, feePaid: updatedStudent.feePaid,
      };
      Object.entries(fields).forEach(([key, value]) => { if (value !== undefined) body.append(key, String(value)); });
      if (updatedStudent.photoFile) body.append('photo', updatedStudent.photoFile);
      const saved = await apiRequest<any>(`/students/${updatedStudent.id}/`, { method: 'PATCH', body });
      updatedStudent = {
        ...updatedStudent, ...saved, id: String(saved.id),
        class: saved.class || updatedStudent.class,
        medicalConditions: saved.medicalConditions || updatedStudent.medicalConditions,
        photoUrl: saved.photoUrl || updatedStudent.photoUrl,
        photoFile: undefined,
      };
    }
    setStudents(prev => {
      const next = prev.map(student => student.id === updatedStudent.id ? updatedStudent : student);
      if (!token) {
        try { localStorage.setItem('erp_students', JSON.stringify(next)); } catch { }
      }
      return next;
    });
    const usersList = readLocalUsers();
    saveLocalUsers(usersList.map((account: any) => {
      if (account.role === 'Student' && account.studentId === updatedStudent.id) {
        return { ...account, name: updatedStudent.name, status: updatedStudent.status === 'TC_Issued' ? 'Inactive' : 'Active', locked: updatedStudent.status === 'TC_Issued' };
      }
      if (account.role === 'Parent' && (account.studentId === updatedStudent.id || (account.linkedStudentIds || []).includes(updatedStudent.id))) {
        return {
          ...account,
          name: updatedStudent.parentName,
          email: updatedStudent.parentEmail || account.email,
          status: updatedStudent.status === 'TC_Issued' ? account.status : 'Active',
        };
      }
      return account;
    }));
    setLogs(prev => [`[Admissions] Updated student profile: ${updatedStudent.name} (${updatedStudent.admissionNo})`, ...prev]);
    emitNotification({
      title: 'Student updated',
      message: `${updatedStudent.name}'s student details were updated.`,
      tone: 'success',
      source: 'admissions',
    });
  };

  const handleStudentDocumentsChanged = (studentId: string, documents: StudentDocument[]) => {
    setStudents((current) => current.map((student) => (
      student.id === studentId ? { ...student, documents } : student
    )));
  };

  const handleDeleteStudent = async (studentId: string): Promise<void> => {
    const student = students.find(s => s.id === studentId);
    if (token) {
      await apiRequest<void>(`/students/${studentId}/`, { method: 'DELETE' });
    }
    setStudents(prev => {
      const next = prev.filter(item => item.id !== studentId);
      if (!token) {
        try { localStorage.setItem('erp_students', JSON.stringify(next)); } catch { }
      }
      return next;
    });
    setAccountDirectory((current) => current.flatMap((account) => {
      if (account.role === 'student' && account.studentId === studentId) return [];
      if (account.role === 'parent' && account.parentStudentIds?.includes(studentId)) {
        const parentStudentIds = account.parentStudentIds.filter((id) => id !== studentId);
        return parentStudentIds.length ? [{ ...account, parentStudentIds }] : [];
      }
      return [account];
    }));
    if (student) {
      const remainingStudents = students.filter(item => item.id !== studentId);
      const usersList = readLocalUsers();
      saveLocalUsers(usersList.filter((account: any) => {
        if (account.role === 'Student' && account.studentId === studentId) return false;
        if (account.role !== 'Parent') return true;
        const linkedIds = (account.linkedStudentIds || [account.studentId]).filter((id: string) => id && id !== studentId);
        const hasRemainingChild = linkedIds.some((id: string) => remainingStudents.some(s => s.id === id));
        if (!hasRemainingChild && account.studentId === studentId) return false;
        account.linkedStudentIds = linkedIds;
        if (account.studentId === studentId) account.studentId = linkedIds[0];
        return true;
      }));
      setLogs(prev => [`[Admissions] Deleted student profile: ${student.name} (${student.admissionNo})`, ...prev]);
      emitNotification({
        title: 'Student deleted',
        message: `${student.name}'s student profile was removed.`,
        tone: 'warning',
        source: 'admissions',
      });
    }
  };

  const handlePromoteStudent = (studentId: string, nextClass: string) => {
    const currentStudent = students.find(s => s.id === studentId);
    if (!currentStudent) return;

    const currentYearIndex = academicYears.findIndex((year) => year.name === currentStudent.academicYear);
    if (currentYearIndex < 0) {
      alert('This student\'s academic year is missing from Academic Setup. Create or correct it before promotion.');
      return;
    }
    const nextYear = academicYears[currentYearIndex + 1]?.name;
    if (!nextYear) {
      alert('Create the next academic year in Academic Setup before promoting this student.');
      return;
    }

    // Update old student record status to Promoted in the current academic year
    const oldStudentUpdated = {
      ...currentStudent,
      status: 'Promoted' as const
    };

    // Prepare history snapshot of this year's performance
    const newHistoryEntry = {
      academicYear: currentStudent.academicYear,
      class: currentStudent.class,
      section: currentStudent.section,
      gpa: currentStudent.gpa || 8.5,
      attendance: currentStudent.attendancePercentage || 92.0,
      status: 'Promoted'
    };

    // Create a new record for the new academic year
    const newStudentId = `${currentStudent.admissionNo}_${nextYear}`;
    const newStudentClone: Student = {
      ...currentStudent,
      id: newStudentId,
      class: nextClass,
      academicYear: nextYear,
      status: 'Active' as const,
      attendancePercentage: 100, // New cycle default
      feePaid: 0, // New cycle default
      gpa: undefined, // New cycle default
      history: [
        ...(currentStudent.history || []),
        newHistoryEntry
      ]
    };

    setStudents(prev => {
      // Filter out any existing clone for that same cycle and update the current student record
      const filtered = prev.filter(s => s.id !== newStudentId);
      return filtered.map(s => {
        if (s.id === studentId) {
          return oldStudentUpdated;
        }
        return s;
      }).concat(newStudentClone);
    });

    setLogs(prev => [
      `[Administration] Promoted ${currentStudent.name} to ${nextClass} for Academic Cycle ${nextYear}. Previous cycle (${currentStudent.academicYear}) record archived.`,
      ...prev
    ]);
  };

  const handleIssueTC = (studentId: string) => {
    setStudents(prev => prev.map(student => {
      if (student.id === studentId) {
        return { ...student, status: 'TC_Issued' as const };
      }
      return student;
    }));
    const sName = students.find(s => s.id === studentId)?.name || 'Student';
    setLogs(prev => [`[Administration] Issued Transfer Certificate for ${sName}. Profile locked.`, ...prev]);
  };

  // Bulk Academic Year Promotion Executor
  const handleExecutePromotion = (
    newYear: string,
    decisions: { [studentId: string]: { status: 'Promoted' | 'Retained'; nextClass: string } }
  ) => {
    const clonedStudents: Student[] = [];
    const updatedPrevStudents = students.map(s => {
      const decision = decisions[s.id];
      if (decision) {
        if (decision.status === 'Promoted') {
          if (decision.nextClass === 'Graduated') {
            return {
              ...s,
              status: 'Promoted' as const // Archive as promoted
            };
          } else {
            // Archive old record and create clone for the new year
            const newHistoryEntry = {
              academicYear: s.academicYear,
              class: s.class,
              section: s.section,
              gpa: s.gpa || 8.5,
              attendance: s.attendancePercentage || 92.0,
              status: 'Promoted'
            };
            const newStudentId = `${s.admissionNo}_${newYear}`;
            clonedStudents.push({
              ...s,
              id: newStudentId,
              class: decision.nextClass,
              academicYear: newYear,
              status: 'Active' as const,
              attendancePercentage: 100,
              feePaid: 0,
              gpa: undefined,
              history: [
                ...(s.history || []),
                newHistoryEntry
              ]
            });

            return {
              ...s,
              status: 'Promoted' as const
            };
          }
        } else {
          // Retained: create clone for new year in the same class
          const newHistoryEntry = {
            academicYear: s.academicYear,
            class: s.class,
            section: s.section,
            gpa: s.gpa || 7.2,
            attendance: s.attendancePercentage || 85.0,
            status: 'Retained'
          };
          const newStudentId = `${s.admissionNo}_${newYear}`;
          clonedStudents.push({
            ...s,
            id: newStudentId,
            class: s.class,
            academicYear: newYear,
            status: 'Active' as const,
            attendancePercentage: 100,
            feePaid: 0,
            gpa: undefined,
            history: [
              ...(s.history || []),
              newHistoryEntry
            ]
          });

          return {
            ...s,
            status: 'Active' as const // keep active in old year representation
          };
        }
      }
      return s;
    });

    // Remove any previously created records of the new academic year to prevent duplicates
    const filteredPrev = updatedPrevStudents.filter(s => s.academicYear !== newYear && !s.id.endsWith(`_${newYear}`));
    setStudents([...filteredPrev, ...clonedStudents]);

    setCurrentAcademicYear(newYear);

    setLogs(prev => [
      `[Promotion] Academic Year Bulk Promotion Executed. Migrated active system cycle to ${newYear}. Historical snapshots fully preserved.`,
      ...prev
    ]);
  };

  // Define RBAC-based menus
  const getMenuItems = () => {
    if (!user) return [];

    switch (user.role) {
      case 'Super Admin':
        return [
          { id: 'super-admin-dashboard', label: 'Overview Dashboard', icon: Grid },
          { id: 'super-admin-schools', label: 'School Branches', icon: School },
          { id: 'super-admin-admins', label: 'School Admins', icon: UserCheck },
          { id: 'super-admin-sys-settings', label: 'System Settings', icon: Settings }
        ];

      case 'School Admin':
        return [
          { id: 'dashboard', label: 'Admin Dashboard', icon: Grid },
          { id: 'academic-setup', label: 'Academic Setup', icon: Settings },
          { id: 'student', label: 'Student Directory', icon: Users },
          { id: 'teachers', label: 'Teacher Profiles', icon: UserCheck },
          { id: 'academic', label: 'Timetables & Schedules', icon: GraduationCap },
          { id: 'attendance', label: 'Roster Attendance', icon: CheckSquare },
          { id: 'fees', label: 'Fees Invoicing', icon: CreditCard },
          { id: 'exams', label: 'Exams & Grading', icon: FileText },
          { id: 'communication', label: 'Communications', icon: MessageSquare },
          { id: 'community-events', label: 'Community & Events', icon: Globe2 },
          { id: 'transport', label: 'Transport GPS', icon: Truck }
        ];

      case 'Teacher':
        return [
          { id: 'dashboard', label: 'Teacher Dashboard', icon: Grid },
          { id: 'student', label: 'Student Directory', icon: Users },
          { id: 'academic', label: 'Academic Schedules', icon: GraduationCap },
          { id: 'attendance', label: 'Mark Attendance', icon: CheckSquare },
          { id: 'exams', label: 'Exams & Grading', icon: FileText },
          { id: 'communication', label: 'Communications', icon: MessageSquare },
          { id: 'community-events', label: 'Community & Events', icon: Globe2 },
        ];

      case 'Parent':
        return [
          { id: 'dashboard', label: 'Parent Portal', icon: Grid },
          { id: 'academic', label: "Child's Timetable", icon: GraduationCap },
          { id: 'attendance', label: 'Ward Attendance', icon: CheckSquare },
          { id: 'notifications', label: 'School Notices', icon: Bell },
          { id: 'fees', label: 'School Fee Desk', icon: CreditCard },
          { id: 'exams', label: 'Exam Reports', icon: FileText },
          { id: 'communication', label: 'Teacher Chat', icon: MessageSquare },
          { id: 'community-events', label: 'Community & Events', icon: Globe2 },
          { id: 'transport', label: 'Transport Tracker', icon: Truck }
        ];

      case 'Student':
        return [
          { id: 'dashboard', label: 'Student Portal', icon: Grid },
          { id: 'academic', label: 'My Timetable', icon: GraduationCap },
          { id: 'exams', label: 'Datesheets & Reports', icon: FileText },
          { id: 'communication', label: 'Class Notices', icon: Bell },
          { id: 'fees', label: 'My School Fees', icon: CreditCard },
          { id: 'community-events', label: 'School Community', icon: Globe2 },
          { id: 'transport', label: 'Transport GPS', icon: Truck }
        ];

      default:
        return [];
    }
  };

  const menuItems = getMenuItems();
  const allowedTabIds = menuItems.map(item => item.id);
  const canAccessActiveTab = !user || allowedTabIds.includes(activeTab);
  const getFirstAllowedTab = (candidates: string[]) => {
    return candidates.find(id => allowedTabIds.includes(id)) || allowedTabIds[0] || getDefaultTabForRole(user?.role || 'School Admin');
  };

  const mainScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) return;
    if (allowedTabIds.length > 0 && !allowedTabIds.includes(activeTab)) {
      dispatch(reduxSetActiveTab(getDefaultTabForRole(user.role)));
    }
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [user, activeTab, allowedTabIds.join('|')]);

  // Compile dynamic theme styles on-the-fly
  const pColor = brandSettings.primaryColor;
  const sColor = brandSettings.secondaryColor;

  const p50 = `${pColor}0d`; // 5% opacity
  const p100 = `${pColor}1a`; // 10% opacity
  const p500 = adjustColorBrightness(pColor, 10);
  const p600 = pColor;
  const p700 = adjustColorBrightness(pColor, -15);
  const p950 = adjustColorBrightness(pColor, -45);

  const s50 = `${sColor}0d`;
  const s100 = `${sColor}1a`;
  const s500 = adjustColorBrightness(sColor, 10);
  const s600 = sColor;
  const s700 = adjustColorBrightness(sColor, -15);
  const s950 = adjustColorBrightness(sColor, -45);

  // Nova Campus is the single visual language for the product. Brand colours
  // remain configurable, but legacy presentation modes are intentionally retired.
  const isGlass = false;
  const is3D = false;

  if (!isPublicMode && user?.mustChangePassword) {
    return (
      <ForcedPasswordChange
        email={user.email}
        onComplete={handleTemporaryPasswordChanged}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div
      className={`theme-nova relative flex transition-colors duration-300 ${isPublicMode || Boolean(user)
          ? 'h-dvh min-h-0 overflow-hidden'
          : 'min-h-screen overflow-x-hidden'
        }`}
      id="school-erp-app"
    >
      <PushNotificationManager enabled={Boolean(token && user)} />

      {/* Dynamic theme style overrides */}
      <style>{`
        :root {
          --color-indigo-50: ${p50} !important;
          --color-indigo-100: ${p100} !important;
          --color-indigo-500: ${p500} !important;
          --color-indigo-600: ${p600} !important;
          --color-indigo-700: ${p700} !important;
          --color-indigo-950: ${p950} !important;

          --color-emerald-50: ${s50} !important;
          --color-emerald-100: ${s100} !important;
          --color-emerald-500: ${s500} !important;
          --color-emerald-600: ${s600} !important;
          --color-emerald-700: ${s700} !important;
          --color-emerald-950: ${s950} !important;
        }
      `}</style>

      {/* Ambient background decoration blobs for Glassmorphic Academy theme */}
      {brandSettings.theme === 'glass-academy' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-40 -right-40 w-[450px] h-[450px] bg-emerald-600/10 rounded-full blur-[150px]" />
          <div className="absolute top-1/2 left-1/3 w-80 h-80 bg-violet-600/5 rounded-full blur-[100px]" />
        </div>
      )}

      {isPublicMode ? (
        <div className="w-full h-full relative z-20 bg-[#080c14] overflow-y-auto">
          <PublicLearningModule onExit={() => setIsPublicMode(false)} />
        </div>
      ) : !user ? (
        <LoginScreen onLogin={handleLogin} brandSettings={brandSettings} onPublicAccess={() => setIsPublicMode(true)} />
      ) : (
        <>
          {credentialSlip && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation">
              <div className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="credentials-modal-title">
                <h2 id="credentials-modal-title" className="text-sm font-extrabold text-emerald-800">{credentialSlip.title}</h2>
                <p className="mt-1 text-xs text-slate-500">Copy these credentials now and share securely.</p>
                <pre className="mt-4 max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-mono leading-5 text-slate-800">
                  {credentialSlip.lines.join('\n')}
                </pre>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(credentialSlip.lines.join('\n'))}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    Copy credentials
                  </button>
                  <button
                    onClick={() => dispatch(reduxSetCredentialSlip(null))}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

          {/* Sidebar Container */}
          <aside
            className={`${isSidebarOpen ? 'w-72' : 'w-20'
              } h-full min-h-0 shrink-0 transition-all duration-300 hidden md:flex flex-col justify-between relative z-20 overflow-hidden ${isGlass
                ? 'bg-slate-900/40 border-r border-slate-800/60 text-slate-200'
                : is3D
                  ? 'bg-[#f0f3f6] border-r border-white/70 shadow-[4px_0_20px_rgba(163,177,198,0.15)] text-slate-800'
                  : 'bg-white border-r border-slate-200 text-slate-700 shadow-sm'
              }`}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative z-10">
              {/* Logo Brand area */}
              <div className={`h-[4.5rem] px-4 flex items-center justify-between gap-3 shrink-0 border-b ${isGlass ? 'border-slate-850' : is3D ? 'border-slate-200/50' : 'border-slate-100'
                }`}>
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {brandSettings.logoType === 'icon' ? (
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 relative z-10 ${isGlass ? 'border border-slate-800' : is3D ? 'border border-white/85 shadow-sm' : 'border border-slate-200 shadow-xs'
                        }`}
                      style={{ backgroundColor: brandSettings.primaryColor }}
                    >
                      {renderBrandIcon(brandSettings.logoIcon, "w-4.5 h-4.5 text-white")}
                    </div>
                  ) : (
                    <img
                      src={brandSettings.logoImageUrl || 'https://placehold.co/120/4f46e5/ffffff?text=S'}
                      alt="Logo"
                      className={`w-8 h-8 rounded object-cover shrink-0 border ${isGlass ? 'border-slate-800' : 'border-slate-200'
                        }`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/120/4f46e5/ffffff?text=S';
                      }}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {isSidebarOpen && (
                    <div className="min-w-0 relative z-10">
                      <h2 className={`text-[11px] font-black font-sans leading-tight tracking-wide uppercase whitespace-normal ${isGlass ? 'text-slate-200' : 'text-slate-800'}`}>{brandSettings.schoolName}</h2>
                      <p className="mt-0.5 text-[10px] font-bold text-slate-500">ERP v1.2</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Links (Filtered by RBAC) */}
              <nav className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-1" id="rbac-sidebar-navigation">
                {menuItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeTab === item.id;

                  let tabBtnClass = '';
                  if (isGlass) {
                    tabBtnClass = isActive
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border-transparent';
                  } else if (is3D) {
                    tabBtnClass = isActive
                      ? 'bg-white text-indigo-600 border-slate-250 shadow-[inset_2px_2px_5px_rgba(163,177,198,0.25)]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/40 border-transparent';
                  } else {
                    tabBtnClass = isActive
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent';
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => dispatch(reduxSetActiveTab(item.id))}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${tabBtnClass}`}
                      id={`nav-${item.id}`}
                    >
                      <IconComponent className="w-4 h-4 shrink-0" />
                      {isSidebarOpen && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Sidebar Footer */}
            <div className={`p-4 shrink-0 relative z-10 border-t ${isGlass ? 'border-slate-850 bg-transparent' : is3D ? 'border-slate-200/50 bg-[#f0f3f6]' : 'border-slate-100 bg-white'
              }`}>
              <div className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${isGlass
                  ? 'border-slate-800 bg-slate-950/40 text-slate-300'
                  : is3D
                    ? 'border-white/60 bg-slate-50 shadow-[inset_2px_2px_5px_rgba(163,177,198,0.15)] text-slate-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                } ${isSidebarOpen ? '' : 'justify-center'}`}>
                {isSidebarOpen && (
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">SYSTEM SECURED</p>
                    <p className="text-xs font-bold text-emerald-600 font-mono mt-0.5 truncate">ROLE: {user.role.toUpperCase()}</p>
                  </div>
                )}
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              </div>
              {isSidebarOpen && (
                <div className="mt-3 flex items-center gap-2 px-1 text-slate-500" title="Developed by Worexa Technologies">
                  <WorexaLogo compact />
                  <span className="text-[9px] font-bold tracking-wide">Developed by Worexa Technologies</span>
                </div>
              )}
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

            {/* Top Header navbar */}
            <header id="app-topbar" className={`h-16 flex items-center justify-between px-6 shrink-0 relative z-30 border-b ${isGlass
                ? 'bg-slate-900/40 border-slate-850 backdrop-blur-md text-slate-100'
                : is3D
                  ? 'bg-white border-slate-200 shadow-sm text-slate-800'
                  : 'bg-white border-slate-200 shadow-xs text-slate-800'
              }`}>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`p-1.5 rounded-xl md:block hidden cursor-pointer border transition-all ${isGlass
                      ? 'border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-800 hover:text-white'
                      : is3D
                        ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white shadow-[2px_2px_5px_rgba(163,177,198,0.15)]'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:shadow-xs'
                    }`}
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="md:flex hidden items-center gap-2 text-xs font-bold text-slate-600">
                  <span className="text-slate-400 italic">Workspace</span>
                  <span className="text-slate-300">/</span>
                  <span className="capitalize text-indigo-500 font-black">{activeTab.replace('-', ' ')}</span>
                </div>
                <div className="md:hidden flex items-center gap-2">
                  {brandSettings.logoType === 'icon' ? (
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center font-bold text-white text-[10px]"
                      style={{ backgroundColor: brandSettings.primaryColor }}
                    >
                      {renderBrandIcon(brandSettings.logoIcon, "w-3.5 h-3.5 text-white")}
                    </div>
                  ) : (
                    <img
                      src={brandSettings.logoImageUrl || 'https://placehold.co/120/4f46e5/ffffff?text=S'}
                      alt="Logo"
                      className="w-7 h-7 rounded object-cover border border-slate-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/120/4f46e5/ffffff?text=S';
                      }}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <h2 className="text-xs font-sans font-bold tracking-wider text-slate-900 uppercase truncate max-w-[100px]">
                    {brandSettings.schoolName}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                {/* School Art Button (Decorative) */}
                <button className={`h-8 px-4 rounded-full border flex items-center gap-2 text-[10px] font-black uppercase tracking-wider hidden lg:flex transition-all cursor-pointer ${isGlass
                    ? 'bg-slate-900 border-slate-800 text-pink-400 hover:bg-pink-950/20'
                    : is3D
                      ? 'bg-white border-slate-200 text-pink-600 shadow-[2px_2px_5px_rgba(163,177,198,0.15)] hover:translate-y-[-1px] active:translate-y-[1px]'
                      : 'bg-pink-50 border-pink-100 text-pink-600 hover:bg-pink-100'
                  }`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                  <span>SCHOOL ART ON</span>
                </button>

                <div className="hidden lg:flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> System live
                </div>

                {/* Active Academic Year badge */}
                <div className={`h-8 px-3 flex items-center gap-1.5 hidden sm:flex ${isGlass ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  <Calendar className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest font-mono">CYCLE {currentAcademicYear || 'NOT CONFIGURED'}</span>
                </div>

                {/* Logged in User Information */}
                <div className={`flex items-center gap-3 pl-4 border-l ${isGlass ? 'border-slate-850' : 'border-slate-200'}`} id="user-header-card">
                  <div className="text-right hidden sm:block">
                    <p className={`text-xs font-black leading-none ${isGlass ? 'text-slate-200' : 'text-slate-850'}`}>{user.name}</p>
                    <p className="text-[9px] font-black text-indigo-400 uppercase font-mono tracking-widest mt-1">{user.role}</p>
                  </div>

                  <button
                    onClick={handleLogout}
                    className={`w-8 h-8 rounded-full transition-all flex items-center justify-center border cursor-pointer ${isGlass
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-rose-950/40 hover:text-rose-400'
                        : is3D
                          ? 'bg-white border-slate-200 text-slate-600 hover:text-rose-600 shadow-[2px_2px_5px_rgba(163,177,198,0.15)] hover:translate-y-[-1px] active:translate-y-[1px]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:shadow-xs'
                      }`}
                    title="Log Out (Destroy JWT session)"
                    id="btn-header-logout"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                <NotificationCenter logs={logs} isGlass={isGlass} is3D={is3D} />
              </div>
            </header>

            {/* Inner Tab Router Body */}
            <main ref={mainScrollRef} className="mb-14 min-h-0 flex-1 overscroll-contain overflow-y-auto p-6 perspective-workspace md:mb-0 md:p-8">
              <div key={activeTab} className="mx-auto min-h-full max-w-7xl page-enter-3d">
                {!canAccessActiveTab && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-800">
                    This page is not available for {user.role}. Redirecting to your dashboard...
                  </div>
                )}
                {/* Super Admin Modules */}
                {canAccessActiveTab && activeTab.startsWith('super-admin-') && (
                  <SuperAdminModule activeTab={activeTab} />
                )}

                {/* School Admin / Standard Modules */}
                {canAccessActiveTab && activeTab === 'academic-setup' && user?.role === 'School Admin' && (
                  <AcademicSetupManager
                    onChanged={handleAcademicSetupChanged}
                    onOpenTeachers={() => dispatch(reduxSetActiveTab('teachers'))}
                  />
                )}
                {canAccessActiveTab && activeTab === 'dashboard' && user && (
                  <Dashboard
                    onNavigateToTab={(tab: string) => dispatch(reduxSetActiveTab(tab))}
                    isGlass={isGlass}
                    role={user.role}
                    userName={user.name}
                    students={students}
                    schoolName={user.schoolName || brandSettings.schoolName}
                    currentAcademicYear={currentAcademicYear}
                  />
                )}
                {canAccessActiveTab && activeTab === 'student' && (
                  <StudentModule
                    students={students}
                    onAddStudent={handleAddStudent}
                    onUpdateStudent={handleUpdateStudent}
                    onDeleteStudent={handleDeleteStudent}
                    onPromoteStudent={handlePromoteStudent}
                    onIssueTC={handleIssueTC}
                    onDocumentsChanged={handleStudentDocumentsChanged}
                    accountDirectory={accountDirectory}
                    onResetCredentials={resetChildCredentials}
                    currentAcademicYear={currentAcademicYear}
                    canManageStudents={user?.role === 'School Admin'}
                    viewerRole={user?.role}
                    onOpenAcademicSetup={user?.role === 'School Admin' ? () => dispatch(reduxSetActiveTab('academic-setup')) : undefined}
                  />
                )}
                {canAccessActiveTab && activeTab === 'teachers' && user?.role === 'School Admin' && <TeacherDirectory />}
                {canAccessActiveTab && activeTab === 'academic' && (
                  <AcademicModule
                    user={user}
                    students={students}
                    currentAcademicYear={currentAcademicYear}
                  />
                )}
                {canAccessActiveTab && activeTab === 'attendance' && (
                  user?.role === 'Parent'
                    ? <ParentAttendance />
                    : <AttendanceModule students={students.filter(s => s.academicYear === currentAcademicYear)} />
                )}
                {canAccessActiveTab && activeTab === 'notifications' && user?.role === 'Parent' && <ParentNotifications />}
                {canAccessActiveTab && activeTab === 'learning' && <LearningModule />}
                {canAccessActiveTab && activeTab === 'fees' && (user?.role === 'Parent' || user?.role === 'Student'
                  ? <FamilyFees role={user.role} />
                  : <FeesModule user={user} students={students} currentAcademicYear={currentAcademicYear} schoolName={brandSettings.schoolName} onAddLog={(msg: string) => setLogs(prev => [msg, ...prev])} />
                )}
                {canAccessActiveTab && activeTab === 'exams' && <ExamModule user={user} students={students} />}
                {canAccessActiveTab && activeTab === 'promotion' && (
                  <PromotionModule
                    students={students}
                    onExecutePromotion={handleExecutePromotion}
                    logs={logs}
                    currentAcademicYear={currentAcademicYear}
                    academicYears={academicYears}
                    academicClasses={academicClasses}
                  />
                )}
                {canAccessActiveTab && activeTab === 'communication' && (
                  <CommunicationModule user={user} isGlass={isGlass} onNavigateToTab={(tab: string) => dispatch(reduxSetActiveTab(tab))} />
                )}
                {canAccessActiveTab && activeTab === 'community-events' && <CommunityEventsModule user={user} />}
                {canAccessActiveTab && activeTab === 'notify-teachers' && user?.role === 'School Admin' && (
                  <NotificationComposerPage mode="school-to-teachers" user={user} students={students} />
                )}
                {canAccessActiveTab && activeTab === 'notify-parents' && user?.role === 'School Admin' && (
                  <NotificationComposerPage mode="teacher-to-parents" user={user} students={students} />
                )}
                {canAccessActiveTab && activeTab === 'notify-students' && user?.role === 'School Admin' && (
                  <NotificationComposerPage mode="teacher-to-students" user={user} students={students} />
                )}
                {canAccessActiveTab && activeTab === 'library' && <LibraryModule />}
                {canAccessActiveTab && activeTab === 'transport' && <TransportModule />}
              </div>
            </main>
          </div>

          {/* Mobile Bottom Navigation Bar (rendered on smaller screens) */}
          <div className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900 border-t border-slate-800 text-slate-400 grid grid-cols-5 h-14 z-50">
            <button
              onClick={() => dispatch(reduxSetActiveTab(getFirstAllowedTab(['dashboard', 'super-admin-dashboard'])))}
              className={`flex flex-col items-center justify-center gap-0.5 text-[9px] ${activeTab === 'dashboard' ? 'text-indigo-400' : ''}`}
            >
              <Grid className="w-4 h-4" />
              <span>Home</span>
            </button>
            <button
              onClick={() => dispatch(reduxSetActiveTab(getFirstAllowedTab(['super-admin-schools', 'student', 'teachers', 'academic'])))}
              className={`flex flex-col items-center justify-center gap-0.5 text-[9px] ${['student', 'teachers', 'academic', 'super-admin-schools'].includes(activeTab) ? 'text-indigo-400' : ''
                }`}
            >
              <Users className="w-4 h-4" />
              <span>{user.role === 'Super Admin' ? 'Branches' : user.role === 'School Admin' ? 'Students' : 'Academic'}</span>
            </button>
            <button
              onClick={() => dispatch(reduxSetActiveTab(getFirstAllowedTab(['super-admin-admins', 'attendance', 'exams'])))}
              className={`flex flex-col items-center justify-center gap-0.5 text-[9px] ${['attendance', 'exams', 'super-admin-admins'].includes(activeTab) ? 'text-indigo-400' : ''
                }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>{user.role === 'Super Admin' ? 'Admins' : allowedTabIds.includes('attendance') ? 'Attendance' : 'Exams'}</span>
            </button>
            <button
              onClick={() => dispatch(reduxSetActiveTab(getFirstAllowedTab(['super-admin-sys-settings', 'learning', 'communication', 'transport'])))}
              disabled={!allowedTabIds.some(id => ['super-admin-sys-settings', 'learning', 'communication', 'transport'].includes(id))}
              className={`flex flex-col items-center justify-center gap-0.5 text-[9px] disabled:opacity-30 ${['learning', 'communication', 'transport', 'super-admin-sys-settings'].includes(activeTab) ? 'text-indigo-400' : ''}`}
            >
              <BookOpen className="w-4 h-4" />
              <span>{user.role === 'Super Admin' ? 'Settings' : allowedTabIds.includes('learning') ? 'LMS' : allowedTabIds.includes('communication') ? 'Chat' : 'More'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex flex-col items-center justify-center gap-0.5 text-[9px] text-rose-400 font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const LandingPage = React.lazy(() => import('./components/marketing/LandingPage'));
const ContactPage = React.lazy(() => import('./components/marketing/ContactPage'));
const ProductPage = React.lazy(() => import('./components/marketing/ProductPage'));

export default function App() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/demo" element={<ContactPage />} />
        <Route path="/platform" element={<ProductPage kind="platform" />} />
        <Route path="/how-it-works" element={<ProductPage kind="how-it-works" />} />
        <Route path="/roles" element={<ProductPage kind="roles" />} />
        <Route path="/security" element={<ProductPage kind="security" />} />
        <Route path="/login" element={<AuthenticatedApp />} />
        <Route path="/app" element={<AuthenticatedApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}
