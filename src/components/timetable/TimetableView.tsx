import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Calendar, MapPin, User, Bell, Shield, BookOpen, AlertCircle, FileText, ArrowRight, Printer } from 'lucide-react';
import { DayOfWeek, TimetableSlot, SchoolTimingConfig, TimetableNotification } from './types';
import { generatePeriodsList, DAYS_OF_WEEK } from './utils';
import TimetableGrid from './TimetableGrid';
import { Student } from '../../types';
import { loadVisibleSubjects, SubjectVisibility } from '../../services/subjectVisibility';

interface TimetableViewProps {
  user: any; // AuthUser
  students: Student[];
  slots: TimetableSlot[];
  timingConfig: SchoolTimingConfig;
  notifications: TimetableNotification[];
}

export default function TimetableView({
  user,
  students,
  slots,
  timingConfig,
  notifications
}: TimetableViewProps) {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [displayMode, setDisplayMode] = useState<'daily' | 'weekly'>('weekly');
  const [subjectVisibility, setSubjectVisibility] = useState<SubjectVisibility | null>(null);
  const [subjectVisibilityError, setSubjectVisibilityError] = useState('');

  useEffect(() => {
    let active = true;
    loadVisibleSubjects()
      .then((payload) => {
        if (!active) return;
        setSubjectVisibility(payload);
        setSubjectVisibilityError('');
      })
      .catch((error) => {
        if (!active) return;
        setSubjectVisibility(null);
        setSubjectVisibilityError(error instanceof Error ? error.message : 'Assigned subjects could not be loaded.');
      });
    return () => { active = false; };
  }, [user.id, user.role]);

  // 1. Resolve perspective variables based on user role
  const linkedChildren = useMemo(() => {
    if (user.role !== 'Parent') return [];
    const linkedStudentIds = Array.isArray(user.parentStudentIds)
      ? user.parentStudentIds.map(String)
      : [];
    const matched = students.filter((student) => linkedStudentIds.includes(String(student.id)));
    return matched.length > 0 ? matched : students;
  }, [user.role, user.parentStudentIds, students]);

  const [selectedChildId, setSelectedChildId] = useState<string>('all');

  const activeChild = useMemo(() => {
    if (user.role !== 'Parent') return null;
    if (selectedChildId !== 'all') {
      return linkedChildren.find((c) => String(c.id) === selectedChildId) || linkedChildren[0] || null;
    }
    return linkedChildren[0] || null;
  }, [user.role, selectedChildId, linkedChildren]);

  let userClass = '';
  let userSection = '';
  let teacherId = '';
  let headingText = 'My Academic Schedule';
  let subtitleText = 'Weekly and daily academic timetables, school hours, and live alerts.';

  // If Parent, find child's class and section
  if (user.role === 'Parent') {
    if (activeChild) {
      userClass = activeChild.class;
      userSection = activeChild.section;
      headingText = selectedChildId === 'all' && linkedChildren.length > 1
        ? `Ward Timetable: ${activeChild.name} (Select Child to Switch)`
        : `Ward Timetable: ${activeChild.name}`;
      subtitleText = `Viewing official academic schedule for ${activeChild.name} (${activeChild.class}-${activeChild.section}).`;
    } else {
      headingText = "Child's Class Timetable";
    }
  }

  // If Student, find their class and section
  if (user.role === 'Student') {
    const student = students.find(s => s.id === user.studentId || s.name === user.name);
    if (student) {
      userClass = student.class;
      userSection = student.section;
    }
    headingText = userClass && userSection ? `My Class Timetable (${userClass}-${userSection})` : 'My Class Timetable';
    subtitleText = `Track your daily periods, subjects, instructors, and class venues.`;
  }

  // Resolve the authenticated teacher from the server-provided teacherId
  // (from /subjects/visible/) or from persisted timetable assignments.
  if (user.role === 'Teacher') {
    teacherId = String(subjectVisibility?.teacherId || '');
    // Fallback: match by teacher name from the actual timetable slots
    if (!teacherId) {
      const assignedSlot = slots.find((slot) => slot.teacherName.trim().toLowerCase() === String(user.name || '').trim().toLowerCase());
      teacherId = String(assignedSlot?.teacherId || '');
    }
    headingText = `Teacher Lecture Schedule: ${user.name}`;
    subtitleText = `Track your assigned lecture hours, class periods, and room assignments.`;
  }

  // Filter notifications relevant to this user
  const relevantNotifications = notifications.filter(notif => {
    if (user.role === 'Student' || user.role === 'Parent') {
      return !notif.targetClass || notif.targetClass === userClass;
    }
    if (user.role === 'Teacher') {
      return notif.targetRole === 'Teacher' || !notif.targetRole || notif.targetRole === 'all';
    }
    return true;
  });

  const allBlocks = generatePeriodsList(timingConfig);
  const activeDays = timingConfig.workingDays;

  // Filter slots for daily timeline view
  const activeDayClassSlots = slots.filter(s => 
    s.class === userClass && 
    s.section === userSection && 
    s.day === selectedDay && 
    s.published
  );

  const activeDayTeacherSlots = slots.filter(s => 
    s.teacherId === teacherId && 
    s.day === selectedDay && 
    s.published
  );

  const perspectivePublishedSlots = useMemo(() => {
    const published = slots.filter((slot) => slot.published);
    if (user.role === 'Teacher') {
      return published.filter((slot) => slot.teacherId === teacherId);
    }
    return published.filter((slot) => slot.class === userClass && slot.section === userSection);
  }, [slots, teacherId, user.role, userClass, userSection]);
  const scheduledSubjectNames = useMemo(
    () => new Set(perspectivePublishedSlots.map((slot) => slot.subject.trim().toLocaleLowerCase())),
    [perspectivePublishedSlots],
  );

  return (
    <div className="space-y-6" id="timetable-view-portal">
      {/* Welcome & Dashboard Subheader */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 uppercase tracking-widest font-mono bg-indigo-50/75 border border-indigo-100/40 px-2 py-0.5 rounded">
            <Clock className="w-3.5 h-3.5" />
            Active Session Timetable
          </div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight mt-1">{headingText}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitleText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Child Switcher for Parents with multiple children */}
          {user.role === 'Parent' && linkedChildren.length > 1 && (
            <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                Select Child:
              </label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="all">All Linked Children</option>
                {linkedChildren.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name} ({w.class} {w.section ? `- ${w.section}` : ''})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setDisplayMode(displayMode === 'daily' ? 'weekly' : 'daily')}
            className="text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Switch to {displayMode === 'daily' ? 'Weekly Grid' : 'Daily Agenda'}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print Format
          </button>
        </div>
      </div>

      {/* Quick Child Switcher Pills if "All Linked Children" selected and multiple children */}
      {user.role === 'Parent' && linkedChildren.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 mr-1">Switch Ward Timetable:</span>
          {linkedChildren.map((child) => {
            const isSelected = activeChild?.id === child.id;
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedChildId(String(child.id))}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{child.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {child.class}-{child.section}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main schedule view */}
        <div className="lg:col-span-3 space-y-5">
          {displayMode === 'weekly' ? (
            <TimetableGrid
              slots={slots.filter(s => s.published)} // Only show published timetables to students/parents/teachers!
              timingConfig={timingConfig}
              viewMode={user.role === 'Teacher' ? 'teacher' : 'class'}
              selectedClass={userClass}
              selectedSection={userSection}
              selectedTeacherId={teacherId}
              selectedSubject=""
              selectedDay="Monday"
              canEdit={false}
            />
          ) : (
            // DAILY AGENDA VIEW
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Daily Class Timeline</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Chronological layout of classes and breaks for {selectedDay}.</p>
                </div>
                {/* Day selector */}
                <div className="flex flex-wrap gap-1 bg-slate-100 p-0.5 rounded-lg">
                  {activeDays.map(d => (
                    <button
                      key={d}
                      onClick={() => setSelectedDay(d)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${
                        selectedDay === d 
                          ? 'bg-white text-indigo-700 shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline blocks */}
              <div className="space-y-3.5">
                {allBlocks.map((block, idx) => {
                  if (block.type === 'break') {
                    return (
                      <div key={idx} className="flex items-center gap-4 p-3 bg-amber-50/45 border border-amber-100/50 border-dashed rounded-xl justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-100/70 text-amber-800 flex items-center justify-center font-bold text-[10px] font-mono">
                            REC
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-700">Recess Break</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{block.timeLabel}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded font-mono">
                          {timingConfig.breakDuration} mins
                        </span>
                      </div>
                    );
                  }

                  if (block.type === 'lunch') {
                    return (
                      <div key={idx} className="flex items-center gap-4 p-3 bg-emerald-50/45 border border-emerald-100/50 border-dashed rounded-xl justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold text-[10px] font-mono">
                            LUN
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-700">Lunch Break Recess</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{block.timeLabel}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded font-mono">
                          {timingConfig.lunchDuration} mins
                        </span>
                      </div>
                    );
                  }

                  // Resolve scheduled slots
                  const slot = user.role === 'Teacher' 
                    ? activeDayTeacherSlots.find(s => s.period === block.periodNumber)
                    : activeDayClassSlots.find(s => s.period === block.periodNumber);

                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
                        slot 
                          ? 'bg-slate-50/50 border-slate-200' 
                          : 'bg-slate-50/10 border-slate-100 border-dashed'
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center font-bold border ${
                        slot 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-100/40' 
                          : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                        <span className="text-[8px] text-slate-400 font-mono leading-none">PD</span>
                        <span className="text-base font-bold mt-0.5 leading-none">{block.periodNumber}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        {slot ? (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-800">{slot.subject}</h4>
                              <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-2 py-0.2 rounded">
                                {block.timeLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500">
                              {user.role === 'Teacher' ? (
                                <span className="flex items-center gap-1 font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded-sm text-[9px]">
                                  Class: {slot.class} - {slot.section}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-slate-400" />
                                  Teacher: {slot.teacherName}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                Classroom: {slot.classroom}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h4 className="text-xs font-bold text-slate-400">Unscheduled Slot</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{block.timeLabel}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar panels */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">My Subjects</h3>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Assigned subjects come from Academic Setup. A green label means the subject also has a published period.
                </p>
              </div>
            </div>
            {subjectVisibilityError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10px] font-semibold text-rose-700">
                {subjectVisibilityError}
              </p>
            ) : subjectVisibility === null ? (
              <p className="mt-3 text-[10px] font-semibold text-slate-400">Loading assigned subjects...</p>
            ) : subjectVisibility.subjects.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-semibold leading-4 text-amber-800">
                No subjects are assigned yet. The School Admin must assign subjects to the class and teacher profile.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {subjectVisibility.subjects.map((subject) => {
                  const scheduled = scheduledSubjectNames.has(subject.name.trim().toLocaleLowerCase());
                  return (
                    <div key={subject.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-bold text-slate-800">{subject.name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide ${scheduled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {scheduled ? 'Published' : 'Not scheduled'}
                        </span>
                      </div>
                      {subject.scopes.length > 0 && (
                        <p className="mt-1 truncate text-[9px] text-slate-500">
                          {subject.scopes.map((scope) => `${scope.className}-${scope.sectionName}`).join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Timetable Notifications */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 flex items-center gap-2 border-b border-slate-50 pb-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Timetable Broadcasts
            </h3>
            
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {relevantNotifications.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic">
                  No active timetable alerts.
                </div>
              ) : (
                relevantNotifications.map(notif => (
                  <div key={notif.id} className="p-3 bg-amber-500/5 border border-amber-200/50 rounded-xl space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-[8px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded uppercase">
                        REVISED
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono">
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">{notif.title}</h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed">{notif.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* School Timings summary Card */}
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xs border border-slate-800 space-y-4">
            <div>
              <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">School Timing Rules</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Official hours of attendance & operations.</p>
            </div>

            <div className="space-y-2.5 text-xs font-mono text-slate-300">
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Class Starts:</span>
                <span>{timingConfig.startTime} AM</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Duration/Period:</span>
                <span>{timingConfig.periodDuration} Mins</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Morning Recess:</span>
                <span>{timingConfig.breakDuration} Mins</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Lunch Hour:</span>
                <span>{timingConfig.lunchDuration} Mins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Weekly Classes:</span>
                <span>{activeDays.length} Working Days</span>
              </div>
            </div>
            
            <div className="pt-2 text-[9px] text-slate-400 border-t border-slate-800 leading-normal">
              Note: Attendance rosters lock exactly 15 minutes after the first period bell rings.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
