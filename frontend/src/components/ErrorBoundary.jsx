import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6" role="alert">
          <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Une erreur inattendue est survenue</h1>
            <p className="mt-2 text-sm text-gray-600">Rechargez la page. Si le problème persiste, contactez le support.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              Recharger la page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
