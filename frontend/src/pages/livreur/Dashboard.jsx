
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import Navbar from "../../components/Navbar";
import Pagination from "../../components/Pagination";
import {
  Package, MapPin, CheckCircle, Clock, Star, RefreshCw,
  Phone, Key, DollarSign, AlertTriangle
} from "lucide-react";

const statusLabels = {
  pending: "En attente", picked_up: "Récupéré", in_transit: "En Transit",
  out_for_delivery: "En Livraison", delivered: "Livré", failed: "Échoué",
};

export default function LivreurDashboard() {
  const { user, updateUser } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("available");
  const [available, setAvailable] = useState([]);
  const [myDeliveries, setMyDeliveries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pinModal, setPinModal] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [pageError, setPageError] = useState("");
  const [availableMeta, setAvailableMeta] = useState(null);
  const [deliveriesMeta, setDeliveriesMeta] = useState(null);

  const loadData = useCallback(async (availablePage = 1, deliveriesPage = 1) => {
    setLoading(true);
    try {
      const [avail, mine, s] = await Promise.all([
        api.colis.list({ status: "available", page: availablePage }),
        api.colis.list({ page: deliveriesPage }),
        api.colis.stats(),
      ]);
      setAvailable(avail.data); setAvailableMeta(avail.meta);
      setMyDeliveries(mine.data); setDeliveriesMeta(mine.meta);
      setStats(s);
      setPageError("");
    } catch (e) { setPageError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user, navigate, loadData]);

  const toggleOnline = async () => {
    try {
      await updateUser({ isOnline: !user.isOnline });
    } catch (e) { setPageError(e.message); }
  };

  const acceptColis = async (colis) => {
    setUpdating(true);
    try {
      await api.colis.updateStatus(colis.id, "picked_up", "Colis récupéré par le livreur");
      loadData();
      setTab("deliveries");
    } catch (e) { setPageError(e.message); }
    setUpdating(false);
  };

  const updateDeliveryStatus = async (colisId, status, msg) => {
    setUpdating(true);
    try {
      await api.colis.updateStatus(colisId, status, msg);
      loadData();
    } catch (e) { setPageError(e.message); }
    setUpdating(false);
  };

  const validatePin = async () => {
    if (!pinModal || !pin) return;
    setPinError("");
    try {
      await api.colis.validatePin(pinModal.id, pin);
      setPinModal(null);
      setPin("");
      loadData();
    } catch (e) {
      setPinError(e.message);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>;

  const isVerified = user?.isVerified && user?.verificationStatus === "approved";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {pageError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{pageError}</div>}

        {user?.verificationStatus === "pending" && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4 mb-5 flex items-center gap-3">
            <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0" />
            <div>
              <div className="font-semibold text-yellow-800">Compte en cours de vérification</div>
              <div className="text-sm text-yellow-700">Vos informations sont en cours d'examen par notre équipe. Délai: 24-48h.</div>
            </div>
          </div>
        )}

        {user?.isBanned && (
          <div className="bg-red-50 border border-red-300 rounded-2xl p-4 mb-5 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-600" />
            <div className="font-semibold text-red-800">Compte suspendu définitivement. Contactez le support.</div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Bonjour, {user?.name?.split(" ")[0]} 👋</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin size={14} /> {user?.city}
              <div className="flex items-center gap-1 ml-2">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span>{user?.rating || 0}/5</span>
              </div>
            </div>
          </div>

          <button
            onClick={toggleOnline}
            disabled={!isVerified}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${user?.isOnline ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"} disabled:opacity-50`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${user?.isOnline ? "bg-white" : "bg-gray-400"}`} />
            {user?.isOnline ? "EN LIGNE" : "HORS LIGNE"}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Package size={18} />} label="Total" value={stats.total} color="blue" />
            <StatCard icon={<Clock size={18} />} label="En cours" value={stats.in_transit} color="orange" />
            <StatCard icon={<CheckCircle size={18} />} label="Livrés" value={stats.delivered} color="green" />
            <StatCard icon={<DollarSign size={18} />} label="Revenus (MAD)" value={stats.revenue} color="purple" />
          </div>
        )}

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {[["available", `Disponibles (${available.length})`], ["deliveries", `Mes Livraisons (${myDeliveries.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${tab === k ? "bg-[#1a2744] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "available" && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-700 flex items-center gap-2">
              <MapPin size={16} /> Affichage des colis disponibles dans votre ville: <strong>{user?.city}</strong>
            </div>
            {available.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
                <Package size={48} className="mx-auto mb-3 opacity-30" />
                <div className="font-medium">Aucun colis disponible à {user?.city}</div>
                <div className="text-sm mt-1">Revenez plus tard ou vérifiez votre connexion</div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {available.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 flex justify-between items-center">
                      <span className="text-white font-mono font-bold">{c.trackingId}</span>
                      <span className="text-white font-bold text-lg">{c.price} MAD</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">De</div>
                          <div className="font-semibold text-sm">{c.fromCity}</div>
                        </div>
                        <div className="text-gray-300">→</div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Vers</div>
                          <div className="font-semibold text-sm">{c.toCity}</div>
                        </div>
                      </div>
                      <div className="flex justify-between text-sm mb-3">
                        <span className="text-gray-500">{c.weight} kg • {c.description || "Colis"}</span>
                        <span className="text-gray-500">Détails protégés avant acceptation</span>
                      </div>
                      {c.isVoyageurEligible && (
                        <div className="text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-2 py-1 mb-3">
                          🚗 Eligible voyageur (livraison inter-villes)
                        </div>
                      )}
                      <button
                        onClick={() => acceptColis(c)}
                        disabled={!isVerified || !user?.isOnline || updating}
                        className="w-full py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
                      >
                        {!isVerified ? "Compte non vérifié" : !user?.isOnline ? "Mettez-vous en ligne" : "Accepter ce Colis"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "deliveries" && (
          <div className="space-y-4">
            {myDeliveries.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
                <Package size={48} className="mx-auto mb-3 opacity-30" />
                <div>Aucune livraison en cours</div>
              </div>
            ) : (
              myDeliveries.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-blue-700">{c.trackingId}</span>
                      <div className="text-xs text-gray-500 mt-0.5">{c.fromCity} → {c.toCity}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      c.status === "delivered" ? "bg-green-100 text-green-700" :
                      c.status === "failed" ? "bg-red-100 text-red-700" :
                      "bg-orange-100 text-orange-700"
                    }`}>{statusLabels[c.status] || c.status}</span>
                  </div>
                  <div className="px-5 py-4">
                    <div className="grid md:grid-cols-3 gap-3 mb-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Destinataire</div>
                        <div className="font-medium">{c.recipientName}</div>
                        <a href={`tel:${c.recipientPhone}`} className="text-blue-600 flex items-center gap-1 text-xs mt-0.5 hover:underline">
                          <Phone size={12} /> {c.recipientPhone}
                        </a>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Adresse</div>
                        <div className="font-medium text-xs">{c.toAddress}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Prix</div>
                        <div className="font-bold text-green-600">{c.price} MAD</div>
                      </div>
                    </div>

                    {c.status !== "delivered" && c.status !== "failed" && (
                      <div className="flex flex-wrap gap-2">
                        {c.status === "picked_up" && (
                          <button onClick={() => updateDeliveryStatus(c.id, "in_transit", "En cours de livraison")}
                            className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-semibold hover:bg-blue-600">
                            Marquer En Transit
                          </button>
                        )}
                        {(c.status === "in_transit" || c.status === "picked_up") && (
                          <button onClick={() => updateDeliveryStatus(c.id, "out_for_delivery", "En cours de livraison finale")}
                            className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600">
                            En Livraison Finale
                          </button>
                        )}
                        {c.status === "out_for_delivery" && (
                          <button onClick={() => { setPinModal(c); setPin(""); setPinError(""); }}
                            className="px-4 py-2 bg-green-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 hover:bg-green-600">
                            <Key size={14} /> Valider PIN
                          </button>
                        )}
                        <button onClick={() => updateDeliveryStatus(c.id, "failed", "Tentative de livraison échouée")}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-200">
                          Échec de livraison
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <Pagination
          meta={tab === "available" ? availableMeta : deliveriesMeta}
          onPageChange={(page) => loadData(
            tab === "available" ? page : (availableMeta?.currentPage || 1),
            tab === "deliveries" ? page : (deliveriesMeta?.currentPage || 1),
          )}
          label={tab === "available" ? "Pagination des colis disponibles" : "Pagination de mes livraisons"}
        />
      </div>

      {pinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPinModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Key size={24} className="text-green-600" />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">Valider la Livraison</h3>
              <p className="text-sm text-gray-500 mt-1">Demandez le code PIN au destinataire</p>
            </div>
            <label htmlFor="courier-delivery-pin" className="sr-only">Code PIN de livraison</label>
            <input
              id="courier-delivery-pin"
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Entrez le code PIN à 4 chiffres"
              maxLength={4}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-green-500 focus:outline-none mb-3"
            />
            {pinError && <div className="text-red-600 text-sm text-center mb-3">{pinError}</div>}
            <div className="flex gap-2">
              <button onClick={() => setPinModal(null)} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium">Annuler</button>
              <button onClick={validatePin} disabled={pin.length < 4} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  };
  return (
    <div className={`border rounded-2xl p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-medium opacity-80">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
