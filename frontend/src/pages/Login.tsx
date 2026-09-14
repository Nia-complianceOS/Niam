import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Shield, Mail, Lock, ArrowRight, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useSEO } from '@/hooks/useSEO'

export default function Login() {
  useSEO({
    title: 'Sign In',
    description: 'Sign in to your Niam compliance workspace.'
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    
    setIsSubmitting(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as Error).message || 'Sign in failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-bg overflow-hidden font-sans">
      {/* LEFT SIDE (Branding & Value Prop) */}
      <div className="w-full md:w-[55%] relative flex flex-col justify-center p-8 md:p-16 lg:p-24 border-b md:border-b-0 md:border-r border-white/5">
        {/* Background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-blue/20 blur-[120px] animate-float" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-purple/20 blur-[120px] animate-float" style={{ animationDelay: '-5s' }} />
        </div>

        <div className="relative z-10 max-w-lg">
          <Link to="/" className="flex items-center gap-2 mb-12">
            <Shield className="w-10 h-10 text-accent-blue" />
            <span className="text-3xl font-bold tracking-tight">Niam</span>
          </Link>

          <h1 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            The smartest way to comply with the DPDP Act.
          </h1>
          
          <div className="space-y-6 mt-12">
            {[
              "Scan your code for personal data flows",
              "Map findings against the DPDP Act",
              "Draft policy fixes as pull requests"
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-4 h-4 text-accent-blue" />
                </div>
                <span className="text-lg text-text-dim">{feature}</span>
              </div>
            ))}
          </div>

          {/* Abstract Graph Visualization */}
          <div className="mt-16 h-32 relative border-t border-white/10 pt-8 opacity-60">
            <div className="absolute top-12 left-0 w-3 h-3 rounded-full bg-accent-blue animate-pulse" />
            <div className="absolute top-8 left-[30%] w-3 h-3 rounded-full bg-accent-purple animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-16 left-[60%] w-3 h-3 rounded-full bg-accent-blue animate-pulse" style={{ animationDelay: '2s' }} />
            <div className="absolute top-4 left-[90%] w-3 h-3 rounded-full bg-accent-purple animate-pulse" style={{ animationDelay: '0.5s' }} />
            
            <svg className="w-full h-full absolute top-8 left-0 pointer-events-none" preserveAspectRatio="none">
              <path d="M 6 16 Q 15% -10, 30% 8 T 60% 16 T 90% 4" fill="none" stroke="rgba(91,140,255,0.3)" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_20s_linear_infinite]" />
            </svg>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE (Form) */}
      <div className="w-full md:w-[45%] flex items-center justify-center p-6 sm:p-12 lg:p-24 bg-black/20">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Welcome back</h2>
            <p className="text-text-dim">Sign in to your Niam workspace to continue.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-medium text-text-dim">Email address</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none">
                    <Mail size={18} />
                  </div>
                  <input 
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                    required
                    aria-label="Email address"
                    aria-invalid={error ? "true" : "false"}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-sm font-medium text-text-dim">Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none">
                    <Lock size={18} />
                  </div>
                  <input 
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                    required
                    aria-label="Password"
                    aria-invalid={error ? "true" : "false"}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text transition-colors focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div 
                  role="alert" 
                  aria-live="assertive"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                >
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="mt-2 w-full bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed group shadow-lg shadow-accent-blue/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-text-dim">
              Don't have an account?{' '}
              <Link to="/signup" className="text-white font-medium hover:text-accent-blue transition-colors">
                Create one
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
