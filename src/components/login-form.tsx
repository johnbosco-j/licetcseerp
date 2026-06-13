"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { signIn } from "@/lib/auth"

export function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const [mounted, setMounted]           = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [error, setError]               = useState("")
  const [formData, setFormData]         = useState({ email: "", password: "", rememberMe: false })

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const { authUser, error: authError } = await signIn(
      formData.email.trim(),
      formData.password.trim()
    )

    if (authError || !authUser) {
      setError("ACCESS_DENIED: " + (authError ?? "Invalid credentials"))
      setIsLoading(false)
      return
    }

    const { data: _safeData, ...safeUser } = authUser.type === "staff" ? { ...authUser, data: { ...authUser.data, password: undefined } } : { ...authUser, data: { ...authUser.data, password: undefined } }; localStorage.setItem("excelsior_user", JSON.stringify(authUser.type === "staff" ? { ...authUser, data: { ...authUser.data, password: undefined } } : { ...authUser, data: { ...authUser.data, password: undefined } }))
    router.push("/dashboard")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div
        className={`space-y-2 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "100ms" }}
      >
        <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <span className={`text-primary transition-all duration-300 ${focusedField === "email" ? "animate-pulse" : ""}`}>&gt;</span>
          Email_ID
        </label>
        <div className="relative">
          <Input
            type="email"
            placeholder="your.email@licet.ac.in"
            value={formData.email}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            className="h-12 bg-background border-border font-mono text-sm placeholder:text-muted-foreground/50 focus:border-primary transition-all duration-300"
            required
          />
          <div className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-primary to-primary/50 transition-all duration-500 ${focusedField === "email" ? "w-full" : "w-0"}`} />
        </div>
      </div>

      <div
        className={`space-y-2 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "200ms" }}
      >
        <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <span className={`text-primary transition-all duration-300 ${focusedField === "password" ? "animate-pulse" : ""}`}>&gt;</span>
          Password
        </label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="your password"
            value={formData.password}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            className="h-12 bg-background border-border font-mono text-sm placeholder:text-muted-foreground/50 pr-12 focus:border-primary transition-all duration-300"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <div className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-primary to-primary/50 transition-all duration-500 ${focusedField === "password" ? "w-full" : "w-0"}`} />
        </div>
      </div>

      <div
        className={`flex items-center justify-between transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "300ms" }}
      >
        <label className="flex items-center gap-3 cursor-pointer group">
          <Checkbox
            checked={formData.rememberMe}
            onCheckedChange={checked => setFormData({ ...formData, rememberMe: checked as boolean })}
            className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">Remember_session</span>
        </label>
        <a href="#" className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors">
          Forgot_password?
        </a>
      </div>

      {error && (
        <div className="font-mono text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2 animate-in fade-in slide-in-from-top-1">
          {error}
        </div>
      )}

      <div
        className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "400ms" }}
      >
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-sm uppercase tracking-wider transition-all duration-300 group relative overflow-hidden"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          {isLoading ? (
            <span className="flex items-center gap-2 relative z-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="animate-pulse">Authenticating...</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 relative z-10">
              Initialize Session
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          )}
        </Button>
      </div>

      <div
        className={`pt-4 border-t border-border transition-all duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDelay: "500ms" }}
      >
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Connection: <span className="text-green-500">ENCRYPTED</span></span>
          <span className="mx-2">|</span>
          <span>Protocol: <span className="text-primary">TLS_1.3</span></span>
        </div>
      </div>
    </form>
  )
}
