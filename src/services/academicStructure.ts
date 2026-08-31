import { apiRequest } from './api';

export interface AcademicClass {
  id: number;
  name: string;
  code: string;
  sortOrder: number;
  subjectIds?: number[];
}

export interface AcademicSection {
  id: number;
  classId: number;
  name: string;
}

export interface AcademicSubject {
  id: number;
  name: string;
}

export interface AcademicYear {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  is_active: boolean;
}

export const ACADEMIC_STRUCTURE_CHANGED_EVENT = 'school-erp:academic-structure-changed';

export function announceAcademicStructureChanged(): void {
  window.dispatchEvent(new Event(ACADEMIC_STRUCTURE_CHANGED_EVENT));
}

type Page<T> = { next?: string | null; results?: T[] } | T[];

async function loadEveryPage<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await apiRequest<Page<T>>(`${path}${separator}page=${page}`);
    if (Array.isArray(payload)) return payload;
    rows.push(...(payload.results || []));
    if (!payload.next) return rows;
  }
  throw new Error('Academic structure pagination exceeded the safe page limit.');
}

export async function loadAcademicStructure(): Promise<{
  years: AcademicYear[];
  classes: AcademicClass[];
  sections: AcademicSection[];
  subjects: AcademicSubject[];
}> {
  const [years, classes, sections, subjects] = await Promise.all([
    loadEveryPage<AcademicYear>('/academic-years/'),
    loadEveryPage<AcademicClass>('/classes/'),
    loadEveryPage<AcademicSection>('/sections/'),
    loadEveryPage<AcademicSubject>('/subjects/'),
  ]);
  years.sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  classes.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.name.localeCompare(right.name, undefined, { numeric: true }));
  sections.sort((left, right) => left.classId - right.classId || left.name.localeCompare(right.name));
  subjects.sort((left, right) => left.name.localeCompare(right.name));
  return { years, classes, sections, subjects };
}
