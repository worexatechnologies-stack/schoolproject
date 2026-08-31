import React, { useState, useEffect } from 'react';
import {
  Settings,
  UserCheck,
  Save,
  Key,
  Calendar,
  Layers,
  FileText,
  Percent,
  CheckSquare,
  Mail,
  CreditCard,
  Database,
  Lock,
  Plus,
  Trash,
  CheckCircle,
  AlertTriangle,
  SlidersHorizontal,
  ToggleLeft
} from 'lucide-react';
import { ACCESS_TOKEN_STORAGE_KEY, SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, SUPER_ADMIN_PASSWORD, decodeJWT } from '../../utils/auth';

const DEFAULT_SETTINGS = {
  schoolName: 'Volpehub Education',
  schoolPrefix: 'SAD',
  operatingHoursStart: '08:00',
  operatingHoursEnd: '14:30',
  holidays: ['Saturday', 'Sunday'],
  minAttendancePercent: 75,
  absentAutoSMS: true,
  smsTemplate: 'Dear Parent, your ward [STUDENT_NAME] was marked ABSENT today. Please contact principal office.',
  gpaScale: '10.0',
  pushAlerts: true,
  emailAlerts: true,
  smtpHost: 'smtp.volpehub.education',
  senderID: 'SANSKR',
  paymentGatewayMode: 'Sandbox',
  razorpayKeyId: 'rzp_test_9281a8F83ha8',
  razorpayKeySecret: '••••••••••••••••••••••••',
  backupSchedule: 'Daily',
  backupDestination: 'GCS Bucket: erp-backups-main',
  backupRetentionDays: 30,
  minPasswordLength: 8,
  lockoutAttempts: 3,
  require2FAForAdmins: false
};

const DEFAULT_MODULES = [
  { id: 'admissions', name: 'Admissions & Student Information', description: 'Student profiles, guardians, documents and academic history.', enabled: true },
  { id: 'academics', name: 'Academics & Timetable', description: 'Classes, subjects, schedules, attendance and examinations.', enabled: true },
  { id: 'finance', name: 'Fees & Finance', description: 'Fee structures, invoices, receipts and family fee views.', enabled: true },
  { id: 'communications', name: 'Communication Centre', description: 'Notices, parent communication and private chats.', enabled: true },
  { id: 'transport', name: 'Transport Safety Centre', description: 'Routes, live location integrations, pickup/drop alerts and route history.', enabled: true },
  { id: 'library', name: 'Library', description: 'Issue desk, books and learner borrowing records.', enabled: true },
  { id: 'learning', name: 'Learning Hub', description: 'Learning content and student-facing academic resources.', enabled: true },
];

export default function SuperAdminSystemSettings() {
  const [activeSection, setActiveSection] = useState<string>('profile');
  const [profileName, setProfileName] = useState(SUPER_ADMIN_NAME);
  const [profilePassword, setProfilePassword] = useState(SUPER_ADMIN_PASSWORD);
  
  // Custom Dynamic Arrays for Fees and Exams
  const [feeCategories, setFeeCategories] = useState<string[]>([]);
  const [newFeeCat, setNewFeeCat] = useState('');
  const [examTypes, setExamTypes] = useState<string[]>([]);
  const [newExamType, setNewExamType] = useState('');

  // General Settings Object
  const [sysSettings, setSysSettings] = useState(DEFAULT_SETTINGS);
  const [modules, setModules] = useState(DEFAULT_MODULES);

  useEffect(() => {
    // Load active settings from local storage if available
    const savedSettings = localStorage.getItem('sa_system_settings');
    if (savedSettings) {
      setSysSettings(JSON.parse(savedSettings));
    } else {
      localStorage.setItem('sa_system_settings', JSON.stringify(DEFAULT_SETTINGS));
    }

    const savedModules = localStorage.getItem('sa_feature_modules');
    if (savedModules) setModules(JSON.parse(savedModules));
    else localStorage.setItem('sa_feature_modules', JSON.stringify(DEFAULT_MODULES));

    // Load Super Admin profile details from sa_users
    const savedUsers = localStorage.getItem('sa_users');
    if (savedUsers) {
      const usersList = JSON.parse(savedUsers);
      const superAdmin = usersList.find((u: any) => String(u.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
      if (superAdmin) {
        setProfileName(superAdmin.name);
        setProfilePassword(superAdmin.password || SUPER_ADMIN_PASSWORD);
      }
    }

    // Load Fee Categories
    const savedFees = localStorage.getItem('sa_fee_categories');
    if (savedFees) {
      setFeeCategories(JSON.parse(savedFees));
    } else {
      const defaultFees = ['Tuition', 'Transport', 'Exam', 'Admission', 'Library', 'Sports', 'Laboratories'];
      localStorage.setItem('sa_fee_categories', JSON.stringify(defaultFees));
      setFeeCategories(defaultFees);
    }

    // Load Exam Types
    const savedExams = localStorage.getItem('sa_exam_types');
    if (savedExams) {
      setExamTypes(JSON.parse(savedExams));
    } else {
      const defaultExams = ['Midterm Test', 'Final Exams', 'Quarterly Assessment', 'Class Unit Quiz', 'Practical Exams'];
      localStorage.setItem('sa_exam_types', JSON.stringify(defaultExams));
      setExamTypes(defaultExams);
    }
  }, []);

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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const savedUsersStr = localStorage.getItem('sa_users');
    if (savedUsersStr) {
      const list = JSON.parse(savedUsersStr);
      const updated = list.map((u: any) => {
        if (String(u.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          return { ...u, name: profileName, password: profilePassword };
        }
        return u;
      });
      localStorage.setItem('sa_users', JSON.stringify(updated));
      addAuditLog(`Updated profile details and password credentials for Super Admin account.`);
      alert('SUCCESS:\n\nSuper Admin profile particulars and password changed. Your login parameters are updated!');
    }
  };

  const handleSaveFeeCategories = () => {
    localStorage.setItem('sa_fee_categories', JSON.stringify(feeCategories));
    addAuditLog('Updated global system Fee Categories array.');
    alert('SUCCESS:\n\nFee categories configuration array persisted.');
  };

  const handleSaveExamTypes = () => {
    localStorage.setItem('sa_exam_types', JSON.stringify(examTypes));
    addAuditLog('Updated global system Exam Types list.');
    alert('SUCCESS:\n\nExam types categories persisted.');
  };

  const handleSaveGeneralSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('sa_system_settings', JSON.stringify(sysSettings));
    addAuditLog('Updated global ERP configuration parameters.');
    alert('SUCCESS:\n\nGlobal system settings updated successfully.');
  };

  const addFeeCat = () => {
    if (!newFeeCat) return;
    if (feeCategories.includes(newFeeCat)) return;
    setFeeCategories([...feeCategories, newFeeCat]);
    setNewFeeCat('');
  };

  const removeFeeCat = (cat: string) => {
    setFeeCategories(feeCategories.filter(c => c !== cat));
  };

  const addExamType = () => {
    if (!newExamType) return;
    if (examTypes.includes(newExamType)) return;
    setExamTypes([...examTypes, newExamType]);
    setNewExamType('');
  };

  const removeExamType = (type: string) => {
    setExamTypes(examTypes.filter(t => t !== type));
  };

  const saveModules = () => {
    localStorage.setItem('sa_feature_modules', JSON.stringify(modules));
    addAuditLog('Updated school feature module availability controls.');
    alert('SUCCESS:\n\nModule availability has been saved.');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row min-h-[500px]" id="sa-settings-hub">
      {/* Side Tabs for settings */}
      <div className="md:w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-1.5 flex-none font-sans">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-3 block">System Parameters</h3>
        
        <button
          onClick={() => setActiveSection('profile')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'profile' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Super Admin Profile
        </button>

        <button
          onClick={() => setActiveSection('franchise')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'franchise' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          Franchise Parameters
        </button>

        <button
          onClick={() => setActiveSection('academic')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'academic' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Academic & Grading
        </button>

        <button
          onClick={() => setActiveSection('billing')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'billing' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Gateway & Billing
        </button>

        <button
          onClick={() => setActiveSection('notifications')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'notifications' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <Mail className="w-4 h-4" />
          Gateways & Alerts
        </button>

        <button
          onClick={() => setActiveSection('security')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'security' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <Lock className="w-4 h-4" />
          Security Lockouts
        </button>

        <button
          onClick={() => setActiveSection('modules')}
          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'modules' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Feature Modules
        </button>
      </div>

      {/* Main Settings Form Container */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        {/* Section: Profile */}
        {activeSection === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6 animate-fade-in" id="profile-settings">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Change Super Admin Password & Profile</h3>
              <p className="text-slate-400 text-xs mt-0.5">Secure your root credential nodes and update administrator display details.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Administrator display name</label>
                <input
                  required
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">System Clearance Email ID</label>
                <input
                  disabled
                  type="email"
                  value={SUPER_ADMIN_EMAIL}
                  className="w-full text-xs bg-slate-100 border border-slate-200 p-2.5 rounded-lg text-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Clearance Access Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    required
                    type="text"
                    value={profilePassword}
                    onChange={e => setProfilePassword(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 pl-10 pr-3 py-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Update Profile Credentials
              </button>
            </div>
          </form>
        )}

        {/* Section: Franchise Details */}
        {activeSection === 'franchise' && (
          <form onSubmit={handleSaveGeneralSettings} className="space-y-6 animate-fade-in" id="franchise-settings">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Configure School Settings</h3>
              <p className="text-slate-400 text-xs mt-0.5">Define weekly default operating hours, physical calendars, and campus code prefixes.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Consolidated School Name</label>
                <input
                  required
                  type="text"
                  value={sysSettings.schoolName}
                  onChange={e => setSysSettings({ ...sysSettings, schoolName: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Code Monogram Prefix</label>
                <input
                  required
                  type="text"
                  value={sysSettings.schoolPrefix}
                  onChange={e => setSysSettings({ ...sysSettings, schoolPrefix: e.target.value.toUpperCase() })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Daily Rollcall Starts</label>
                <input
                  required
                  type="time"
                  value={sysSettings.operatingHoursStart}
                  onChange={e => setSysSettings({ ...sysSettings, operatingHoursStart: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Classes End Bell</label>
                <input
                  required
                  type="time"
                  value={sysSettings.operatingHoursEnd}
                  onChange={e => setSysSettings({ ...sysSettings, operatingHoursEnd: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save School Configuration
              </button>
            </div>
          </form>
        )}

        {/* Section: Academic Settings */}
        {activeSection === 'academic' && (
          <div className="space-y-6 animate-fade-in" id="academic-settings">
            <form onSubmit={handleSaveGeneralSettings} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Academic Governance</h3>
                <p className="text-slate-400 text-xs mt-0.5">Each school controls its database-backed years, classes, sections, and subjects from the School Admin Academic Setup page.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-800">
                  Academic years are intentionally tenant-scoped. Sign in as the School Admin for a branch to create or activate its academic year.
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Attendance Roster Rule (%)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    value={sysSettings.minAttendancePercent}
                    onChange={e => setSysSettings({ ...sysSettings, minAttendancePercent: parseInt(e.target.value) })}
                    className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Grading GPA Scale System</label>
                  <select
                    value={sysSettings.gpaScale}
                    onChange={e => setSysSettings({ ...sysSettings, gpaScale: e.target.value })}
                    className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 cursor-pointer font-sans"
                  >
                    <option value="10.0">10.0 Cumulative Grade Point Average (CGPA)</option>
                    <option value="4.0">4.0 Grade Point Average (GPA)</option>
                    <option value="100%">100% Direct Percent Marks System</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs"
                >
                  Save Academic Parameters
                </button>
              </div>
            </form>

            {/* Configure Fee Categories List */}
            <div className="border-t border-slate-100 pt-6 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configure Fee Categories</h4>
                <p className="text-[10px] text-slate-400">Add or clear default categories loaded across invoices.</p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Laboratory Charges"
                  value={newFeeCat}
                  onChange={e => setNewFeeCat(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 flex-1 max-w-sm"
                />
                <button
                  type="button"
                  onClick={addFeeCat}
                  className="flex items-center gap-1 bg-slate-800 text-white hover:bg-slate-700 text-xs font-bold px-3 py-2 rounded-lg"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {feeCategories.map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                    {cat}
                    <button onClick={() => removeFeeCat(cat)} className="text-slate-400 hover:text-rose-600 font-sans font-bold">×</button>
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveFeeCategories}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Persist Fee Categories
              </button>
            </div>

            {/* Configure Exam Types List */}
            <div className="border-t border-slate-100 pt-6 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configure Exam Types</h4>
                <p className="text-[10px] text-slate-400">Set exam assessment types commissioned across teachers' gradebooks.</p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Half Yearly Examinations"
                  value={newExamType}
                  onChange={e => setNewExamType(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 flex-1 max-w-sm"
                />
                <button
                  type="button"
                  onClick={addExamType}
                  className="flex items-center gap-1 bg-slate-800 text-white hover:bg-slate-700 text-xs font-bold px-3 py-2 rounded-lg"
                >
                  <Plus className="w-4 h-4" /> Add Exam
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {examTypes.map(type => (
                  <span key={type} className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                    {type}
                    <button onClick={() => removeExamType(type)} className="text-slate-400 hover:text-rose-600 font-sans font-bold">×</button>
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveExamTypes}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Persist Exam Types
              </button>
            </div>
          </div>
        )}

        {/* Section: Billing / Payment Gateway */}
        {activeSection === 'billing' && (
          <form onSubmit={handleSaveGeneralSettings} className="space-y-6 animate-fade-in" id="billing-settings">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Configure Payment Gateway (Razorpay)</h3>
              <p className="text-slate-400 text-xs mt-0.5">Enable or configure secure Razorpay checkout terminals for automated student fees collection.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Operational Mode</label>
                <select
                  value={sysSettings.paymentGatewayMode}
                  onChange={e => setSysSettings({ ...sysSettings, paymentGatewayMode: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 cursor-pointer font-sans"
                >
                  <option value="Sandbox">Sandbox / Test Transactions Mode</option>
                  <option value="Live">Live / Real Production Clearing</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Webhooks Endpoint URI</label>
                <input
                  disabled
                  type="text"
                  value="https://api.volpehub.education/payments/razorpay/webhook-handler"
                  className="w-full text-xs bg-slate-100 border border-slate-200 p-2.5 rounded-lg text-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Razorpay Key ID</label>
                <input
                  required
                  type="text"
                  value={sysSettings.razorpayKeyId}
                  onChange={e => setSysSettings({ ...sysSettings, razorpayKeyId: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Razorpay Secret Key</label>
                <input
                  required
                  type="password"
                  value={sysSettings.razorpayKeySecret}
                  onChange={e => setSysSettings({ ...sysSettings, razorpayKeySecret: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[10px] font-medium text-emerald-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Razorpay API checkout endpoints are active in Sandbox Mode. Payment cards will clear simulated UPI receipts.</span>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Update Payment Parameters
              </button>
            </div>
          </form>
        )}

        {/* Section: Gateways & SMS Alerts */}
        {activeSection === 'notifications' && (
          <form onSubmit={handleSaveGeneralSettings} className="space-y-6 animate-fade-in" id="notification-settings">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Configure Email & SMS Settings</h3>
              <p className="text-slate-400 text-xs mt-0.5">Integrate centralized Twilio SMS or SMTP servers for daily absences or progress alerts.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Twilio SMS Sender ID</label>
                <input
                  required
                  type="text"
                  value={sysSettings.senderID}
                  onChange={e => setSysSettings({ ...sysSettings, senderID: e.target.value.toUpperCase() })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Corporate SMTP SMTPHost</label>
                <input
                  required
                  type="text"
                  value={sysSettings.smtpHost}
                  onChange={e => setSysSettings({ ...sysSettings, smtpHost: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sms-auto"
                  checked={sysSettings.absentAutoSMS}
                  onChange={e => setSysSettings({ ...sysSettings, absentAutoSMS: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="sms-auto" className="text-xs text-slate-600 font-bold uppercase tracking-wider cursor-pointer">
                  Trigger Automated Twilio SMS to guardian on absent roll call
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Roll Call Absence SMS Template</label>
              <textarea
                required
                rows={3}
                value={sysSettings.smsTemplate}
                onChange={e => setSysSettings({ ...sysSettings, smsTemplate: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-sans"
              />
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Update Communication Channels
              </button>
            </div>
          </form>
        )}

        {/* Section: Security Policies */}
        {activeSection === 'security' && (
          <form onSubmit={handleSaveGeneralSettings} className="space-y-6 animate-fade-in" id="security-settings">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Configure Security Policies</h3>
              <p className="text-slate-400 text-xs mt-0.5">Enforce global password strength, lockout limits, backups, and authorization policies.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Minimum password key length</label>
                <input
                  required
                  type="number"
                  min="6"
                  max="32"
                  value={sysSettings.minPasswordLength}
                  onChange={e => setSysSettings({ ...sysSettings, minPasswordLength: parseInt(e.target.value) })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Max password attempts before Lockout</label>
                <input
                  required
                  type="number"
                  min="3"
                  max="10"
                  value={sysSettings.lockoutAttempts}
                  onChange={e => setSysSettings({ ...sysSettings, lockoutAttempts: parseInt(e.target.value) })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Database Snapshot Schedule</label>
                <select
                  value={sysSettings.backupSchedule}
                  onChange={e => setSysSettings({ ...sysSettings, backupSchedule: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 cursor-pointer font-sans"
                >
                  <option value="Hourly">Hourly Incremental Snapshots</option>
                  <option value="Daily">Daily Full Replication Backups</option>
                  <option value="Weekly">Weekly System Archives</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Snapshot Retention Days</label>
                <input
                  required
                  type="number"
                  min="7"
                  max="365"
                  value={sysSettings.backupRetentionDays}
                  onChange={e => setSysSettings({ ...sysSettings, backupRetentionDays: parseInt(e.target.value) })}
                  className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Replication Destination Storage Bucket</label>
              <input
                required
                type="text"
                value={sysSettings.backupDestination}
                onChange={e => setSysSettings({ ...sysSettings, backupDestination: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-indigo-500 text-slate-800 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sec-2fa"
                checked={sysSettings.require2FAForAdmins}
                onChange={e => setSysSettings({ ...sysSettings, require2FAForAdmins: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="sec-2fa" className="text-xs text-slate-600 font-bold uppercase tracking-wider cursor-pointer">
                Enforce multi-factor verification (2FA) for administrators
              </label>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Commit Lockout & Backup Policies
              </button>
            </div>
          </form>
        )}
        {activeSection === 'modules' && (
          <section className="space-y-6 animate-fade-in" id="module-controls">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-bold text-slate-900">School feature modules</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Configure the rollout of operational modules across your platform. This makes it possible to launch a focused school workspace, then enable additional capabilities when the school is ready.</p></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700"><ToggleLeft className="h-3.5 w-3.5" /> Rollout controls</span></div>
            <div className="grid gap-3">{modules.map((module) => <article key={module.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-slate-900">{module.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p></div><button type="button" onClick={() => setModules((current) => current.map((item) => item.id === module.id ? { ...item, enabled: !item.enabled } : item))} className={`inline-flex min-w-24 items-center justify-center rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${module.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{module.enabled ? 'Enabled' : 'Disabled'}</button></article>)}</div>
            <div className="flex justify-end border-t border-slate-100 pt-5"><button type="button" onClick={saveModules} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"><Save className="h-4 w-4" />Save module controls</button></div>
          </section>
        )}
      </div>
    </div>
  );
}
