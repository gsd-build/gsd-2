/**
 * ErrorBoundaryFrame — React error boundary for iframe isolation.
 *
 * Wraps each iframe/device frame so a crash in one preview does not
 * take down the rest of the app. Renders a neutral fallback when the
 * child encounters an uncaught error.
 *
 * React 19 still requires class components for error boundaries.
 * Pattern: Phase 11.1 direct class instance testing (getDerivedStateFromError).
 */
import { Component } from "react";
import type { ReactNode } from "react";

export interface ErrorBoundaryFrameProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryFrameState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundaryFrame extends Component<ErrorBoundaryFrameProps, ErrorBoundaryFrameState> {
  constructor(props: ErrorBoundaryFrameProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryFrameState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundaryFrame]", error, info);
  }

  resetError(): void {
    this.setState({ hasError: false, error: undefined });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex items-center justify-center h-full text-slate-500 text-xs font-mono p-4">
          Preview unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
