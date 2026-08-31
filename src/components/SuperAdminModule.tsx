import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ACCESS_TOKEN_STORAGE_KEY, SUPER_ADMIN_NAME, decodeJWT } from '../utils/auth';

// Modular Sub-components
import SuperAdminDashboard from './super-admin/SuperAdminDashboard';
import SuperAdminSchools from './super-admin/SuperAdminSchools';
import SuperAdminAdmins from './super-admin/SuperAdminAdmins';
import SuperAdminSystemSettings from './super-admin/SuperAdminSystemSettings';

interface SuperAdminModuleProps {
  activeTab?: string;
}

export default function SuperAdminModule({ activeTab = 'super-admin-dashboard' }: SuperAdminModuleProps) {
  const [operatorName, setOperatorName] = useState(SUPER_ADMIN_NAME);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (token) {
      try {
        const decoded = decodeJWT(token);
        if (decoded) setOperatorName(decoded.name);
      } catch (e) {
        // ignore
      }
    }
  }, []);


  return (
    <div className="space-y-6 font-sans" id="super-admin-workspace">
      {/* Upper Global Tenant Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-5 rounded-xl text-white shadow-sm border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 uppercase tracking-widest font-mono">
              Root Level Session
            </span>
          </div>
          <h1 className="text-base font-bold tracking-tight mt-1">
            Super Admin Global Workspace
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Operational Clearance: {operatorName} - Connected to ERP Core Engine.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 text-xs font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
          <span>TENANT: SECURED</span>
        </div>
      </div>

      {/* Render matching child view based on activeTab */}
      <div className="transition-all duration-300">
        {activeTab === 'super-admin-dashboard' && <SuperAdminDashboard />}
        {activeTab === 'super-admin-schools' && <SuperAdminSchools />}
        {activeTab === 'super-admin-admins' && <SuperAdminAdmins />}
        {activeTab === 'super-admin-sys-settings' && <SuperAdminSystemSettings />}
      </div>
    </div>
  );
}
