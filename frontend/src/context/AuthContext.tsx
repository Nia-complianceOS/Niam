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
  login: (email: string, password?: string) => Promise<void>
  signup: (email: string, name: string, password?: string) => Promise<void>
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
    const storedUser = localStorage.getItem('nia_user')
    const token = localStorage.getItem('token')
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (e) {
        console.error('Failed to parse user from local storage')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string) => {
    try {
      // Bypassing real API call since DB is not connected
      localStorage.setItem('token', 'mock-token-123')
      
      const loggedInUser: User = {
        id: 'mock-user-id',
        name: 'Admin Workspace',
        email,
        plan: 'Growth plan',
      }
      setUser(loggedInUser)
      localStorage.setItem('nia_user', JSON.stringify(loggedInUser))
      navigate('/')
    } catch (error) {
      console.error('Login failed', error)
      throw error
    }
  }

  const signup = async (email: string, name: string) => {
    try {
      // Bypassing real API call since DB is not connected
      localStorage.setItem('token', 'mock-token-123')
      
      const signedUpUser: User = {
        id: 'mock-user-id',
        name,
        email,
        plan: 'Free plan',
      }
      setUser(signedUpUser)
      localStorage.setItem('nia_user', JSON.stringify(signedUpUser))
      navigate('/')
    } catch (error) {
      console.error('Signup failed', error)
      throw error
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('nia_user')
    localStorage.removeItem('token')
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
