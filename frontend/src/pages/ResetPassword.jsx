import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useLocation } from "wouter";
import { api } from "../lib/api";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [form, setForm] = useState({ password: "", passwordConfirmation: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!token || !email) {
      setError("Ce lien de réinitialisation est incomplet.");
      return;
    }
    if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError("Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.");
      return;
    }
    if (form.password !== form.passwordConfirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.auth.resetPassword({ token, email, ...form });
      setSuccess(result.message || "Mot de passe réinitialisé.");
      window.setTimeout(() => navigate("/auth"), 1200);
    } catch (err) {
      setError(err.status === 422 ? "Ce lien est invalide ou expiré." : (err.message || "La réinitialisation a échoué."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1a2744] to-[#2d4080] flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" aria-labelledby="reset-title">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><KeyRound aria-hidden="true" /></span>
          <div>
            <h1 id="reset-title" className="text-xl font-bold text-gray-900">Nouveau mot de passe</h1>
            <p className="text-sm text-gray-500">Compte : {email || "email manquant"}</p>
          </div>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{success} Redirection…</p>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-gray-700">Mot de passe</label>
            <input id="reset-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} disabled={loading || Boolean(success)} required className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="reset-password-confirmation" className="mb-1.5 block text-sm font-medium text-gray-700">Confirmer le mot de passe</label>
            <input id="reset-password-confirmation" type="password" autoComplete="new-password" value={form.passwordConfirmation} onChange={(event) => setForm((current) => ({ ...current, passwordConfirmation: event.target.value }))} disabled={loading || Boolean(success)} required className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" disabled={loading || Boolean(success)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-60">
            {loading && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
            Réinitialiser le mot de passe
          </button>
        </form>
      </section>
    </main>
  );
}
