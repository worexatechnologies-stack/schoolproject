import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bell, BookOpen, CalendarDays, CheckCircle2, CreditCard, FileText, GraduationCap, MessageSquare, Sparkles, Target, TrendingUp, UserRoundCheck, Users } from 'lucide-react';
import { loadVisibleSubjects, SubjectVisibility } from '../services/subjectVisibility';
import { apiRequest } from '../services/api';
import { loadTimetableSlots } from '../services/timetable';
import type { TimetableSlot } from './timetable/types';

type PortalRole = 'Teacher' | 'Student' | 'Parent';

interface RoleDashboardProps {
  role: PortalRole;
  userName: string;
  onNavigateToTab: (tabId: string) => void;
  isGlass?: boolean;
}

interface Stat {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}

function StatCard({ stat, isGlass }: { stat: Stat; isGlass: boolean; key?: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${isGlass ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</p>
          <p className={`mt-2 text-2xl font-extrabold ${isGlass ? 'text-white' : 'text-slate-900'}`}>{stat.value}</p>
          <p className="mt-2 text-xs font-semibold text-emerald-600">{stat.detail}</p>
        </div>
        <span className={`rounded-xl p-3 ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

function Panel({ children, isGlass, className = '' }: { children: ReactNode; isGlass: boolean; className?: string }) {
  return <section className={`rounded-2xl border p-6 ${isGlass ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-white shadow-sm'} ${className}`}>{children}</section>;
}

function EmptyPanel({ title, detail, action, onClick, isGlass }: { title: string; detail: string; action: string; onClick: () => void; isGlass: boolean }) {
  return (
    <button onClick={onClick} className={`w-full rounded-xl border border-dashed p-6 text-left transition hover:border-indigo-300 ${isGlass ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
      <p className={`text-sm font-extrabold ${isGlass ? 'text-white' : 'text-slate-900'}`}>{title}</p>
      <p className={`mt-1 text-xs ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>{detail}</p>
      <p className="mt-4 text-xs font-bold text-indigo-600">{action}</p>
    </button>
  );
}

function SubjectList({ visibility, error, isGlass }: { visibility: SubjectVisibility | null; error: string; isGlass: boolean }) {
  if (error) return <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>;
  if (!visibility) return <p className={`mt-4 text-xs ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>Loading assigned subjects...</p>;
  if (!visibility.subjects.length) {
    return <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">No subjects are assigned yet. Ask the School Admin to complete the class and teacher subject assignment.</p>;
  }
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {visibility.subjects.map((subject) => (
        <div key={subject.id} className={`rounded-xl border px-3 py-3 ${isGlass ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
          <p className={`text-xs font-extrabold ${isGlass ? 'text-white' : 'text-slate-800'}`}>{subject.name}</p>
          <p className={`mt-1 text-[10px] ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>
            {subject.scopes.length
              ? subject.scopes.map((scope) => `${scope.className}-${scope.sectionName}`).join(', ')
              : 'Subject assigned; class/section assignment is still required'}
          </p>
        </div>
      ))}
    </div>
  );
}

type AttendanceRecord = { studentId: number; date: string; period?: number; subjectName?: string; status: 'Present' | 'Absent' | 'Late' | 'Half-day' };
type ExamResult = { exam_name: string; subject: string; max_marks: number; marks_obtained: string | number | null; status: string };

export default function RoleDashboard({ role, userName, onNavigateToTab, isGlass = false }: RoleDashboardProps) {
  const title = isGlass ? 'text-white' : 'text-slate-900';
  const muted = isGlass ? 'text-slate-400' : 'text-slate-500';
  const firstName = userName.split(' ')[0] || userName;
  const [subjectVisibility, setSubjectVisibility] = useState<SubjectVisibility | null>(null);
  const [subjectError, setSubjectError] = useState('');
  // Real data fetched from the API
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [myResults, setMyResults] = useState<ExamResult[]>([]);
  const [myStudentId, setMyStudentId] = useState<number | null>(null);
  const [dataError, setDataError] = useState('');

  // Fetch visible subjects
  useEffect(() => {
    let active = true;
    loadVisibleSubjects()
      .then((payload) => {
        if (!active) return;
        setSubjectVisibility(payload);
        setSubjectError('');
      })
      .catch((error) => {
        if (!active) return;
        setSubjectVisibility(null);
        setSubjectError(error instanceof Error ? error.message : 'Assigned subjects could not be loaded.');
      });
    return () => { active = false; };
  }, [role, userName]);

  // Fetch timetable slots — backend already role-scopes this endpoint.
  useEffect(() => {
    let active = true;
    loadTimetableSlots()
      .then((rows) => { if (active) setTimetableSlots(rows.filter(s => s.published)); })
      .catch(() => { if (active) setTimetableSlots([]); });
    return () => { active = false; };
  }, [role]);

  // Fetch attendance for parent or student
  useEffect(() => {
    if (role !== 'Parent' && role !== 'Student') return;
    let active = true;
    apiRequest<{ results?: AttendanceRecord[] } | AttendanceRecord[]>('/attendance/')
      .then((payload) => {
        if (!active) return;
        const rows = Array.isArray(payload) ? payload : payload.results || [];
        setAttendanceRecords(rows);
      })
      .catch(() => { if (active) setAttendanceRecords([]); });
    return () => { active = false; };
  }, [role]);

  // For student: fetch own student ID from /auth/me/ then results + attendance
  useEffect(() => {
    if (role !== 'Student') return;
    let active = true;
    apiRequest<{ studentId?: string | number }>('/auth/me/')
      .then((me) => {
        if (!active) return;
        const studentId = Number(me.studentId);
        setMyStudentId(Number.isFinite(studentId) && studentId > 0 ? studentId : null);
        if (Number.isFinite(studentId) && studentId > 0) {
          apiRequest<ExamResult[]>(`/students/${studentId}/results/`)
            .then((results) => { if (active) setMyResults(results); })
            .catch(() => { if (active) setMyResults([]); });
        }
      })
      .catch(() => { if (active) setMyStudentId(null); });
    return () => { active = false; };
  }, [role]);

  type ParentWard = { id: number | string; name: string; class: string; section?: string; admissionNo?: string };
  const [wards, setWards] = useState<ParentWard[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string>('all');

  // For parent: fetch linked wards list and exam results
  useEffect(() => {
    if (role !== 'Parent') return;
    let active = true;
    apiRequest<{ results?: ParentWard[] } | ParentWard[]>('/students/')
      .then((payload) => {
        if (!active) return;
        const rows = Array.isArray(payload) ? payload : payload.results || [];
        setWards(rows);
      })
      .catch(() => { if (active) setWards([]); });

    apiRequest<{ parentStudentIds?: Array<string | number> }>('/auth/me/')
      .then((me) => {
        const parentStudentIds = me.parentStudentIds?.map(Number).filter((id: number) => Number.isFinite(id) && id > 0) || [];
        if (active && parentStudentIds.length) {
          Promise.all(parentStudentIds.map((id: number) => apiRequest<ExamResult[]>(`/students/${id}/results/`)))
            .then((groups) => { if (active) setExamResults(groups.flat()); })
            .catch(() => { if (active) setExamResults([]); });
        } else if (active) {
          setExamResults([]);
        }
      })
      .catch(() => { if (active) setExamResults([]); });
    return () => { active = false; };
  }, [role]);

  const activeWard = useMemo(() => {
    if (selectedWardId === 'all') return null;
    return wards.find((w) => String(w.id) === selectedWardId) || null;
  }, [wards, selectedWardId]);

  const assignedSubjectCount = subjectVisibility?.subjects.length || 0;
  const assignedScopeCount = useMemo(() => new Set(
    (subjectVisibility?.subjects || []).flatMap((subject) => subject.scopes.map((scope) => scope.sectionId)),
  ).size, [subjectVisibility]);

  // Compute real attendance for the current role
  const roleAttendance = useMemo(() => {
    if (role === 'Parent' && activeWard) {
      return attendanceRecords.filter((r) => String(r.studentId) === String(activeWard.id));
    }
    return attendanceRecords;
  }, [role, activeWard, attendanceRecords]);

  const studentPresent = roleAttendance.filter((r) => r.status === 'Present').length;
  const studentTotal = roleAttendance.length;
  const studentAttendanceRate = studentTotal ? Math.round((studentPresent / studentTotal) * 100) : 0;

  const roleExamResults = useMemo(() => {
    if (role === 'Parent' && activeWard) {
      return examResults.filter(
        (r: any) =>
          String(r.student) === String(activeWard.id) ||
          (r.student_name && r.student_name.toLowerCase() === activeWard.name.toLowerCase())
      );
    }
    return examResults;
  }, [role, activeWard, examResults]);

  // Compute class periods today for teacher (unique sections from their timetable slots)
  const teacherSectionsToday = useMemo(() => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as TimetableSlot['day'];
    const todaySlot = timetableSlots.find((s) => s.day === today);
    return todaySlot ? new Set(timetableSlots.filter((s) => s.day === today).map((s) => `${s.class}-${s.section}`)).size : 0;
  }, [timetableSlots]);

  if (role === 'Teacher') {
    const publishedSlotCount = timetableSlots.length;
    const stats: Stat[] = [
      { label: 'Classes this week', value: String(publishedSlotCount || 0), detail: publishedSlotCount ? 'Published periods' : 'No timetable assigned yet', icon: CalendarDays, tone: 'bg-indigo-100 text-indigo-600' },
      { label: 'Assigned subjects', value: String(assignedSubjectCount), detail: assignedScopeCount ? `${assignedScopeCount} class section${assignedScopeCount === 1 ? '' : 's'}` : 'Waiting for class scope', icon: BookOpen, tone: 'bg-sky-100 text-sky-600' },
      { label: 'Today sections', value: String(teacherSectionsToday), detail: teacherSectionsToday ? 'Sections to teach today' : 'No classes today', icon: UserRoundCheck, tone: 'bg-amber-100 text-amber-600' },
      { label: 'Attendance due', value: '0', detail: 'No open registers', icon: FileText, tone: 'bg-rose-100 text-rose-600' },
    ];

    return <div className="space-y-5 animate-fade-in" id="teacher-dashboard">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 px-6 py-7 text-white shadow-lg shadow-indigo-500/20 sm:px-8">
        <GraduationCap className="absolute -right-5 -bottom-8 h-44 w-44 text-white/10" />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-violet-100">Teacher workspace</p>
        <h1 className="relative mt-2 text-2xl font-extrabold sm:text-3xl">Welcome, {firstName}</h1>
        <p className="relative mt-2 text-sm text-violet-100">Your live timetable and class periods appear below.</p>
      </header>
      {dataError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{dataError}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => <StatCard stat={stat} isGlass={isGlass} key={stat.label} />)}</div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel isGlass={isGlass} className="xl:col-span-2">
          <h2 className={`text-base font-extrabold ${title}`}>My teaching subjects</h2>
          <p className={`mt-1 text-xs ${muted}`}>These assignments come directly from the School Admin's academic setup.</p>
          <SubjectList visibility={subjectVisibility} error={subjectError} isGlass={isGlass} />
          <button onClick={() => onNavigateToTab('academic')} className="mt-5 text-xs font-bold text-indigo-600">Open timetable and publication status</button>
        </Panel>
        <Panel isGlass={isGlass}>
          <h2 className={`text-base font-extrabold ${title}`}>My published periods</h2>
          <div className="mt-5 space-y-3">
            {publishedSlotCount === 0 ? (
              <EmptyPanel title="No published periods" detail="The School Admin must publish the timetable before students can view it." action="Open timetable" onClick={() => onNavigateToTab('academic')} isGlass={isGlass} />
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {timetableSlots.slice(0, 10).map((slot) => (
                  <div key={slot.id} className={`rounded-xl border px-3 py-2 ${isGlass ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
                    <p className={`text-xs font-bold ${isGlass ? 'text-white' : 'text-slate-800'}`}>{slot.subject} — {slot.class}-{slot.section}</p>
                    <p className={`mt-0.5 text-[10px] ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>{slot.day} · Period {slot.period} · {slot.time}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>;
  }

  if (role === 'Student') {
    const stats: Stat[] = [
      { label: 'Attendance', value: `${studentAttendanceRate}%`, detail: studentTotal ? `${studentTotal} records` : 'No attendance records', icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-600' },
      { label: 'Class subjects', value: String(assignedSubjectCount), detail: assignedSubjectCount ? 'Assigned by your school' : 'No class subjects yet', icon: BookOpen, tone: 'bg-indigo-100 text-indigo-600' },
      { label: 'Published results', value: String(myResults.length), detail: myResults.length ? 'Exam results available' : 'No published results', icon: FileText, tone: 'bg-amber-100 text-amber-600' },
      { label: 'Timetable periods', value: String(timetableSlots.length), detail: timetableSlots.length ? 'Published periods' : 'No timetable yet', icon: CalendarDays, tone: 'bg-purple-100 text-purple-600' },
    ];

    return <div className="space-y-5 animate-fade-in" id="student-dashboard">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 px-6 py-7 text-white shadow-lg shadow-cyan-500/20 sm:px-8"><Sparkles className="absolute -right-5 -bottom-8 h-44 w-44 text-white/15" /><p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-50">Student learning hub</p><h1 className="relative mt-2 text-2xl font-extrabold sm:text-3xl">Welcome, {firstName}</h1><p className="relative mt-2 text-sm text-cyan-50">Your timetable, attendance and results are shown below from the live database.</p></header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => <StatCard stat={stat} isGlass={isGlass} key={stat.label} />)}</div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel isGlass={isGlass} className="xl:col-span-2">
          <h2 className={`text-base font-extrabold ${title}`}>My class subjects</h2>
          <p className={`mt-1 text-xs ${muted}`}>Subjects appear here as soon as they are assigned to your class.</p>
          <SubjectList visibility={subjectVisibility} error={subjectError} isGlass={isGlass} />
          <button onClick={() => onNavigateToTab('academic')} className="mt-5 text-xs font-bold text-indigo-600">Open timetable and publication status</button>
        </Panel>
        <Panel isGlass={isGlass}>
          <h2 className={`text-base font-extrabold ${title}`}>Published exam results</h2>
          <div className="mt-5 space-y-3">
            {myResults.length === 0 ? (
              <EmptyPanel title="No published results" detail="Your school has not published exam results yet." action="Open exams" onClick={() => onNavigateToTab('exams')} isGlass={isGlass} />
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {myResults.slice(0, 10).map((result, index) => {
                  const marks = Number(result.marks_obtained ?? 0);
                  const percent = result.max_marks ? Math.round((marks / result.max_marks) * 100) : 0;
                  return (
                    <div key={`${result.exam_name}-${index}`} className={`rounded-xl border px-3 py-2 ${isGlass ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
                      <p className={`text-xs font-bold ${isGlass ? 'text-white' : 'text-slate-800'}`}>{result.exam_name} — {result.subject}</p>
                      <p className={`mt-0.5 text-[10px] ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>{marks} / {result.max_marks} · {percent}%</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>;
  }

  // Parent role - Eye-catching Welcome & Portal Hub (Data display removed as requested)
  const greetingTime = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const parentQuickLinks = [
    {
      id: 'academic',
      title: "Child's Timetable",
      subtitle: 'View weekly schedules, periods, instructors & classroom venues.',
      icon: CalendarDays,
      tone: 'from-indigo-500 to-violet-600',
      badge: 'Academic',
    },
    {
      id: 'attendance',
      title: 'Ward Attendance',
      subtitle: 'Track daily class presence, session status and period registers.',
      icon: CheckCircle2,
      tone: 'from-emerald-500 to-teal-600',
      badge: 'Daily Tracker',
    },
    {
      id: 'notifications',
      title: 'School Notices',
      subtitle: 'Official announcements, circulars & class-wise broadcast alerts.',
      icon: Bell,
      tone: 'from-rose-500 to-pink-600',
      badge: 'Circulars',
    },
    {
      id: 'fees',
      title: 'School Fee Desk',
      subtitle: 'Review term tuition fees, invoice ledgers & payment receipts.',
      icon: CreditCard,
      tone: 'from-amber-500 to-orange-600',
      badge: 'Finance Desk',
    },
    {
      id: 'exams',
      title: 'Exam Reports',
      subtitle: 'Access published subject marks, grades & teacher evaluation feedback.',
      icon: FileText,
      tone: 'from-sky-500 to-blue-600',
      badge: 'Report Cards',
    },
    {
      id: 'communication',
      title: 'Teacher Chat',
      subtitle: 'Direct 1-on-1 private messaging with your children’s assigned teachers.',
      icon: MessageSquare,
      tone: 'from-purple-500 to-indigo-600',
      badge: 'Direct Chat',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10" id="parent-dashboard">
      {/* ── Eye-Catching Hero Greeting Showcase ── */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-rose-500 via-pink-500 to-orange-400 p-8 sm:p-12 text-white shadow-xl shadow-rose-500/20">
        {/* Ambient Decorative Shapes & Glow */}
        <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl pointer-events-none" />
        <Users className="absolute -right-6 -bottom-10 h-64 w-64 text-white/10 pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur-md border border-white/25">
              <Sparkles className="h-3.5 w-3.5 text-amber-200" />
              Parent Portal
            </span>
            <span className="rounded-full bg-black/20 px-3.5 py-1 text-xs font-bold text-rose-50 backdrop-blur-md">
              {todayFormatted}
            </span>
          </div>

          {/* Eye-Catching Personalized Greeting */}
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl leading-tight text-white drop-shadow-xs">
              {greetingTime}, {firstName}!
            </h1>
            <p className="mt-3 text-base sm:text-lg leading-relaxed text-rose-50 font-medium max-w-2xl drop-shadow-2xs">
              Welcome to your family dashboard. We are delighted to partner with you in your children’s learning journey, academic growth, and everyday school life.
            </p>
          </div>

          {/* Linked Children Showcase Badges */}
          {wards.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-100/90">
                Connected Students:
              </span>
              {wards.map((w) => (
                <span
                  key={w.id}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md border border-white/20 shadow-2xs"
                >
                  <GraduationCap className="h-3.5 w-3.5 text-amber-200" />
                  {w.name}
                  <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-mono text-rose-100">
                    {w.class} {w.section ? `- ${w.section}` : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Quick Access Portal Hub (Covering the space elegantly) ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Parent Portals & Services</h2>
            <p className="text-xs text-slate-500 font-medium">
              Select any section below to view detailed records, timetables, and circulars for your children.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {parentQuickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigateToTab(item.id)}
                className="group relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 text-left shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br ${item.tone} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 group-hover:bg-rose-50 group-hover:text-rose-700 transition-colors">
                    {item.badge}
                  </span>
                </div>

                <div className="mt-5 space-y-1.5">
                  <h3 className="text-base font-extrabold text-slate-900 group-hover:text-rose-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-500 font-medium">
                    {item.subtitle}
                  </p>
                </div>

                <div className="mt-5 flex items-center gap-1 text-xs font-extrabold text-indigo-600 group-hover:text-rose-600 group-hover:translate-x-1 transition-all">
                  <span>Open Section</span>
                  <span className="text-sm">→</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Community & School Support Banner ── */}
      <section className="rounded-3xl border border-indigo-100 bg-linear-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-extrabold text-slate-900">Need assistance or have school queries?</h3>
          <p className="text-xs text-slate-600 font-medium">
            Use the <strong>Teacher Chat</strong> to reach out to assigned class teachers or visit the <strong>School Notices</strong> desk for circulars.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigateToTab('notifications')}
            className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs transition cursor-pointer"
          >
            View School Notices
          </button>
          <button
            onClick={() => onNavigateToTab('communication')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs transition cursor-pointer"
          >
            Chat with Teacher
          </button>
        </div>
      </section>
    </div>
  );
}