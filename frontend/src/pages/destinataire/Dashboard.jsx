
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import Navbar from "../../components/Navbar";
import { Package, Star, RefreshCw, CheckCircle, Clock, Phone, MapPin, Key } from "lucide-react";

const statusLabels = {
  created: "Créé", pending: "En attente", picked_up: "Récupéré",
  in_transit: "En Transit", out_for_delivery: "En Livraison",
  delivered: "Livré", failed: "Échoué", returned: "Retourné",
};
const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  in_transit: "bg-blue-100 text-blue-700",
  picked_up: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const steps = ["created", "pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];

export default function DestinataireeDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [colis, setColis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ratingModal, setRatingModal] = useState(null);
  const [rating, setRating] = useState({ score: 5, comment: "" });
  const [trackId, setTrackId] = useState("");
  const [tracked, setTracked] = useState(null);
  const [trackError, setTrackError] = useState("");

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const c = await api.colis.list();
      setColis(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const trackColis = async (e) => {
    e.preventDefault();
    setTrackError("");
    try {
      const data = await api.colis.track(trackId.trim().toUpperCase());
      setTracked(data);
    } catch (e) { setTrackError(e.message); }
  };

  const submitRating = async () => {
    if (!ratingModal) return;
    try {
      await api.colis.rate(ratingModal.id, {
        toUserId: ratingModal.livreurId,
        score: rating.score,
        comment: rating.comment,
      });
      setRatingModal(null);
      loadData();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>;

  const pending = colis.filter((c) => !["delivered", "failed"].includes(c.status));
  const delivered = colis.filter((c) => c.status === "delivered");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Bonjour, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-gray-500 text-sm">Tableau de bord Destinataire</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-orange-600">
            <div className="text-xs font-medium mb-1">En Attente</div>
            <div className="text-2xl font-bold">{pending.length}</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-green-600">
            <div className="text-xs font-medium mb-1">Livrés</div>
            <div className="text-2xl font-bold">{delivered.length}</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-blue-600">
            <div className="text-xs font-medium mb-1">Total Reçus</div>
            <div className="text-2xl font-bold">{colis.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">Suivre un Colis</h3>
          <form onSubmit={trackColis} className="flex gap-3">
            <input
              type="text"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              placeholder="ID de suivi (ex: LOG2024ABC)"
              className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none font-mono"
            />
            <button type="submit" className="px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600">Suivre</button>
          </form>
          {trackError && <div className="mt-2 text-sm text-red-600">{trackError}</div>}
          {tracked && (
            <div className="mt-4 bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono font-bold text-blue-700">{tracked.trackingId}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[tracked.status] || "bg-gray-100 text-gray-600"}`}>{statusLabels[tracked.status]}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {steps.map((step, i) => {
                  const idx = steps.indexOf(tracked.status);
                  return (
                    <div key={step} className="flex items-center flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i <= idx ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                        {i <= idx ? "✓" : i + 1}
                      </div>
                      {i < steps.length - 1 && <div className={`h-0.5 w-6 ${i < idx ? "bg-blue-500" : "bg-gray-200"}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {pending.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Colis En Attente</h3>
            <div className="space-y-3">
              {pending.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-blue-700">{c.trackingId}</span>
                      <div className="text-xs text-gray-500 mt-0.5">{c.fromCity} → {c.toCity}</div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || "bg-gray-100 text-gray-600"}`}>{statusLabels[c.status]}</span>
                  </div>
                  <div className="px-5 pb-4 grid md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">Description</div>
                      <div className="font-medium">{c.description || "Colis"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Livraison estimée</div>
                      <div className="font-medium">{new Date(c.estimatedDelivery).toLocaleDateString("fr-MA")}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Prix à payer</div>
                      <div className="font-bold text-orange-600">{c.price} MAD</div>
                    </div>
                  </div>
                  {c.status === "out_for_delivery" && (
                    <div className="px-5 pb-4">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800 flex items-center gap-2">
                        <Key size={16} /> Communiquez au livreur le code PIN reçu de l’expéditeur pour confirmer la livraison.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {delivered.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Colis Reçus</h3>
            <div className="space-y-3">
              {delivered.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden opacity-80">
                  <div className="px-5 py-4 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-gray-700">{c.trackingId}</span>
                      <div className="text-xs text-gray-500 mt-0.5">{c.fromCity} → {c.toCity} • {new Date(c.updatedAt).toLocaleDateString("fr-MA")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                        <CheckCircle size={12} /> Livré
                      </span>
                      {c.livreurId && (
                        <button
                          onClick={() => setRatingModal(c)}
                          className="p-1.5 text-yellow-500 hover:bg-yellow-50 rounded-lg"
                          title="Noter le livreur"
                        >
                          <Star size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {colis.length === 0 && (
          <div className="bg-white rounded-2xl border p-16 text-center text-gray-400">
            <Package size={56} className="mx-auto mb-4 opacity-20" />
            <div className="font-medium text-lg">Aucun colis pour le moment</div>
            <div className="text-sm mt-2">Vos colis apparaîtront ici une fois expédiés</div>
          </div>
        )}
      </div>

      {ratingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRatingModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-1 text-center">Noter le Livreur</h3>
            <p className="text-sm text-gray-500 text-center mb-4">Pour la livraison {ratingModal.trackingId}</p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating((p) => ({ ...p, score: s }))} className={`text-3xl transition-transform hover:scale-110 ${s <= rating.score ? "text-yellow-400" : "text-gray-200"}`}>★</button>
              ))}
            </div>
            <textarea
              value={rating.comment}
              onChange={(e) => setRating((p) => ({ ...p, comment: e.target.value }))}
              placeholder="Commentaire (optionnel)"
              rows={3}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setRatingModal(null)} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium">Annuler</button>
              <button onClick={submitRating} className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-sm font-bold">Envoyer ⭐</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
