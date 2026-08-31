import { apiRequest } from './api';
import type { TimetableSlot } from '../components/timetable/types';

type TimetablePage = TimetableApiRecord[] | {
  results?: TimetableApiRecord[];
  next?: string | null;
};

interface TimetableApiRecord {
  id: number | string;
  schoolId: number | string;
  academicYear: string;
  class?: string;
  className?: string;
  section: string;
  sectionId: number;
  day: TimetableSlot['day'];
  period: number;
  time?: string;
  subject: string;
  subjectId: number;
  teacherId: number | string;
  teacherName: string;
  classroom?: string;
  published: boolean;
}

export interface TimetableSlotInput {
  academicYear: string;
  sectionId: number;
  day: TimetableSlot['day'];
  period: number;
  time: string;
  subjectId: number;
  teacherId: number;
  classroom: string;
}

function normalizeSlot(row: TimetableApiRecord): TimetableSlot {
  return {
    id: String(row.id),
    schoolId: String(row.schoolId),
    academicYear: row.academicYear,
    class: row.class || row.className || '',
    section: row.section,
    sectionId: Number(row.sectionId),
    day: row.day,
    period: Number(row.period),
    time: row.time || '',
    subject: row.subject,
    subjectId: Number(row.subjectId),
    teacherId: String(row.teacherId),
    teacherName: row.teacherName,
    classroom: row.classroom || 'Default',
    published: Boolean(row.published),
  };
}

export function timetableSlotInput(slot: TimetableSlot): TimetableSlotInput {
  if (!Number.isFinite(slot.sectionId) || !Number.isFinite(slot.subjectId) || !Number.isFinite(Number(slot.teacherId))) {
    throw new Error('This timetable period is missing a canonical section, subject, or teacher assignment. Recreate the period.');
  }
  return {
    academicYear: slot.academicYear,
    sectionId: slot.sectionId,
    day: slot.day,
    period: slot.period,
    time: slot.time,
    subjectId: slot.subjectId,
    teacherId: Number(slot.teacherId),
    classroom: slot.classroom,
  };
}

export async function loadTimetableSlots(academicYear?: string): Promise<TimetableSlot[]> {
  const rows: TimetableApiRecord[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const params = new URLSearchParams({ page: String(page) });
    if (academicYear) params.set('academicYear', academicYear);
    const payload = await apiRequest<TimetablePage>(`/timetable-slots/?${params}`);
    if (Array.isArray(payload)) return payload.map(normalizeSlot);
    rows.push(...(payload.results || []));
    if (!payload.next) return rows.map(normalizeSlot);
  }
  throw new Error('Timetable pagination exceeded the safe page limit.');
}

export async function createTimetableSlot(slot: TimetableSlot): Promise<TimetableSlot> {
  const saved = await apiRequest<TimetableApiRecord>('/timetable-slots/', {
    method: 'POST',
    body: JSON.stringify(timetableSlotInput(slot)),
  });
  return normalizeSlot(saved);
}

export async function updateTimetableSlot(slot: TimetableSlot): Promise<TimetableSlot> {
  const saved = await apiRequest<TimetableApiRecord>(`/timetable-slots/${slot.id}/`, {
    method: 'PATCH',
    body: JSON.stringify(timetableSlotInput(slot)),
  });
  return normalizeSlot(saved);
}

export function deleteTimetableSlot(slotId: string): Promise<void> {
  return apiRequest<void>(`/timetable-slots/${slotId}/`, { method: 'DELETE' });
}

export async function publishTimetable(academicYear: string, sectionId: number): Promise<TimetableSlot[]> {
  const response = await apiRequest<TimetableApiRecord[] | { slots?: TimetableApiRecord[] }>(
    '/timetable-slots/publish/',
    {
      method: 'POST',
      body: JSON.stringify({ academicYear, sectionId }),
    },
  );
  const rows = Array.isArray(response) ? response : (response.slots || []);
  return rows.map(normalizeSlot);
}
