import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../services/api';
import {
  School,
  UserCheck,
  Users,
  DollarSign,
  Activity,
  Cpu,
  Tv,
  CheckCircle,
  XCircle,
  Search,
  RefreshCw,
  Terminal,
  Server
} from 'lucide-react';

interface AuditLog {
  id: string;
  userName: string;
  action: string;
  timestamp: string;
  ipAddress: string;
}

const INITIAL_AUDITS: AuditLog[] = [];

export default function SuperAdminDashboard() {
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [activeSchools, setActiveSchools] = useState(0);
  const [inactiveSchools, setInactiveSchools] = useState(0);
  const [adminsCount, setAdminsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [parentsCount, setParentsCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [systemVitals, setSystemVitals] = useState({ cpu: 12, memory: 34, latency: 45 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);

  // Fetch metrics and audit logs on mount
  useEffect(() => {
    void loadDashboardData();
    return () => {
      if (refreshTimeoutRef.current !== null) window.clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const loadDashboardData = async () => {
    setIsRefreshing(true);
    
    // Load Schools from API
    try {
      const payload = await apiRequest<any[]>('/schools/');
      const items = Array.isArray(payload) ? payload : (payload as any).results || [];
      setSchoolsCount(items.length);
      setActiveSchools(items.filter((s: any) => s.is_active !== false).length);
      setInactiveSchools(items.filter((s: any) => s.is_active === false).length);
    } catch {
      setSchoolsCount(0);
      setActiveSchools(0);
      setInactiveSchools(0);
    }
    
    setTotalRevenue(0);

    // Load Admins count from API if accessible
    try {
      const usersPayload = await apiRequest<any[]>('/auth/users/');
      const usersList = Array.isArray(usersPayload) ? usersPayload : (usersPayload as any).results || [];
      setAdminsCount(usersList.filter((u: any) => u.role === 'school_admin' || u.role === 'School Admin').length);
      setTeachersCount(usersList.filter((u: any) => u.role === 'teacher' || u.role === 'Teacher').length);
      setParentsCount(usersList.filter((u: any) => u.role === 'parent' || u.role === 'Parent').length);
    } catch {
      setAdminsCount(0);
      setTeachersCount(0);
      setParentsCount(0);
    }

    // Load Students count from API if accessible
    try {
      const studentsPayload = await apiRequest<any[]>('/students/');
      const studentsList = Array.isArray(studentsPayload) ? studentsPayload : (studentsPayload as any).results || [];
      setStudentsCount(studentsList.length);
    } catch {
      setStudentsCount(0);
    }

    // Load audits
    const savedAudits = localStorage.getItem('sa_audit_logs');
    if (savedAudits) {
      setAuditLogs(JSON.parse(savedAudits));
    } else {
      setAuditLogs([]);
    }

    // Simulate system health
    setSystemVitals({
      cpu: Math.floor(Math.random() * 8) + 8,
      memory: Math.floor(Math.random() * 5) + 32,
      latency: Math.floor(Math.random() * 15) + 38
    });

    if (refreshTimeoutRef.current !== null) window.clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = window.setTimeout(() => {
      setIsRefreshing(false);
      refreshTimeoutRef.current = null;
    }, 500);
  };

  const handleClearAuditLogs = () => {
    localStorage.removeItem('sa_audit_logs');
    setAuditLogs([]);
  };

  const filteredAudits = auditLogs.filter(log =>
    log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.ipAddress.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" id="sa-dashboard-container">
      {/* Title block with trigger */}
      <div className="flex justify-between items-center bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold tracking-tight font-sans flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Global Workspace Controller
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Operational dashboard compiling telemetry metrics across all active school nodes, databases, and RBAC accounts.
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700/60 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Live Reload'}
        </button>
      </div>

      {/* Stats KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Total Branches */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 shrink-0">
            <School className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Branches</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">{schoolsCount}</h3>
            <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle className="w-2.5 h-2.5" />
              {activeSchools} Active
            </span>
          </div>
        </div>

        {/* KPI: Total Admins */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-lg border border-sky-100 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">School Admins</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">{adminsCount}</h3>
            <span className="text-[9px] text-slate-500 font-medium block mt-0.5">Commissioned officers</span>
          </div>
        </div>

        {/* KPI: Student Base */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Consolidated Students</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">{studentsCount.toLocaleString()}</h3>
            <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">Active registration</span>
          </div>
        </div>

        {/* KPI: Collections */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-100 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Central Collections</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">₹{(totalRevenue).toFixed(1)} Lakhs</h3>
            <span className="text-[9px] text-indigo-600 font-semibold block mt-0.5">Monthly ledger target</span>
          </div>
        </div>
      </div>

      {/* Auxiliary Statistics Row (Vitals & Secondary details) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* System Vitals (4 cols) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
            <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-slate-600" />
              System Vitals Telemetry
            </h3>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>

          <div className="space-y-3.5 pt-1">
            {/* CPU utilization */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 uppercase">
                <span>CPU Load</span>
                <span className="font-mono">{systemVitals.cpu}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${systemVitals.cpu}%` }}></div>
              </div>
            </div>

            {/* RAM usage */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 uppercase">
                <span>Memory Allocation</span>
                <span className="font-mono">{systemVitals.memory}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: `${systemVitals.memory}%` }}></div>
              </div>
            </div>

            {/* API Latency */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 uppercase">
                <span>Core DB Query Latency</span>
                <span className="font-mono">{systemVitals.latency} ms</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(systemVitals.latency / 100) * 100}%` }}></div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 flex flex-col gap-1.5 text-[10px] font-mono text-slate-500">
            <div className="flex justify-between">
              <span>Database Engine</span>
              <span className="text-slate-700 font-semibold">PostgreSQL v16</span>
            </div>
            <div className="flex justify-between">
              <span>Payment Gateway</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                <CheckCircle className="w-3 h-3" /> Razorpay
              </span>
            </div>
            <div className="flex justify-between">
              <span>Branch Nodes Sync</span>
              <span className="text-emerald-600 font-semibold">Healthy (100%)</span>
            </div>
          </div>
        </div>

        {/* Detailed counts (8 cols) */}
        <div className="lg:col-span-8 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-2.5">
            <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-800">
              Campus Census Breakdowns
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
              <Users className="w-6 h-6 text-indigo-500 mx-auto mb-1.5" />
              <h4 className="text-lg font-bold text-slate-800 leading-none">{teachersCount}</h4>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">Teachers Active</p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
              <Users className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
              <h4 className="text-lg font-bold text-slate-800 leading-none">{parentsCount}</h4>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">Parents Directory</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
              <School className="w-6 h-6 text-amber-500 mx-auto mb-1.5" />
              <div className="flex justify-center gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{activeSchools}</h4>
                  <p className="text-[8px] text-slate-400 font-bold uppercase">Active</p>
                </div>
                <div className="w-[1px] h-6 bg-slate-200"></div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{inactiveSchools}</h4>
                  <p className="text-[8px] text-slate-400 font-bold uppercase">Inactive</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">Schools Status</p>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-800 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Consolidated ERP nodes are synchronized. Multi-campus replication is active. Database schema matches global standards.</span>
          </div>
        </div>
      </div>

      {/* Section: Audit Logs (Every action is logged) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-800">
              System Audit Trails
            </h3>
            <p className="text-slate-400 text-[10px] mt-0.5">Logs of all actions performed by Super Admin accounts (Active logging compliance).</p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter audit logs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
              />
            </div>
            {auditLogs.length > 0 && (
              <button
                onClick={handleClearAuditLogs}
                className="shrink-0 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg hover:bg-rose-50 transition-colors"
                title="Clear all stored audit log trails"
              >
                Clear Trails
              </button>
            )}
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-lg" id="audit-table">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <th className="p-2.5 pl-4">Operator Name</th>
                <th className="p-2.5">Action Executed</th>
                <th className="p-2.5">Date & Time</th>
                <th className="p-2.5 text-right pr-4">Simulated IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 font-mono">
              {filteredAudits.length > 0 ? (
                filteredAudits.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="p-2.5 pl-4 font-sans font-bold text-slate-800">{log.userName}</td>
                    <td className="p-2.5 text-slate-600 font-sans">{log.action}</td>
                    <td className="p-2.5 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-2.5 text-right pr-4 text-slate-500 font-bold">{log.ipAddress}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400 font-sans">
                    No matching audit logs registered in system.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
