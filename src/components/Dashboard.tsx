import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  GraduationCap,
  UserCheck,
  Users,
  Wallet,
  Clock
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Student, UserRole } from '../types';
import RoleDashboard from './RoleDashboard';
import { useGetTeachersQuery } from '../store/api/teacherApi';
import { useGetClassesQuery, useGetSectionsQuery } from '../store/api/academicApi';
import { useGetSchoolRevenueQuery } from '../store/api/financeApi';

interface DashboardProps {
  onNavigateToTab: (tabId: string) => void;
  isGlass?: boolean;
  role?: UserRole;
  userName?: string;
  students?: Student[];
  schoolName?: string;
  currentAcademicYear?: string;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const asAmount = (value: unknown): number | null => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export default function Dashboard({
  onNavigateToTab,
  isGlass = false,
  role = 'School Admin',
  userName = 'Admin',
  students = [],
  schoolName = 'Your School',
  currentAcademicYear = '',
}: DashboardProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Fetch real teachers, classes, and sections from PostgreSQL API
  const { data: teachersData = [] } = useGetTeachersQuery();
  const { data: classesData = [] } = useGetClassesQuery();
  const { data: sectionsData = [] } = useGetSectionsQuery();

  // Fetch authoritative, real-time school revenue from PostgreSQL database with timely polling
  const { data: revenueData, isFetching: isRevenueFetching } = useGetSchoolRevenueQuery(
    currentAcademicYear ? { academicYear: currentAcademicYear } : undefined,
    {
      pollingInterval: 8000, // Timely polling every 8 seconds to ensure data is always fresh
      refetchOnFocus: true,
      refetchOnReconnect: true,
      refetchOnMountOrArgChange: true,
    }
  );

  const teachersList = useMemo(() => {
    return Array.isArray(teachersData) ? teachersData : (teachersData as any).results || [];
  }, [teachersData]);

  const activeTeachers = useMemo(() => {
    return teachersList.filter((t: any) => t.status === 'Active' || !t.status);
  }, [teachersList]);

  if (role === 'Teacher' || role === 'Student' || role === 'Parent') {
    return <RoleDashboard role={role} userName={userName} onNavigateToTab={onNavigateToTab} isGlass={isGlass} />;
  }

  // Student metrics
  const activeStudents = useMemo(() => students.filter((student) => student.status === 'Active'), [students]);
  const promotedStudents = useMemo(() => students.filter((student) => student.status === 'Promoted'), [students]);

  // Fallback revenue calculations from students prop while hydrating
  const fallbackFeeTotal = useMemo(() => {
    return activeStudents.reduce((sum, student) => sum + (asAmount(student.feeTotal) ?? 0), 0);
  }, [activeStudents]);

  const fallbackFeePaid = useMemo(() => {
    return activeStudents.reduce((sum, student) => sum + (asAmount(student.feePaid) ?? 0), 0);
  }, [activeStudents]);

  // Authoritative database values
  const totalRevenue = revenueData?.totalRevenue ?? fallbackFeePaid;
  const totalInvoiced = revenueData?.totalInvoiced ?? fallbackFeeTotal;
  const pendingReceivables = revenueData?.pendingReceivables ?? Math.max(0, fallbackFeeTotal - fallbackFeePaid);
  const collectionRate = revenueData?.collectionRate ?? (totalInvoiced > 0 ? Math.round((totalRevenue / totalInvoiced) * 100) : 0);

  // Monthly revenue collection distribution from PostgreSQL
  const chartValues = useMemo(() => {
    if (revenueData?.monthlyDistribution && revenueData.monthlyDistribution.length > 0) {
      return revenueData.monthlyDistribution.slice(0, 8);
    }
    return months.map((month, index) => ({
      month,
      amount: index === months.length - 1 ? totalRevenue : 0,
    }));
  }, [revenueData, totalRevenue]);

  // Max amount in monthly chart for proportional height
  const maxMonthlyAmount = useMemo(() => {
    const amounts = chartValues.map((v) => v.amount);
    return Math.max(...amounts, 1);
  }, [chartValues]);

  // Student to Teacher Ratio
  const studentTeacherRatio = useMemo(() => {
    if (activeTeachers.length === 0) return `${activeStudents.length}:0`;
    const ratio = Math.round(activeStudents.length / activeTeachers.length);
    return `${ratio}:1`;
  }, [activeStudents.length, activeTeachers.length]);

  const adminName = userName.trim() || 'Admin';
  const displayAdminName = adminName.toLocaleLowerCase() === schoolName.trim().toLocaleLowerCase() ? 'School Admin' : adminName;
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const timeLabel = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);

  const surface = isGlass ? 'border-white/10 bg-slate-900/55 shadow-black/20' : 'border-slate-200/80 bg-white shadow-slate-200/60';
  const title = isGlass ? 'text-white' : 'text-slate-900';
  const muted = isGlass ? 'text-slate-400' : 'text-slate-500';
  const soft = isGlass ? 'bg-white/[.045] border-white/10' : 'bg-slate-50/80 border-slate-100';

  // Key metrics cards
  const metrics = [
    {
      label: 'Active Students',
      value: activeStudents.length.toLocaleString('en-IN'),
      note: `${students.length} total on record (${promotedStudents.length} promoted)`,
      icon: Users,
      color: 'from-indigo-500 to-violet-500',
      tab: 'student',
    },
    {
      label: 'Teaching Faculty',
      value: `${activeTeachers.length} Teachers`,
      note: `${studentTeacherRatio} Student-Teacher ratio`,
      icon: UserCheck,
      color: 'from-blue-500 to-indigo-600',
      tab: 'teachers',
    },
    {
      label: 'Revenue Collected',
      value: `₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      note: totalInvoiced ? `${collectionRate}% of ₹${totalInvoiced.toLocaleString('en-IN')} billed` : 'No fee dues billed',
      icon: CreditCard,
      color: 'from-emerald-500 to-teal-500',
      tab: 'fees',
    },
    {
      label: 'Academic Classes',
      value: `${classesData.length} Classes`,
      note: `${sectionsData.length} active class sections`,
      icon: GraduationCap,
      color: 'from-cyan-500 to-sky-500',
      tab: 'academic-setup',
    },
  ];

  return (
    <section className="dashboard-v2 space-y-6 animate-fade-in" id="dashboard-module">
      {/* ----------------------------------------------------
          TOP HERO BANNER
          ---------------------------------------------------- */}
      <div className="dashboard-hero dashboard-hero-v2 relative isolate overflow-hidden rounded-3xl p-6 text-white sm:p-8 lg:p-9 shadow-2xl">
        <div className="dashboard-orb dashboard-orb-one" />
        <div className="dashboard-orb dashboard-orb-two" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between z-10">
          <div className="flex items-start gap-4 sm:gap-5">
            {/* Glowing Avatar Emblem */}
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 opacity-70 blur-sm transition duration-300 group-hover:opacity-100" />
              <span className="relative grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-gradient-to-br from-slate-900/90 via-indigo-950 to-slate-900 border border-white/25 shadow-xl backdrop-blur-md">
                <GraduationCap className="h-7 w-7 sm:h-8 sm:w-8 text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]" />
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-[34px] leading-tight">
                Welcome back, <span className="bg-gradient-to-r from-white via-cyan-100 to-indigo-200 bg-clip-text text-transparent drop-shadow-sm">{displayAdminName}</span>.
              </h1>
              <p className="mt-2 max-w-2xl text-xs sm:text-sm font-medium leading-relaxed text-indigo-100/90">
                Live overview of teaching faculty, fee collections, academic structures, and operations for <strong className="text-cyan-200 font-bold">{schoolName}</strong>.
              </p>
            </div>
          </div>

          {/* Right Status Widgets */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Campus & Live Clock */}
            <div className="flex flex-col justify-center rounded-2xl border border-white/20 bg-white/[0.08] px-4 py-2.5 shadow-lg backdrop-blur-md transition hover:border-cyan-400/40 hover:bg-white/[0.12]">
              <span className="font-extrabold text-xs text-white tracking-wide">{schoolName}</span>
              <span className="mt-0.5 font-mono text-[11px] font-semibold text-cyan-200/90 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-cyan-400" />
                {dateLabel} · {timeLabel}
              </span>
            </div>

            {/* Academic Session */}
            <div className="flex items-center gap-2.5 rounded-2xl border border-indigo-400/30 bg-indigo-950/40 px-4 py-2.5 text-xs font-bold text-indigo-100 shadow-lg backdrop-blur-md transition hover:border-indigo-400/50 hover:bg-indigo-900/50">
              <div className="grid h-7 w-7 place-items-center rounded-xl bg-indigo-500/20 text-cyan-300 border border-indigo-400/30">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-[9px] uppercase tracking-wider text-indigo-300/80 font-bold">Academic Session</span>
                <span className="font-extrabold text-white text-xs">{currentAcademicYear || 'Active Session'}</span>
              </div>
            </div>

            {/* Live DB Sync Status */}
            <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-2.5 text-xs font-bold text-emerald-100 shadow-lg backdrop-blur-md transition hover:border-emerald-400/50 hover:bg-emerald-900/50">
              <div className="relative flex h-3 w-3 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${isRevenueFetching ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              </div>
              <div>
                <span className="block text-[9px] uppercase tracking-wider text-emerald-300/80 font-bold">System Status</span>
                <span className="font-extrabold text-emerald-200 text-xs">{isRevenueFetching ? 'Syncing DB...' : 'Live Synced'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          KEY METRICS ROW
          ---------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon, color, tab }) => (
          <button
            key={label}
            onClick={() => onNavigateToTab(tab)}
            className={`dashboard-metric group rounded-3xl border p-5 text-left transition hover:shadow-md ${surface}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[10px] font-extrabold uppercase tracking-[.14em] ${muted}`}>{label}</p>
                <p className={`mt-2 text-2xl font-extrabold leading-none tracking-tight sm:text-[28px] ${title}`}>{value}</p>
              </div>
              <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-lg shadow-indigo-500/20`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100/60 pt-3 dark:border-white/5">
              <span className={`text-xs font-semibold ${muted}`}>{note}</span>
              <ArrowUpRight className="h-4 w-4 text-indigo-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
      </div>

      {/* ----------------------------------------------------
          CORE PANELS: REVENUE & FACULTY (SIDE-BY-SIDE)
          ---------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* REVENUE & FEE COLLECTIONS */}
        <div className={`rounded-3xl border p-6 flex flex-col justify-between ${surface}`}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-base font-extrabold ${title}`}>Revenue & Fee Collections</h2>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live DB
                    </span>
                  </div>
                </div>
                <p className={`mt-0.5 text-xs ${muted}`}>Authoritative PostgreSQL revenue, invoices, and payment receipts.</p>
              </div>
              <button
                onClick={() => onNavigateToTab('fees')}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold text-emerald-600 ${soft} hover:bg-emerald-50 transition`}
              >
                Open Invoices <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Financial Highlights */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-2xl border p-4 ${soft}`}>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>Total Revenue Made</span>
                <p className="mt-1 text-2xl font-black text-emerald-600">
                  ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 rounded px-1.5 py-0.5 mt-1 inline-block">
                  {collectionRate}% Collected
                </span>
              </div>

              <div className={`rounded-2xl border p-4 ${soft}`}>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>Pending Receivables</span>
                <p className="mt-1 text-2xl font-black text-amber-600">
                  ₹{pendingReceivables.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <span className={`text-[10px] font-semibold ${muted} mt-1 inline-block`}>
                  from ₹{totalInvoiced.toLocaleString('en-IN')} total
                </span>
              </div>
            </div>

            {/* Collections Momentum Bar Chart */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                  Monthly Receipts Momentum (PostgreSQL Records)
                </span>
                {revenueData?.lastUpdated && (
                  <span className={`text-[9px] font-mono flex items-center gap-1 ${muted}`}>
                    <Clock className="h-3 w-3" /> Auto-syncing
                  </span>
                )}
              </div>
              <div className="flex h-36 items-end gap-2 border-b border-slate-200/70 pb-px dark:border-white/10">
                {chartValues.map((item) => {
                  const proportionalHeight = maxMonthlyAmount > 0 && item.amount > 0
                    ? Math.max(16, Math.round((item.amount / maxMonthlyAmount) * 85))
                    : 8;
                  const hasAmount = item.amount > 0;

                  return (
                    <div className="group flex h-full flex-1 flex-col justify-end" key={item.month}>
                      <div className="relative flex flex-1 items-end justify-center">
                        <span
                          className={`pointer-events-none absolute -top-2 hidden -translate-y-full rounded-md px-2 py-1 text-[10px] font-bold ${
                            isGlass ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
                          } group-hover:block z-10 shadow-md`}
                        >
                          ₹{item.amount.toLocaleString('en-IN')}
                        </span>
                        <div
                          style={{ height: `${proportionalHeight}%` }}
                          className={`w-full max-w-8 rounded-t-lg transition-all duration-300 group-hover:brightness-110 ${
                            hasAmount
                              ? 'bg-gradient-to-t from-emerald-600 via-teal-500 to-cyan-400 shadow-[0_-4px_16px_rgba(16,185,129,.25)]'
                              : isGlass
                                ? 'bg-slate-700'
                                : 'bg-slate-100'
                          }`}
                        />
                      </div>
                      <span className={`pt-2 text-center text-[10px] font-bold ${hasAmount ? 'text-emerald-600 font-extrabold' : muted}`}>
                        {item.month}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs ${muted}`}>
            <span>Total Invoiced: <strong className={title}>₹{totalInvoiced.toLocaleString('en-IN')}</strong></span>
            <span>Fee Health: <strong className="text-emerald-600">{collectionRate >= 80 ? 'Excellent' : collectionRate >= 50 ? 'Moderate' : 'Active Cycle'}</strong></span>
          </div>
        </div>

        {/* TEACHING FACULTY & STAFF */}
        <div className={`rounded-3xl border p-6 flex flex-col justify-between ${surface}`}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                    <UserCheck className="h-4 w-4" />
                  </span>
                  <h2 className={`text-base font-extrabold ${title}`}>Teaching Faculty & Staff</h2>
                </div>
                <p className={`mt-0.5 text-xs ${muted}`}>
                  {activeTeachers.length} active faculty members • {studentTeacherRatio} Student-to-Teacher ratio.
                </p>
              </div>
              <button
                onClick={() => onNavigateToTab('teachers')}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold text-blue-600 ${soft} hover:bg-blue-50 transition`}
              >
                Teacher Directory <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Teachers List Preview */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
              {teachersList.length > 0 ? (
                teachersList.slice(0, 6).map((teacher: any) => {
                  const subjectCount = Array.isArray(teacher.subjects) ? teacher.subjects.length : 0;

                  return (
                    <div
                      key={teacher.id}
                      className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${soft}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-xs font-black text-white shadow-xs">
                          {teacher.name ? teacher.name.charAt(0).toUpperCase() : 'T'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-slate-900 dark:text-white">
                            {teacher.name}
                          </p>
                          <p className={`truncate text-[10px] ${muted}`}>
                            {teacher.qualification || 'Faculty Member'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="rounded-md bg-white border border-slate-200/60 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-slate-800 dark:border-white/10 dark:text-slate-300">
                          {subjectCount} {subjectCount === 1 ? 'subj' : 'subjs'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="sm:col-span-2 p-6 text-center rounded-2xl border border-dashed text-xs text-slate-400">
                  No teachers recorded yet. Click Teacher Directory to add faculty.
                </div>
              )}
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs ${muted}`}>
            <span>Total Faculty: <strong className={title}>{teachersList.length} Teachers</strong></span>
            <button
              onClick={() => onNavigateToTab('academic')}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              View Schedules & Timetables →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
