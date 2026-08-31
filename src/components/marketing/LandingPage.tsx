import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, BarChart3, BellRing, BookOpenCheck, Building2, CalendarDays, Check,
  ClipboardCheck, GraduationCap, HeartHandshake, LockKeyhole, Menu,
  MessageSquareText, ShieldCheck, Sparkles, UsersRound, WalletCards, X,
} from 'lucide-react';
import connectedSchoolPlatform from '../../assets/connected-school-platform.png';
import './LandingPage.css';

const capabilities = [
  { icon: UsersRound, title: 'Student lifecycle', text: 'Admissions, profiles, documents and academic history in one reliable record.' },
  { icon: BookOpenCheck, title: 'Academic operations', text: 'Classes, sections, attendance, timetables and results, connected by design.' },
  { icon: WalletCards, title: 'Fee visibility', text: 'Clear balances for your office, parents and students—without spreadsheet chasing.' },
  { icon: MessageSquareText, title: 'School communication', text: 'Targeted notices reach the right parent, teacher or student account.' },
  { icon: BarChart3, title: 'Actionable reporting', text: 'See the status of academic and operational work from a single workspace.' },
  { icon: ShieldCheck, title: 'Role-based access', text: 'Every portal is tailored to the person using it and scoped to their school.' },
];

const roles = [
  ['School Admin', 'Run day-to-day operations with a complete school view.'],
  ['Teacher', 'Manage assigned classes, attendance and assessment work.'],
  ['Parent', 'Follow your child’s attendance, fees, notices and results.'],
  ['Student', 'Keep learning, schedules and academic progress close at hand.'],
];

const schoolDay = [
  { icon: ClipboardCheck, title: 'Start with a dependable record', text: 'Bring admissions, student profiles, guardians and supporting documents into one place.' },
  { icon: CalendarDays, title: 'Keep the day on track', text: 'Give teams a shared view of attendance, schedules, notices and tasks that need attention.' },
  { icon: GraduationCap, title: 'Support progress with context', text: 'Connect learning activity, assessments and results so timely decisions are easier to make.' },
];

const softwareAreas = [
  { title: 'Admissions & student information', items: ['Enquiries and admissions workflow', 'Student, guardian and document records', 'Academic history and class placement'] },
  { title: 'Academics & learning', items: ['Classes, sections and subject setup', 'Timetables, attendance and assessments', 'Results and progress visibility'] },
  { title: 'Fees & finance', items: ['Fee categories and structures', 'Invoices, balances and payment tracking', 'Clear family-facing fee information'] },
  { title: 'People & communication', items: ['Teacher and staff directories', 'Role-targeted school notices', 'Parent and student notifications'] },
];

const rolloutSteps = [
  ['01', 'Understand your school', 'Map your school structure, key roles and the workflows you want to improve first.'],
  ['02', 'Set up the workspace', 'Configure school information, academic periods, classes, user access and the modules you need.'],
  ['03', 'Bring your team on board', 'Introduce each group to its focused workspace, with a rollout pace that fits your school.'],
  ['04', 'Operate with confidence', 'Use live information to manage the school day and continue expanding your connected workflows.'],
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main className="landing-page min-h-screen overflow-x-hidden bg-[#f7f8fc] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Volpehub Education home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-500 shadow-lg shadow-indigo-200">
              <Building2 className="h-5 w-5 text-white" />
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-tight text-slate-950">Volpehub Education</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-600">School ERP platform</span>
            </span>
          </Link>
          <nav className="hidden items-center rounded-2xl border border-slate-200 bg-slate-50/80 p-1 text-sm font-bold text-slate-600 lg:flex" aria-label="Primary navigation">
            <Link className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm" to="/platform">Platform</Link>
            <Link className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm" to="/how-it-works">How it works</Link>
            <Link className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm" to="/roles">For your school</Link>
            <Link className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm" to="/security">Security</Link>
            <Link className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm" to="/contact">Contact</Link>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100">Sign in</Link>
            <Link to="/demo" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700">Talk to us <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
          </div>

          <button onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700 lg:hidden" aria-label="Toggle navigation" aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && <nav className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-7xl gap-1 text-sm font-bold text-slate-700">
            <Link onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-slate-50" to="/platform">Platform</Link>
            <Link onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-slate-50" to="/how-it-works">How it works</Link>
            <Link onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-slate-50" to="/roles">For your school</Link>
            <Link onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-slate-50" to="/security">Security</Link>
            <Link onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-slate-50" to="/login">Sign in</Link>
          </div>
        </nav>}
      </header>

      <section className="landing-hero relative isolate overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:pb-28 lg:pt-24">
          <div className="relative z-10 flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-indigo-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> Built for connected schools
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-[4.25rem]">
              Every school day, <span className="text-indigo-600">working together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Volpehub Education brings admissions, academics, communication and family access into one secure operating system for your school.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-xl shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700">Open workspace <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/demo" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 transition hover:border-indigo-300 hover:bg-indigo-50">Plan your rollout</Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-slate-600">
              {['Role-specific workspaces', 'School-scoped access', 'Responsive on every device'].map((item) => <span key={item} className="inline-flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3 w-3" /></span>{item}</span>)}
            </div>
          </div>

          <div className="landing-dashboard relative z-10 self-center rounded-[28px] border border-white/70 bg-white p-3 shadow-[0_32px_70px_rgba(44,49,100,.20)] sm:p-4">
            <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-[#f7f9fd]">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">System live</span>
              </div>
              <div className="grid min-h-[365px] grid-cols-[112px_1fr] sm:grid-cols-[142px_1fr]">
                <aside className="hidden border-r border-slate-200 bg-[#121a31] p-3 text-slate-400 sm:block">
                  <div className="mb-7 flex items-center gap-2 text-[9px] font-bold text-white"><span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-500"><Building2 className="h-3.5 w-3.5" /></span> VOLPEHUB</div>
                  {['Overview', 'Students', 'Attendance', 'Fees', 'Exams'].map((label, index) => <div key={label} className={`mb-1 rounded-md px-2 py-2 text-[9px] font-bold ${index === 0 ? 'bg-indigo-500 text-white' : ''}`}>{label}</div>)}
                </aside>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-indigo-500">School operations</p><h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">Good morning, team.</h2></div><BellRing className="h-5 w-5 text-slate-400" /></div>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3"><MiniStat label="Students" value="1,248" tone="indigo" /><MiniStat label="Attendance" value="96%" tone="emerald" /><MiniStat label="Notices" value="08" tone="amber" /></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1.45fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Weekly attendance</p><div className="mt-5 flex h-20 items-end justify-between gap-2">{[42, 66, 54, 79, 64, 92, 72].map((height, index) => <span key={index} style={{ height: `${height}%` }} className={`w-full rounded-t-md ${index === 5 ? 'bg-indigo-600' : 'bg-indigo-100'}`} />)}</div></div><div className="rounded-xl bg-indigo-600 p-3 text-white"><p className="text-[9px] font-bold uppercase tracking-wider text-indigo-100">Today</p><p className="mt-2 text-2xl font-black">14</p><p className="mt-1 text-[9px] font-semibold text-indigo-100">actions ready for review</p></div></div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-emerald-100" /><div><p className="text-[10px] font-bold text-slate-800">Parent notice delivered</p><p className="text-[9px] text-slate-400">School communication</p></div></div><span className="text-[9px] font-bold text-emerald-600">Sent</span></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="scroll-mt-20 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">One platform. Clearer work.</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">A practical system for the work schools do every day.</h2><p className="mt-4 text-base leading-7 text-slate-600">Designed around real roles and real workflows—not a generic dashboard with school labels added later.</p></div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-base font-extrabold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="overflow-hidden bg-[#10172a] py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[.92fr_1.08fr] lg:px-8">
          <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-300">The complete picture</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">One software home for the whole school community.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Volpehub Education is school management software that connects the information your office manages with the day-to-day experiences of teachers, families and students. It gives each person a focused workspace while keeping the school aligned.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-white/[.06] p-4"><p className="text-sm font-extrabold">For the office</p><p className="mt-1 text-sm leading-6 text-slate-300">Maintain accurate records, manage operations and see what needs attention.</p></div><div className="rounded-xl border border-white/10 bg-white/[.06] p-4"><p className="text-sm font-extrabold">For learning</p><p className="mt-1 text-sm leading-6 text-slate-300">Support classes, attendance, assessments and shared academic progress.</p></div></div></div>
          <figure className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/30"><img src={connectedSchoolPlatform} alt="Teacher, students and parent connected through a school platform" className="aspect-[16/10] w-full rounded-[21px] object-cover" /></figure>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr]"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">Inside the software</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">The connected tools your team needs.</h2><p className="mt-4 max-w-md text-base leading-7 text-slate-600">Each area is designed to share context with the others, so your team can spend less time reconciling information and more time supporting learners.</p><Link to="/contact" className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-indigo-600 hover:text-indigo-800">Discuss your school setup <ArrowRight className="h-4 w-4" /></Link></div><div className="grid gap-4 sm:grid-cols-2">{softwareAreas.map(({ title, items }) => <article key={title} className="rounded-2xl border border-slate-200 p-6"><h3 className="text-base font-extrabold text-slate-900">{title}</h3><ul className="mt-4 space-y-3">{items.map((item) => <li key={item} className="flex gap-2 text-sm leading-5 text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></article>)}</div></div></div></section>

      <section id="workflow" className="scroll-mt-20 bg-[#f7f8fc] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">One connected rhythm</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">From the first enquiry to result day.</h2><p className="mt-4 text-base leading-7 text-slate-600">Volpehub helps your team move through the school year with a shared source of truth, instead of disconnected tools and follow-ups.</p></div>
          <div className="relative mt-12 grid gap-5 md:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-10 hidden h-px bg-indigo-200 md:block" />
            {schoolDay.map(({ icon: Icon, title, text }, index) => <article key={title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Icon className="h-5 w-5" /></span><span className="absolute right-6 top-6 text-xs font-black text-indigo-200">0{index + 1}</span><h3 className="mt-6 text-lg font-extrabold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section id="roles" className="scroll-mt-20 bg-[#10172a] py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-300">Built around people</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">Each role gets the right workspace.</h2><p className="mt-5 max-w-md text-base leading-7 text-slate-300">Less noise, more confidence. Every person sees the tools and information that belong to their role.</p><Link to="/login" className="mt-8 inline-flex items-center gap-2 text-sm font-extrabold text-white hover:text-indigo-200">Explore role access <ArrowRight className="h-4 w-4" /></Link></div><div className="grid gap-3 sm:grid-cols-2">{roles.map(([role, description], index) => <article key={role} className="rounded-2xl border border-white/10 bg-white/[.05] p-5 backdrop-blur-sm"><span className="text-xs font-bold text-indigo-300">0{index + 1}</span><h3 className="mt-5 text-lg font-extrabold">{role}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{description}</p></article>)}</div></div>
      </section>

      <section className="bg-[#f7f8fc] py-20 sm:py-28"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr]"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">From setup to everyday use</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">A clear path to a connected school.</h2><p className="mt-4 max-w-md text-base leading-7 text-slate-600">Software works best when it matches the way people actually work. Volpehub is designed to be introduced in practical stages, starting with the areas where your team needs clarity first.</p><div className="mt-7 rounded-2xl bg-indigo-600 p-5 text-white"><p className="text-sm font-extrabold">Built for daily decisions</p><p className="mt-2 text-sm leading-6 text-indigo-100">See the important work in context: who is present, which records need attention, what families need to know and where follow-up is needed.</p></div></div><ol className="grid gap-3 sm:grid-cols-2">{rolloutSteps.map(([number, title, text]) => <li key={number} className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-xs font-black text-indigo-500">{number}</span><h3 className="mt-5 text-base font-extrabold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></li>)}</ol></div></div></section>

      <section className="bg-white py-20 sm:py-24"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="text-center"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">Visibility that helps</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">Turn everyday activity into useful oversight.</h2><p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">Give your team a shared view of school operations without losing the detail behind each student, class or family record.</p></div><div className="mt-12 grid gap-4 md:grid-cols-3"><article className="rounded-2xl border border-slate-200 p-6"><BarChart3 className="h-6 w-6 text-indigo-600" /><h3 className="mt-5 font-extrabold text-slate-900">Operational overview</h3><p className="mt-2 text-sm leading-6 text-slate-600">Review essential school activity from one workspace and identify items that need follow-up.</p></article><article className="rounded-2xl border border-slate-200 p-6"><BellRing className="h-6 w-6 text-indigo-600" /><h3 className="mt-5 font-extrabold text-slate-900">Timely communication</h3><p className="mt-2 text-sm leading-6 text-slate-600">Create targeted notices so the right update reaches the right school community.</p></article><article className="rounded-2xl border border-slate-200 p-6"><ShieldCheck className="h-6 w-6 text-indigo-600" /><h3 className="mt-5 font-extrabold text-slate-900">Responsible access</h3><p className="mt-2 text-sm leading-6 text-slate-600">Keep information focused with role-based workspaces and school-scoped records.</p></article></div></div></section>

      <section id="security" className="scroll-mt-20 bg-[#eef1ff] py-20 sm:py-24"><div className="mx-auto grid max-w-5xl items-center gap-10 px-5 lg:grid-cols-[auto_1fr_auto] lg:px-8"><span className="grid h-20 w-20 place-items-center rounded-3xl bg-white text-indigo-600 shadow-xl shadow-indigo-200/60"><LockKeyhole className="h-9 w-9" /></span><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">Security by default</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950">School information stays in the right school.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Role-aware access and tenant-scoped records keep operational data focused on the people who are permitted to use it.</p></div><Link to="/contact" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-indigo-700">Talk security <ArrowRight className="h-4 w-4" /></Link></div></section>

      <section className="bg-white py-20 sm:py-24"><div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[.85fr_1.15fr] lg:px-8"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-indigo-600">Ready when you are</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-slate-950 sm:text-4xl">A foundation your school can grow with.</h2><p className="mt-4 max-w-md text-base leading-7 text-slate-600">Begin with the workflows that matter most, then bring more of your school day into one clear workspace.</p></div><div className="grid gap-3"><Detail title="Can different people have different access?" text="Yes. Admin, teacher, parent and student workspaces are designed around the information and actions each role needs." /><Detail title="Will parents have a simpler view?" text="Yes. Family-facing access focuses on the essentials: attendance, fees, notices and academic updates for linked children." /><Detail title="Can we introduce it gradually?" text="Yes. Your team can organise its rollout around the modules and school processes that are most useful first." /></div></div></section>

      <section className="bg-white py-20 sm:py-28"><div className="mx-auto max-w-4xl px-5 text-center lg:px-8"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><HeartHandshake className="h-6 w-6" /></span><h2 className="mt-6 text-3xl font-black tracking-[-.045em] text-slate-950 sm:text-5xl">Ready for a calmer school day?</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">Start with the workspace your school needs today, then grow from a connected foundation.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link to="/login" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-xl shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700">Sign in to Volpehub</Link><Link to="/demo" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-extrabold text-slate-800 transition hover:bg-slate-50">Contact our team</Link></div></div></section>

      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div className="flex items-center gap-2 font-bold text-slate-800"><Building2 className="h-4 w-4 text-indigo-600" /> Volpehub Education</div><div className="flex flex-wrap gap-x-5 gap-y-2"><Link to="/contact" className="hover:text-indigo-600">Contact</Link><Link to="/login" className="hover:text-indigo-600">Sign in</Link><a href="#security" className="hover:text-indigo-600">Security</a></div><p className="text-xs">© {new Date().getFullYear()} Worexa Technologies.</p></div></footer>
    </main>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'indigo' | 'emerald' | 'amber' }) {
  const tones = { indigo: 'bg-indigo-50 text-indigo-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700' };
  return <div className={`rounded-xl p-2.5 ${tones[tone]}`}><p className="text-[8px] font-bold uppercase tracking-wider opacity-70">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}

function Detail({ title, text }: { title: string; text: string }) {
  return <article className="rounded-xl border border-slate-200 bg-[#fafbff] px-5 py-4"><h3 className="flex items-center gap-3 text-sm font-extrabold text-slate-900"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{title}</h3><p className="mt-2 pl-7 text-sm leading-6 text-slate-600">{text}</p></article>;
}
