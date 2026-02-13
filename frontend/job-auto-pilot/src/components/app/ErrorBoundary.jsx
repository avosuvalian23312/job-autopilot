// src/components/app/ErrorBoundary.jsx
import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Replace with your logging hook (Sentry, AppInsights, etc.)
    console.error("ErrorBoundary:", error, info);
  }

  componentDidUpdate(prevProps) {
    // Optional reset on navigation / key changes
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xl font-semibold mb-2">Something crashed</div>
              <div className="text-sm text-white/70 mb-4">
                Open DevTools → Console to see the error, then refresh.
              </div>
              <button
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15"
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
