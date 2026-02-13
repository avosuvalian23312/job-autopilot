// src/components/app/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("App ErrorBoundary:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-slate-900 p-6">
        <div className="max-w-xl w-full rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="text-xl font-bold mb-2">Something crashed.</div>
          <div className="text-sm text-slate-600 mb-4">
            Open DevTools → Console to see the real error.
          </div>

          {import.meta?.env?.DEV && this.state.error?.message ? (
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto">
              {String(this.state.error.message)}
            </pre>
          ) : null}

          <button
            className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
