import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  Filter,
  GraduationCap,
  Megaphone,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/api';
import type { Student } from '../types';

type ParentNotification = {
  id: number;
  senderName: string;
  category: string;
  title: string;
  body: string;
  channel?: string;
  readAt: string | null;
  createdAt: string;
  related_object?: Record<string, any>;
};

const REFRESH_INTERVAL_MS = 10_000;

export default function ParentNotifications() {
  const [wards, setWards] = useState<Student[]>([]);
  const [wardsLoading, setWardsLoading] = useState(true);
  const [items, setItems] = useState<ParentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Fetch linked wards for the parent
  const loadWards = useCallback(async () => {
    try {
      const response = await apiRequest<{ results?: any[] } | any[]>('/students/');
      const rows = Array.isArray(response) ? response : response.results || [];
      const normalized: Student[] = rows.map((s: any) => ({
        id: String(s.id),
        admissionNo: s.admissionNo || s.admission_no || '',
        name: s.name || '',
        class: s.class || s.class_ || s.className || '',
        section: s.section || '',
        rollNo: Number(s.rollNo || s.roll_no || 0),
        parentName: s.parentName || s.parent_name || '',
        parentPhone: s.parentPhone || s.parent_phone || '',
        parentEmail: s.parentEmail || s.parent_email || '',
        dob: s.dob || '',
        gender: s.gender || '',
        status: s.status || 'Active',
        academicYear: s.academicYear || s.academic_year || '',
      }));
      setWards(normalized);
    } catch {
      setWards([]);
    } finally {
      setWardsLoading(false);
    }
  }, []);

  // 2. Fetch notifications for the parent
  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await apiRequest<ParentNotification[]>('/notifications/');
      setItems(Array.isArray(data) ? data : []);
      setUpdatedAt(new Date());
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load school notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWards();
    void loadNotifications(true);

    const interval = window.setInterval(() => {
      void loadNotifications(false);
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadNotifications(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadWards, loadNotifications]);

  const activeWard = useMemo(() => {
    if (selectedWardId === 'all') return null;
    return wards.find((w) => String(w.id) === selectedWardId) || null;
  }, [wards, selectedWardId]);

  const markRead = async (id: number) => {
    try {
      const updated = await apiRequest<ParentNotification>(`/notifications/${id}/read/`, { method: 'PATCH' });
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update this notice.');
    }
  };

  const markAllRead = async () => {
    const unreadItems = filteredItems.filter((item) => !item.readAt);
    try {
      await Promise.all(
        unreadItems.map((item) =>
          apiRequest<ParentNotification>(`/notifications/${item.id}/read/`, { method: 'PATCH' })
        )
      );
      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt || new Date().toISOString(),
        }))
      );
    } catch {
      void loadNotifications();
    }
  };

  // Helper to normalize class string (e.g., "Class 5", "5", "class-5" -> "5")
  const cleanClassName = (raw: string) => {
    return raw
      .replace(/class/gi, '')
      .replace(/grade/gi, '')
      .replace(/standard/gi, '')
      .replace(/std/gi, '')
      .replace(/[-_ ]/g, '')
      .trim()
      .toLowerCase();
  };

  // Helper to test if a notice applies to a specific child
  const isNoticeForWard = useCallback((item: ParentNotification, ward: Student) => {
    const wardClassClean = cleanClassName(ward.class || '');
    const wardSection = (ward.section || '').trim().toLowerCase();
    const wardName = (ward.name || '').trim().toLowerCase();
    const wardAdm = (ward.admissionNo || '').trim().toLowerCase();
    const related = item.related_object || {};

    // 1. Explicit student ID match
    if (Array.isArray(related.studentIds) && related.studentIds.length > 0) {
      if (related.studentIds.some((id: any) => String(id) === String(ward.id))) {
        return true;
      }
    }

    // 2. Explicit student Name match
    if (Array.isArray(related.studentNames) && related.studentNames.length > 0) {
      if (related.studentNames.some((n: any) => String(n).trim().toLowerCase() === wardName)) {
        return true;
      }
    }

    // 3. Target class & section match in related metadata
    const targetClass = String(related.targetClass || related.class_name || '').trim();
    const targetSection = String(related.targetSection || related.section || '').trim().toLowerCase();

    if (targetClass && targetClass !== 'all' && targetClass !== 'All') {
      const targetClassClean = cleanClassName(targetClass);
      const classMatches =
        targetClassClean === wardClassClean ||
        targetClassClean.includes(wardClassClean) ||
        wardClassClean.includes(targetClassClean);

      if (!classMatches) {
        return false; // Specifically targeted to another class
      }

      if (targetSection && targetSection !== 'all' && targetSection !== 'All') {
        return targetSection === wardSection || targetSection.includes(wardSection);
      }
      return true;
    }

    // 4. Mentioned in title or body text
    const titleLower = item.title.toLowerCase();
    const bodyLower = item.body.toLowerCase();

    if (wardName && (titleLower.includes(wardName) || bodyLower.includes(wardName))) {
      return true;
    }
    if (wardAdm && (titleLower.includes(wardAdm) || bodyLower.includes(wardAdm))) {
      return true;
    }

    // If another class is explicitly mentioned in title/body (e.g. "Class 8 notice" when this ward is in Class 5), check exclusion
    if (wardClassClean) {
      const hasOtherClass = wards.some((other) => {
        if (String(other.id) === String(ward.id)) return false;
        const otherClean = cleanClassName(other.class || '');
        return (
          otherClean &&
          otherClean !== wardClassClean &&
          (titleLower.includes(`class ${otherClean}`) || bodyLower.includes(`class ${otherClean}`))
        );
      });
      if (hasOtherClass && !titleLower.includes(wardClassClean) && !bodyLower.includes(wardClassClean)) {
        return false;
      }
    }

    // 5. School-wide announcements apply to all children
    return true;
  }, [wards]);

  // Filter items based on selected child, category, and search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Child Filter
      if (activeWard) {
        if (!isNoticeForWard(item, activeWard)) {
          return false;
        }
      }

      // Category Filter
      if (categoryFilter !== 'all') {
        if (item.category.toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }

      // Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesBody = item.body.toLowerCase().includes(query);
        const matchesSender = item.senderName.toLowerCase().includes(query);
        const matchesCategory = item.category.toLowerCase().includes(query);
        if (!matchesTitle && !matchesBody && !matchesSender && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [items, activeWard, categoryFilter, searchQuery, isNoticeForWard]);

  // Notice counts per child
  const childNoticeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    wards.forEach((w) => {
      map[String(w.id)] = items.filter((item) => isNoticeForWard(item, w)).length;
    });
    return map;
  }, [items, wards, isNoticeForWard]);

  const unreadCount = filteredItems.filter((item) => !item.readAt).length;

  return (
    <section className="space-y-5 animate-fade-in pb-12" id="parent-school-notices">
      {/* Header Banner with Ward Switcher Dropdown */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-6 text-white shadow-lg shadow-rose-500/20 sm:p-8">
        <Users className="absolute -right-5 -bottom-8 h-48 w-48 text-white/15 pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[.18em] text-white backdrop-blur-md">
                Parent Portal
              </span>
              <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-bold text-white">
                Official Announcements
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl tracking-tight">School Notices</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-rose-50/90 font-medium">
              Official circulars, class alerts, and school-wide announcements from your School Admin and teachers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Ward Switcher Dropdown */}
            {wards.length > 0 && (
              <div className="bg-white/15 p-2 rounded-2xl backdrop-blur-md border border-white/20">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-100 mb-1 px-1">
                  Select Child
                </label>
                <select
                  value={selectedWardId}
                  onChange={(e) => setSelectedWardId(e.target.value)}
                  className="rounded-xl border-0 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300 cursor-pointer"
                >
                  <option value="all">All Linked Children ({items.length})</option>
                  {wards.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name} ({w.class} {w.section ? `- ${w.section}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-2xl bg-white/15 px-4 py-3 text-center backdrop-blur-sm border border-white/20">
              <p className="text-2xl font-black">{unreadCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-100">Unread</p>
            </div>
          </div>
        </div>
      </header>

      {/* Quick Child Filter Pills (Instant One-Click Child Switching) */}
      {wards.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-rose-500" /> Filter by Child:
          </span>
          <button
            type="button"
            onClick={() => setSelectedWardId('all')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedWardId === 'all'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>All Children</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedWardId === 'all' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {items.length}
            </span>
          </button>

          {wards.map((w) => {
            const isSelected = selectedWardId === String(w.id);
            const count = childNoticeCounts[String(w.id)] ?? 0;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWardId(String(w.id))}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{w.name}</span>
                <span
                  className={`rounded-md px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {w.class}
                  {w.section ? `-${w.section}` : ''}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected ? 'bg-white/30 text-white' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Child Context Bar */}
      {activeWard && (
        <div className="rounded-2xl border border-rose-200 bg-linear-to-r from-rose-50/80 to-white p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-sm shadow-xs">
              {activeWard.name ? activeWard.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{activeWard.name}</h3>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  Class {activeWard.class} {activeWard.section ? `· Section ${activeWard.section}` : ''}
                </span>
                {activeWard.admissionNo && (
                  <span className="text-[11px] font-mono text-slate-500 font-semibold">
                    Adm: {activeWard.admissionNo}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                Showing notices targeted to <strong>{activeWard.name}</strong>, Class <strong>{activeWard.class}</strong>, and school-wide announcements
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedWardId('all')}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 bg-white border border-rose-200 px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer transition hover:bg-rose-50"
          >
            Show All Children
          </button>
        </div>
      )}

      {/* Filter & Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search notices & circulars..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:border-rose-400 focus:bg-white focus:outline-none w-48 sm:w-64"
            />
          </div>

          <div className="flex items-center gap-1">
            {['all', 'urgent', 'meeting', 'academic', 'general'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
            >
              Mark all as read
            </button>
          )}

          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Clock3 className="h-3.5 w-3.5 text-rose-500" />
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading notices...'}
          </p>

          <button
            onClick={() => void loadNotifications(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || wardsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {/* Notices Feed */}
      <div className="space-y-3">
        {!loading && filteredItems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-rose-400" />
            <h2 className="mt-3 text-base font-extrabold text-slate-900">No school notices found</h2>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              {activeWard
                ? `No notices specifically targeting ${activeWard.name} (Class ${activeWard.class}) right now.`
                : searchQuery || categoryFilter !== 'all'
                ? 'No notices match your active search or category filter.'
                : 'New notices from your School Admin and teachers will appear here automatically.'}
            </p>
          </div>
        )}

        {filteredItems.map((item) => {
          const isUrgent = item.category?.toLowerCase() === 'urgent';
          const isMeeting = item.category?.toLowerCase() === 'meeting';
          const related = item.related_object || {};
          const targetClass = String(related.targetClass || related.class_name || '').trim();
          const targetSection = String(related.targetSection || related.section || '').trim();

          // Identify matching children for this notice
          const matchingWards = wards.filter((w) => isNoticeForWard(item, w));

          return (
            <article
              key={item.id}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-rose-200 ${
                item.readAt
                  ? 'border-slate-200'
                  : isUrgent
                  ? 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/20'
                  : 'border-rose-200 ring-1 ring-rose-100'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        isUrgent
                          ? 'bg-rose-600 text-white'
                          : isMeeting
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {item.category}
                    </span>

                    {/* Child Target Scope Badge */}
                    {targetClass ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
                        <GraduationCap className="h-3 w-3 text-indigo-500" />
                        Class {targetClass} {targetSection ? `(${targetSection})` : ''}
                        {matchingWards.length > 0 && (
                          <span className="font-semibold text-indigo-900">
                            · {matchingWards.map((w) => w.name).join(', ')}
                          </span>
                        )}
                      </span>
                    ) : matchingWards.length > 0 && matchingWards.length < wards.length ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                        <Users className="h-3 w-3 text-emerald-500" />
                        For {matchingWards.map((w) => w.name).join(', ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                        <Megaphone className="h-3 w-3 text-slate-500" />
                        School-Wide Announcement
                      </span>
                    )}

                    {!item.readAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                        New
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-base font-extrabold text-slate-900 flex items-center gap-2">
                    {isUrgent && <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />}
                    {item.title}
                  </h2>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 font-medium">
                    {item.body}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-400">
                    <span>From {item.senderName}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      at{' '}
                      {new Date(item.createdAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {!item.readAt && (
                  <button
                    onClick={() => void markRead(item.id)}
                    className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Mark as read
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
