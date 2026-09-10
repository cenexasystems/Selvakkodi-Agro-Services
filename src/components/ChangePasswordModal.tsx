import React, { useState } from 'react'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, X, KeyRound } from 'lucide-react'
import { authService } from '../services/authService'
import { useLangStore } from '../store/langStore'

interface ChangePasswordProps {
  isOpen: boolean
  onClose: () => void
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordProps) {
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => (lang === 'ta' ? ta : en)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!currentPassword) {
      setError(l('Please enter your current password.', 'தற்போதைய கடவுச்சொல்லை உள்ளிடவும்.'))
      return
    }

    if (!newPassword || newPassword.length < 6) {
      setError(l('New password must be at least 6 characters.', 'புதிய கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்.'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(l('New password and confirmation do not match.', 'புதிய கடவுச்சொல் மற்றும் உறுதிப்படுத்தல் பொருந்தவில்லை.'))
      return
    }

    if (newPassword === currentPassword) {
      setError(l('New password cannot be the same as current password.', 'புதிய கடவுச்சொல் தற்போதைய கடவுச்சொல்லாக இருக்கக்கூடாது.'))
      return
    }

    setLoading(true)
    const res = await authService.changePassword({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    setLoading(false)

    if (res.success) {
      setSuccess(l('Password changed successfully!', 'கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது!'))
      setTimeout(() => {
        handleClose()
      }, 1800)
    } else {
      setError(res.error || l('Failed to change password.', 'கடவுச்சொல்லை மாற்ற முடியவில்லை.'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#A5D6A7]/50">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#1B5E20]">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 id="change-password-title" className="text-base font-black text-[#111111]">
                {l('Change Account Password', 'கடவுச்சொல் மாற்று')}
              </h2>
              <p className="text-xs text-[#6B7280]">
                {l('Update your login password securely in Neon', 'உங்கள் கடவுச்சொல்லை பாதுகாப்பாக மாற்றவும்')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle size={15} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-black uppercase text-[#6B7280] mb-1.5">
              {l('Current Password', 'தற்போதைய கடவுச்சொல்')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading || !!success}
                className="w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 pr-10 text-sm font-semibold outline-none focus:border-[#1B5E20] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-[#6B7280] mb-1.5">
              {l('New Password (min 6 characters)', 'புதிய கடவுச்சொல் (குறைந்தது 6 எழுத்துகள்)')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading || !!success}
                className="w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 pr-10 text-sm font-semibold outline-none focus:border-[#1B5E20] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-[#6B7280] mb-1.5">
              {l('Confirm New Password', 'புதிய கடவுச்சொல்லை உறுதிப்படுத்தவும்')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading || !!success}
                className="w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 pr-10 text-sm font-semibold outline-none focus:border-[#1B5E20] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {l('Cancel', 'ரத்து செய்')}
            </button>
            <button
              type="submit"
              disabled={loading || !!success}
              className="flex items-center gap-2 rounded-xl bg-[#1B5E20] px-5 py-2 text-xs font-black text-white hover:bg-[#154a19] transition-colors shadow-sm disabled:opacity-50"
            >
              <Lock size={14} />
              {loading
                ? l('Updating...', 'புதுப்பிக்கப்படுகிறது...')
                : l('Update Password', 'கடவுச்சொல் மாற்று')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
