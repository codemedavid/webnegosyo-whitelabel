"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Panel, SectionHeader } from "@/components/superadmin/ui/primitives"

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

interface PasswordRule {
  label: string
  test: (value: string) => boolean
}

const passwordRules: PasswordRule[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "Upper & lowercase letters", test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: "At least one number", test: (v) => /\d/.test(v) },
  { label: "A symbol (recommended)", test: (v) => /[^A-Za-z0-9]/.test(v) },
]

function getStrength(value: string): { score: number; label: string; tint: string } {
  const passed = passwordRules.filter((rule) => rule.test(value)).length
  if (!value) return { score: 0, label: "Empty", tint: "bg-white/15" }
  if (passed <= 1) return { score: 1, label: "Weak", tint: "bg-red-400" }
  if (passed === 2) return { score: 2, label: "Fair", tint: "bg-amber-400" }
  if (passed === 3) return { score: 3, label: "Good", tint: "bg-sky-400" }
  return { score: 4, label: "Strong", tint: "bg-emerald-400" }
}

interface PasswordFieldProps {
  id: string
  label: string
  visible: boolean
  onToggle: () => void
  error?: string
  registration: ReturnType<ReturnType<typeof useForm<ChangePasswordValues>>["register"]>
}

function PasswordField({ id, label, visible, onToggle, error, registration }: PasswordFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium text-white/60">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className={cn(
            "h-11 rounded-xl border-white/10 bg-white/[0.03] pr-10 text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-white/10",
            error && "border-red-400/40 focus-visible:border-red-400/50",
          )}
          aria-invalid={!!error}
          {...registration}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
          onClick={onToggle}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
    </div>
  )
}

export function ChangePasswordForm() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const newPassword = watch("newPassword") ?? ""
  const strength = getStrength(newPassword)

  async function onSubmit(values: ChangePasswordValues) {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) {
      toast.error("Unable to get current user email")
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: values.currentPassword,
    })

    if (signInError) {
      setError("currentPassword", { message: "Current password is incorrect" })
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.newPassword,
    })

    if (updateError) {
      toast.error(updateError.message)
      return
    }

    toast.success("Password updated successfully")
    reset()
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-white/[0.06] p-6">
        <SectionHeader
          icon={KeyRound}
          title="Change Password"
          subtitle="Update the password for your superadmin account"
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-white/45">
              <ShieldCheck className="h-3 w-3" />
              Account
            </span>
          }
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <PasswordField
            id="currentPassword"
            label="Current Password"
            visible={showCurrentPassword}
            onToggle={() => setShowCurrentPassword((v) => !v)}
            error={errors.currentPassword?.message}
            registration={register("currentPassword")}
          />

          <div className="h-px bg-white/[0.06]" />

          <div className="grid gap-5 sm:grid-cols-2">
            <PasswordField
              id="newPassword"
              label="New Password"
              visible={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              error={errors.newPassword?.message}
              registration={register("newPassword")}
            />
            <PasswordField
              id="confirmPassword"
              label="Confirm New Password"
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              error={errors.confirmPassword?.message}
              registration={register("confirmPassword")}
            />
          </div>

          {newPassword && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-widest text-white/45">
                  Password strength
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    strength.score <= 1 && "text-red-400",
                    strength.score === 2 && "text-amber-400",
                    strength.score === 3 && "text-sky-400",
                    strength.score >= 4 && "text-emerald-400",
                  )}
                >
                  {strength.label}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((bar) => (
                  <div
                    key={bar}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      bar <= strength.score ? strength.tint : "bg-white/[0.08]",
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-white text-black hover:bg-white/90"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/45">
            Requirements
          </p>
          <ul className="mt-4 space-y-3">
            {passwordRules.map((rule) => {
              const ok = !!newPassword && rule.test(newPassword)
              return (
                <li key={rule.label} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      ok
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                        : "border-white/10 bg-white/[0.04] text-white/30",
                    )}
                  >
                    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span className={ok ? "text-white/70" : "text-white/45"}>{rule.label}</span>
                </li>
              )
            })}
          </ul>
        </aside>
      </form>
    </Panel>
  )
}
