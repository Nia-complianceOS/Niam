import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ShieldCheck, Mail, Lock, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    
    setIsSubmitting(true)
    try {
      await login(email)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent-blue/10 blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent-purple/10 blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="w-full max-w-[420px] p-6 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-12 h-12 rounded-[12px] bg-grad-primary flex items-center justify-center mb-4 shadow-lg shadow-accent-blue/20">
            <ShieldCheck className="text-white" size={24} strokeWidth={2} />
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-text">Welcome back</h1>
          <p className="text-text-dim text-[14.5px] mt-1.5">Sign in to your NIA workspace</p>
        </div>

        <Card className="p-8 backdrop-blur-xl bg-surface/60 border-border/50">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-text-dim ml-1">Email address</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">
                  <Mail size={16} />
                </div>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-black/20 border border-border-soft rounded-[10px] pl-9 pr-4 py-2.5 text-[14px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[13px] font-medium text-text-dim">Password</label>
                <a href="#" className="text-[12px] text-accent-blue hover:text-accent-blue/80 transition-colors">Forgot password?</a>
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">
                  <Lock size={16} />
                </div>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/20 border border-border-soft rounded-[10px] pl-9 pr-4 py-2.5 text-[14px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="mt-4 w-full bg-text text-bg hover:bg-white flex items-center justify-center gap-2 py-2.5 rounded-[10px] font-medium text-[14px] transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              {!isSubmitting && <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />}
            </button>
          </form>

          <div className="mt-8 text-center text-[13.5px] text-text-dim">
            Don't have an account?{' '}
            <Link to="/signup" className="text-text font-medium hover:text-accent-blue transition-colors">
              Create an account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
