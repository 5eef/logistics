
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import Navbar from "../../components/Navbar";
import {
  Users, Package, TrendingUp, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Star, MessageSquare, Shield, Ban, Eye, Bell
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts";

const COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#14B8A6"];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingCouriers, setPendingCouriers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [colis, setColis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReply, setTicketReply] = useState("");
  const [rejReason, setRejReason] = useState("");
  const [warnReason, setWarnReason] = useState("");

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    if (user.role !== "admin") { navigate("/"); return; }
    loadAll();
  }, [user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, u, p, t, c] = await Promise.all([
        api.admin.stats(),
        api.admin.users(),
        api.admin.pendingCouriers(),
        api.admin.tickets(),
        api.admin.colis(),
      ]);
      setStats(s);
      setUsers(u);
      setPendingCouriers(p);
      setTickets(t);
      setColis(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const verifyCourier = async (id, status) => {
    try {
      await api.admin.verifyCourier(id, status, rejReason);
      setSelectedCourier(null);
      setRejReason("");
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const warnCourier = async (id) => {
    try {
      await api.admin.warnCourier(id, warnReason);
      setWarnReason("");
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const banCourier = async (id) => {
    if (!confirm("Bannir définitivement cet utilisateur?")) return;
    try {
      await api.admin.banCourier(id);
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const replyTicket = async (id) => {
    try {
      await api.admin.replyTicket(id, "resolved", ticketReply);
      setSelectedTicket(null);
      setTicketReply("");
      loadAll();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>;

  const tabs = [
    ["overview", "Aperçu", null],
    ["couriers", `Vérification (${pendingCouriers.length})`, pendingCouriers.length > 0 ? "bg-red-500" : null],
    ["users", "Utilisateurs", null],
    ["colis", "Colis", null],
    ["tickets", `Tickets (${tickets.filter((t) => t.status === "open").length})`, null],
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Tableau de Bord Administrateur</h1>
            <p className="text-gray-500 text-sm">Gestion globale de la plateforme Logistics</p>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">
            <RefreshCw size={16} /> Actualiser
          </button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(([k, l, badge]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`relative px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${tab === k ? "bg-[#1a2744] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}>
              {l}
              {badge && <span className={`absolute -top-1 -right-1 w-4 h-4 ${badge} rounded-full text-white text-[10px] flex items-center justify-center font-bold`}>!</span>}
            </button>
          ))}
        </div>

        {tab === "overview" && stats && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon={<Package size={20} />} label="Total Colis" value={stats.totalColis} color="blue" />
              <StatCard icon={<Users size={20} />} label="Utilisateurs" value={stats.totalUsers} color="purple" />
              <StatCard icon={<CheckCircle size={20} />} label="Taux Livraison" value={`${stats.deliveryRate}%`} color="green" />
              <StatCard icon={<TrendingUp size={20} />} label="Revenus (MAD)" value={stats.totalRevenue.toLocaleString()} color="orange" />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <StatCard icon={<Shield size={20} />} label="Livreurs" value={stats.totalLivreurs} color="blue" />
              <StatCard icon={<AlertTriangle size={20} />} label="Vérifications en attente" value={stats.pendingVerifications} color="orange" />
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-4">Répartition des statuts</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.statusStats.filter((d) => d.value > 0)} cx="50%" cy="50%" outerRadius={85} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {stats.statusStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-4">Colis par ville</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.cityStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="city" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h3 className="font-semibold text-gray-800 mb-4">Évolution mensuelle</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="colis" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === "couriers" && (
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Demandes de vérification ({pendingCouriers.length})</h3>
            {pendingCouriers.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
                <Shield size={48} className="mx-auto mb-3 opacity-30" />
                <div>Aucune demande en attente</div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {pendingCouriers.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="bg-yellow-50 border-b border-yellow-100 px-5 py-3 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-gray-800">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.role} • {c.city}</div>
                      </div>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">En attente</span>
                    </div>
                    <div className="p-5 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{c.email}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Téléphone</span><span>{c.phone}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">CIN</span><span className="font-mono">{c.cin || "—"}</span></div>
                      {c.role === "livreur" && (
                        <>
                          <div className="flex justify-between"><span className="text-gray-500">Permis</span><span className="font-mono">{c.license || "—"}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Véhicule</span><span>{c.vehicleType} • {c.vehiclePlate || "—"}</span></div>
                        </>
                      )}
                      <div className="flex justify-between"><span className="text-gray-500">Avertissements</span>
                        <span className={`font-semibold ${c.warnings > 0 ? "text-red-600" : "text-green-600"}`}>{c.warnings}</span>
                      </div>
                    </div>
                    <div className="px-5 pb-5 flex gap-2">
                      <button onClick={() => verifyCourier(c.id, "approved")} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1">
                        <CheckCircle size={16} /> Approuver
                      </button>
                      <button onClick={() => { setSelectedCourier(c); }} className="flex-1 py-2.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl text-sm font-semibold flex items-center justify-center gap-1">
                        <XCircle size={16} /> Rejeter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b font-semibold text-gray-800">Tous les Utilisateurs ({users.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Nom", "Email", "Rôle", "Ville", "Note", "Avertissements", "Statut", "Actions"].map((h) => (
                      <th key={h} className="text-xs font-semibold text-gray-500 text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-sm">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.role === "livreur" ? "bg-green-100 text-green-700" :
                          u.role === "expediteur" ? "bg-blue-100 text-blue-700" :
                          u.role === "voyageur" ? "bg-teal-100 text-teal-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">{u.city}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Star size={12} className="text-yellow-400 fill-yellow-400" />
                          {u.rating || 0}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${u.warnings > 0 ? "text-red-600" : "text-gray-400"}`}>{u.warnings}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.isBanned ? "bg-red-100 text-red-700" :
                          u.verificationStatus === "approved" ? "bg-green-100 text-green-700" :
                          u.verificationStatus === "pending" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {u.isBanned ? "Banni" : u.verificationStatus || "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {(u.role === "livreur" || u.role === "voyageur") && !u.isBanned && (
                            <>
                              <button onClick={() => { setSelectedCourier(u); setWarnReason(""); }} title="Avertir" className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"><AlertTriangle size={14} /></button>
                              <button onClick={() => banCourier(u.id)} title="Bannir" className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Ban size={14} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "colis" && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b font-semibold text-gray-800">Tous les Colis ({colis.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["ID Suivi", "Trajet", "Destinataire", "Poids", "Prix", "Payé", "Statut", "Date"].map((h) => (
                      <th key={h} className="text-xs font-semibold text-gray-500 text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colis.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-blue-700">{c.trackingId}</td>
                      <td className="px-4 py-3 text-sm">{c.fromCity} → {c.toCity}</td>
                      <td className="px-4 py-3 text-sm">{c.recipientName}</td>
                      <td className="px-4 py-3 text-sm">{c.weight}kg</td>
                      <td className="px-4 py-3 text-sm font-semibold">{c.price} MAD</td>
                      <td className="px-4 py-3">{c.isPaid ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "delivered" ? "bg-green-100 text-green-700" :
                          c.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                          c.status === "failed" ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString("fr-MA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "tickets" && (
          <div className="space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-gray-800">{t.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.message.slice(0, 100)}...</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      t.priority === "urgent" ? "bg-red-100 text-red-700" :
                      t.priority === "high" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{t.priority}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === "open" ? "bg-yellow-100 text-yellow-700" : t.status === "resolved" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{t.status}</span>
                    <button onClick={() => { setSelectedTicket(t); setTicketReply(""); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                      <MessageSquare size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {tickets.length === 0 && (
              <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
                <div>Aucun ticket</div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCourier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCourier(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-4">Action sur {selectedCourier.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Raison / Motif</label>
                <textarea
                  value={rejReason || warnReason}
                  onChange={(e) => { setRejReason(e.target.value); setWarnReason(e.target.value); }}
                  rows={3}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                  placeholder="Indiquez la raison..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedCourier.verificationStatus === "pending" ? (
                  <>
                    <button onClick={() => verifyCourier(selectedCourier.id, "approved")} className="py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600">Approuver</button>
                    <button onClick={() => verifyCourier(selectedCourier.id, "rejected")} className="py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Rejeter</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => warnCourier(selectedCourier.id)} className="py-2.5 bg-yellow-400 hover:bg-yellow-500 text-white rounded-xl text-sm font-semibold">Avertir</button>
                    <button onClick={() => { banCourier(selectedCourier.id); setSelectedCourier(null); }} className="py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Bannir</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedCourier(null)} className="w-full py-2 border-2 border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTicket(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-gray-800">{selectedTicket.subject}</h3>
              <div className="text-sm text-gray-500 mt-1">{selectedTicket.message}</div>
            </div>
            <div className="p-6">
              {selectedTicket.responses.map((r) => (
                <div key={r.id} className="bg-blue-50 rounded-xl p-3 mb-3">
                  <div className="text-xs font-semibold text-blue-700 mb-1">{r.userName}</div>
                  <div className="text-sm">{r.message}</div>
                </div>
              ))}
              <textarea
                value={ticketReply}
                onChange={(e) => setTicketReply(e.target.value)}
                rows={3}
                placeholder="Votre réponse..."
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none mb-3"
              />
              <div className="flex gap-2">
                <button onClick={() => setSelectedTicket(null)} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm">Annuler</button>
                <button onClick={() => replyTicket(selectedTicket.id)} disabled={!ticketReply} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">Répondre & Résoudre</button>
              </div>
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
