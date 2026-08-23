
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import Navbar from "../../components/Navbar";
import CreateShipment from "./CreateShipment";
import {
  Package, Plus, TrendingUp, Clock, CheckCircle, XCircle,
  Eye, Star, MessageSquare, RefreshCw, QrCode, DollarSign
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const statusLabels = {
  created: "Créé", pending: "En attente", picked_up: "Récupéré",
  in_transit: "En Transit", out_for_delivery: "En Livraison",
  delivered: "Livré", failed: "Échoué", returned: "Retourné",
};
const statusColors = {
  created: "bg-gray-100 text-gray-700", pending: "bg-yellow-100 text-yellow-700",
  picked_up: "bg-blue-100 text-blue-700", in_transit: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-orange-100 text-orange-700", delivered: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700", returned: "bg-red-100 text-red-700",
};

export default function ExpediteurDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const [colis, setColis] = useState([]);
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ratingModal, setRatingModal] = useState(null);
  const [rating, setRating] = useState({ score: 5, comment: "" });
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "", priority: "medium" });

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, s, t] = await Promise.all([
        api.colis.list(),
        api.colis.stats(),
        api.tickets.list(),
      ]);
      setColis(c);
      setStats(s);
      setTickets(t);
    } catch (e) { console.error(e); }
    setLoading(false);
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

  const submitTicket = async (e) => {
    e.preventDefault();
    try {
      await api.tickets.create(ticketForm);
      setTicketForm({ subject: "", message: "", priority: "medium" });
      loadData();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>;

  const COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Bonjour, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="text-gray-500 text-sm">Tableau de bord Expéditeur • {user?.city}</p>
          </div>
          <button
            onClick={() => setTab("create")}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors"
          >
            <Plus size={18} /> Nouvelle Expédition
          </button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {[["overview", "Aperçu"], ["colis", "Mes Colis"], ["create", "Créer Expédition"], ["tickets", "Support"]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${tab === k ? "bg-[#1a2744] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "overview" && stats && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon={<Package size={20} />} label="Total Colis" value={stats.total} color="blue" />
              <StatCard icon={<Clock size={20} />} label="En Transit" value={stats.in_transit} color="orange" />
              <StatCard icon={<CheckCircle size={20} />} label="Livrés" value={stats.delivered} color="green" />
              <StatCard icon={<DollarSign size={20} />} label="Revenus (MAD)" value={stats.revenue} color="purple" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-4">Répartition par statut</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "En attente", value: stats.pending },
                        { name: "En transit", value: stats.in_transit },
                        { name: "Livrés", value: stats.delivered },
                        { name: "Échoués", value: stats.failed },
                      ].filter((d) => d.value > 0)}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                    >
                      {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-4">Derniers colis</h3>
                <div className="space-y-3">
                  {colis.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-mono font-medium text-blue-700">{c.trackingId}</span>
                        <div className="text-xs text-gray-500">{c.toCity} • {c.recipientName}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status]}`}>
                        {statusLabels[c.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "colis" && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Mes Expéditions ({colis.length})</h3>
              <button onClick={loadData} className="text-gray-400 hover:text-gray-600"><RefreshCw size={16} /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["ID Suivi", "Destination", "Destinataire", "Poids", "Prix", "Statut", "Actions"].map((h) => (
                      <th key={h} className="text-xs font-semibold text-gray-500 text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colis.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-blue-700">{c.trackingId}</td>
                      <td className="px-4 py-3 text-sm">{c.fromCity} → {c.toCity}</td>
                      <td className="px-4 py-3 text-sm">{c.recipientName}</td>
                      <td className="px-4 py-3 text-sm">{c.weight} kg</td>
                      <td className="px-4 py-3 text-sm font-semibold">{c.price} MAD</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status]}`}>
                          {statusLabels[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setSelected(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Détails">
                            <Eye size={15} />
                          </button>
                          {c.status === "delivered" && c.livreurId && (
                            <button onClick={() => setRatingModal(c)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Noter">
                              <Star size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {colis.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Package size={48} className="mx-auto mb-3 opacity-30" />
                  <div>Aucune expédition. Créez votre premier colis!</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "create" && (
          <CreateShipment onSuccess={() => { setTab("colis"); loadData(); }} />
        )}

        {tab === "tickets" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border">
              <div className="px-5 py-4 border-b font-semibold text-gray-800">Nouveau Ticket</div>
              <form onSubmit={submitTicket} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sujet</label>
                  <input
                    type="text"
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm((p) => ({ ...p, subject: e.target.value }))}
                    required
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Priorité</label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Message</label>
                  <textarea
                    value={ticketForm.message}
                    onChange={(e) => setTicketForm((p) => ({ ...p, message: e.target.value }))}
                    required
                    rows={4}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
                <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                  Envoyer le Ticket
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border">
              <div className="px-5 py-4 border-b font-semibold text-gray-800">Mes Tickets ({tickets.length})</div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {tickets.map((t) => (
                  <div key={t.id} className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm">{t.subject}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === "open" ? "bg-yellow-100 text-yellow-700" : t.status === "resolved" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString("fr-MA")}</div>
                    {t.responses.length > 0 && (
                      <div className="mt-2 bg-blue-50 rounded-lg p-2 text-xs text-blue-800">
                        <strong>Support:</strong> {t.responses[t.responses.length - 1].message}
                      </div>
                    )}
                  </div>
                ))}
                {tickets.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm"><MessageSquare size={32} className="mx-auto mb-2 opacity-30" />Aucun ticket</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Détails du Colis</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">ID de suivi</span>
                <span className="font-mono font-bold text-blue-700">{selected.trackingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Statut</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status]}`}>{statusLabels[selected.status]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">De → Vers</span>
                <span className="text-sm font-medium">{selected.fromCity} → {selected.toCity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Destinataire</span>
                <span className="text-sm font-medium">{selected.recipientName} • {selected.recipientPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Poids / Prix</span>
                <span className="text-sm font-medium">{selected.weight} kg / {selected.price} MAD</span>
              </div>
              <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
                Le code PIN n’est affiché qu’une seule fois à la création de l’expédition.
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-2">Historique</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {[...selected.statusHistory].reverse().map((h, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{h.message}</div>
                        <div className="text-gray-400">{h.city} • {new Date(h.createdAt).toLocaleString("fr-MA")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ratingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRatingModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-4">Noter le Livreur</h3>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating((p) => ({ ...p, score: s }))} className={`text-3xl ${s <= rating.score ? "text-yellow-400" : "text-gray-200"}`}>★</button>
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
              <button onClick={submitRating} className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-sm font-bold transition-colors">Envoyer</button>
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
      <div className="text-2xl font-bold">{typeof value === "number" && value > 100 ? value.toLocaleString() : value}</div>
    </div>
  );
}
