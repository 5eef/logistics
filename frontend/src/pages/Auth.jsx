
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { Package, Eye, EyeOff, Upload, AlertCircle } from "lucide-react";


export default function Auth() {
  const [location, navigate] = useLocation();
  const { login, register, user } = useAuth();

  const params = new URLSearchParams(location.split("?")[1] || "");
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [role, setRole] = useState(params.get("role") || "expediteur");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cities, setCities] = useState(["Casablanca"]);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", city: "Casablanca",
    vehicleType: "Moto", vehiclePlate: "", cin: "", license: "",
  });

  useEffect(() => {
    api.misc.cities().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) navigate(dashPath(user.role));
  }, [user]);

  const dashPath = (r) => {
    switch (r) {
      case "admin": return "/admin";
      case "expediteur": return "/expediteur";
      case "livreur": return "/livreur";
      case "destinataire": return "/destinataire";
      case "voyageur": return "/voyageur";
      default: return "/";
    }
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (mode === "login") {
        const u = await login(form.email, form.password);
        navigate(dashPath(u.role));
      } else {
        const u = await register({ ...form, role });
        navigate(dashPath(u.role));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const roleInfo = {
    expediteur: { label: "Expéditeur", icon: "✈", color: "blue", desc: "Créez et gérez vos expéditions" },
    livreur: { label: "Livreur", icon: "🛵", color: "green", desc: "Rejoignez notre réseau de livraison" },
    destinataire: { label: "Destinataire", icon: "👤", color: "orange", desc: "Gérez vos réceptions" },
    voyageur: { label: "Voyageur", icon: "🚗", color: "teal", desc: "Livrez en voyageant entre villes" },
    admin: { label: "Administrateur", icon: "🔧", color: "purple", desc: "Accès administrateur" },
  };

  const ri = roleInfo[role] || roleInfo.expediteur;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2744] to-[#2d4080] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-4 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Package size={22} className="text-white" />
            </div>
            <span className="text-white font-bold text-2xl">LOGISTICS</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === "login" ? "bg-[#1a2744] text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              SE CONNECTER
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === "register" ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              S'INSCRIRE
            </button>
          </div>

          <div className="p-6">
            {mode === "register" && (
              <div className="mb-5">
                <div className="text-sm font-semibold text-gray-700 mb-3">Choisissez votre rôle</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(roleInfo).filter(([k]) => k !== "admin").map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => setRole(key)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${role === key ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="text-xl mb-1">{info.icon}</div>
                      <div className="font-semibold text-sm text-gray-800">{info.label}</div>
                      <div className="text-xs text-gray-500">{info.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom complet *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      required
                      placeholder="Mohammed Alami"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Téléphone *</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      required
                      placeholder="0612345678"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville *</label>
                    <select
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {cities.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                  placeholder="exemple@email.com"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mot de passe *</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      required
                      minLength={10}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder="••••••••"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {mode === "register" && <p className="mt-1 text-xs text-gray-400">10 caractères minimum, avec lettres et chiffres.</p>}
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {mode === "register" && (role === "livreur" || role === "voyageur") && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-yellow-700 font-semibold text-sm">
                    <Upload size={16} /> Documents de vérification
                  </div>
                  <p className="text-xs text-yellow-600">Votre compte sera activé après vérification par notre équipe (24-48h).</p>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Numéro CIN *</label>
                    <input
                      type="text"
                      value={form.cin}
                      onChange={(e) => set("cin", e.target.value)}
                      required
                      placeholder="BK123456"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  {role === "livreur" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Numéro de permis *</label>
                        <input
                          type="text"
                          value={form.license}
                          onChange={(e) => set("license", e.target.value)}
                          required
                          placeholder="C123456"
                          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type de véhicule</label>
                        <select
                          value={form.vehicleType}
                          onChange={(e) => set("vehicleType", e.target.value)}
                          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          {["Moto", "Voiture", "Camionnette", "Vélo"].map((v) => <option key={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Plaque d'immatriculation</label>
                        <input
                          type="text"
                          value={form.vehiclePlate}
                          onChange={(e) => set("vehiclePlate", e.target.value)}
                          placeholder="12345-A-1"
                          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm transition-colors mt-2"
              >
                {loading ? "Chargement..." : mode === "login" ? "SE CONNECTER" : "CRÉER MON COMPTE"}
              </button>
            </form>

            <div className="text-center mt-4 text-sm text-gray-500">
              {mode === "login" ? (
                <>Pas encore de compte?{" "}
                  <button onClick={() => setMode("register")} className="text-blue-600 font-semibold hover:underline">S'inscrire</button>
                </>
              ) : (
                <>Déjà un compte?{" "}
                  <button onClick={() => setMode("login")} className="text-blue-600 font-semibold hover:underline">Se connecter</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
