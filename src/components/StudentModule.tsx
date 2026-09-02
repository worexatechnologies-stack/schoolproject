import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  UserPlus,
  ShieldAlert,
  Award,
  ArrowUpCircle,
  Smartphone,
  Calendar,

  GraduationCap,
  UploadCloud,
  User,
  MapPin,
  Activity,
  FileText,
  Trash2,
  Download,
  BookOpen,
} from 'lucide-react';
import { Student, StudentDocument, UserRole } from '../types';
import AuthenticatedImage from './AuthenticatedImage';
import { formatBytes, optimizeImageForUpload } from '../services/imageOptimizer';
import { apiDownload, apiRequest } from '../services/api';
import {
  ACADEMIC_STRUCTURE_CHANGED_EVENT,
  AcademicClass,
  AcademicSection,
  AcademicSubject,
  AcademicYear,
  loadAcademicStructure,
} from '../services/academicStructure';

interface StudentModuleProps {
  students: Student[];
  onAddStudent: (newStudent: Student) => Promise<Student>;
  onUpdateStudent: (updatedStudent: Student) => Promise<void>;
  onDeleteStudent: (studentId: string) => Promise<void>;
  onPromoteStudent: (studentId: string, nextClass: string) => void;
  onIssueTC: (studentId: string) => void;
  onDocumentsChanged: (studentId: string, documents: StudentDocument[]) => void;
  accountDirectory?: Array<{ id: number; email: string; role: string; studentId?: string; parentStudentIds?: string[] }>;
  onResetCredentials?: (userId: number) => Promise<{ loginId: string; temporaryPassword: string }>;
  currentAcademicYear?: string;
  canManageStudents?: boolean;
  onOpenAcademicSetup?: () => void;
  viewerRole?: UserRole;
}

type StudentDetailsTab = 'Profile' | 'Performance' | 'Fees' | 'Attendance' | 'Documents' | 'History';

export default function StudentModule({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onPromoteStudent,
  onIssueTC,
  onDocumentsChanged,
  accountDirectory = [],
  onResetCredentials,
  currentAcademicYear = '',
  canManageStudents = false,
  onOpenAcademicSetup,
  viewerRole = 'School Admin',
}: StudentModuleProps) {
  const isTeacherView = viewerRole === 'Teacher';
  // Query Filters
  const [yearFilter, setYearFilter] = useState(currentAcademicYear);
  const [classFilter, setClassFilter] = useState('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Tab state inside details panel
  const [activeDetailsTab, setActiveDetailsTab] = useState<StudentDetailsTab>('Profile');

  // Forms states
  const [isAdding, setIsAdding] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newSectionId, setNewSectionId] = useState<number | undefined>();
  const [newRollNo, setNewRollNo] = useState<number>(0);
  const [newParent, setNewParent] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDob, setNewDob] = useState('2011-04-12');
  const [newGender, setNewGender] = useState('Male');
  const [newBloodGroup, setNewBloodGroup] = useState('B+');
  const [newAadhaar, setNewAadhaar] = useState('');
  const [newFatherName, setNewFatherName] = useState('');
  const [newMotherName, setNewMotherName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string>('');
  const [newPhotoSummary, setNewPhotoSummary] = useState('');

  // Document upload state
  const [uploadDocName, setUploadDocName] = useState('Birth Certificate');
  const [uploadDocumentFile, setUploadDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [credentialRevision, setCredentialRevision] = useState(0);
  // A generated password exists only in this in-memory state.  It is never
  // written to localStorage or the database in plaintext.
  const [revealedCredential, setRevealedCredential] = useState<{
    role: 'Student' | 'Parent'; loginId: string; temporaryPassword: string;
  } | null>(null);
  const [academicClasses, setAcademicClasses] = useState<AcademicClass[]>([]);
  const [academicSections, setAcademicSections] = useState<AcademicSection[]>([]);
  const [academicSubjects, setAcademicSubjects] = useState<AcademicSubject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [structureError, setStructureError] = useState('');
  const classOptions = academicClasses;
  const sectionRecords = academicSections;
  const selectedClassRecord = classOptions.find((classroom) => classroom.name === newClass) || classOptions[0];
  const sectionOptions = sectionRecords.filter((section) => section.classId === selectedClassRecord?.id);
  const filterClassRecord = classOptions.find((classroom) => classroom.name === classFilter);
  const teacherYearNames = Array.from(new Set(students.map((student) => student.academicYear).filter(Boolean)));
  const teacherClassNames = Array.from(new Set(
    students
      .filter((student) => !yearFilter || student.academicYear === yearFilter)
      .map((student) => student.class)
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const directoryYearOptions = isTeacherView
    ? teacherYearNames.map((name) => ({ id: name, name }))
    : academicYears.map((year) => ({ id: String(year.id), name: year.name }));
  const directoryClassNames = isTeacherView ? teacherClassNames : classOptions.map((classroom) => classroom.name);
  const filterSections = isTeacherView
    ? Array.from(new Set(
        students
          .filter((student) => (!yearFilter || student.academicYear === yearFilter) && (classFilter === 'All' || student.class === classFilter))
          .map((student) => student.section)
          .filter(Boolean),
      )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    : Array.from(new Set(
        sectionRecords
          .filter((section) => classFilter === 'All' || section.classId === filterClassRecord?.id)
          .map((section) => section.name),
      ));

  useEffect(() => {
    let active = true;
    const load = () => loadAcademicStructure()
      .then(({ years, classes, sections, subjects }) => {
        if (!active) return;
        setAcademicYears(years);
        setAcademicClasses(classes);
        setAcademicSections(sections);
        setAcademicSubjects(subjects);
        setStructureError('');
        const selectedYear = years.find((year) => year.name === currentAcademicYear)
          || years.find((year) => year.is_active)
          || years[0];
        setYearFilter((existing) => years.some((year) => year.name === existing) ? existing : (selectedYear?.name || ''));
        const classroom = classes[0];
        const classSections = classroom ? sections.filter((item) => item.classId === classroom.id) : [];
        const section = classSections[0];
        setNewClass(classroom?.name || '');
        if (section) {
          setNewSection(section.name);
          setNewSectionId(section.id);
        } else {
          setNewSection('');
          setNewSectionId(undefined);
        }
      })
      .catch((error) => setStructureError(error instanceof Error ? error.message : 'Could not load classes and sections.'));
    void load();
    window.addEventListener(ACADEMIC_STRUCTURE_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(ACADEMIC_STRUCTURE_CHANGED_EVENT, load);
    };
  }, [currentAcademicYear]);

  useEffect(() => {
    if (!isTeacherView) return;

    const nextYear = teacherYearNames.includes(currentAcademicYear)
      ? currentAcademicYear
      : teacherYearNames[0] || '';
    if (!teacherYearNames.includes(yearFilter) && yearFilter !== nextYear) {
      setYearFilter(nextYear);
    }

    if (classFilter !== 'All' && !teacherClassNames.includes(classFilter)) {
      setClassFilter('All');
      setSectionFilter('All');
    } else if (sectionFilter !== 'All' && !filterSections.includes(sectionFilter)) {
      setSectionFilter('All');
    }
  }, [classFilter, currentAcademicYear, filterSections, isTeacherView, sectionFilter, teacherClassNames, teacherYearNames, yearFilter]);

  useEffect(() => {
    if (isTeacherView && ['Fees', 'Documents'].includes(activeDetailsTab)) {
      setActiveDetailsTab('Profile');
    }
  }, [activeDetailsTab, isTeacherView]);

  // Filter students based on all selected criteria
  const filteredStudents = students.filter(student => {
    const matchesYear = student.academicYear === yearFilter;
    const matchesClass = classFilter === 'All' || student.class === classFilter;
    const matchesSection = sectionFilter === 'All' || student.section === sectionFilter;

    const query = search.toLowerCase().trim();
    const matchesSearch = !query || 
      String(student.name || '').toLowerCase().includes(query) ||
      String(student.admissionNo || '').toLowerCase().includes(query) ||
      String(student.rollNo || '').toLowerCase() === query ||
      String(student.class || '').toLowerCase().includes(query) ||
      String(student.section || '').toLowerCase() === query ||
      String(student.parentPhone || '').toLowerCase().includes(query);

    return matchesYear && matchesClass && matchesSection && matchesSearch;
  });

  // Track the selected student
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  
  // Resolve selected student (handling changes dynamically)
  const selectedStudent = filteredStudents.find(s => s.id === selectedStudentId) || filteredStudents[0] || null;
  const selectedStudentSection = academicSections.find((section) => section.id === selectedStudent?.sectionId);
  const selectedStudentClass = academicClasses.find((classroom) => classroom.id === selectedStudentSection?.classId)
    || academicClasses.find((classroom) => classroom.name === selectedStudent?.class);
  const selectedStudentSubjectIds = new Set(selectedStudentClass?.subjectIds || []);
  const selectedStudentSubjects = academicSubjects
    .filter((subject) => selectedStudentSubjectIds.has(subject.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const detailsTabs: Array<{ id: StudentDetailsTab; label: string }> = isTeacherView
    ? [
        { id: 'Profile', label: 'Student profile' },
        { id: 'Performance', label: 'Subjects' },
        { id: 'Attendance', label: 'Attendance' },
      ]
    : [
        { id: 'Profile', label: 'Profile' },
        { id: 'Performance', label: 'Performance' },
        { id: 'Fees', label: 'Fees' },
        { id: 'Attendance', label: 'Attendance' },
        { id: 'Documents', label: 'Documents' },
        { id: 'History', label: 'History' },
      ];

  const getLoginDetailsForStudent = (student: Student) => {
    void credentialRevision;
    const studentAccount = accountDirectory.find((account) => account.role === 'student' && account.studentId === student.id);
    const parentAccount = accountDirectory.find((account) => account.role === 'parent' && account.parentStudentIds?.includes(student.id));

    return {
      studentEmail: studentAccount?.email || 'No linked Student login found',
      studentPassword: 'Password is shown only once. Use Reset credentials to generate a new one.',
      studentUserId: studentAccount?.id,
      parentEmail: parentAccount?.email || 'No linked Parent login found',
      parentPassword: 'Password is shown only once. Use Reset credentials to generate a new one.',
      parentUserId: parentAccount?.id,
    };
  };

  const resetCredentials = async (role: 'Student' | 'Parent', userId: number | undefined) => {
    if (!onResetCredentials || !userId) {
      alert(`No linked ${role} login is available to reset.`);
      return;
    }
    if (!confirm(`Generate a new one-time password for this ${role} account?`)) return;
    try {
      const credentials = await onResetCredentials(userId);
      setCredentialRevision((version) => version + 1);
      setRevealedCredential({ role, loginId: credentials.loginId, temporaryPassword: credentials.temporaryPassword });
    } catch (error) {
      alert(error instanceof Error ? `Could not reset ${role} credentials: ${error.message}` : `Could not reset ${role} credentials.`);
    }
  };

  const copyLoginDetails = (student: Student) => {
    const details = getLoginDetailsForStudent(student);
    navigator.clipboard?.writeText([
      `Student Email: ${details.studentEmail}`,
      `Parent Email: ${details.parentEmail}`,
    ].join('\n'));
  };

  // Calculate cohort-wise dashboard stats corresponding to currently selected class filter
  const cohortForDashboard = students.filter(s => 
    s.academicYear === yearFilter && 
    (classFilter === 'All' ? true : s.class === classFilter) &&
    (sectionFilter === 'All' ? true : s.section === sectionFilter)
  );

  const statsTotal = cohortForDashboard.length;
  const statsBoys = cohortForDashboard.filter(s => s.gender === 'Male').length;
  const statsGirls = cohortForDashboard.filter(s => s.gender === 'Female').length;
  
  const recordedAttendance = cohortForDashboard
    .map((student) => student.attendancePercentage)
    .filter((value): value is number => value !== undefined);
  const statsAvgAttendance = recordedAttendance.length > 0
    ? Math.round(recordedAttendance.reduce((sum, value) => sum + value, 0) / recordedAttendance.length)
    : null;

  const statsTotalExpectedFee = cohortForDashboard.reduce((sum, s) => sum + (s.feeTotal ?? 0), 0);
  const statsTotalPaidFee = cohortForDashboard.reduce((sum, s) => sum + (s.feePaid ?? 0), 0);
  const statsFeeStatusPercent = statsTotalExpectedFee > 0
    ? Math.round((statsTotalPaidFee / statsTotalExpectedFee) * 100)
    : 0;

  const currentClassTeacher = classFilter !== 'All' ? 'See Teacher Profiles' : 'Multiple Teachers';

  const resetStudentForm = () => {
    const firstClass = classOptions[0];
    const firstSection = sectionRecords.find((item) => item.classId === firstClass?.id);
    setNewName('');
    setNewParent('');
    setNewPhone('');
    setNewEmail('');
    setNewFatherName('');
    setNewMotherName('');
    setNewAadhaar('');
    setNewAddress('');
    setNewRollNo(0);
    setNewPhotoFile(null);
    setNewPhotoPreview('');
    setNewPhotoSummary('');
    if (firstClass) setNewClass(firstClass.name);
    if (firstSection) {
      setNewSection(firstSection.name);
      setNewSectionId(firstSection.id);
    } else {
      setNewSection('');
      setNewSectionId(undefined);
    }
    setEditingStudentId(null);
  };

  const startEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setNewName(student.name);
    setNewClass(student.class);
    setNewSection(student.section);
    const classroom = academicClasses.find((item) => item.name === student.class);
    const section = academicSections.find((item) => item.classId === classroom?.id && item.name === student.section);
    setNewSectionId(student.sectionId || section?.id);
    setNewRollNo(student.rollNo);
    setNewParent(student.parentName);
    setNewPhone(student.parentPhone);
    setNewEmail(student.parentEmail);
    setNewDob(student.dob);
    setNewGender(student.gender);
    setNewBloodGroup(student.bloodGroup || 'B+');
    setNewAadhaar(student.aadhaar || '');
    setNewFatherName(student.fatherName || student.parentName);
    setNewMotherName(student.motherName || '');
    setNewAddress(student.address || '');
    setNewPhotoFile(null);
    setNewPhotoPreview(student.photoUrl || '');
    setNewPhotoSummary('');
    setIsAdding(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newParent || !newPhone) return;
    if (!yearFilter || !academicYears.some((year) => year.name === yearFilter)) {
      alert('Create and select an academic year in Academic Setup before saving a student.');
      return;
    }
    if (!newSectionId) {
      alert('A School Admin must create and select a class section before saving a student.');
      return;
    }

    const computedRollNo = newRollNo > 0 ? newRollNo : (students.filter(s => s.class === newClass && s.academicYear === yearFilter).length + 1);

    if (editingStudentId) {
      const existing = students.find(s => s.id === editingStudentId);
      if (!existing) return;

      const updatedStudent: Student = {
        ...existing,
        name: newName,
        class: newClass,
        section: newSection,
        sectionId: newSectionId,
        academicYear: yearFilter,
        rollNo: computedRollNo,
        parentName: newParent,
        parentPhone: newPhone,
        parentEmail: newEmail || existing.parentEmail,
        dob: newDob,
        gender: newGender,
        address: newAddress || '',
        medicalConditions: existing.medicalConditions || 'None',
        bloodGroup: newBloodGroup,
        aadhaar: newAadhaar,
        fatherName: newFatherName || newParent,
        motherName: newMotherName || 'Not Specified',
        feeTotal: existing.feeTotal ?? 0,
        feePaid: existing.feePaid ?? 0,
        photoUrl: newPhotoPreview || existing.photoUrl,
        photoFile: newPhotoFile || undefined,
      };

      await onUpdateStudent(updatedStudent);
      setSelectedStudentId(updatedStudent.id);
      setIsAdding(false);
      resetStudentForm();
      return;
    }

    const academicYearCode = yearFilter.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || 'YEAR';
    const newS: Student = {
      id: `s-${Date.now()}`,
      admissionNo: `ADM-${academicYearCode}-${Date.now().toString(36).toUpperCase()}`,
      name: newName,
      class: newClass,
      section: newSection,
      sectionId: newSectionId,
      rollNo: computedRollNo,
      parentName: newParent,
      parentPhone: newPhone,
      parentEmail: newEmail || `${newParent.toLowerCase().replace(/\s/g, '')}@school-erp.com`,
      dob: newDob,
      gender: newGender,
      address: newAddress || '',
      medicalConditions: 'None',
      qrCodeData: `SCH-ERP-s-${Date.now()}`,
      status: 'Active',
      academicYear: yearFilter,
      bloodGroup: newBloodGroup,
      aadhaar: newAadhaar,
      fatherName: newFatherName || newParent,
      motherName: newMotherName || 'Not Specified',
      attendancePercentage: 100,
      feeTotal: 0,
      feePaid: 0,
      gpa: undefined,
      documents: [],
      history: []
    };
    if (newPhotoFile) {
      newS.photoFile = newPhotoFile;
      newS.photoUrl = newPhotoPreview;
    }

    try {
      const createdStudent = await onAddStudent(newS);
      setSelectedStudentId(createdStudent.id);
      setIsAdding(false);
      resetStudentForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Student admission could not be saved to the server.');
    }
  };

  const handlePromote = (sId: string) => {
    if (!selectedStudent) return;
    const currentIndex = classOptions.findIndex((classroom) => classroom.name === selectedStudent.class);
    const nextClassroom = currentIndex >= 0 ? classOptions[currentIndex + 1] : undefined;
    if (!nextClassroom) {
      alert('Create or order the next class before promoting this student.');
      return;
    }

    onPromoteStudent(sId, nextClassroom.name);
    
    // Switch the viewing context to the next year filter so they see the promoted clone!
    const parts = selectedStudent.academicYear.split('-');
    if (parts.length === 2) {
      const nextY = `${parseInt(parts[0]) + 1}-${String(parseInt(parts[1]) + 1).slice(-2)}`;
      setYearFilter(nextY);
      setSelectedStudentId(`${selectedStudent.admissionNo}_${nextY}`);
    }
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !uploadDocumentFile) {
      alert('Choose a PDF, JPEG, or PNG document first.');
      return;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('name', uploadDocName);
      body.append('file', uploadDocumentFile);
      const uploaded = await apiRequest<StudentDocument>(`/students/${selectedStudent.id}/documents/`, { method: 'POST', body });
      const updatedDocs = [...(selectedStudent.documents || []), uploaded];
      onDocumentsChanged(selectedStudent.id, updatedDocs);
      setUploadDocumentFile(null);
      const input = document.getElementById('student-document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      alert(`Document "${uploaded.name}" uploaded securely for ${selectedStudent.name}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Document upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentDownload = async (document: StudentDocument) => {
    if (!document.downloadUrl) {
      alert('This legacy document is not available for download. Upload it again to store it securely.');
      return;
    }
    try {
      const { blob, filename } = await apiDownload(document.downloadUrl);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Document download failed.');
    }
  };

  // Helper to resolve profile photo URL or initials
  const renderProfilePhoto = (student: Student, sizeClass = "w-10 h-10 text-xs") => {
    const photoUrl = student.photoUrl;
    if (photoUrl) {
      return (
        <AuthenticatedImage
          src={photoUrl}
          alt={student.name}
          className={`${sizeClass} rounded-full object-cover border border-slate-200`}
        />
      );
    }
    const initials = String(student.name || 'ST').split(' ').map(n => n[0]).slice(0, 2).join('');
    return (
      <div className={`${sizeClass} rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold flex items-center justify-center`}>
        {initials}
      </div>
    );
  };

  return (
    <>
    <div className="space-y-6" id="student-management-workspace">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-sans font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            {isTeacherView ? 'My Assigned Students' : 'Class-wise Student Directory'}
          </h2>
          <p className="text-xs text-slate-500">
            {isTeacherView
              ? 'Only students in your assigned class sections are shown. Open a profile to review learning details or contact the student and guardian.'
              : 'Maintain independent rosters per academic term, monitor class performance dashboards, execute promotions, and manage documents.'}
          </p>
        </div>
        
        {canManageStudents && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onOpenAcademicSetup}
              disabled={!onOpenAcademicSetup}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Open Academic Setup
            </button>
            <button
              disabled={!academicYears.length || !academicSections.length}
              onClick={() => {
                if (isAdding) {
                  setIsAdding(false);
                  resetStudentForm();
                } else {
                  setEditingStudentId(null);
                  setIsAdding(true);
                }
              }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors"
              title={!academicYears.length || !academicSections.length ? 'Create an academic year, class, and section first' : undefined}
            >
              <UserPlus className="w-4 h-4" />
              {isAdding ? 'View Student List' : 'Enroll New Student'}
            </button>
          </div>
        )}
      </div>

      {structureError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {structureError}
        </div>
      )}

      {isTeacherView && (
        <div className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">Assignment-scoped access is active. Unassigned classes and students are not available in this directory.</span>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
            {students.length} assigned student{students.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Class-wise Dashboard Widgets (Hides during adding form) */}
      {!isAdding && (
        <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-sm space-y-4 relative overflow-hidden" id="class-cohort-dashboard">
          <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">{isTeacherView ? 'Assigned roster summary' : 'Cohort Analytics Dashboard'}</p>
              <h3 className="text-sm font-bold font-sans flex items-center gap-1.5 mt-0.5">
                {classFilter === 'All' ? (isTeacherView ? 'My assigned classes' : 'School-wide Summary') : `${classFilter} (${sectionFilter === 'All' ? 'All Sections' : `Section ${sectionFilter}`})`}
                <span className="text-xs font-mono text-slate-400">· Cycle {yearFilter}</span>
              </h3>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60 text-xs text-indigo-200 font-mono">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isTeacherView ? <strong className="text-white font-sans font-semibold">Server-scoped access</strong> : <>Teacher: <strong className="text-white font-sans font-semibold">{currentClassTeacher}</strong></>}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 pt-1">
            <div className="bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">TOTAL STUDENTS</span>
              <p className="text-xl font-extrabold font-sans text-white mt-1.5">{statsTotal}</p>
            </div>

            <div className="bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">BOYS RATIO</span>
              <p className="text-xl font-extrabold font-sans text-indigo-200 mt-1.5">
                {statsBoys} <span className="text-[11px] font-normal text-slate-400">({statsTotal > 0 ? Math.round((statsBoys / statsTotal) * 100) : 0}%)</span>
              </p>
            </div>

            <div className="bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">GIRLS RATIO</span>
              <p className="text-xl font-extrabold font-sans text-pink-300 mt-1.5">
                {statsGirls} <span className="text-[11px] font-normal text-slate-400">({statsTotal > 0 ? Math.round((statsGirls / statsTotal) * 100) : 0}%)</span>
              </p>
            </div>

            <div className="bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">CLASS ATTENDANCE</span>
              <div className="flex items-baseline gap-1 mt-1.5">
                <p className="text-xl font-extrabold font-sans text-emerald-400">{statsAvgAttendance === null ? '—' : `${statsAvgAttendance}%`}</p>
                <span className="text-[9px] text-slate-400 font-medium">avg</span>
              </div>
            </div>

            {isTeacherView ? (
              <div className="col-span-2 md:col-span-1 bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider">VISIBLE CLASSES</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-300" />
                  <p className="text-xl font-extrabold font-sans text-amber-300">{teacherClassNames.length}</p>
                </div>
              </div>
            ) : (
              <div className="col-span-2 md:col-span-1 bg-white/5 border border-white/5 p-3 rounded-lg flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider">FEES COLLECTED</span>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-xl font-extrabold font-sans text-amber-400">{statsFeeStatusPercent}%</p>
                  <div className="w-10 bg-slate-800 rounded-full h-1.5">
                    <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${statsFeeStatusPercent}%` }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdding ? (
        /* ADMISSION REGISTRATION FORM */
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-4xl mx-auto">
          <div className="border-b border-slate-100 pb-3 mb-5">
            <h3 className="font-sans font-bold text-slate-900 text-sm">{editingStudentId ? 'Edit Student Details' : 'Register New Student (Class-wise Admission)'}</h3>
            <p className="text-xs text-slate-500">{editingStudentId ? 'Update student profile and guardian contact details.' : 'Provide personal and guardian contact details to enroll instantly.'}</p>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            
            {/* Primary Details Block */}
            <div>
              <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                1. Basic Personal Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Profile Photo</label>
                  <div className="mt-1 flex items-center gap-3">
                    {newPhotoPreview ? <AuthenticatedImage src={newPhotoPreview} alt="Student preview" className="h-12 w-12 rounded-full border border-slate-200 object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">Photo</span>}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                      const file = event.target.files?.[0] || null;
                      if (!file) { setNewPhotoFile(null); setNewPhotoPreview(''); setNewPhotoSummary(''); return; }
                      try {
                        const optimized = await optimizeImageForUpload(file);
                        setNewPhotoFile(optimized.file);
                        setNewPhotoPreview(optimized.previewUrl);
                        setNewPhotoSummary(`${optimized.width}×${optimized.height} WebP · ${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)}`);
                      } catch (error) {
                        alert(error instanceof Error ? error.message : 'Photo optimization failed.');
                        event.target.value = '';
                      }
                    }} className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700" />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">JPEG, PNG, or WebP.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. Rohan Verma"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gender *</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Blood Group</label>
                  <select
                    value={newBloodGroup}
                    onChange={(e) => setNewBloodGroup(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option>A+</option>
                    <option>A-</option>
                    <option>B+</option>
                    <option>B-</option>
                    <option>O+</option>
                    <option>O-</option>
                    <option>AB+</option>
                    <option>AB-</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aadhaar Card Number (Optional)</label>
                  <input
                    type="text"
                    value={newAadhaar}
                    onChange={(e) => setNewAadhaar(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. 5432-8765-1029"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Roll Number (Leave 0 for Auto)</label>
                  <input
                    type="number"
                    value={newRollNo}
                    onChange={(e) => setNewRollNo(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. 15"
                  />
                </div>
              </div>
            </div>

            {/* Class Placement Block */}
            <div>
              <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                2. Roster Placement & Academic Year
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Academic Term</label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    disabled={!academicYears.length}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50 font-semibold text-slate-700"
                  >
                    {!academicYears.length && <option value="">Create an academic year first</option>}
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.name}>{year.name} Cycle</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grade/Class *</label>
                  <select
                    value={newClass}
                    onChange={(e) => {
                      const classroom = classOptions.find((item) => item.name === e.target.value);
                      const firstSection = sectionRecords.find((item) => item.classId === classroom?.id);
                      setNewClass(e.target.value);
                      setNewSection(firstSection?.name || '');
                      setNewSectionId(firstSection?.id);
                    }}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {!classOptions.length && <option value="">Create a class first</option>}
                    {classOptions.map((classroom) => (
                      <option key={classroom.id} value={classroom.name}>{classroom.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assigned Section *</label>
                  <select
                    value={newSection}
                    onChange={(e) => {
                      const section = sectionOptions.find((item) => item.name === e.target.value);
                      setNewSection(e.target.value);
                      setNewSectionId(section?.id);
                    }}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {!sectionOptions.length && <option value="">Create a section for this class</option>}
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.name}>{section.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Parent & Contact Details */}
            <div>
              <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                3. Parent, Guardian & Contact Info
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Primary Guardian Name *</label>
                  <input
                    type="text"
                    required
                    value={newParent}
                    onChange={(e) => setNewParent(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. Sunil Verma"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Father's Name</label>
                  <input
                    type="text"
                    value={newFatherName}
                    onChange={(e) => setNewFatherName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. Sunil Verma"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mother's Name</label>
                  <input
                    type="text"
                    value={newMotherName}
                    onChange={(e) => setNewMotherName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. Meera Verma"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Parent Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. +91 99999 88888"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Parent Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. sunil@gmail.com"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Use the guardian’s own email. Staff and student account emails cannot also be parent logins.</p>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Residential Address *</label>
                <textarea
                  required
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none h-16"
                  placeholder="Street No, Building/Flat, Locality, City/State"
                />
              </div>
            </div>


            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  resetStudentForm();
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-xs transition-all"
              >
                {editingStudentId ? 'Save Student Changes' : 'Confirm Admission Registry'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* MAIN ERP STUDENT WORKSPACE (SPLIT PANELS) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT PANEL: Directory list & Filter tools (col-span-5) */}
          <div className="flex h-[650px] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs lg:sticky lg:top-0 lg:col-span-5 lg:h-[calc(100dvh-8rem)]" id="student-sidebar-directory">
            
            {/* Multi-Filters header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                
                {/* Year Filter */}
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Academic Year</label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    disabled={!directoryYearOptions.length}
                    className="text-xs p-2 w-full rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-mono font-semibold"
                  >
                    {!directoryYearOptions.length && <option value="">{isTeacherView ? 'No assigned students' : 'No academic years'}</option>}
                    {directoryYearOptions.map((year) => (
                      <option key={year.id} value={year.name}>{year.name}</option>
                    ))}
                  </select>
                </div>

                {/* Class Filter */}
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Class/Grade</label>
                  <select
                    value={classFilter}
                    onChange={(e) => {
                      setClassFilter(e.target.value);
                      setSectionFilter('All');
                    }}
                    className="text-xs p-2 w-full rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                  >
                    <option value="All">{isTeacherView ? 'All Assigned' : 'All Grades'}</option>
                    {directoryClassNames.map((className) => (
                      <option key={className} value={className}>{className}</option>
                    ))}
                  </select>
                </div>

                {/* Section Filter */}
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Section</label>
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="text-xs p-2 w-full rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                  >
                    <option value="All">All Sections</option>
                    {filterSections.map((section) => (
                      <option key={section} value={section}>Sec {section}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advanced search (Query matches Name, Admission ID, Roll No, Class, Section, Mobile) */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Name, ADM-ID, Roll, Mobile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-xs w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 bg-white text-slate-800 placeholder-slate-400 font-semibold"
                />
              </div>
            </div>

            {/* Scrollable list of filtered cohort */}
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isTeacherView
                    ? 'No students are linked to your assigned class sections for these filters.'
                    : 'No matching students found in this cycle.'}
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const isSelected = selectedStudent?.id === student.id;
                  return (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`p-4 flex items-center justify-between hover:bg-slate-50/70 cursor-pointer transition-all border-l-4 ${isSelected ? 'bg-indigo-50/50 border-l-indigo-600' : 'border-l-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        {renderProfilePhoto(student, "w-9 h-9 text-[11px]")}
                        <div>
                          <p className="text-xs font-bold text-slate-900">{student.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 font-mono">
                            <span>{student.admissionNo}</span>
                            <span>·</span>
                            <span>Roll #{student.rollNo}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          {student.class}-{student.section}
                        </span>
                        <div className="mt-1">
                          {student.status === 'TC_Issued' ? (
                            <span className="text-[9px] font-bold text-rose-500 uppercase">TC Issued</span>
                          ) : student.status === 'Promoted' ? (
                            <span className="text-[9px] font-bold text-indigo-500 uppercase">Archived</span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-500 uppercase">Active</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Total Indicator footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center font-semibold">
              {isTeacherView ? 'Visible assigned roster' : 'Filtered cohort size'}: {filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'}
            </div>
          </div>

          {/* RIGHT PANEL: Comprehensive Student details tabs (col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {selectedStudent ? (
              <div className="space-y-6">
                
                {/* ID Identification header */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div className="flex items-center gap-4">
                    {renderProfilePhoto(selectedStudent, "w-14 h-14 text-base")}
                    <div>
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono">
                        Cycle {selectedStudent.academicYear}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 font-sans tracking-tight mt-1">{selectedStudent.name}</h3>
                      <p className="text-xs text-slate-500">
                        Class: <strong className="text-slate-800">{selectedStudent.class} - {selectedStudent.section}</strong> · Admission: <strong className="text-slate-800 font-mono">{selectedStudent.admissionNo}</strong>{isTeacherView && <> · Roll: <strong className="text-slate-800 font-mono">#{selectedStudent.rollNo}</strong></>}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {selectedStudent.status === 'TC_Issued' ? (
                      <span className="bg-rose-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                        Locked (TC Issued)
                      </span>
                    ) : selectedStudent.status === 'Promoted' ? (
                      <span className="bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                        Term Promoted
                      </span>
                    ) : (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                        Active Enrolled
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-tabs Selection for specific profiles attributes */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto divide-x divide-slate-100" id="profile-sub-tabs">
                    {detailsTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDetailsTab(tab.id)}
                        className={`px-4 py-3 text-xs font-bold tracking-wide transition-all ${activeDetailsTab === tab.id ? 'bg-white text-indigo-600 border-t-2 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {/* TAB 1: Profile & Contact */}
                    {activeDetailsTab === 'Profile' && (
                      <div className="space-y-4" id="tab-profile-details">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                            {selectedStudent.photoUrl ? (
                              <AuthenticatedImage src={selectedStudent.photoUrl} alt={`${selectedStudent.name}'s profile`} className="h-28 w-28 rounded-full border-2 border-white object-cover shadow-sm" />
                            ) : (
                              <>
                                <div className="grid h-20 w-20 place-items-center rounded-full bg-indigo-100 text-indigo-600">
                                  <User className="h-9 w-9" />
                                </div>
                                <p className="mt-3 text-xs font-bold text-slate-600">No photo uploaded</p>
                                <p className="mt-1 text-[10px] text-slate-400">Student profile image</p>
                              </>
                            )}
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Personal Particulars</span>
                            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                              <p>Date of Birth: <strong className="text-slate-800 font-mono">{selectedStudent.dob}</strong></p>
                              <p>Gender: <strong className="text-slate-800">{selectedStudent.gender}</strong></p>
                              {isTeacherView ? (
                                <>
                                  <p>Admission ID: <strong className="text-slate-800 font-mono">{selectedStudent.admissionNo}</strong></p>
                                  <p>Roll Number: <strong className="text-slate-800 font-mono">#{selectedStudent.rollNo}</strong></p>
                                  <p>Status: <strong className="text-slate-800">{selectedStudent.status}</strong></p>
                                </>
                              ) : (
                                <>
                                  <p>Blood Group: <strong className="text-slate-800 font-mono">{selectedStudent.bloodGroup || 'Not recorded'}</strong></p>
                                  <p>Aadhaar UID: <strong className="text-slate-800 font-mono">{selectedStudent.aadhaar || 'Not Uploaded'}</strong></p>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Parent / Guardian Details</span>
                            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                              <p>Primary Guardian: <strong className="text-slate-800">{selectedStudent.parentName}</strong></p>
                              {!isTeacherView && <p>Father Name: <strong className="text-slate-800">{selectedStudent.fatherName || selectedStudent.parentName}</strong></p>}
                              {!isTeacherView && <p>Mother Name: <strong className="text-slate-800">{selectedStudent.motherName || 'Not Specified'}</strong></p>}
                              <p>Emergency Phone: <strong className="text-indigo-600 font-mono">{selectedStudent.parentPhone}</strong></p>
                            </div>
                          </div>
                        </div>

                        {isTeacherView && (
                          <section className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Class subjects</span>
                            <p className="mt-1 text-xs text-slate-600">Subjects configured for {selectedStudent.class} - {selectedStudent.section}.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {selectedStudentSubjects.length ? selectedStudentSubjects.map((subject) => (
                                <span key={subject.id} className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700">{subject.name}</span>
                              )) : <span className="text-xs font-semibold text-amber-700">No subjects are assigned to this class yet.</span>}
                            </div>
                          </section>
                        )}

                        {!isTeacherView && <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1 text-xs text-slate-600">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Contact & Communication Address</span>
                          <p className="flex items-center gap-1.5 mt-1">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                            <span>Mobile Phone: <strong className="text-slate-800 font-mono">{selectedStudent.parentPhone}</strong></span>
                          </p>
                          <p className="flex items-center gap-1.5 mt-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>Parent Email: <strong className="text-slate-800 font-mono">{selectedStudent.parentEmail}</strong></span>
                          </p>
                          <p className="flex items-start gap-1.5 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>Address: <strong className="text-slate-800 leading-normal">{selectedStudent.address}</strong></span>
                          </p>
                        </div>}

                        {!isTeacherView && (() => {
                          const loginDetails = getLoginDetailsForStudent(selectedStudent);
                          return (
                            <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-100 text-xs text-slate-700">
                              <div className="flex flex-col gap-3">
                                <div className="min-w-0">
                                  <span className="text-[10px] text-emerald-600 font-bold uppercase block mb-2">Login Details — Student & Parent</span>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div className="min-w-0 rounded-lg bg-white border border-emerald-100 p-3">
                                      <p className="text-[10px] font-bold uppercase text-slate-400">Student Login</p>
                                      <p className="mt-1 break-all font-mono"><strong>Email:</strong> {loginDetails.studentEmail}</p>
                                      <p className="mt-1 break-all font-mono"><strong>Password:</strong> {loginDetails.studentPassword}</p>
                                      <button onClick={() => void resetCredentials('Student', loginDetails.studentUserId)} className="mt-3 rounded-lg border border-indigo-200 px-2.5 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">Reset Student credentials</button>
                                    </div>
                                    <div className="min-w-0 rounded-lg bg-white border border-emerald-100 p-3">
                                      <p className="text-[10px] font-bold uppercase text-slate-400">Parent Login</p>
                                      <p className="mt-1 break-all font-mono"><strong>Email:</strong> {loginDetails.parentEmail}</p>
                                      <p className="mt-1 break-all font-mono"><strong>Password:</strong> {loginDetails.parentPassword}</p>
                                      <button onClick={() => void resetCredentials('Parent', loginDetails.parentUserId)} className="mt-3 rounded-lg border border-indigo-200 px-2.5 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">Reset Parent credentials</button>
                                    </div>
                                  </div>
                                </div>
                                <button onClick={() => copyLoginDetails(selectedStudent)} className="self-start rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700">Copy Login IDs</button>
                              </div>
                            </div>
                          );
                        })()}

                        {!isTeacherView && <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-100 text-xs text-slate-600">
                          <span className="text-[10px] text-rose-500 font-bold uppercase block mb-1">Medical & Emergency Instructions</span>
                          <p className="font-semibold text-rose-900">{selectedStudent.medicalConditions || 'No critical allergies or conditions registered.'}</p>
                        </div>}
                      </div>
                    )}

                    {/* TAB 2: Academic Performance */}
                    {activeDetailsTab === 'Performance' && (
                      <div className="space-y-4" id="tab-performance-details">
                        {!isTeacherView && <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Current Academic GPA</span>
                            <p className="text-xl font-bold text-slate-950 mt-0.5">{selectedStudent.gpa !== undefined ? `${selectedStudent.gpa} / 10` : 'Pending Exam Marks'}</p>
                          </div>
                          <Award className="w-8 h-8 text-indigo-500" />
                        </div>}

                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">{isTeacherView ? `Subjects for ${selectedStudent.class} - ${selectedStudent.section}` : 'First Term Midterm Report'}</span>
                          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden bg-white text-xs">
                            <div className="p-2.5 bg-slate-50 font-bold text-slate-700 flex justify-between">
                              <span>Subject</span>
                              {!isTeacherView && <div className="flex gap-8">
                                <span className="w-16 text-center">Marks (80)</span>
                                <span className="w-12 text-center">Grade</span>
                              </div>}
                            </div>
                            {selectedStudentSubjects.length ? selectedStudentSubjects.map((subject) => (
                              <div key={subject.id} className="p-2.5 flex justify-between">
                                <span>{subject.name}</span>
                                {isTeacherView ? (
                                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-700">Assigned to class</span>
                                ) : <div className="flex gap-8 font-mono text-slate-400">
                                  <span className="w-16 text-center">--</span>
                                  <span className="w-12 text-center">Pending</span>
                                </div>}
                              </div>
                            )) : (
                              <p className="p-3 text-xs text-slate-500">No subjects are assigned to this class in Academic Setup.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: Fees Ledger */}
                    {!isTeacherView && activeDetailsTab === 'Fees' && (
                      <div className="space-y-4" id="tab-fees-details">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
                            <span className="text-[9px] text-slate-400 font-bold uppercase">TOTAL ANNUAL</span>
                            <p className="text-base font-extrabold text-slate-800 mt-1 font-mono">₹{selectedStudent.feeTotal ?? 0}</p>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                            <span className="text-[9px] text-emerald-600 font-bold uppercase">PAID SO FAR</span>
                            <p className="text-base font-extrabold text-emerald-800 mt-1 font-mono">₹{selectedStudent.feePaid ?? 0}</p>
                          </div>
                          <div className="p-3 bg-rose-50 rounded-lg border border-rose-100 text-center">
                            <span className="text-[9px] text-rose-600 font-bold uppercase">OUTSTANDING</span>
                            <p className="text-base font-extrabold text-rose-800 mt-1 font-mono">₹{Math.max(0, (selectedStudent.feeTotal ?? 0) - (selectedStudent.feePaid ?? 0))}</p>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2 text-xs">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Receipt Register</span>
                          <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                            <div>
                              <p className="font-bold text-slate-800">Quarter 1 Tuition Fee</p>
                              <p className="text-[10px] text-slate-400 font-mono">Receipt: SCH-Q1-2026</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold font-mono">₹{selectedStudent.feePaid ?? 0}</p>
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${selectedStudent.feePaid && selectedStudent.feePaid > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {selectedStudent.feePaid && selectedStudent.feePaid > 0 ? 'PAID' : 'PENDING'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 4: Attendance Summary */}
                    {activeDetailsTab === 'Attendance' && (
                      <div className="space-y-4" id="tab-attendance-details">
                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                          <div className="w-16 h-16 rounded-full border-4 border-indigo-500 flex items-center justify-center font-bold text-slate-800 text-sm font-sans shrink-0">
                            {selectedStudent.attendancePercentage === undefined ? '—' : `${selectedStudent.attendancePercentage}%`}
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Attendance Percentage</span>
                            <h4 className="text-sm font-bold text-slate-800 mt-0.5">Regular Classroom Attendance</h4>
                            <p className="text-xs text-slate-500 mt-1">{selectedStudent.attendancePercentage === undefined ? 'Attendance has not been recorded for this academic year.' : 'Calculated from the attendance records saved for this academic year.'}</p>
                          </div>
                        </div>

                        {!isTeacherView && <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                          <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex items-center justify-between">
                            <span>Present Days</span>
                            <strong className="text-emerald-800 font-mono text-sm">188 days</strong>
                          </div>
                          <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-100 flex items-center justify-between">
                            <span>Absent Days</span>
                            <strong className="text-rose-800 font-mono text-sm">12 days</strong>
                          </div>
                        </div>}
                      </div>
                    )}

                    {/* TAB 5: Documents Folder */}
                    {!isTeacherView && activeDetailsTab === 'Documents' && (
                      <div className="space-y-4" id="tab-documents-folder">
                        
                        <form onSubmit={handleDocumentUpload} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row gap-3 items-end">
                          <div className="flex-1 w-full">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Upload New Document</label>
                            <select
                              value={uploadDocName}
                              onChange={(e) => setUploadDocName(e.target.value)}
                              className="text-xs p-2.5 w-full rounded-lg border border-slate-200 bg-white focus:outline-none"
                            >
                              <option>Previous Term Marksheet</option>
                              <option>Transfer Certificate (TC)</option>
                              <option>Medical Fitness Certificate</option>
                              <option>Address Proof Copy</option>
                              <option>Character Certificate</option>
                            </select>
                          </div>
                          <div className="flex-1 w-full">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">File (PDF, JPEG, PNG · max 5 MB)</label>
                            <input id="student-document-file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setUploadDocumentFile(event.target.files?.[0] || null)} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs" required />
                          </div>
                          
                          <button
                            type="submit"
                            disabled={isUploading}
                            className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2.5 rounded-lg text-xs font-bold shrink-0 transition-all disabled:opacity-50"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            {isUploading ? 'Uploading...' : 'Upload to database'}
                          </button>
                        </form>

                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Verified Files Folder</span>
                          {selectedStudent.documents && selectedStudent.documents.length > 0 ? (
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg bg-white overflow-hidden text-xs">
                              {selectedStudent.documents.map((doc, idx) => (
                                <div key={doc.id || `${doc.name}-${idx}`} className="p-2.5 flex items-center justify-between hover:bg-slate-50/40 transition-colors">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-indigo-500" />
                                    <div>
                                      <p className="font-bold text-slate-800">{doc.name}</p>
                                      <p className="text-[9px] text-slate-400 font-mono uppercase">{doc.fileType}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                      {doc.status}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleDocumentDownload(doc)}
                                      className="p-1 text-slate-400 hover:text-indigo-600"
                                      title="Download File"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No files uploaded yet.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB 6: Complete Academic History */}
                    {!isTeacherView && activeDetailsTab === 'History' && (
                      <div className="space-y-4" id="tab-history-progression">
                        <div className="space-y-3">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Multi-Year Progression Snapshots</span>
                          
                          {selectedStudent.history && selectedStudent.history.length > 0 ? (
                            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-100">
                              {selectedStudent.history.map((hist, idx) => (
                                <div key={idx} className="flex gap-4 relative pl-8">
                                  <div className="absolute left-1 top-1.5 w-5 h-5 rounded-full bg-indigo-50 border-2 border-indigo-500 flex items-center justify-center font-bold text-[9px] text-indigo-700">
                                    {idx + 1}
                                  </div>
                                  
                                  <div className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex justify-between items-center border-b border-slate-200/50 pb-1.5">
                                      <span className="text-xs font-bold text-slate-900 font-mono">Academic Year {hist.academicYear}</span>
                                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded uppercase tracking-wider">
                                        {hist.status}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-600 font-medium">
                                      <p>Grade: <strong className="text-slate-800">{hist.class} {hist.section}</strong></p>
                                      <p>Final GPA: <strong className="text-slate-800 font-mono">{hist.gpa ? `${hist.gpa}/10` : '9.0'}</strong></p>
                                      <p>Attendance: <strong className="text-slate-800 font-mono">{hist.attendance}%</strong></p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                              No previous terms available. This student was admitted directly into the current {selectedStudent.academicYear} cycle.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Administration Administrative Actions box */}
                {canManageStudents && <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-slate-400" />
                    Administrative Actions
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      onClick={() => startEditStudent(selectedStudent)}
                      className="flex items-center justify-between p-3.5 bg-sky-50/70 border border-sky-100 hover:border-sky-300 text-sky-700 hover:text-sky-800 rounded-xl text-xs font-bold transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-sky-500" />
                        <span>Edit Student Details</span>
                      </div>
                      <span className="text-[9px] font-mono bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-bold uppercase">EDIT</span>
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm(`Delete student profile for ${selectedStudent.name}? This permanently removes the student and any login accounts that are no longer linked to a student.`)) return;
                        try {
                          await onDeleteStudent(selectedStudent.id);
                          setSelectedStudentId(null);
                        } catch (error) {
                          alert(error instanceof Error ? error.message : 'The student could not be deleted. Please try again.');
                        }
                      }}
                      className="flex items-center justify-between p-3.5 bg-red-50/70 border border-red-100 hover:border-red-300 text-red-700 hover:text-red-800 rounded-xl text-xs font-bold transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-500" />
                        <span>Delete Student Profile</span>
                      </div>
                      <span className="text-[9px] font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold uppercase">DELETE</span>
                    </button>

                    {/* Promote class trigger */}
                    <button
                      onClick={() => handlePromote(selectedStudent.id)}
                      disabled={selectedStudent.status === 'TC_Issued'}
                      className="flex items-center justify-between p-3.5 bg-indigo-50/50 border border-indigo-100 hover:border-indigo-300 text-indigo-700 hover:text-indigo-800 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                    >
                      <div className="flex items-center gap-2">
                        <ArrowUpCircle className="w-4 h-4 text-indigo-500" />
                        <span>Promote to Next Grade</span>
                      </div>
                      <span className="text-[9px] font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">PROMOTE</span>
                    </button>

                    {/* Lock / issue transfer certificate */}
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to issue a Transfer Certificate (TC) for ${selectedStudent.name}? This will lock their records.`)) {
                          onIssueTC(selectedStudent.id);
                        }
                      }}
                      disabled={selectedStudent.status === 'TC_Issued'}
                      className="flex items-center justify-between p-3.5 bg-rose-50/50 border border-rose-100 hover:border-rose-300 text-rose-700 hover:text-rose-800 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <span>Issue Transfer Certificate (TC)</span>
                      </div>
                      <span className="text-[9px] font-mono bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold uppercase">LOCK</span>
                    </button>
                  </div>
                </div>}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs shadow-xs">
                {isTeacherView
                  ? `No assigned students match these filters${yearFilter ? ` for ${yearFilter}` : ''}.`
                  : `No students match your query criteria in Academic Year ${yearFilter}. Choose another academic cycle or enroll a student.`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    {canManageStudents && revealedCredential && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation">
        <section className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="reset-credential-title">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">New one-time credentials</p>
          <h2 id="reset-credential-title" className="mt-1 text-lg font-extrabold text-slate-900">{revealedCredential.role} password reset</h2>
          <p className="mt-2 text-sm text-slate-600">Copy this password now. It will not be shown again, and the user must change it after signing in.</p>
          <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-900">
            <p className="break-all"><span className="font-sans font-bold text-slate-500">Login ID: </span>{revealedCredential.loginId}</p>
            <p className="break-all"><span className="font-sans font-bold text-slate-500">Temporary password: </span>{revealedCredential.temporaryPassword}</p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => void navigator.clipboard?.writeText(`Login ID: ${revealedCredential.loginId}\nTemporary password: ${revealedCredential.temporaryPassword}`)} className="rounded-xl border border-indigo-200 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Copy credentials</button>
            <button onClick={() => setRevealedCredential(null)} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">I copied it</button>
          </div>
        </section>
      </div>,
      document.body,
    )}
    </>
  );
}
