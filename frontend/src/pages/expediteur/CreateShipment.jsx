
import { useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { Package, CheckCircle, QrCode } from "lucide-react";

const CITIES = [
  "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir",
  "Meknès", "Oujda", "Kénitra", "Tétouan", "Safi", "Mohammedia",
  "Khouribga", "Béni Mellal", "El Jadida", "Nador", "Settat", "Laâyoune"
];

export default function CreateShipment({ onSuccess }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState({
    fromCity: user?.city || "Casablanca",
    toCity: "Rabat",
    fromAddress: "",
    toAddress: "",
    recipientName: "",
    recipientPhone: "",
    weight: "",
    description: "",
    price: "",
    notes: "",
    isVoyageurEligible: false,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const estimatePrice = () => {
    if (!form.weight) return 0;
    const base = form.fromCity === form.toCity ? 30 : 60;
    return Math.round(base + parseFloat(form.weight) * 5);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const payload = { ...form, price: form.price || estimatePrice() };
      const result = await api.colis.create(payload);
      setCreated(result);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 3 && created) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Expédition Créée!</h2>
        <p className="text-gray-500 text-sm mb-6">Votre colis a été enregistré avec succès.</p>

        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm text-left">
          <div className="flex justify-between">
            <span className="text-gray-500">ID de suivi</span>
            <span className="font-mono font-bold text-blue-700">{created.trackingId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Code PIN destinataire</span>
            <span className="font-mono font-bold text-orange-600 bg-orange-50 px-2 rounded">{created.recipientPin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Destination</span>
            <span>{created.fromCity} → {created.toCity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Prix</span>
            <span className="font-semibold">{created.price} MAD</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Livraison estimée</span>
            <span>{new Date(created.estimatedDelivery).toLocaleDateString("fr-MA")}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 mb-6">
          Partagez le code PIN <strong>{created.recipientPin}</strong> avec le destinataire. Il sera requis pour confirmer la livraison.
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setStep(1); setCreated(null); setForm({ fromCity: user?.city || "Casablanca", toCity: "Rabat", fromAddress: "", toAddress: "", recipientName: "", recipientPhone: "", weight: "", description: "", price: "", notes: "", isVoyageurEligible: false }); }}
            className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            Nouvelle Expédition
          </button>
          <button
            onClick={onSuccess}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Voir Mes Colis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border max-w-2xl mx-auto overflow-hidden">
      <div className="bg-gradient-to-r from-[#1a2744] to-[#2d4080] px-6 py-4">
        <h2 className="text-white font-bold text-lg">Nouvelle Expédition</h2>
        <div className="flex gap-4 mt-3">
          {[["1", "Adresses"], ["2", "Colis & Prix"]].map(([n, l]) => (
            <div key={n} className={`flex items-center gap-2 text-sm ${step >= parseInt(n) ? "text-white" : "text-white/40"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= parseInt(n) ? "bg-orange-500" : "bg-white/20"}`}>{n}</div>
              {l}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville d'origine *</label>
                <select value={form.fromCity} onChange={(e) => set("fromCity", e.target.value)} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville de destination *</label>
                <select value={form.toCity} onChange={(e) => set("toCity", e.target.value)} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Adresse d'expédition *</label>
              <input type="text" value={form.fromAddress} onChange={(e) => set("fromAddress", e.target.value)} required placeholder="123 Rue Mohammed V, Casablanca" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Adresse de livraison *</label>
              <input type="text" value={form.toAddress} onChange={(e) => set("toAddress", e.target.value)} required placeholder="456 Bd Hassan II, Rabat" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom du destinataire *</label>
                <input type="text" value={form.recipientName} onChange={(e) => set("recipientName", e.target.value)} required placeholder="Mohammed Alami" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Téléphone destinataire *</label>
                <input type="tel" value={form.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} required placeholder="0612345678" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <button type="button" onClick={() => { if (!form.fromAddress || !form.toAddress || !form.recipientName || !form.recipientPhone) { setError("Remplissez tous les champs obligatoires"); return; } setError(""); setStep(2); }} className="w-full py-3 bg-[#1a2744] text-white rounded-xl font-semibold text-sm hover:bg-[#2d4080] transition-colors">
              Suivant →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Poids (kg) *</label>
                <input type="number" step="0.1" min="0.1" value={form.weight} onChange={(e) => set("weight", e.target.value)} required placeholder="1.5" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prix (MAD) *</label>
                <input type="number" min="1" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder={`Estimé: ${estimatePrice()} MAD`} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description du colis</label>
              <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Vêtements, électronique, documents..." className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes pour le livreur</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Instructions spéciales..." className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none resize-none" />
            </div>
            <label className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.isVoyageurEligible} onChange={(e) => set("isVoyageurEligible", e.target.checked)} className="w-4 h-4" />
              <div>
                <div className="font-semibold text-teal-700 text-sm">Livraison par Voyageur</div>
                <div className="text-xs text-teal-600">Permettre à un voyageur de livrer ce colis lors de son trajet entre villes</div>
              </div>
            </label>

            {form.weight && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="font-semibold text-blue-800 text-sm mb-2">Résumé</div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-600">Trajet</span><span>{form.fromCity} → {form.toCity}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Poids</span><span>{form.weight} kg</span></div>
                  <div className="flex justify-between font-bold text-blue-800"><span>Prix total</span><span>{form.price || estimatePrice()} MAD</span></div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50">
                ← Retour
              </button>
              <button type="submit" disabled={loading || !form.weight} className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <Package size={18} /> {loading ? "Création..." : "Créer l'Expédition"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
