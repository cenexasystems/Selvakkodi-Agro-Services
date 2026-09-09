import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { User, Lock, Mail, Phone, Eye, EyeOff, AlertCircle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { authService } from '../services/authService'
import { BRAND_EN, BRAND_TA, BRAND_LOGO, BRAND_SUBTITLE } from '../lib/brand'
import { isValidPhone } from '../lib/phone'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => (lang === 'ta' ? ta : en)
  const setAuth = useAuthStore((state) => state.setAuth)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Determine redirect URL
  const queryParams = new URLSearchParams(location.search)
  const redirectPath = queryParams.get('redirect') || (location.state as { from?: Location })?.from?.pathname || '/profile'

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const cleanEmail = email.trim().toLowerCase()
    const cleanPwd = password.trim()

    if (!cleanEmail || !cleanPwd) {
      setError(l('Please enter your email and password.', 'உங்கள் மின்னஞ்சல் மற்றும் கடவுச்சொல்லை உள்ளிடவும்.'))
      return
    }

    setLoading(true)
    try {
      const { user, error: loginError } = await authService.signIn(cleanEmail, cleanPwd)
      if (loginError || !user) {
        setError(loginError || l('Invalid email or password.', 'தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்.'))
        return
      }

      setAuth({
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role === 'admin' ? 'admin' : 'customer',
        avatarUrl: user.avatar_url,
      })

      navigate(redirectPath, { replace: true })
    } catch (err: any) {
      setError(err.message || l('Login failed. Please try again.', 'உள்நுழைவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const cleanName = name.trim()
    const cleanMobile = mobile.replace(/\D/g, '')
    const cleanEmail = email.trim().toLowerCase()
    const cleanPwd = password.trim()

    if (!cleanName || cleanName.length < 2) {
      setError(l('Name must be at least 2 characters.', 'பெயர் குறைந்தது 2 எழுத்துக்கள் இருக்க வேண்டும்.'))
      return
    }
    if (!cleanMobile || !isValidPhone(cleanMobile)) {
      setError(l('Please enter a valid 10-digit mobile number.', 'சரியான 10-இலக்க மொபைல் எண்ணை உள்ளிடவும்.'))
      return
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(l('Please enter a valid email address.', 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.'))
      return
    }
    if (!cleanPwd || cleanPwd.length < 6) {
      setError(l('Password must be at least 6 characters.', 'கடவுச்சொல் குறைந்தது 6 எழுத்துக்கள் இருக்க வேண்டும்.'))
      return
    }
    if (cleanPwd !== confirmPassword.trim()) {
      setError(l('Passwords do not match.', 'கடவுச்சொற்கள் பொருந்தவில்லை.'))
      return
    }

    setLoading(true)
    try {
      const { user, error: regError } = await authService.signUp({
        name: cleanName,
        mobile: cleanMobile,
        email: cleanEmail,
        password: cleanPwd,
      })

      if (regError || !user) {
        setError(regError || l('Registration failed. Please try again.', 'பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.'))
        return
      }

      setAuth({
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: 'customer',
        avatarUrl: user.avatar_url,
      })

      setSuccess(l('Account created successfully!', 'கணக்கு வெற்றிகரமாக உருவாக்கப்பட்டது!'))
      navigate(redirectPath, { replace: true })
    } catch (err: any) {
      setError(err.message || l('Registration failed. Please try again.', 'பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F9FAFB] px-4 py-8 font-sans text-[#111111] sm:px-6 lg:flex lg:items-center lg:justify-center">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[#2E7D32]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[#2E7D32]/20 blur-3xl" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[32px] border border-[#A7F3D0] bg-white shadow-[0_24px_80px_rgba(44,57,42,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        {/* Left Side: Brand & Visuals */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] p-10 text-white lg:flex">
          <div>
            <div className="mb-6 inline-flex items-center justify-center rounded-2xl bg-white p-2.5 shadow-xl border border-white/20">
              <img src={BRAND_LOGO} alt={`${BRAND_EN} logo`} className="h-12 w-auto max-w-[150px] object-contain" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#C8E6C9]">{BRAND_SUBTITLE}</p>
            <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight">
              {BRAND_EN}
            </h2>
            <p className="mt-1 text-sm font-semibold text-white/80">{BRAND_TA}</p>
            <p className="mt-5 text-sm leading-relaxed text-white/80">
              {l(
                'Quality fertilizers, high-yield seeds, crop protection solutions, and agricultural equipment delivered to your farm.',
                'உயர்தர உரங்கள், அதிக விளைச்சல் தரும் விதைகள், பயிர் பாதுகாப்பு மருந்துகள் மற்றும் விவசாய உபகரணங்கள் உங்கள் பண்ணைக்கு நேரடியாக.'
              )}
            </p>
          </div>

          <div className="pt-8 border-t border-white/20">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span>{l('Store Portal', 'கடை போர்டல்')}</span>
              <Link to="/admin-login" className="font-bold underline hover:text-white inline-flex items-center gap-1">
                <ShieldCheck size={14} /> {l('Admin / Staff Portal', 'நிர்வாகி / ஊழியர் உள்நுழைவு')}
              </Link>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="p-6 sm:p-10 lg:p-12">
          {/* Mobile Header */}
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <img src={BRAND_LOGO} alt={`${BRAND_EN} logo`} className="h-12 w-auto max-w-[140px] rounded-xl object-contain mb-3" />
            <h1 className="text-2xl font-black tracking-tight text-[#111111]">{BRAND_EN}</h1>
            <p className="text-xs font-semibold text-[#6B7280]">{BRAND_TA}</p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="mb-6 flex rounded-2xl bg-[#F3F4F6] p-1 border border-borderLight">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess('') }}
              className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                mode === 'login' ? 'bg-white text-[#2E7D32] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
              }`}
            >
              {l('Sign In', 'உள்நுழைக')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setSuccess('') }}
              className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                mode === 'register' ? 'bg-white text-[#2E7D32] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
              }`}
            >
              {l('New Account', 'புதிய கணக்கு')}
            </button>
          </div>

          {/* Status Notices */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-bold text-red-600">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1.5 flex items-center gap-1.5">
                  <Mail size={13} /> {l('Email Address', 'மின்னஞ்சல் முகவரி')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-4 py-3 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1.5 flex items-center gap-1.5">
                  <Lock size={13} /> {l('Password', 'கடவுச்சொல்')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-4 py-3 pr-11 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111111]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-maroon-dark py-3.5 text-sm font-black text-white shadow-lg shadow-[#2E7D32]/20 transition-all hover:bg-maroon disabled:opacity-50 mt-2"
              >
                {loading ? l('Signing in...', 'உள்நுழைகிறது...') : l('Sign In', 'உள்நுழைக')}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1 flex items-center gap-1.5">
                  <User size={13} /> {l('Full Name', 'முழு பெயர்')}
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-3.5 py-2.5 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1 flex items-center gap-1.5">
                  <Phone size={13} /> {l('Mobile Number', 'மொபைல் எண்')}
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-3.5 py-2.5 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1 flex items-center gap-1.5">
                  <Mail size={13} /> {l('Email Address', 'மின்னஞ்சல் முகவரி')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-3.5 py-2.5 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1 flex items-center gap-1.5">
                    <Lock size={13} /> {l('Password', 'கடவுச்சொல்')}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-3.5 py-2.5 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1 flex items-center gap-1.5">
                    <Lock size={13} /> {l('Confirm', 'உறுதிசெய்க')}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#D1D5DB] bg-[#FBFAF6] px-3.5 py-2.5 text-sm font-semibold text-[#111111] outline-none transition-colors focus:border-[#2E7D32] focus:bg-white"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-maroon-dark py-3.5 text-sm font-black text-white shadow-lg shadow-[#2E7D32]/20 transition-all hover:bg-maroon disabled:opacity-50 mt-2"
              >
                {loading ? l('Creating account...', 'கணக்கு உருவாக்கப்படுகிறது...') : l('Create Account', 'கணக்கை உருவாக்கு')}
                <ArrowRight size={16} />
              </button>
            </form>
          )}

          {/* Admin / Staff Shortcut Footer */}
          <div className="mt-8 pt-5 border-t border-borderLight flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-[#6B7280] font-semibold">{l('Store administrator or staff member?', 'கடை நிர்வாகி அல்லது ஊழியரா?')}</span>
            <Link
              to="/admin-login"
              className="font-black text-[#2E7D32] hover:underline inline-flex items-center gap-1.5"
            >
              <ShieldCheck size={14} /> {l('Portal Sign In', 'போர்டல் உள்நுழைவு')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
