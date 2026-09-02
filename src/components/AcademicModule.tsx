import React, { useState, useEffect, useRef } from 'react';
import { Clock, School } from 'lucide-react';
import { TimetableSlot, SchoolTimingConfig, TimetableNotification } from './timetable/types';
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
            <Clock className="w-5 h-5 text-indigo-600" />
            Timetable Management
          </h2>
          <p className="text-xs text-slate-500">Coordinate school schedules, track class timetables, and monitor period allocations.</p>
        </div>
      </div>

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
    </div>
  );
}
