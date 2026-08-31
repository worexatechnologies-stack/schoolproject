import React, { useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { AuthUser } from '../utils/auth';
import { BrandSettings, UserRole } from '../types';
import { useLoginMutation } from '../store/api/authApi';
import { persistAuthSession } from '../store/api/baseApi';
import WorexaLogo from './WorexaLogo';
import schoolPortalHero from '../assets/school-portal-hero.png';
import './LoginScreen.css';

interface LoginScreenProps { onLogin: (user: AuthUser, token: string) => void; brandSettings?: BrandSettings; onPublicAccess?: () => void; }

const roles: UserRole[] = ['Super Admin', 'School Admin', 'Teacher', 'Parent', 'Student'];
const roleNames: Record<string, string> = { 'Super Admin': 'Platform', 'School Admin': 'Admin', Teacher: 'Teacher', Parent: 'Parent', Student: 'Student' };

// Map both raw backend role keys (school_admin, teacher, parent, student, super_admin)
// and display role names ('School Admin', 'Teacher', ...) to a single canonical key.
const roleToKey: Record<string, string> = {
  'Super Admin': 'super_admin',
  super_admin: 'super_admin',
  'School Admin': 'school_admin',
  school_admin: 'school_admin',
  Teacher: 'teacher',
  teacher: 'teacher',
  Parent: 'parent',
  parent: 'parent',
  Student: 'student',
  student: 'student',
  PUBLIC_LEARNER: 'public_learner',
  public_learner: 'public_learner',
};

const roleDisplay: Record<string, string> = {
  super_admin: 'Super Admin',
  school_admin: 'School Admin',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  public_learner: 'Public Learner',
};

// Only the Super Admin portal is pre-filled, and solely from environment
// variables (VITE_SUPER_ADMIN_EMAIL / VITE_SUPER_ADMIN_PASSWORD). No demo
// accounts are embedded in the frontend; every other role requires real,
// server-provisioned credentials. Keep these in sync with the backend
// BOOTSTRAP_SUPERADMIN_* values.
const SUPER_ADMIN_EMAIL = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
const SUPER_ADMIN_PASSWORD = (import.meta.env.VITE_SUPER_ADMIN_PASSWORD || '').trim();

const PRESET_CREDENTIALS: Record<string, { email: string; password: string }> = {};
if (SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD) {
  PRESET_CREDENTIALS['Super Admin'] = { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD };
}

export default function LoginScreen({ onLogin, brandSettings, onPublicAccess }: LoginScreenProps) {
  const [activeRole, setActiveRole] = useState<UserRole>('School Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginMutation, { isLoading }] = useLoginMutation();
  const schoolName = brandSettings?.schoolName || 'School ERP';

  const changeRole = (role: UserRole) => {
    setActiveRole(role);
    const preset = PRESET_CREDENTIALS[role];
    if (preset) {
      setEmail(preset.email);
      setPassword(preset.password);
    } else {
      setEmail('');
      setPassword('');
    }
    setErrorMessage('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) { setErrorMessage('Please enter your email and password.'); return; }
    setErrorMessage('');
    try {
      const canonicalRequestedRole = roleToKey[activeRole] || activeRole;
      const session = await loginMutation({
        email: email.trim().toLowerCase(),
        password,
        role: canonicalRequestedRole,
      }).unwrap();

      // Normalize both sides so raw backend roles (school_admin, teacher, parent,
      // student, super_admin) match the display roles ('School Admin', ...).
      const returnedRole = session.user.role;
      const normalizedReturned = roleToKey[returnedRole] || returnedRole;
      const displayRole = roleDisplay[normalizedReturned] || returnedRole;

      if (normalizedReturned !== canonicalRequestedRole) {
        const expectedTab = roleNames[displayRole] || displayRole;
        setErrorMessage(`These credentials belong to a ${displayRole} account. Please select the "${expectedTab}" portal tab to sign in.`);
        return;
      }

      persistAuthSession(session.access, session.user);
      onLogin(session.user, session.access);
    } catch (error: any) {
      const msg = error?.data?.detail || error?.data?.message || (error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
      setErrorMessage(msg);
    }
  };

  return <main className="image-login" id="login-container">
    <div className="image-login__canvas">
      <header className="image-login__brand"><div className="image-login__crest">{brandSettings?.logoType === 'image' && brandSettings.logoImageUrl ? <img src={brandSettings.logoImageUrl} alt="School logo" /> : <GraduationCap />}</div><div><strong>{schoolName}</strong><span>School management portal</span></div></header>
      <section className="image-login__access">
        <div className="image-login__intro"><p><Sparkles /> SECURE ACCESS</p><h1>Welcome back</h1><span>Sign in to continue to your connected school workspace.</span></div>
        <div className="school-login__roles" aria-label="Choose your access portal">{roles.map(role => <button key={role} type="button" onClick={() => changeRole(role)} className={activeRole === role ? 'is-active' : ''}>{roleNames[role]}</button>)}</div>
        <form onSubmit={submit} className="school-login__form" id="manual-login-form">
          {errorMessage && <div className="school-login__error" role="alert">{errorMessage}</div>}
          <label>Email address<span className="school-login__input"><Mail /><input id="login-input-email" type="email" autoComplete="email" placeholder="name@school.edu" value={email} onChange={e => setEmail(e.target.value)} required /></span></label>
          <label>Password<span className="school-login__input"><LockKeyhole /><input id="login-input-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label>
          <button className="school-login__submit" type="submit" disabled={isLoading}>{isLoading ? 'Signing in…' : <>Sign in to {roleNames[activeRole]} portal <ArrowRight /></>}</button>
        </form>
        <div className="school-login__trust"><ShieldCheck /><span><strong>Protected school access</strong> Your credentials and data are securely encrypted.</span></div>
        {onPublicAccess && <button type="button" className="school-login__public" onClick={onPublicAccess}>Explore public learning resources <ArrowRight /></button>}
      </section>
      <aside className="image-login__visual"><img src={schoolPortalHero} alt="Students and teachers at a connected modern school campus" /><div className="image-login__visual-copy"><span>ONE CONNECTED CAMPUS</span><h2>Learn. Lead. Grow.</h2><p>Every part of school life, working beautifully together.</p></div><div className="image-login__visual-footer"><span><GraduationCap /> Academics</span><span><CheckCircle2 /> Attendance</span><span><BookOpen /> Learning</span></div></aside>
      <footer className="image-login__footer"><WorexaLogo compact /> Built by Worexa Technologies</footer>
    </div>
  </main>;
}