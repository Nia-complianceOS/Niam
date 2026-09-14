import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-bg flex items-center justify-center p-4">
          <Card className="max-w-[480px] w-full p-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-accent-red/10 flex items-center justify-center mb-5 border border-accent-red/20">
              <AlertCircle className="text-accent-red" size={24} />
            </div>
            <h1 className="font-display text-[20px] font-semibold text-text mb-2">
              Something went wrong
            </h1>
            <p className="text-[14px] text-text-dim mb-6 leading-relaxed">
              An unexpected error occurred in the application.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="w-full bg-black/40 rounded-lg p-4 mb-6 text-left overflow-x-auto border border-border-soft">
                <pre className="text-[12px] text-accent-red font-mono whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}
            
            <div className="flex gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] bg-text text-bg hover:bg-white font-medium text-[13.5px] transition-colors"
              >
                <RefreshCw size={16} />
                Reload
              </button>
              <a
                href="/"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] bg-surface border border-border-soft hover:bg-white/5 text-text font-medium text-[13.5px] transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
