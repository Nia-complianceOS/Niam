import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface User {
  id: string
  name: string
  email: string
  plan: string
}

interface AuthContextType {
  user: User | null
  login: (email: string) => Promise<void>
  signup: (email: string, name: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Check local storage on mount
    const storedUser = localStorage.getItem('nia_user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (e) {
        console.error('Failed to parse user from local storage')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string) => {
    // Mock API call
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const mockUser: User = {
          id: '1',
          name: 'Admin Workspace',
          email,
          plan: 'Growth plan',
        }
        setUser(mockUser)
        localStorage.setItem('nia_user', JSON.stringify(mockUser))
        navigate('/')
        resolve()
      }, 800)
    })
  }

  const signup = async (email: string, name: string) => {
    // Mock API call
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const mockUser: User = {
          id: '1',
          name,
          email,
          plan: 'Free plan',
        }
        setUser(mockUser)
        localStorage.setItem('nia_user', JSON.stringify(mockUser))
        navigate('/')
        resolve()
      }, 800)
    })
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('nia_user')
    navigate('/login')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
