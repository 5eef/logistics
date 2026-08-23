
import { useState } from "react";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { Search, CheckCircle, MapPin, ArrowRight } from "lucide-react";

const statusSteps = ["created", "pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];
const demoMode = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
const statusLabels = {
  created: "Créé",
  pending: "En Attente",
  picked_up: "Récupéré",
  in_transit: "En Transit",
  out_for_delivery: "En Livraison",
  delivered: "Livré",
  failed: "Échoué",
  returned: "Retourné",
};
const statusColors = {
  created: "bg-gray-400",
  pending: "bg-yellow-400",
  picked_up: "bg-blue-400",
  in_transit: "bg-blue-500",
  out_for_delivery: "bg-orange-500",
  delivered: "bg-green-500",
  failed: "bg-red-500",
  returned: "bg-red-400",
};

function TrackingResult({ colis }) {
  if (!colis) return null;
  const stepIndex = statusSteps.indexOf(colis.status);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-6">
      <div className="bg-gradient-to-r from-[#1a2744] to-[#2d4080] px-6 py-4 flex justify-between items-center">
        <div>
          <div className="text-white/70 text-xs mb-1">ID DE SUIVI</div>
          <div className="text-white font-bold text-lg font-mono">{colis.trackingId}</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${statusColors[colis.status] || "bg-gray-400"}`}>
          {statusLabels[colis.status]}
        </span>
      </div>

      <div className="px-6 py-5">
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
          {statusSteps.map((step, i) => (
            <div key={step} className="flex items-center flex-shrink-0">
              <div className={`flex flex-col items-center`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all
                  ${i <= stepIndex ? statusColors[step] || "bg-blue-500" : "bg-gray-200 text-gray-400"}`}>
                  {i <= stepIndex ? <CheckCircle size={16} /> : i + 1}
                </div>
                <div className={`text-xs mt-1 whitespace-nowrap ${i <= stepIndex ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                  {statusLabels[step]}
                </div>
              </div>
              {i < statusSteps.length - 1 && (
                <div className={`h-0.5 w-8 mx-1 mb-4 ${i < stepIndex ? "bg-blue-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">De</div>
            <div className="font-semibold text-sm">{colis.fromCity}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Vers</div>
            <div className="font-semibold text-sm">{colis.toCity}</div>
          </div>
        </div>

        <div className="mb-5">
          <div className="text-center bg-blue-50 rounded-xl p-3">
            <div className="text-xs text-gray-500">Livraison estimée</div>
            <div className="font-semibold text-sm mt-0.5">
              {new Date(colis.estimatedDelivery).toLocaleDateString("fr-MA")}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">Historique</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...colis.statusHistory].reverse().map((h, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <div className="flex-shrink-0 mt-0.5">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 ${statusColors[h.status] || "bg-gray-400"}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-700">{h.message}</div>
                  <div className="text-xs text-gray-400">{h.city} • {new Date(h.createdAt).toLocaleString("fr-MA")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const [trackingId, setTrackingId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await api.colis.track(trackingId.trim().toUpperCase());
      setResult(data);
    } catch (err) {
      setError(err.message || "Colis introuvable. Vérifiez l'ID de suivi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-br from-[#1a2744] via-[#1e3260] to-[#2d4080] py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
            <MapPin size={14} className="text-orange-400" />
            <span className="text-orange-300 text-sm font-medium">Livraison partout au Maroc</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Gérez vos livraisons<br />
            <span className="text-orange-400">en toute simplicité</span>
          </h1>
          <p className="text-gray-300 text-lg mb-10 max-w-2xl mx-auto">
            Suivez vos colis en temps réel, gérez vos expéditions et connectez-vous avec des livreurs vérifiés dans toutes les villes du Maroc.
          </p>

          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-2xl mx-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              SUIVI DE COLIS SANS COMPTE
            </h2>
            <form onSubmit={handleTrack} className="flex gap-3">
              <label htmlFor="tracking-id" className="sr-only">Identifiant de suivi</label>
              <input
                id="tracking-id"
                type="text"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder={demoMode ? "Entrez votre ID de suivi (Ex: LOG2024ABC)" : "Entrez votre ID de suivi"}
                className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:outline-none transition-colors font-mono"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-colors"
              >
                <Search size={18} />
                {loading ? "..." : "SUIVRE"}
              </button>
            </form>
            {error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
            )}
            {demoMode && <div className="mt-2 text-xs text-gray-400 text-center">Essayez : LOG2024ABC</div>}
            <TrackingResult colis={result} />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-3">BIENVENUE - SÉLECTIONNEZ VOTRE RÔLE</h2>
          <p className="text-center text-gray-500 text-sm mb-10">Vous souhaitez juste suivre un colis? Voir ci-dessus.</p>

          <div className="grid md:grid-cols-3 gap-6">
            <RoleCard
              icon="✈"
              color="blue"
              title="EXPÉDITEUR"
              subtitle="CRÉER VOS EXPÉDITIONS"
              description="Envoyez des colis à travers tout le Maroc. Gérez vos commandes et suivez vos livraisons."
              actions={[
                { label: "SE CONNECTER / S'INSCRIRE EXPÉDITEUR", path: "/auth?role=expediteur", primary: true },
              ]}
              navigate={navigate}
            />
            <RoleCard
              icon="🛵"
              color="green"
              title="LIVREUR"
              subtitle="DÉMARRER VOTRE TOURNÉE"
              description="Devenez livreur freelance. Choisissez vos horaires, travaillez dans votre ville."
              actions={[
                { label: "SE CONNECTER / REJOINDRE LIVREUR", path: "/auth?role=livreur", primary: true },
              ]}
              navigate={navigate}
            />
            <RoleCard
              icon="👤"
              color="orange"
              title="DESTINATAIRE"
              subtitle="GÉRER VOS RÉCEPTIONS"
              description="Suivez vos colis entrants, confirmez les livraisons et notez vos livreurs."
              actions={[
                { label: "SE CONNECTER DESTINATAIRE", path: "/auth?role=destinataire", primary: true },
              ]}
              navigate={navigate}
            />
          </div>

          <div className="mt-6 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-2">🚗</div>
            <h3 className="font-bold text-teal-800 text-lg mb-2">Vous voyagez entre deux villes?</h3>
            <p className="text-teal-600 text-sm mb-4">
              Gagnez de l'argent en transportant des colis lors de vos trajets. Aucune inscription livreur requise!
            </p>
            <button
              onClick={() => navigate("/auth?role=voyageur")}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2"
            >
              Devenir Voyageur <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 px-4 border-t">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">Pourquoi choisir Logistics?</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: "🔐", title: "Livreurs Vérifiés", desc: "CIN, permis, véhicule — chaque livreur est contrôlé par notre équipe." },
              { icon: "📍", title: "Suivi en Temps Réel", desc: "Suivez votre colis à chaque étape du parcours, 24h/24." },
              { icon: "⭐", title: "Système de Note", desc: "Notez votre livreur et maintenez un haut niveau de qualité." },
              { icon: "🇲🇦", title: "Tout le Maroc", desc: "18 villes couvertes: Casablanca, Rabat, Marrakech et plus encore." },
            ].map((f) => (
              <div key={f.title} className="text-center p-4">
                <div className="text-4xl mb-3">{f.icon}</div>
                <div className="font-bold text-gray-800 mb-2">{f.title}</div>
                <div className="text-gray-500 text-sm">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#1a2744] text-gray-400 py-8 px-4 text-center text-sm">
        <div className="font-bold text-white text-lg mb-1">LOGISTICS</div>
        <div>Plateforme de gestion des livraisons au Maroc • © 2026</div>
        <div className="mt-2 text-xs">Casablanca, Rabat, Marrakech, Fès, Tanger, Agadir et plus...</div>
      </footer>
    </div>
  );
}

function RoleCard({ icon, color, title, subtitle, description, actions, navigate }) {
  const colors = {
    blue: { border: "border-blue-200", bg: "bg-blue-50", btn: "bg-blue-600 hover:bg-blue-700", icon: "text-blue-500" },
    green: { border: "border-green-200", bg: "bg-green-50", btn: "bg-green-600 hover:bg-green-700", icon: "text-green-500" },
    orange: { border: "border-orange-200", bg: "bg-orange-50", btn: "bg-orange-500 hover:bg-orange-600", icon: "text-orange-500" },
  };
  const c = colors[color];
  return (
    <div className={`border-2 ${c.border} rounded-2xl p-6 ${c.bg} text-center`}>
      <div className={`text-4xl mb-3 ${c.icon}`}>{icon}</div>
      <div className="font-bold text-gray-800 text-lg">{title}</div>
      <div className="text-xs text-gray-500 mb-3">{subtitle}</div>
      <div className="text-gray-600 text-sm mb-5">{description}</div>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => navigate(a.path)}
          className={`w-full py-2.5 px-4 rounded-xl text-white text-sm font-semibold transition-colors ${c.btn}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
