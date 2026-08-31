import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Edit,
  Trash,
  Lock,
  Unlock,
  Key,
  CheckCircle,
  XCircle,
  Search,
  Save,
  ShieldCheck,
  RefreshCw,
  School
} from 'lucide-react';
import { ACCESS_TOKEN_STORAGE_KEY, SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, decodeJWT } from '../../utils/auth';
import { apiRequest } from '../../services/api';

export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  schoolId: string; // Primordial school
  status: 'Active' | 'Inactive';
  locked?: boolean;
}

interface SchoolOption {
  id: string;
  name: string;
  isDemo: boolean;
}

interface AccountDirectoryItem {
  id: number;
  name: string;
  email: string;
  role: string;
  schoolId?: string;
  isActive?: boolean;
}

interface StoredUserItem {
  name: string;
  email: string;
  role: string;
  schoolId?: string;
  status?: string;
  locked?: boolean;
  permissions?: string[];
}

const toAdminRecord = (account: AccountDirectoryItem): AdminRecord => ({
  id: String(account.id),
  name: account.name,
  email: account.email,
  schoolId: account.schoolId || '',
  status: account.isActive === false ? 'Inactive' : 'Active',
  locked: false,
});

export default function SuperAdminAdmins() {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Password change states
  const [changingPasswordId, setChangingPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminRecord | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [createdAdminCredentials, setCreatedAdminCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [schoolLoadError, setSchoolLoadError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    schoolId: '',
    status: 'Active' as 'Active' | 'Inactive'
  });
  const isServerBacked = Boolean(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY));

  useEffect(() => {
    if (isServerBacked) {
      Promise.all([
        apiRequest<Array<{ id: number; schoolName: string; isDemo?: boolean }> | { results?: Array<{ id: number; schoolName: string; isDemo?: boolean }> }>('/schools/'),
        apiRequest<AccountDirectoryItem[]>('/auth/users/'),
      ])
        .then(([schoolPayload, accounts]) => {
          const payload = schoolPayload;
          const items = Array.isArray(payload) ? payload : payload.results || [];
          const serverSchools = items.map((school) => ({ id: String(school.id), name: school.schoolName, isDemo: Boolean(school.isDemo) }));
          const realSchools = serverSchools.filter((school) => !school.isDemo);
          setSchools(serverSchools);
          setAdmins(accounts
            .filter((account) => account.role === 'school_admin')
            .map(toAdminRecord));
          setForm((current) => current.schoolId ? current : { ...current, schoolId: realSchools[0]?.id || '' });
          setSchoolLoadError(realSchools.length ? '' : 'No real schools are available. Create a real school before creating its administrator.');
        })
        .catch(() => {
          setSchools([]);
          setAdmins([]);
          setSchoolLoadError('Unable to load schools from the server. Refresh the page and try again.');
        });
      return;
    }
    // Demo-only fallback when no authenticated API session exists.
    const savedSch = localStorage.getItem('sa_schools');
    if (savedSch) {
      const parsed = JSON.parse(savedSch);
      setSchools(Array.isArray(parsed) ? parsed : []);
    } else {
      setSchools([]);
    }

    // Load admins
    const savedAdm = localStorage.getItem('sa_admins');
    const filterEmails = ['delhi.admin@volpehub.education', 'mumbai.admin@volpehub.education', 'blr.admin@volpehub.education'];
    if (savedAdm) {
      try {
        const parsed = JSON.parse(savedAdm);
        const filtered = parsed.filter((adm: any) => !filterEmails.includes(adm.email?.toLowerCase()));
        if (filtered.length !== parsed.length) {
          localStorage.setItem('sa_admins', JSON.stringify(filtered));
        }
        setAdmins(filtered);
      } catch (e) {
        setAdmins([]);
      }
    } else {
      const defaultAdmins: AdminRecord[] = [];
      localStorage.setItem('sa_admins', JSON.stringify(defaultAdmins));
      setAdmins(defaultAdmins);
    }
  }, [isServerBacked]);

  const addAuditLog = (action: string) => {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    let operatorName = SUPER_ADMIN_NAME;
    if (token) {
      try {
        const decoded = decodeJWT(token);
        if (decoded) operatorName = decoded.name;
      } catch (e) {}
    }
    const newLog = {
      id: `audit-${Date.now()}`,
      userName: operatorName,
      action,
      timestamp: new Date().toISOString(),
      ipAddress: '157.45.192.' + Math.floor(Math.random() * 254 + 1)
    };
    const saved = localStorage.getItem('sa_audit_logs');
    const existing = saved ? JSON.parse(saved) : [];
    localStorage.setItem('sa_audit_logs', JSON.stringify([newLog, ...existing]));
  };

  const syncWithGlobalUsers = (updatedAdmins: AdminRecord[]) => {
    localStorage.setItem('sa_admins', JSON.stringify(updatedAdmins));
    setAdmins(updatedAdmins);

    // Sync to sa_users for login matching
    const savedUsersStr = localStorage.getItem('sa_users');
    let usersList: StoredUserItem[] = [];
    if (savedUsersStr) {
      usersList = JSON.parse(savedUsersStr);
    }

    // Process all admins to put them in usersList
    updatedAdmins.forEach(adm => {
      const existingUserIdx = usersList.findIndex((u) => u.email.toLowerCase() === adm.email.toLowerCase());
      const userPayload = {
        email: adm.email,
        name: adm.name,
        role: 'School Admin',
        schoolId: adm.schoolId,
        status: adm.status,
        locked: adm.locked || false,
        permissions: ['manage_school_data', 'manage_teachers', 'manage_fees', 'academic_year_promotion', 'developer_access']
      };

      if (existingUserIdx >= 0) {
        usersList[existingUserIdx] = { ...usersList[existingUserIdx], ...userPayload };
      } else {
        usersList.push(userPayload);
      }
    });

    // Remove deleted admins from usersList
    const adminEmails = updatedAdmins.map(a => a.email.toLowerCase());
    usersList = usersList.filter((u) => {
      if (u.role === 'School Admin') {
        return adminEmails.includes(u.email.toLowerCase()) || u.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      }
      return true;
    });

    localStorage.setItem('sa_users', JSON.stringify(usersList));
  };

  const handleToggleLock = (id: string) => {
    const s = admins.find(x => x.id === id);
    if (!s) return;

    const nextLocked = !s.locked;
    const updated = admins.map(item => {
      if (item.id === id) {
        return { ...item, locked: nextLocked };
      }
      return item;
    });

    addAuditLog(`${nextLocked ? 'Locked' : 'Unlocked'} School Admin account: ${s.name} (${s.email})`);
    syncWithGlobalUsers(updated);
  };

  const handleToggleStatus = async (id: string) => {
    const s = admins.find(x => x.id === id);
    if (!s) return;

    const nextStatus = s.status === 'Active' ? 'Inactive' : 'Active';
    if (nextStatus === 'Inactive' && !confirm(`Deactivate access for "${s.name}"? Their account will remain visible and can be reactivated later.`)) return;
    try {
      await apiRequest(`/auth/school-admins/${id}/${nextStatus === 'Active' ? 'reactivate' : 'deactivate'}/`, { method: 'POST' });
      setAdmins((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      addAuditLog(`${nextStatus === 'Active' ? 'Reactivated' : 'Deactivated'} School Admin access: ${s.name} (${s.email})`);
    } catch (error) {
      alert(error instanceof Error ? `Could not update School Admin access: ${error.message}` : 'Could not update School Admin access.');
    }
  };

  const handleManualPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingPasswordId || !newPassword) return;

    const s = admins.find(x => x.id === changingPasswordId);
    if (!s) return;

    if (!isServerBacked) {
      alert('Connect to the server as a Super Admin before changing a School Admin password.');
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest(`/auth/school-admins/${s.id}/set-password/`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      addAuditLog(`Set a temporary password for School Admin ${s.name} (${s.email})`);
      alert(`Password updated for School Admin "${s.name}". They must change it after signing in.`);
      setChangingPasswordId(null);
      setNewPassword('');
    } catch (error) {
      alert(error instanceof Error ? `Could not change School Admin password: ${error.message}` : 'Could not change School Admin password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAdmin = async () => {
    if (!deleteCandidate || deleteConfirmation !== deleteCandidate.email) return;
    setDeleting(true);
    try {
      await apiRequest(`/auth/school-admins/${deleteCandidate.id}/delete/`, { method: 'POST', body: JSON.stringify({ confirmation: deleteConfirmation }) });
      setAdmins((current) => current.filter((item) => item.id !== deleteCandidate.id));
      addAuditLog(`Permanently deleted School Admin account: ${deleteCandidate.name} (${deleteCandidate.email})`);
      setDeleteCandidate(null);
      setDeleteConfirmation('');
    } catch (error) {
      alert(error instanceof Error ? `Could not delete School Admin: ${error.message}` : 'Could not delete School Admin.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      if (form.password && form.password.length < 8) {
        alert('Password must be at least 8 characters.');
        return;
      }
      // Editing Admin Profile
      const s = admins.find(x => x.id === editingId);
      if (!s) return;

      const updated = admins.map(item => {
        if (item.id === editingId) {
          return {
            ...item,
            name: form.name,
            email: form.email,
            schoolId: form.schoolId,
            status: form.status
          };
        }
        return item;
      });
      addAuditLog(`Updated profile details for School Admin: ${form.name} (${form.email})`);
      syncWithGlobalUsers(updated);
      setEditingId(null);
    } else {
      if (isServerBacked) {
        if (!form.schoolId) {
          alert('Select a school before creating a School Admin account.');
          return;
        }
        try {
          const created = await apiRequest<AccountDirectoryItem & { loginCredentials?: { loginId: string; temporaryPassword: string } }>('/auth/school-admins/', { method: 'POST', body: JSON.stringify({ name: form.name, schoolId: form.schoolId, status: form.status }) });
          setAdmins((current) => [...current, toAdminRecord(created)]);
          setCreatedAdminCredentials({
            name: created.name,
            email: created.loginCredentials?.loginId || created.email,
            password: created.loginCredentials?.temporaryPassword || '',
          });
          setIsAdding(false);
          setForm({ name: '', email: '', password: '', schoolId: schools.find((school) => !school.isDemo)?.id || '', status: 'Active' });
          return;
        } catch (error) {
          alert(error instanceof Error ? `School Admin account could not be saved: ${error.message}` : 'School Admin account could not be saved to the server.');
          return;
        }
      }
      if (!form.password || form.password.length < 8) {
        alert('Please manually enter a password with at least 8 characters for this School Admin.');
        return;
      }
      // Commissioning Admin
      const newAdmin: AdminRecord = {
        id: `adm-${Date.now()}`,
        name: form.name,
        email: form.email,
        schoolId: form.schoolId,
        status: form.status,
        locked: false
      };
      const updated = [...admins, newAdmin];
      addAuditLog(`Commissioned and registered School Admin: ${form.name} (${form.email})`);
      syncWithGlobalUsers(updated);
      setIsAdding(false);
      setCreatedAdminCredentials({ name: form.name, email: form.email, password: form.password });
    }

    // Reset Form
    setForm({
      name: '',
      email: '',
      password: '',
      schoolId: schools.find((school) => !school.isDemo)?.id || '',
      status: 'Active'
    });
  };

  const startEdit = (admin: AdminRecord) => {
    setEditingId(admin.id);
    setForm({
      name: admin.name,
      email: admin.email,
      password: '',
      schoolId: admin.schoolId,
      status: admin.status
    });
    setIsAdding(true);
  };

  const filteredAdmins = admins.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" id="sa-admins-container">
      {deleteCandidate && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="font-bold text-rose-700">Permanently delete School Admin</h2>
          <p className="mt-3 text-sm text-slate-600">This deletes only <strong>{deleteCandidate.email}</strong>. The school and all student, teacher, attendance, and exam data remain unchanged.</p>
          <label className="mt-5 block text-xs font-bold text-slate-700">Type the School Admin email to confirm</label>
          <input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="mt-5 flex justify-end gap-2"><button onClick={() => { setDeleteCandidate(null); setDeleteConfirmation(''); }} disabled={deleting} className="rounded-lg border px-3 py-2 text-sm">Cancel</button><button onClick={deleteAdmin} disabled={deleteConfirmation !== deleteCandidate.email || deleting} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{deleting ? 'Deleting…' : 'Delete Admin'}</button></div>
        </div>
      </div>}
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
            School Administrators & Commissioners
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Appoint regional commissioners, manage credentials lockouts, and allocate school control bounds.</p>
        </div>

        <button
          onClick={() => {
            setEditingId(null);
            setForm({ name: '', email: '', password: '', schoolId: schools[0]?.id || 'sch-1', status: 'Active' });
            setIsAdding(!isAdding);
          }}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? 'Cancel Commission' : 'Commission School Admin'}
        </button>
      </div>

      {/* Manual Password Dialog */}
      {createdAdminCredentials && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm max-w-xl">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="flex-1">
              <h4 className="text-xs font-extrabold uppercase tracking-wide">Commissioner login credentials</h4>
              <p className="mt-1 text-[11px] text-emerald-700">Copy and share securely with {createdAdminCredentials.name}.</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-mono text-slate-800">
{`Email: ${createdAdminCredentials.email}
Password: ${createdAdminCredentials.password}`}
              </pre>
              <button
                onClick={() => navigator.clipboard?.writeText(`Email: ${createdAdminCredentials.email}\nPassword: ${createdAdminCredentials.password}`)}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Copy credentials
              </button>
            </div>
            <button onClick={() => setCreatedAdminCredentials(null)} className="text-xs font-bold text-emerald-700">Dismiss</button>
          </div>
        </div>
      )}

      {changingPasswordId && (
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm max-w-md space-y-3">
          <div className="flex items-start gap-2.5">
            <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-sans font-bold text-xs text-amber-800">Change School Admin Password</h4>
              <p className="text-[10px] text-amber-600 mt-0.5">Specify a custom secure password override for this administrative clearance.</p>
            </div>
          </div>
          <form onSubmit={handleManualPasswordChange} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">New Secure Password</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={10}
                placeholder="Type password..."
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg focus:outline-indigo-500 text-slate-800"
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setChangingPasswordId(null); setNewPassword(''); }}
                disabled={savingPassword}
                className="bg-slate-200 text-slate-600 font-bold px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 shadow-2xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPassword ? 'Updating…' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Form Card */}
      {isAdding && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm max-w-2xl animate-fade-in" id="admin-form">
          <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2.5 mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-500" />
            {editingId ? 'Edit Administrative Clearance' : 'Commission New School Administrator'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            {schoolLoadError && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{schoolLoadError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Officer Full Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Dr. Ramesh Chidambaram"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>
              {isServerBacked ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
                  The login ID is generated automatically from this name and the selected real school.
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Login Email Address</label>
                  <input
                    required
                    type="email"
                    placeholder="e.g. ramesh.c@volpehub.education"
                    value={form.email}
                    disabled={editingId !== null}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono disabled:opacity-60"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Primary Assigned Campus</label>
                <select
                  required
                  value={form.schoolId}
                  onChange={e => setForm({ ...form, schoolId: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 cursor-pointer font-sans"
                >
                  <option value="">-- Choose Branch --</option>
                  {schools.filter((school) => !school.isDemo).map(sch => (
                    <option key={sch.id} value={sch.id}>{sch.name}</option>
                  ))}
                </select>
              </div>
              {isServerBacked ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                  A strong temporary password is generated securely and shown once after creation. The School Admin must change it on first login.
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {editingId ? 'New Password (optional)' : 'Manual Login Password'}
                  </label>
                  <input
                    required={!editingId}
                    minLength={8}
                    type="text"
                    placeholder={editingId ? 'Leave blank to keep old password' : 'Enter permanent password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Operational Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 cursor-pointer font-sans"
                >
                  <option value="Active">Active Clearance</option>
                  <option value="Inactive">Deactivated Clearance</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingId(null);
                }}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isServerBacked && schools.filter((school) => !school.isDemo).length === 0}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {editingId ? 'Save Profile' : 'Commission Officer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Filter officers by name or credentials identifier..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full text-xs bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 shadow-xs"
        />
      </div>

      {/* Administrators Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" id="sa-admins-list-table">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <th className="p-3.5 pl-5">Officer Name</th>
              <th className="p-3.5">Email / Login ID</th>
              <th className="p-3.5">Allocated Branch</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Security Gate</th>
              <th className="p-3.5 text-right pr-5">Clearance Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-sans">
            {filteredAdmins.map(adm => {
              const bBranch = schools.find(x => x.id === adm.schoolId);
              return (
                <tr key={adm.id} className={`hover:bg-slate-50/50 ${adm.status === 'Inactive' ? 'bg-slate-50 text-slate-400 opacity-70' : adm.locked ? 'bg-rose-50/30' : ''}`}>
                  <td className="p-3.5 pl-5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center text-xs">
                        {adm.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">{adm.name}</span>
                        {adm.locked && (
                          <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.2 rounded-md font-bold uppercase tracking-wide block w-fit mt-0.5">
                            LOCKED OUT
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-slate-600">{adm.email}</td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                      <School className="w-3.5 h-3.5 text-slate-400" />
                      {bBranch ? bBranch.name : 'All Campuses (SAD)'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        adm.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : 'bg-rose-50 text-rose-500 border-rose-100'
                      }`}
                    >
                      {adm.status}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      SCHOOL_ADMIN
                    </span>
                  </td>
                  <td className="p-3.5 text-right pr-5">
                    <div className="flex items-center justify-end gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {/* Edit profiles */}
                      <button
                        onClick={() => startEdit(adm)}
                        className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer px-1"
                        title="Configure Profile"
                      >
                        Edit
                      </button>

                      {/* Lock Toggle */}
                      <button
                        onClick={() => handleToggleLock(adm.id)}
                        className={`transition-colors cursor-pointer px-1 flex items-center gap-0.5 ${
                          adm.locked ? 'text-emerald-600 hover:text-emerald-800' : 'text-amber-600 hover:text-amber-800'
                        }`}
                        title={adm.locked ? 'Unlock Account' : 'Lock Account'}
                      >
                        {adm.locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {adm.locked ? 'Unlock' : 'Lock'}
                      </button>

                      <button
                        onClick={() => handleToggleStatus(adm.id)}
                        className={adm.status === 'Active' ? 'text-rose-600 hover:text-rose-800 transition-colors cursor-pointer px-1' : 'text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer px-1'}
                        title={adm.status === 'Active' ? 'Deactivate School Admin access' : 'Reactivate School Admin access'}
                      >
                        {adm.status === 'Active' ? 'Revoke Access' : 'Reactivate'}
                      </button>

                      <button
                        onClick={() => setChangingPasswordId(adm.id)}
                        className="text-slate-500 hover:text-slate-700 transition-colors cursor-pointer px-1"
                        title="Override Password"
                      >
                        Set Pass
                      </button>

                      <button
                        onClick={() => { setDeleteCandidate(adm); setDeleteConfirmation(''); }}
                        className="text-rose-600 hover:text-rose-800 transition-colors cursor-pointer px-1"
                        title="Permanently delete this School Admin account"
                      >
                        Delete
                      </button>

                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredAdmins.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  No School Admin records match your query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
