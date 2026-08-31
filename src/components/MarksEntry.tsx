import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  FilePenLine,
  FileText,
  GraduationCap,
  Info,
  Layers,
  Lock,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { ExamSchedule, Student } from '../types';
import type { AuthUser } from '../utils/auth';
import { emitNotification } from '../services/notificationBus';
import AuthenticatedImage from './AuthenticatedImage';
import {
  useGetExamSchedulesQuery,
  useGetMarksSheetQuery,
  useSaveMarksSheetMutation,
  usePublishMarksSheetMutation,
  type ExamTimetableRecord,
} from '../store/api/examApi';

export default function MarksEntry({
  user,
  students = [],
}: {
  user: AuthUser;
  students?: Student[];
  exams?: ExamSchedule[];
}) {
  const isAdmin = user.role === 'School Admin' || user.role === 'Super Admin';
  const isTeacher = user.role === 'Teacher';

  // 1. Fetch all Exam Schedules
  const { data: schedules = [], isLoading: schedulesLoading, refetch: refetchSchedules } = useGetExamSchedulesQuery();

  // Admin Navigation Levels: 'exams' (blocks) -> 'sections' -> 'sheet'
  const [adminViewLevel, setAdminViewLevel] = useState<'exams' | 'sections' | 'sheet'>('exams');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<string>('');

  // Search & Feedback State
  const [searchQuery, setSearchQuery] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Selected schedule object
  const activeSchedule: ExamTimetableRecord | null = useMemo(() => {
    if (!schedules.length) return null;
    if (selectedScheduleId) {
      return schedules.find((s) => s.id === selectedScheduleId) || schedules[0];
    }
    return schedules[0];
  }, [schedules, selectedScheduleId]);

  // Set default schedule
  useEffect(() => {
    if (schedules.length && !selectedScheduleId) {
      setSelectedScheduleId(schedules[0].id);
    }
  }, [schedules, selectedScheduleId]);

  // 2. Fetch Marks Sheet data for the selected schedule and section
  const {
    data: sheetData,
    isLoading: sheetLoading,
    refetch: refetchSheet,
  } = useGetMarksSheetQuery(
    {
      scheduleId: activeSchedule?.id || 0,
      section: selectedSection,
    },
    {
      skip: !activeSchedule?.id,
    }
  );

  // Set default section from sheet data if not selected
  useEffect(() => {
    if (sheetData) {
      if (!selectedSection && sheetData.section) {
        setSelectedSection(sheetData.section);
      }
    }
  }, [sheetData, selectedSection]);

  // Local editable marks state: map of `studentId-subjectName` -> marks string
  const [localMarks, setLocalMarks] = useState<Record<string, string>>({});

  // Populate local marks whenever sheetData changes
  useEffect(() => {
    if (!sheetData?.students) {
      setLocalMarks({});
      return;
    }
    const initialMap: Record<string, string> = {};
    sheetData.students.forEach((student) => {
      sheetData.subjects.forEach((subject) => {
        const entry = student.marks?.[subject.subject_name];
        const key = `${student.student_id}-${subject.subject_name}`;
        initialMap[key] = entry && entry.marks_obtained !== null && entry.marks_obtained !== undefined ? String(entry.marks_obtained) : '';
      });
    });
    setLocalMarks(initialMap);
    setSavedMessage('');
    setErrorMessage('');
  }, [sheetData]);

  const [saveMarksMutation, { isLoading: isSaving }] = useSaveMarksSheetMutation();
  const [publishMarksMutation, { isLoading: isPublishing }] = usePublishMarksSheetMutation();

  const handleMarkChange = (studentId: number, subjectName: string, value: string) => {
    const key = `${studentId}-${subjectName}`;
    setLocalMarks((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Save (Teacher or Admin)
  const handleSave = async (status: 'draft' | 'submitted') => {
    if (!activeSchedule || !selectedSection || !sheetData) return;
    setErrorMessage('');
    setSavedMessage('');

    // Build entries payload
    const entries: Array<{
      student_id: number;
      subject_name: string;
      marks_obtained: string | number | null;
    }> = [];

    // Filter to subjects this user can edit
    const editableSubjectNames = new Set(
      sheetData.subjects.filter((sub) => sub.can_edit).map((sub) => sub.subject_name)
    );

    for (const student of sheetData.students) {
      for (const subject of sheetData.subjects) {
        if (editableSubjectNames.has(subject.subject_name)) {
          const key = `${student.student_id}-${subject.subject_name}`;
          const val = localMarks[key] !== undefined ? localMarks[key] : '';
          
          if (val.trim() !== '') {
            const num = Number(val);
            if (!Number.isFinite(num) || num < 0 || num > subject.max_marks) {
              setErrorMessage(`Marks for ${student.student_name} in ${subject.subject_name} must be between 0 and ${subject.max_marks}.`);
              return;
            }
          }

          entries.push({
            student_id: student.student_id,
            subject_name: subject.subject_name,
            marks_obtained: val.trim() === '' ? null : Number(val),
          });
        }
      }
    }

    try {
      const res = await saveMarksMutation({
        scheduleId: activeSchedule.id,
        section: selectedSection,
        status,
        entries,
      }).unwrap();

      if (status === 'submitted') {
        setSavedMessage(
          isTeacher
            ? `Marks for your subjects have been submitted. They are now available in the Admin panel for verification.`
            : `Marks verified and saved.`
        );
        emitNotification({
          title: 'Marks Submitted',
          message: `${activeSchedule.name} (${activeSchedule.class_name} - ${selectedSection}) marks saved.`,
          tone: 'success',
          source: 'marks-entry',
        });
      } else {
        setSavedMessage(`Draft marks saved successfully.`);
        emitNotification({
          title: 'Draft Saved',
          message: `Marks draft for ${activeSchedule.class_name} - ${selectedSection} saved.`,
          tone: 'success',
          source: 'marks-entry',
        });
      }

      void refetchSheet();
      void refetchSchedules();
    } catch (err: any) {
      setErrorMessage(err?.data?.detail || err?.message || 'Failed to save marks.');
    }
  };

  // Publish (Admin Only)
  const handlePublish = async () => {
    if (!activeSchedule || !selectedSection) return;
    if (
      !window.confirm(
        `Are you sure you want to officially publish marks for ${activeSchedule.name} (${activeSchedule.class_name} - ${selectedSection})? Results will be immediately visible on Parent & Student report cards.`
      )
    ) {
      return;
    }

    setErrorMessage('');
    setSavedMessage('');
    try {
      const res = await publishMarksMutation({
        scheduleId: activeSchedule.id,
        section: selectedSection,
      }).unwrap();

      setSavedMessage(res.detail || 'Marks published successfully to students and parents.');
      emitNotification({
        title: 'Report Cards Published',
        message: `${activeSchedule.name} (${activeSchedule.class_name} - ${selectedSection}) marks are now live!`,
        tone: 'success',
        source: 'marks-entry',
      });

      void refetchSheet();
      void refetchSchedules();
    } catch (err: any) {
      setErrorMessage(err?.data?.detail || err?.message || 'Failed to publish marks.');
    }
  };

  // If user is neither Admin nor Teacher
  if (!isAdmin && !isTeacher) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <LockKeyhole className="mx-auto h-10 w-10 text-indigo-500" />
        <h3 className="mt-3 text-base font-extrabold text-slate-900">Marks Entry Workspace</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Marks entry is reserved for subject teachers and administrators. You can view published exam report cards
          under the Report Cards tab.
        </p>
      </div>
    );
  }

  // Filter students by search
  const displayedStudents = useMemo(() => {
    if (!sheetData?.students) return [];
    if (!searchQuery.trim()) return sheetData.students;
    const q = searchQuery.toLowerCase();
    return sheetData.students.filter(
      (s) =>
        s.student_name.toLowerCase().includes(q) ||
        s.admission_no.toLowerCase().includes(q) ||
        String(s.roll_no).includes(q)
    );
  }, [sheetData, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in" id="marks-entry-container">
      {/* Toast Messages */}
      {savedMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 font-bold shadow-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 font-bold shadow-xs">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ADMIN PANEL VIEW (Simple 3-Level Block Flow)                           */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="space-y-6">
          {/* Breadcrumb Navigation for Admin */}
          <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold">
              <button
                onClick={() => {
                  setAdminViewLevel('exams');
                  setSelectedSection('');
                }}
                className={`transition hover:text-indigo-600 cursor-pointer ${
                  adminViewLevel === 'exams' ? 'text-indigo-700 font-black' : 'text-slate-500'
                }`}
              >
                1. Select Exam
              </button>

              {activeSchedule && (
                <>
                  <span className="text-slate-300">/</span>
                  <button
                    onClick={() => {
                      setAdminViewLevel('sections');
                    }}
                    className={`transition hover:text-indigo-600 cursor-pointer ${
                      adminViewLevel === 'sections' ? 'text-indigo-700 font-black' : 'text-slate-500'
                    }`}
                  >
                    2. {activeSchedule.name} ({activeSchedule.class_name})
                  </button>
                </>
              )}

              {selectedSection && adminViewLevel === 'sheet' && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="text-indigo-700 font-black">
                    3. Section {selectedSection} Marks Sheet
                  </span>
                </>
              )}
            </div>

            {adminViewLevel !== 'exams' && (
              <button
                onClick={() => {
                  if (adminViewLevel === 'sheet') setAdminViewLevel('sections');
                  else if (adminViewLevel === 'sections') setAdminViewLevel('exams');
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>

          {/* LEVEL 1: EXAM BLOCKS */}
          {adminViewLevel === 'exams' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Choose Exam to Manage Marks</h3>
                <p className="text-xs text-slate-500">
                  Click on an exam block to select a section and view/verify student marks across all subjects.
                </p>
              </div>

              {schedules.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
                  <Award className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Exam Schedules Found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Create and publish an exam timetable under "Exam Schedule" first.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {schedules.map((sched) => (
                    <div
                      key={sched.id}
                      onClick={() => {
                        setSelectedScheduleId(sched.id);
                        setAdminViewLevel('sections');
                      }}
                      className="group relative cursor-pointer rounded-3xl border-2 border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-700">
                            {sched.class_name}
                          </span>
                          <h4 className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition">
                            {sched.name}
                          </h4>
                          <p className="text-xs font-semibold text-slate-500">
                            {sched.items?.length || 0} Subjects · Academic Year {sched.academic_year || '2026-2027'}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 transition" />
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                        <span className="text-slate-400">Click to view sections</span>
                        <span className="text-indigo-600 flex items-center gap-1">
                          Open Marks <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LEVEL 2: SECTIONS SELECTION */}
          {adminViewLevel === 'sections' && activeSchedule && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {activeSchedule.name} — Select Section ({activeSchedule.class_name})
                </h3>
                <p className="text-xs text-slate-500">
                  Select a section to view student rows and all subject marks entered by teachers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(sheetData?.all_sections || ['A']).map((sec) => (
                  <div
                    key={sec}
                    onClick={() => {
                      setSelectedSection(sec);
                      setAdminViewLevel('sheet');
                    }}
                    className="group cursor-pointer rounded-3xl border-2 border-slate-200/90 bg-white p-6 shadow-xs transition-all hover:border-indigo-500 hover:shadow-md space-y-2 text-center"
                  >
                    <Users className="mx-auto h-8 w-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                    <h4 className="text-lg font-black text-slate-900">Section {sec}</h4>
                    <p className="text-xs font-semibold text-slate-500">
                      {activeSchedule.class_name} · {activeSchedule.items?.length || 0} Subjects
                    </p>
                    <div className="pt-2">
                      <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition">
                        View Student Marks <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 3: STUDENT ROWS & CURRENT MARKS DATA */}
          {adminViewLevel === 'sheet' && activeSchedule && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4">
              {/* Header Bar */}
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-[11px] font-black text-indigo-800">
                      {activeSchedule.class_name} — Section {selectedSection}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-bold text-slate-600">
                      {activeSchedule.name}
                    </span>
                    {sheetData?.all_published ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-[11px] font-black text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Published to Parents
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-black text-amber-800 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-600" /> Pending Admin Verification
                      </span>
                    )}
                  </div>
                  <h4 className="font-sans font-black text-slate-900 text-base mt-1.5">
                    Student Marks Sheet ({displayedStudents.length} Students)
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    All subject marks entered by teachers. You can verify, modify values, and click Publish.
                  </p>
                </div>

                {/* Search Bar & Switch Section */}
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search student or roll no..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-48 sm:w-56"
                    />
                  </div>

                  {/* Section Switcher */}
                  {(sheetData?.all_sections || []).length > 1 && (
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none cursor-pointer"
                    >
                      {sheetData?.all_sections.map((s) => (
                        <option key={s} value={s}>
                          Section {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Roster & Subject Columns Table */}
              {displayedStudents.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Users className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No students enrolled in Section {selectedSection}</p>
                </div>
              ) : (
                <div className="overflow-x-auto px-5">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px] tracking-wider rounded-xl">
                      <tr>
                        <th className="p-3.5 rounded-l-xl">Candidate Name</th>
                        <th className="p-3.5">Roll No</th>
                        <th className="p-3.5">Admission No</th>
                        {/* Dynamic Subject Columns */}
                        {sheetData?.subjects.map((sub) => (
                          <th key={sub.subject_name} className="p-3.5 text-center">
                            <div>{sub.subject_name}</div>
                            <div className="text-[9px] font-normal text-slate-500 lowercase">
                              (max: {sub.max_marks})
                            </div>
                          </th>
                        ))}
                        <th className="p-3.5 text-center rounded-r-xl">Total Marks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedStudents.map((student) => {
                        let studentTotal = 0;
                        let maxTotal = 0;

                        return (
                          <tr key={student.student_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5">
                              <div className="flex items-center gap-2.5">
                                {student.photo_url ? (
                                  <AuthenticatedImage
                                    src={student.photo_url}
                                    alt={student.student_name}
                                    className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                                    {student.student_name.slice(0, 1)}
                                  </div>
                                )}
                                <span className="font-black text-slate-900">{student.student_name}</span>
                              </div>
                            </td>
                            <td className="p-3.5 font-mono font-bold text-indigo-700">#{student.roll_no || '—'}</td>
                            <td className="p-3.5 font-mono text-slate-600 text-[11px]">{student.admission_no || '—'}</td>

                            {/* Subject Marks Inputs (Editable by Admin) */}
                            {sheetData?.subjects.map((sub) => {
                              const key = `${student.student_id}-${sub.subject_name}`;
                              const currentVal = localMarks[key] !== undefined ? localMarks[key] : '';
                              if (currentVal.trim() !== '') {
                                const num = Number(currentVal);
                                if (Number.isFinite(num)) {
                                  studentTotal += num;
                                  maxTotal += sub.max_marks;
                                }
                              }

                              return (
                                <td key={sub.subject_name} className="p-3.5 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max={sub.max_marks}
                                    step="0.5"
                                    placeholder="0"
                                    value={currentVal}
                                    onChange={(e) =>
                                      handleMarkChange(student.student_id, sub.subject_name, e.target.value)
                                    }
                                    className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                </td>
                              );
                            })}

                            <td className="p-3.5 text-center font-mono font-black text-indigo-700 text-xs">
                              {studentTotal} {maxTotal > 0 ? `/ ${maxTotal}` : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer Action Bar for Admin */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-slate-500 font-medium">
                  <span>
                    Admin can edit any mark above. Click <strong>"Save Modifications"</strong> to update or{' '}
                    <strong>"Publish Marks"</strong> to release to students & parents.
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSaving || displayedStudents.length === 0}
                    onClick={() => handleSave('draft')}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Modifications
                  </button>

                  <button
                    type="button"
                    disabled={isPublishing || displayedStudents.length === 0}
                    onClick={handlePublish}
                    className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 shadow-xs shadow-indigo-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isPublishing ? 'Publishing...' : 'Verify & Publish Marks to Parents'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TEACHER PANEL VIEW (Simple Grid: All subjects, only assigned editable) */}
      {/* ========================================================================= */}
      {isTeacher && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-700">
                    Teacher Marks Entry
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                    Assigned Teacher: {user.name}
                  </span>
                </div>
                <h3 className="font-sans font-black text-slate-900 text-lg mt-2 flex items-center gap-2">
                  <FilePenLine className="h-5 w-5 text-indigo-600" />
                  Subject Marks Entry
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Enter student marks for the subject(s) you teach. Once submitted, marks are sent to the administration
                  for verification.
                </p>
              </div>

              {/* Exam & Section Switchers */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Exam Schedule Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Select Exam:
                  </label>
                  <select
                    value={activeSchedule?.id || ''}
                    onChange={(e) => setSelectedScheduleId(Number(e.target.value))}
                    className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                  >
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.class_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section Dropdown */}
                {sheetData?.sections && sheetData.sections.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Select Section:
                    </label>
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                    >
                      {sheetData.sections.map((sec) => (
                        <option key={sec} value={sec}>
                          Section {sec}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Teacher Assignment Highlight Banner */}
            {sheetData && (
              <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <span className="text-slate-700 font-bold">Your Assigned Subject(s) in this Exam:</span>
                  <div className="flex items-center gap-1.5">
                    {sheetData.teacher_subjects.length === 0 ? (
                      <span className="text-amber-700 font-semibold italic">
                        (No subjects assigned to your account in this class)
                      </span>
                    ) : (
                      sheetData.teacher_subjects.map((sub) => (
                        <span
                          key={sub}
                          className="rounded-lg bg-indigo-600 px-2.5 py-0.5 text-[11px] font-black text-white"
                        >
                          {sub}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <span className="text-[11px] text-slate-500 font-medium">
                  Editable fields are highlighted in blue. Other subjects are handled by fellow teachers.
                </span>
              </div>
            )}
          </div>

          {/* Student Roster with All Subjects */}
          {activeSchedule && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/40">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h4 className="font-sans font-black text-slate-900 text-sm">
                      {activeSchedule.class_name} - Section {selectedSection} ({displayedStudents.length} Students)
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Enter marks for your subject(s) in the table below. (No grading column, marks only)
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search candidate..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-48 sm:w-56"
                  />
                </div>
              </div>

              {/* Marks Grid */}
              {displayedStudents.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <Users className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No students found in Section {selectedSection}</p>
                </div>
              ) : (
                <div className="overflow-x-auto px-5">
                  <table className="w-full text-left text-xs min-w-[720px]">
                    <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px] tracking-wider rounded-xl">
                      <tr>
                        <th className="p-3.5 rounded-l-xl">Candidate</th>
                        <th className="p-3.5">Roll No</th>
                        <th className="p-3.5">Admission No</th>

                        {/* All subjects in the exam */}
                        {sheetData?.subjects.map((sub) => (
                          <th
                            key={sub.subject_name}
                            className={`p-3.5 text-center ${
                              sub.can_edit ? 'bg-indigo-100/70 text-indigo-900 font-black' : 'text-slate-600'
                            }`}
                          >
                            <div>{sub.subject_name}</div>
                            <div className="text-[9px] font-normal lowercase">
                              {sub.can_edit ? `(You teach · max: ${sub.max_marks})` : `(max: ${sub.max_marks})`}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedStudents.map((student) => (
                        <tr key={student.student_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              {student.photo_url ? (
                                <AuthenticatedImage
                                  src={student.photo_url}
                                  alt={student.student_name}
                                  className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                                  {student.student_name.slice(0, 1)}
                                </div>
                              )}
                              <span className="font-extrabold text-slate-900">{student.student_name}</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-indigo-700">#{student.roll_no || '—'}</td>
                          <td className="p-3.5 font-mono text-slate-600 text-[11px]">{student.admission_no || '—'}</td>

                          {/* Subjects in Exam */}
                          {sheetData?.subjects.map((sub) => {
                            const key = `${student.student_id}-${sub.subject_name}`;
                            const currentVal = localMarks[key] !== undefined ? localMarks[key] : '';

                            return (
                              <td key={sub.subject_name} className="p-3.5 text-center">
                                {sub.can_edit ? (
                                  /* Teacher Can Edit this subject */
                                  <input
                                    type="number"
                                    min="0"
                                    max={sub.max_marks}
                                    step="0.5"
                                    placeholder="0"
                                    value={currentVal}
                                    onChange={(e) =>
                                      handleMarkChange(student.student_id, sub.subject_name, e.target.value)
                                    }
                                    className="w-20 rounded-xl border-2 border-indigo-300 bg-white px-2.5 py-1.5 text-center text-xs font-black text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                  />
                                ) : (
                                  /* Other Subject (Disabled / Read-only) */
                                  <div className="w-20 mx-auto rounded-xl bg-slate-100/90 border border-slate-200 py-1.5 text-center text-xs font-semibold text-slate-500">
                                    {currentVal !== '' ? currentVal : '—'}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer Action Bar for Teacher */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-slate-500 font-medium">
                  <span>
                    After entering marks for your subject, click <strong>"Submit Marks to Admin"</strong>.
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSaving || displayedStudents.length === 0}
                    onClick={() => handleSave('draft')}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || displayedStudents.length === 0}
                    onClick={() => handleSave('submitted')}
                    className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 shadow-xs shadow-indigo-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit Marks to Admin
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
