import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, BookOpen, UserCheck, Plus, CheckCircle2, School, Bell, Settings } from 'lucide-react';
import { ACADEMIC_EVENTS } from '../data/mockData';
import { DayOfWeek, TimetableSlot, SchoolTimingConfig, TimetableNotification } from './timetable/types';
import { getDefaultTimingConfig } from './timetable/utils';
import TimetableEditor from './timetable/TimetableEditor';
import TimetableView from './timetable/TimetableView';
import { Student } from '../types';
import { emitNotification } from '../services/notificationBus';
import {
  createTimetableSlot,
  deleteTimetableSlot,
  loadTimetableSlots,
  publishTimetable,
  updateTimetableSlot,
} from '../services/timetable';

interface AcademicModuleProps {
  user?: any; // AuthUser
  students?: Student[];
  currentAcademicYear?: string;
}

export default function AcademicModule({
  user = { role: 'School Admin', schoolId: 'school-default', name: 'School Admin' },
  students = [],
  currentAcademicYear = ''
}: AcademicModuleProps) {
  // Tabs: 'calendar' or 'timetable'
  const [activeSubTab, setActiveSubTab] = useState<'timetable' | 'calendar'>('timetable');

  // Super Admin campus select context (defaults to sch-1 Delhi Campus)
  const [superAdminSchoolId, setSuperAdminSchoolId] = useState('school-default');

  // Timetable periods are authoritative PostgreSQL records. Browser storage
  // is intentionally not used so published schedules survive logout and are
  // visible on every device to the correct role.
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [timetableLoading, setTimetableLoading] = useState(true);
  const [timetableError, setTimetableError] = useState('');
  const timetableRequestId = useRef(0);

  // Timing Config map per schoolId — always starts from defaults, never localStorage.
  const [timingConfigs, setTimingConfigs] = useState<{ [schoolId: string]: SchoolTimingConfig }>(() => ({
    [user?.schoolId || 'school-default']: getDefaultTimingConfig(user?.schoolId || 'school-default', currentAcademicYear)
  }));

  // Timetable broadcast notifications — always starts empty, never localStorage.
  const [notifications, setNotifications] = useState<TimetableNotification[]>([]);

  // ----------------------------------------------------
  // ORIGINAL CALENDAR PORTION STATES & HANDLERS
  // ----------------------------------------------------
  const [events, setEvents] = useState(ACADEMIC_EVENTS);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventDate, setNewEventDate] = useState('2026-07-25');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCat, setNewEventCat] = useState('Academic');

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle) return;
    setEvents([...events, { date: newEventDate, title: newEventTitle, category: newEventCat }]);
    setNewEventTitle('');
    setIsAddingEvent(false);
  };

  // ----------------------------------------------------
  // STATE SYNCERS
  // ----------------------------------------------------
  const refreshTimetable = async () => {
    const requestId = ++timetableRequestId.current;
    setTimetableLoading(true);
    try {
      const rows = await loadTimetableSlots(currentAcademicYear || undefined);
      if (requestId !== timetableRequestId.current) return;
      setSlots(rows);
      setTimetableError('');
    } catch (error) {
      if (requestId !== timetableRequestId.current) return;
      setSlots([]);
      setTimetableError(error instanceof Error ? error.message : 'Timetable could not be loaded.');
    } finally {
      if (requestId === timetableRequestId.current) setTimetableLoading(false);
    }
  };

  useEffect(() => {
    void refreshTimetable();
  }, [user?.email, user?.role, currentAcademicYear]);

  const handleUpdateSlots = async (updated: TimetableSlot[]) => {
    const currentById = new Map(slots.map((slot) => [slot.id, slot]));
    const updatedById = new Map(updated.map((slot) => [slot.id, slot]));
    const persistedId = (id: string) => /^\d+$/.test(id);
    const removed = slots.filter((slot) => persistedId(slot.id) && !updatedById.has(slot.id));
    const created = updated.filter((slot) => !persistedId(slot.id));
    const changed = updated.filter((slot) => {
      if (!persistedId(slot.id)) return false;
      const previous = currentById.get(slot.id);
      return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(slot);
    });

    setTimetableError('');
    try {
      // Deleting target periods first makes timetable copy operations obey the
      // database uniqueness constraints without a transient collision.
      for (const slot of removed) await deleteTimetableSlot(slot.id);
      for (const slot of changed) await updateTimetableSlot(slot);
      for (const slot of created) await createTimetableSlot(slot);
      await refreshTimetable();
    } catch (error) {
      await refreshTimetable();
      const message = error instanceof Error ? error.message : 'Timetable changes could not be saved.';
      setTimetableError(message);
      throw error;
    }
  };

  const handlePublishSlots = async (sectionId: number) => {
    setTimetableError('');
    try {
      await publishTimetable(currentAcademicYear, sectionId);
      await refreshTimetable();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Timetable could not be published.';
      setTimetableError(message);
      throw error;
    }
  };

  const handleUpdateTimingConfig = (updated: SchoolTimingConfig) => {
    const newConfigs = {
      ...timingConfigs,
      [activeSchoolId]: updated
    };
    setTimingConfigs(newConfigs);
  };

  const handleAddNotification = (title: string, message: string, targetClass?: string, targetRole?: string) => {
    const newNotif: TimetableNotification = {
      id: `notif-${Date.now()}`,
      schoolId: activeSchoolId,
      title,
      message,
      timestamp: new Date().toISOString(),
      targetClass,
      targetRole
    };
    setNotifications([newNotif, ...notifications]);
    emitNotification({
      title,
      message,
      tone: 'info',
      source: 'timetable',
    });
  };

  // Determine active school context
  const activeSchoolId = user.role === 'Super Admin' ? superAdminSchoolId : (user.schoolId || 'school-default');
  const activeTimingConfig = timingConfigs[activeSchoolId] || getDefaultTimingConfig(activeSchoolId, currentAcademicYear);

  // Check if current user role has edit rights
  const isSuperAdmin = user.role === 'Super Admin';
  const isSchoolAdmin = user.role === 'School Admin';
  const hasEditRights = isSchoolAdmin;

  return (
    <div className="space-y-6" id="academic-module-main">
      {/* Top Navigation & Description Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-base font-sans font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Academic Operations Desk
          </h2>
          <p className="text-xs text-slate-500">Coordinate school schedules, track class timetables, and manage event rosters.</p>
        </div>

        {/* Tab switcher buttons */}
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('timetable')}
            className={`text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeSubTab === 'timetable'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            Timetable Management
          </button>
          <button
            onClick={() => setActiveSubTab('calendar')}
            className={`text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeSubTab === 'calendar'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Academic Calendar ({events.length})
          </button>
        </div>
      </div>

      {/* Render selected view */}
      {activeSubTab === 'timetable' ? (
        <div className="space-y-6 animate-fade-in" id="timetable-sub-view">
          {timetableError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700" role="alert">
              {timetableError}
            </div>
          )}
          {timetableLoading && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs font-semibold text-indigo-700">
              Loading the live timetable from the database...
            </div>
          )}
          {/* Branch Switcher ONLY for Super Admin */}
          {isSuperAdmin && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold">Super Admin Global Control: Branch Context Selection</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Managing Campus:</label>
                <select
                  value={superAdminSchoolId}
                  onChange={(e) => setSuperAdminSchoolId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-lg p-1.5 focus:outline-none"
                  id="super-admin-branch-select"
                >
                  <option value="school-default">Default school</option>
                </select>
              </div>
            </div>
          )}

          {/* Core sub-panels */}
          {hasEditRights ? (
            <TimetableEditor
              schoolId={activeSchoolId}
              currentAcademicYear={currentAcademicYear}
              slots={slots}
              timingConfig={activeTimingConfig}
              onUpdateSlots={handleUpdateSlots}
              onPublishSlots={handlePublishSlots}
              onUpdateTimingConfig={handleUpdateTimingConfig}
              onAddNotification={handleAddNotification}
            />
          ) : (
            <TimetableView
              user={user}
              students={students}
              slots={slots}
              timingConfig={activeTimingConfig}
              notifications={notifications}
            />
          )}
        </div>
      ) : (
        /* ORIGINAL ACADEMIC CALENDAR & EVENTS INTACT */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" id="academic-calendar-sub-view">
          {/* Calendar Events Listing */}
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[450px]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-sans font-bold text-slate-800 text-sm uppercase tracking-wider">Scheduled Calendar Events</h3>
                </div>
                <button
                  onClick={() => setIsAddingEvent(!isAddingEvent)}
                  className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center gap-1 text-xs font-bold"
                  id="btn-add-calendar-event"
                >
                  <Plus className="w-4 h-4" />
                  Create Event
                </button>
              </div>

              {isAddingEvent && (
                <form onSubmit={handleAddEvent} className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Event Title</label>
                    <input
                      type="text"
                      required
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 mt-1 bg-white focus:outline-indigo-500"
                      placeholder="e.g. Annual Science Fair"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Date</label>
                      <input
                        type="date"
                        required
                        value={newEventDate}
                        onChange={(e) => setNewEventDate(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 mt-1 bg-white focus:outline-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                      <select
                        value={newEventCat}
                        onChange={(e) => setNewEventCat(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 mt-1 bg-white focus:outline-indigo-500 font-semibold"
                      >
                        <option>Academic</option>
                        <option>Event</option>
                        <option>Holiday</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingEvent(false)}
                      className="text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-1.5 rounded-lg shadow-sm"
                    >
                      Save Event
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {events.map((evt, index) => (
                  <div key={index} className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-200 flex gap-4 items-start hover:bg-slate-50 transition-colors">
                    <div className="text-center font-mono shrink-0 bg-white border border-slate-200 p-1.5 rounded-lg shadow-2xs min-w-[50px]">
                      <p className="text-base font-bold text-indigo-700 leading-none">{evt.date.split('-')[2]}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                        {new Date(evt.date).toLocaleString('default', { month: 'short' })}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 leading-tight">{evt.title}</p>
                      <span className={`inline-block text-[8px] font-bold tracking-wider uppercase mt-1.5 ${
                        evt.category === 'Holiday' ? 'text-amber-700 bg-amber-50 border border-amber-100' :
                        evt.category === 'Event' ? 'text-purple-700 bg-purple-50 border border-purple-100' : 'text-indigo-700 bg-indigo-50 border border-indigo-100'
                      } px-2 py-0.5 rounded`}>
                        {evt.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Informational card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 border-b border-slate-50 pb-2">Academic Operations Overview</h4>
              
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Syllabus Tracking</h5>
                    <p className="text-[10px] text-slate-500 leading-relaxed">Central guidelines mapping curricula across standard divisions, synced directly to teacher LMS planners.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Faculty Roster Allocation</h5>
                    <p className="text-[10px] text-slate-500 leading-relaxed">Cross-referenced scheduling locks rooms and prevents concurrent faculty reservations automatically.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4">
              <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subject allocations</h4>
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-[10px] text-slate-400">
                No teacher allocations created yet.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
