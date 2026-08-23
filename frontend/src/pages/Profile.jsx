import { useEffect, useState } from "react";
import { Camera, CheckCircle, LoaderCircle, MapPin, ShieldCheck, UserRound } from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

const roleLabels = {
  admin: "Administrateur",
  expediteur: "Expéditeur",
  livreur: "Livreur",
  destinataire: "Destinataire",
  voyageur: "Voyageur",
};

export default function Profile() {
  const { user, updateUser, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", city: "", vehicleType: "", vehiclePlate: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || "",
      phone: user.phone || "",
      city: user.city || "",
      vehicleType: user.vehicleType || "",
      vehiclePlate: user.vehiclePlate || "",
    });
    api.profile.show().then((profile) => {
      setForm({
        name: profile.name || "", phone: profile.phone || "", city: profile.city || "",
        vehicleType: profile.vehicleType || "", vehiclePlate: profile.vehiclePlate || "",
      });
    }).catch(() => {});
  }, [user]);

  if (!user) return null;
  const isCourier = ["livreur", "voyageur"].includes(user.role);
  const avatarInitial = user.name?.trim()?.[0]?.toUpperCase() || "U";
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      await updateUser(form);
      setMessage("Profil enregistré avec succès.");
    } catch (err) {
      setError(err.message || "Impossible de mettre à jour le profil.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      await api.profile.uploadAvatar(file);
      await refreshUser();
      setMessage("Photo de profil mise à jour.");
    } catch (err) {
      setError(err.message || "Impossible d’envoyer cette photo.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
          <p className="text-sm text-gray-500 mt-1">Gérez vos coordonnées et votre photo de profil.</p>
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-20 shrink-0">
              <div className="w-20 h-20 rounded-full bg-orange-500 text-white flex items-center justify-center text-2xl font-bold overflow-hidden">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={`Photo de ${user.name}`} className="w-full h-full object-cover" /> : avatarInitial}
              </div>
              <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-[#1a2744] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2d4080]" title="Changer la photo">
                {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadAvatar} disabled={uploading} />
              </label>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{user.name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                <UserRound size={13} /> {roleLabels[user.role] || user.role}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">PNG, JPG ou WebP, 2 Mo maximum.</p>
        </section>

        <form onSubmit={save} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nom complet" value={form.name} onChange={(value) => set("name", value)} required />
            <Field label="Téléphone" type="tel" value={form.phone} onChange={(value) => set("phone", value)} required />
            <Field label="Ville" value={form.city} onChange={(value) => set("city", value)} required icon={<MapPin size={15} />} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse email</label>
              <input value={user.email} disabled className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500" />
              <p className="text-xs text-gray-400 mt-1">L’email et le rôle ne peuvent pas être modifiés ici.</p>
            </div>
          </div>

          {isCourier && (
            <div className="border-t pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4"><ShieldCheck size={17} /> Véhicule</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Type de véhicule" value={form.vehicleType} onChange={(value) => set("vehicleType", value)} />
                <Field label="Plaque d’immatriculation" value={form.vehiclePlate} onChange={(value) => set("vehiclePlate", value)} />
              </div>
            </div>
          )}

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 flex gap-2 items-center"><CheckCircle size={16} /> {message}</p>}
          <div className="flex justify-end">
            <button disabled={saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2">
              {saving && <LoaderCircle size={16} className="animate-spin" />} Enregistrer les modifications
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, required, icon }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      <span className="flex items-center gap-1.5 mb-1.5">{icon}{label}{required && " *"}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none" />
    </label>
  );
}
