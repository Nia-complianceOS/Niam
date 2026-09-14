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
        <div className="min-h-screen w-full bg-bg flex items-center justify-center p-4 font-sans">
          <Card className="max-w-[480px] w-full p-8 flex flex-col items-center text-center border-border bg-surface">
            <div className="w-12 h-12 rounded-xl bg-status-gap/10 flex items-center justify-center mb-5 border border-status-gap/20">
              <AlertCircle className="text-status-gap" size={24} />
            </div>
            <h1 className="font-serif text-xl font-medium text-text-primary mb-2">
              Something went wrong
            </h1>
            <p className="text-xs text-text-secondary mb-6 leading-relaxed">
              An unexpected error occurred in the application.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="w-full bg-surface-sunken rounded p-4 mb-6 text-left overflow-x-auto border border-border">
                <pre className="text-xs text-status-gap font-mono whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}
            
            <div className="flex gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded border border-border-strong bg-text-primary text-bg hover:opacity-90 font-medium text-xs transition-opacity"
              >
                <RefreshCw size={14} />
                Reload
              </button>
              <a
                href="/"
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-surface border border-border hover:bg-surface-raised text-text-primary font-medium text-xs transition-colors"
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
