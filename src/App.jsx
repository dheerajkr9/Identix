import React, { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'
import { analyzeDocument, detectFile } from './services/analysis'

const TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Marksheet', 'Certificate', 'Other']
const navItems = [['dashboard', 'Dashboard'], ['verify', 'Verify Documents'], ['history', 'History'], ['profile', 'Profile']]
const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`
const friendlyError = (error, fallback) => {
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) return 'Supabase email rate limit reached. Wait before trying again, or disable Confirm email in Supabase Authentication settings while testing.'
  if (error?.code === 'PGRST205' || error?.message?.includes('verification_sessions')) return 'Supabase database setup is missing. Run supabase/schema.sql in the Supabase SQL Editor, then reload the app.'
  return error?.message || fallback
}
const withTimeout = (promise, message = 'Supabase did not respond. Check your project URL, API key, and network connection.') => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 15000)),
])

function routeFromHash() { return (window.location.hash.replace('#/', '').split('?')[0] || 'home') }

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [route, setRoute] = useState(routeFromHash())
  const [authMode, setAuthMode] = useState('login')
  const [authBusy, setAuthBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [appError, setAppError] = useState('')

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    if (!supabase) return () => window.removeEventListener('hashchange', onHashChange)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => { listener.subscription.unsubscribe(); window.removeEventListener('hashchange', onHashChange) }
  }, [])

  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    loadProfile(session.user).catch((error) => setAppError(friendlyError(error, 'Unable to load your profile.')))
  }, [session])

  useEffect(() => {
    const protectedRoutes = ['dashboard', 'verify', 'history', 'profile', 'report']
    if (protectedRoutes.includes(route) && !session) window.location.hash = '#/login'
    if (['login', 'signup'].includes(route) && session) window.location.hash = '#/dashboard'
  }, [route, session])

  async function loadProfile(user) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (error) throw error
    if (data) setProfile(data)
    else {
      const fallback = { id: user.id, email: user.email || '', full_name: user.user_metadata?.full_name || '', mobile: user.user_metadata?.mobile || '', organization: user.user_metadata?.organization || '' }
      const { data: created, error: createError } = await supabase.from('profiles').insert(fallback).select().single()
      if (createError) throw createError
      setProfile(created)
    }
  }

  async function submitAuth(form, submittedMode = authMode) {
    setNotice(''); setAppError('')
    if (!supabaseConfigured) { setAppError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.'); return }
    setAuthBusy(true)
    try {
      if (submittedMode === 'login') {
        const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: form.email, password: form.password }))
        if (error) throw error
        window.location.hash = '#/dashboard'
      } else {
        const { data, error } = await withTimeout(supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.fullName, mobile: form.mobile, organization: form.organization } } }))
        if (error) throw error
        if (data.user && data.session) await loadProfile(data.user)
        setNotice(data.session ? 'Account created. You can now use your workspace.' : 'Account created. Check your email to confirm the account, then sign in.')
        if (data.session) window.location.hash = '#/dashboard'
      }
    } catch (error) { setAppError(friendlyError(error, 'Authentication failed. Please try again.')) } finally { setAuthBusy(false) }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut()
    window.location.hash = '#/home'
  }

  async function sendMagicLink(email) {
    setNotice(''); setAppError('')
    if (!supabaseConfigured) { setAppError('Supabase is not configured for this deployment.'); return }
    if (!email) { setAppError('Enter your email address first, then request a sign-in link.'); return }
    setAuthBusy(true)
    try {
      const { error } = await withTimeout(supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/#/dashboard` } }))
      if (error) throw error
      setNotice('Check your email for a secure sign-in link. It will open your IDENTIX workspace automatically.')
    } catch (error) { setAppError(friendlyError(error, 'Unable to send a sign-in link. Please try again.')) } finally { setAuthBusy(false) }
  }

  const go = (next) => { window.location.hash = `#/${next}` }
  const currentUserName = profile?.full_name || session?.user?.email?.split('@')[0] || 'there'

  if (['login', 'signup'].includes(route)) return <AuthPage mode={route} setMode={setAuthMode} authMode={authMode} onSubmit={submitAuth} onMagicLink={sendMagicLink} busy={authBusy} error={appError} notice={notice} go={go} />
  if (!session) return <Landing go={go} />
  if (route === 'home') { window.location.hash = '#/dashboard'; return null }

  return <div className="app-shell"><AppHeader profile={profile} route={route} go={go} logout={logout} /><main className="app-main">
    {appError && <Alert tone="error" onClose={() => setAppError('')}>{appError}</Alert>}
    {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {route === 'dashboard' && <Dashboard user={session.user} profile={profile} go={go} setError={setAppError} />}
    {route === 'verify' && <VerifyPage user={session.user} go={go} setError={setAppError} setNotice={setNotice} />}
    {route === 'history' && <HistoryPage user={session.user} go={go} setError={setAppError} />}
    {route === 'profile' && <ProfilePage user={session.user} profile={profile} setProfile={setProfile} setError={setAppError} setNotice={setNotice} />}
    {route === 'report' && <ReportPage user={session.user} go={go} setError={setAppError} />}
  </main></div>
}

function Brand({ go }) { return <button className="brand" onClick={() => go('home')}>IDENTIX<span>.</span></button> }
function AppHeader({ profile, route, go, logout }) {
  const [open, setOpen] = useState(false)
  return <header className="app-header"><div className="header-inner"><Brand go={go} /><button className="mobile-toggle" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>☰</button><nav className={`app-nav ${open ? 'open' : ''}`}>{navItems.map(([key, label]) => <button className={route === key ? 'active' : ''} key={key} onClick={() => { go(key); setOpen(false) }}>{label}</button>)}<button className="logout-button" onClick={logout}>Log out</button></nav><div className="user-chip">{(profile?.full_name || profile?.email || 'U').slice(0, 1).toUpperCase()}</div></div></header>
}
function Alert({ children, tone, onClose }) { return <div className={`alert ${tone}`} role="alert"><span>{children}</span><button onClick={onClose} aria-label="Dismiss">×</button></div> }
function Landing({ go }) {
  return <div className="landing"><header className="public-header"><Brand go={go} /><nav><button onClick={() => document.getElementById('how-it-works')?.scrollIntoView()}>How It Works</button><button className="text-button" onClick={() => go('login')}>Sign in</button><button className="button primary small" onClick={() => go('login')}>Verify Documents</button></nav></header><main>
    <section className="landing-hero"><div className="hero-copy"><div className="eyebrow">IDENTITY SCREENING / 01</div><h1>Detect fake documents.<br /><em>Verify identity.</em></h1><p>IDENTIX is an AI-assisted document authenticity screening platform that analyzes documents for inconsistencies and suspicious indicators and provides an easy-to-understand authenticity score.</p><div className="hero-actions"><button className="button primary" onClick={() => go('login')}>Verify Documents <span>↗</span></button><button className="button secondary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView()}>How It Works</button></div></div><div className="hero-panel"><div className="panel-kicker">SCREENING OVERVIEW <span>LIVE DEMO</span></div><div className="scan-card"><div className="scan-icon">ID</div><div><strong>Document authenticity</strong><small>Explainable screening signals</small></div><b className="status-dot">●</b></div><div className="signal-row"><span>STRUCTURE</span><b>PASS</b></div><div className="signal-row"><span>TEXT CONSISTENCY</span><b>PASS</b></div><div className="signal-row"><span>MANIPULATION SIGNAL</span><b className="warning-text">REVIEW</b></div><div className="hero-score"><strong>96</strong><span>/ 100<br />DEMO SCORE</span></div></div></section>
    <section className="benefits container"><div className="section-intro"><div className="eyebrow">WHY IDENTIX</div><h2>Clarity at the point of trust.</h2></div><div className="benefit-grid"><Benefit icon="01" title="Upload multiple documents" text="Bring a complete identity packet into one focused screening session." /><Benefit icon="02" title="Analyze authenticity indicators" text="Evaluate structure, text, layout, metadata, and tampering signals." /><Benefit icon="03" title="Get explainable results" text="See the score, exact checks, issues, and a clear next recommendation." /></div></section>
    <section className="supported container"><div><div className="eyebrow">SUPPORTED INPUTS</div><h2>Built for everyday identity workflows.</h2></div><div className="type-list">{['Aadhaar','PAN','Passport','Driving Licence','Voter ID','Marksheet','Degree Certificate','Other Certificates','PDF Documents'].map((type) => <span key={type}>{type}</span>)}</div></section>
    <section className="disclaimer container"><span>DEMO ANALYSIS</span><p>Results are simulated for demonstration and are not official verification by UIDAI, Passport authorities, PAN authorities, or any government agency.</p></section>
    <section id="how-it-works" className="how-section"><div className="container how-inner"><div><div className="eyebrow">THE FLOW</div><h2>From upload to an explainable decision.</h2></div><div className="flow-list"><div><b>01</b><span>Authenticate your workspace</span></div><div><b>02</b><span>Screen one or more documents</span></div><div><b>03</b><span>Review, save, and report</span></div></div></div></section>
  </main><footer className="public-footer container"><Brand go={go} /><span>© 2026 IDENTIX / Smart India Hackathon</span></footer></div>
}
function Benefit({ icon, title, text }) { return <article className="benefit"><b>{icon}</b><h3>{title}</h3><p>{text}</p></article> }
function AuthPage({ mode, setMode, authMode, onSubmit, onMagicLink, busy, error, notice, go }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', mobile: '', organization: '' })
  const signup = mode === 'signup'
  useEffect(() => setMode(mode), [mode, setMode])
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  return <div className="auth-page"><div className="auth-side"><Brand go={go} /><div><div className="eyebrow">SECURE WORKSPACE</div><h1>Trust, with<br /><em>evidence.</em></h1><p>Screen identity documents with a transparent, human-readable workflow built for modern teams.</p><button className="side-link" onClick={() => go('home')}>Explore the landing page →</button></div><span className="side-foot">IDENTIX / DOCUMENT AUTHENTICITY</span></div><section className="auth-card"><button className="back-link" onClick={() => go('home')}>← Back to landing page</button><div className="auth-heading"><div className="eyebrow">{signup ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</div><h2>{signup ? 'Create your workspace' : 'Sign in to IDENTIX'}</h2><p>{signup ? 'Use any real email address and a password with at least 6 characters.' : 'Continue to your verification workspace.'}</p></div>{error && <Alert tone="error" onClose={() => {}}>{error}</Alert>}{notice && <Alert tone="success" onClose={() => {}}>{notice}</Alert>}<form onSubmit={(event) => { event.preventDefault(); onSubmit(form, mode) }}>{signup && <Field label="Full Name" name="fullName" value={form.fullName} onChange={update} required />}{signup && <div className="form-row"><Field label="Mobile Number (optional)" name="mobile" value={form.mobile} onChange={update} /><Field label="Organization (optional)" name="organization" value={form.organization} onChange={update} /></div>}<Field label="Email" name="email" type="email" value={form.email} onChange={update} required /><Field label="Password" name="password" type="password" value={form.password} onChange={update} required minLength="6" /><button type="submit" className="button primary full" disabled={busy}>{busy ? (signup ? 'Creating account...' : 'Signing in...') : signup ? 'Create account' : 'Sign in'} <span>↗</span></button></form><p className="switch-auth">{signup ? 'Already have an account?' : 'New to IDENTIX?'} <button onClick={() => go(signup ? 'login' : 'signup')}>{signup ? 'Sign in' : 'Create an account'}</button></p></section></div>
}
function Field({ label, name, type = 'text', value, onChange, required, minLength }) { return <label className="field"><span>{label}</span><input name={name} type={type} value={value} onChange={onChange} required={required} minLength={minLength} /></label> }

function Dashboard({ user, profile, go, setError }) {
  const [data, setData] = useState({ docs: [], sessions: [] }); const [loading, setLoading] = useState(true)
  useEffect(() => { loadDashboard(user.id).catch((error) => setError(friendlyError(error, 'Unable to load dashboard data.'))).finally(() => setLoading(false)) }, [user.id])
  async function loadDashboard(userId) { const [{ data: docs, error: docsError }, { data: sessions, error: sessionsError }] = await Promise.all([supabase.from('documents').select('*, verification_results(*)').eq('user_id', userId), supabase.from('verification_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)]); if (docsError || sessionsError) throw docsError || sessionsError; setData({ docs: docs || [], sessions: sessions || [] }) }
  const counts = { total: data.docs.length, approved: data.docs.filter((doc) => doc.verification_results?.[0]?.status === 'DOCUMENT VALID').length, review: data.docs.filter((doc) => doc.verification_results?.[0]?.status === 'REQUIRES REVIEW').length }
  return <div className="page-content"><PageTitle eyebrow="OVERVIEW" title={`Welcome, ${profile?.full_name || user.email?.split('@')[0] || 'there'}.`} text="A clear view of the documents your workspace has screened." action={<button className="button primary" onClick={() => go('verify')}>+ Verify Documents</button>} /><div className="stat-grid"><Stat label="Documents Verified" value={counts.total} /><Stat label="Document Valid" value={counts.approved} tone="valid" /><Stat label="Requires Review" value={counts.review} tone="review" /><Stat label="Approval Threshold" value="80%" tone="suspicious" /></div><section className="content-card"><div className="card-heading"><div><div className="eyebrow">ACTIVITY</div><h3>Recent verifications</h3></div><button className="text-button" onClick={() => go('history')}>View history →</button></div>{loading ? <Loading text="Loading your activity..." /> : data.sessions.length ? <SessionTable sessions={data.sessions} go={go} /> : <Empty title="No verifications yet" text="Upload your first document to create a saved report." action={<button className="button secondary small" onClick={() => go('verify')}>Start a verification</button>} />}</section></div>
}
function Stat({ label, value, tone }) { return <div className={`stat-card ${tone || ''}`}><span>{label}</span><strong>{value}</strong></div> }
function PageTitle({ eyebrow, title, text, action }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>{action}</div> }
function Loading({ text }) { return <div className="loading">{text}</div> }
function Empty({ title, text, action }) { return <div className="empty"><strong>{title}</strong><p>{text}</p>{action}</div> }
function SessionTable({ sessions, go }) { return <div className="session-list">{sessions.map((session) => <div className="session-row" key={session.id}><div><strong>Verification {session.id.slice(0, 8).toUpperCase()}</strong><span>{new Date(session.created_at).toLocaleString()}</span></div><span>{session.document_count} document{session.document_count === 1 ? '' : 's'}</span><StatusBadge status={session.overall_status} /><button className="text-button" onClick={() => go(`report?session=${session.id}`)}>View report →</button></div>)}</div> }
function StatusBadge({ status }) { return <span className={`status-badge ${status === 'DOCUMENT VALID' ? 'valid' : 'review'}`}>{status}</span> }

function VerifyPage({ user, go, setError, setNotice }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [complete, setComplete] = useState(null)

  const addFiles = (incoming) => {
    setError('')
    const next = [...files]
    ;[...incoming].forEach((file) => {
      const extension = file.name.toLowerCase().split('.').pop()
      const supported = file.type === 'application/pdf' || file.type === 'image/jpeg' || file.type === 'image/png' || ['pdf', 'jpg', 'jpeg', 'png'].includes(extension)
      if (file.size > 10 * 1024 * 1024) { setError(`${file.name} is larger than the 10 MB limit.`); return }
      if (!supported) { setError(`${file.name} is not a supported PDF, JPG, JPEG, or PNG file.`); return }
      if (next.some((item) => item.file.name === file.name && item.file.size === file.size)) return
      const detection = detectFile(file)
      next.push({ file, ...detection, selectedType: detection.detectedType || '' })
    })
    setFiles(next)
  }

  const updateType = (index, value) => setFiles(files.map((item, current) => current === index ? { ...item, selectedType: value } : item))

  async function analyze() {
    if (!files.length) { setError('Add at least one document before analyzing.'); return }
    if (files.some((item) => !item.selectedType)) { setError('Select a document type for each file that could not be confidently detected.'); return }
    setBusy(true)
    setError('')
    const results = files.map((item) => ({ ...item, result: analyzeDocument(item.file, item.selectedType) }))
      const localSession = { id: crypto.randomUUID(), document_count: results.length, overall_status: results.every((item) => item.result.status === 'DOCUMENT VALID' && item.result.score >= 80) ? 'DOCUMENT VALID' : 'REQUIRES REVIEW' }
    setComplete({ session: localSession, results })
    try {
      const session = await saveVerification(user.id, results)
      setComplete({ session, results })
      setNotice('Verification analyzed and saved to your history.')
    } catch (error) {
      setError(`Analysis completed, but saving failed: ${friendlyError(error, 'Please run the Supabase SQL setup and try again.')}`)
    } finally { setBusy(false) }
  }
  if (complete) return <Results results={complete.results} session={complete.session} go={go} />
  return <div className="page-content"><PageTitle eyebrow="SCREEN DOCUMENTS" title="Upload your documents." text="Upload one or multiple documents for deterministic demo screening." /><section className="upload-card content-card"><div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}><div className="upload-mark">＋</div><h3>Drop files here or browse</h3><p>PDF, JPG, JPEG, PNG / 10 MB per file</p><label className="button secondary small">Browse files<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => addFiles(event.target.files)} /></label></div>{files.length > 0 && <div className="file-list"><div className="list-heading"><strong>Selected documents</strong><span>{files.length} file{files.length === 1 ? '' : 's'}</span></div>{files.map((item, index) => <div className="file-row" key={`${item.file.name}-${item.file.size}`}><div className="file-mark">{item.format}</div><div className="file-name"><strong>{item.file.name}</strong><span>{formatBytes(item.file.size)} · {item.detectedType || 'Type not confidently detected'}</span></div>{item.detectedType ? <span className="detected-label">Auto-detected</span> : <select value={item.selectedType} onChange={(event) => updateType(index, event.target.value)}><option value="">Select type</option>{TYPES.map((type) => <option key={type}>{type}</option>)}</select>}<button className="remove-file" aria-label={`Remove ${item.file.name}`} onClick={() => setFiles(files.filter((_, current) => current !== index))}>×</button></div>)}<div className="upload-actions"><label className="button secondary small">+ Add More<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => addFiles(event.target.files)} /></label><button className="button primary" onClick={analyze} disabled={busy}>{busy ? 'Analyzing and saving...' : 'Analyze Documents →'}</button></div></div>}</section><div className="demo-note"><strong>DEMO ANALYSIS</strong><span>Results are simulated from deterministic document characteristics and are not official verification.</span></div></div>
}
async function saveVerification(userId, items) { if (!supabase) throw new Error('Supabase is not configured. Add your environment variables before saving results.') ; const overall = items.every((item) => item.result.status === 'DOCUMENT VALID' && item.result.score >= 80) ? 'DOCUMENT VALID' : 'REQUIRES REVIEW'; const { data: session, error: sessionError } = await supabase.from('verification_sessions').insert({ user_id: userId, document_count: items.length, overall_status: overall }).select().single(); if (sessionError) throw sessionError; for (const item of items) { const path = `${userId}/${session.id}/${crypto.randomUUID()}-${item.file.name}`; const { error: uploadError } = await supabase.storage.from('documents').upload(path, item.file, { upsert: false }); if (uploadError) throw uploadError; const { data: document, error: documentError } = await supabase.from('documents').insert({ session_id: session.id, user_id: userId, file_name: item.file.name, file_type: item.file.type, file_size: item.file.size, storage_path: path, detected_type: item.selectedType }).select().single(); if (documentError) throw documentError; const { error: resultError } = await supabase.from('verification_results').insert({ document_id: document.id, score: item.result.score, status: item.result.status, issues: item.result.issues, checks: item.result.checks, recommendation: item.result.recommendation }); if (resultError) throw resultError } return session }
function Results({ results, session, go }) { const [selected, setSelected] = useState(null); return <div className="page-content"><PageTitle eyebrow="VERIFICATION COMPLETE" title={`${results.length} document${results.length === 1 ? '' : 's'} analyzed.`} text="Review each screening result and the evidence behind its score." action={<button className="button secondary" onClick={() => go('history')}>View history</button>} /><div className="result-grid">{results.map((item, index) => <article className="result-card content-card" key={item.file.name}><div className="result-top"><div><div className="file-mark">{item.format}</div><strong>{item.file.name}</strong><span>{item.selectedType}</span></div><Score score={item.result.score} /></div><div className="result-bottom"><StatusBadge status={item.result.status} /><button className="text-button" onClick={() => setSelected(index)}>View details →</button></div></article>)}</div><div className="result-foot"><span>Verification {session.id.slice(0, 8).toUpperCase()} saved successfully.</span><button className="button primary" onClick={() => go(`report?session=${session.id}`)}>Open full report</button></div>{selected !== null && <DetailModal item={results[selected]} onClose={() => setSelected(null)} />}</div> }
function Score({ score }) { return <div className="score"><strong>{score}%</strong><span>DEMO SCORE</span></div> }
function DetailModal({ item, onClose }) { return <div className="modal-backdrop" onClick={onClose}><section className="detail-modal content-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="eyebrow">DOCUMENT DETAIL</div><h2>{item.file.name}</h2><p className="modal-meta">{item.selectedType} · {item.file.type || item.format}</p><div className="detail-score"><Score score={item.result.score} /><StatusBadge status={item.result.status} /></div><h3>Verification checks</h3><div className="check-list">{item.result.checks.map((check) => <div key={check.name}><span>{check.passed ? '✓' : '⚠'} {check.name}</span><b className={check.passed ? 'valid-text' : 'warning-text'}>{check.passed ? `PASS · ${check.weight}` : 'REVIEW'}</b></div>)}</div><h3>Detected issues</h3>{item.result.issues.length ? <ol className="issues">{item.result.issues.map((issue) => <li key={issue.title}><strong>{issue.title}</strong><span>{issue.detail}</span></li>)}</ol> : <p className="clean-message">No issues detected in this demo analysis.</p>}<h3>Recommendation</h3><p className="recommendation">{item.result.recommendation}</p></section></div> }

function HistoryPage({ user, go, setError }) { const [sessions, setSessions] = useState([]); const [query, setQuery] = useState(''); const [status, setStatus] = useState('ALL'); const [loading, setLoading] = useState(true); useEffect(() => { loadHistory().catch((error) => setError(friendlyError(error, 'Unable to load verification history.'))).finally(() => setLoading(false)) }, [user.id]); async function loadHistory() { const { data, error } = await supabase.from('verification_sessions').select('*, documents(file_name, detected_type, verification_results(score, status))').eq('user_id', user.id).order('created_at', { ascending: false }); if (error) throw error; setSessions(data || []) } const filtered = sessions.filter((item) => (!status || status === 'ALL' || item.overall_status === status) && item.documents?.some((doc) => doc.file_name.toLowerCase().includes(query.toLowerCase()))); return <div className="page-content"><PageTitle eyebrow="ARCHIVE" title="Verification history." text="Every saved screening session, scoped to your account." action={<button className="button primary" onClick={() => go('verify')}>+ Verify Documents</button>} /><div className="filter-bar"><input placeholder="Search by filename" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option>DOCUMENT VALID</option><option>REQUIRES REVIEW</option><option>SUSPICIOUS</option></select></div><section className="content-card">{loading ? <Loading text="Loading history..." /> : filtered.length ? <SessionTable sessions={filtered} go={go} /> : <Empty title="No matching sessions" text="Try another filename or status filter." />}</section></div> }

function ProfilePage({ user, profile, setProfile, setError, setNotice }) { const [form, setForm] = useState({ full_name: profile?.full_name || '', mobile: profile?.mobile || '', organization: profile?.organization || '' }); const [busy, setBusy] = useState(false); useEffect(() => setForm({ full_name: profile?.full_name || '', mobile: profile?.mobile || '', organization: profile?.organization || '' }), [profile]); async function save(event) { event.preventDefault(); setBusy(true); setError(''); try { const { data, error } = await supabase.from('profiles').update(form).eq('id', user.id).select().single(); if (error) throw error; setProfile(data); setNotice('Profile updated successfully.') } catch (error) { setError(friendlyError(error, 'Unable to update your profile.')) } finally { setBusy(false) } } return <div className="page-content"><PageTitle eyebrow="ACCOUNT" title="Your profile." text="Manage the information connected to your screening workspace." /><section className="profile-grid"><form className="content-card profile-form" onSubmit={save}><h3>Profile details</h3><Field label="Full Name" name="full_name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /><Field label="Email" name="email" value={profile?.email || user.email || ''} onChange={() => {}} /><Field label="Mobile Number" name="mobile" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} /><Field label="Organization" name="organization" value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} /><button className="button primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button></form><aside className="content-card account-card"><div className="eyebrow">ACCOUNT CREATED</div><strong>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</strong><p>Email is managed securely through Supabase Authentication.</p></aside></section></div> }

function ReportPage({ user, go, setError }) { const [sessions, setSessions] = useState([]); const [loading, setLoading] = useState(true); const sessionId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('session'); useEffect(() => { load().catch((error) => setError(friendlyError(error, 'Unable to load this report.'))).finally(() => setLoading(false)) }, [user.id, sessionId]); async function load() { let query = supabase.from('verification_sessions').select('*, documents(*, verification_results(*))').eq('user_id', user.id).order('created_at', { ascending: false }); if (sessionId) query = query.eq('id', sessionId); const { data, error } = await query.limit(1).maybeSingle(); if (error) throw error; setSessions(data ? [data] : []) } function download() { const session = sessions[0]; if (!session) return; const text = [`IDENTIX VERIFICATION REPORT`, `Verification ID: ${session.id}`, `Date: ${new Date(session.created_at).toLocaleString()}`, '', ...session.documents.map((doc) => { const result = doc.verification_results?.[0]; return `${doc.file_name} | ${doc.detected_type} | ${result?.score}% | ${result?.status}\nIssues: ${JSON.stringify(result?.issues || [])}\nRecommendation: ${result?.recommendation || ''}` })].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); link.download = `identix-report-${session.id.slice(0, 8)}.txt`; link.click(); URL.revokeObjectURL(link.href) } const session = sessions[0]; return <div className="page-content report-page"><PageTitle eyebrow="REPORT" title="Verification report." text="A printable, evidence-led summary of this screening session." action={<div className="button-group"><button className="button secondary" onClick={() => go('history')}>← History</button><button className="button primary" onClick={download} disabled={!session}>Download report</button></div>} />{loading ? <Loading text="Loading report..." /> : session ? <section className="content-card report-sheet"><div className="report-header"><div className="brand">IDENTIX<span>.</span></div><div><strong>Verification {session.id.slice(0, 8).toUpperCase()}</strong><span>{new Date(session.created_at).toLocaleString()}</span></div></div><div className="report-summary"><span>DOCUMENTS ANALYZED <b>{session.document_count}</b></span><span>OVERALL STATUS <StatusBadge status={session.overall_status} /></span></div>{session.documents.map((doc) => <ReportDocument key={doc.id} doc={doc} />)}<div className="demo-note"><strong>DEMO ANALYSIS</strong><span>Results are simulated and are not an official verification.</span></div></section> : <Empty title="Report not found" text="This report may have been removed or does not belong to your account." />}</div> }
function ReportDocument({ doc }) { const result = doc.verification_results?.[0]; return <article className="report-document"><div><div className="eyebrow">{doc.detected_type}</div><h3>{doc.file_name}</h3></div><div className="report-score"><strong>{result?.score}%</strong><StatusBadge status={result?.status || 'REQUIRES REVIEW'} /></div><div className="report-details"><h4>Checks</h4>{(result?.checks || []).map((check) => <span key={check.name} className={check.passed ? 'valid-text' : 'warning-text'}>{check.passed ? '✓' : '⚠'} {check.name}</span>)}<h4>Issues</h4>{result?.issues?.length ? result.issues.map((issue) => <p key={issue.title}><strong>{issue.title}:</strong> {issue.detail}</p>) : <p>No issues detected.</p>}<h4>Recommendation</h4><p>{result?.recommendation}</p></div></article> }
