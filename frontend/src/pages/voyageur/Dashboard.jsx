
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import Navbar from "../../components/Navbar";
import Pagination from "../../components/Pagination";
import { Package, MapPin, ArrowRight } from "lucide-react";

export default function VoyageurDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [fromCity, setFromCity] = useState(user?.city || "Casablanca");
  const [toCity, setToCity] = useState("Rabat");
  const [available, setAvailable] = useState([]);
  const [myDeliveries, setMyDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [pinModal, setPinModal] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [cities, setCities] = useState([]);
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeTrip, setActiveTrip] = useState(null);
  const [pageError, setPageError] = useState("");
  const [availableMeta, setAvailableMeta] = useState(null);
  const [deliveriesMeta, setDeliveriesMeta] = useState(null);
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    Promise.all([api.colis.list(), api.misc.cities(), api.travelerTrips.list()])
      .then(([deliveries, supportedCities, activeTrips]) => {
        setMyDeliveries(deliveries.data); setDeliveriesMeta(deliveries.meta); setCities(supportedCities); setTrips(activeTrips);
      })
      .catch((error) => setPageError(error.message));
  }, [user, navigate]);

  const search = async () => {
    setLoading(true);
    try {
      const trip = await api.travelerTrips.create({ fromCity, toCity, departureDate });
      setActiveTrip(trip);
      const res = await api.colis.list({ tripId: trip.id });
      setAvailable(res.data); setAvailableMeta(res.meta);
      setTrips(await api.travelerTrips.list());
      setSearched(true);
      setPageError("");
    } catch (e) { setPageError(e.message); }
    setLoading(false);
  };

  const acceptColis = async (colis) => {
    setUpdating(true);
    try {
      await api.colis.updateStatus(colis.id, "picked_up", "Colis pris en charge par un voyageur", activeTrip?.id);
      if (activeTrip) {
        const availablePage = await api.colis.list({ tripId: activeTrip.id });
        setAvailable(availablePage.data); setAvailableMeta(availablePage.meta);
      }
      const mine = await api.colis.list();
      setMyDeliveries(mine.data); setDeliveriesMeta(mine.meta);
    } catch (e) { setPageError(e.message); }
    setUpdating(false);
  };

  const updateStatus = async (id, status, msg) => {
    setUpdating(true);
    try {
      await api.colis.updateStatus(id, status, msg);
      const mine = await api.colis.list();
      setMyDeliveries(mine.data); setDeliveriesMeta(mine.meta);
    } catch (e) { setPageError(e.message); }
    setUpdating(false);
  };

  const validatePin = async () => {
    if (!pinModal || pin.length !== 4) return;
    setUpdating(true);
    setPinError("");
    try {
      await api.colis.validatePin(pinModal.id, pin);
      setPinModal(null);
      setPin("");
      const mine = await api.colis.list();
      setMyDeliveries(mine.data); setDeliveriesMeta(mine.meta);
    } catch (e) {
      setPinError(e.message);
    } finally {
      setUpdating(false);
    }
  };

  const cancelTrip = async (id) => {
    try {
      await api.travelerTrips.cancel(id);
      const activeTrips = await api.travelerTrips.list();
      setTrips(activeTrips);
      if (activeTrip?.id === id) { setActiveTrip(null); setAvailable([]); setSearched(false); }
    } catch (error) { setPageError(error.message); }
  };

  const changeAvailablePage = async (page) => {
    if (!activeTrip) return;
    try {
      const result = await api.colis.list({ tripId: activeTrip.id, page });
      setAvailable(result.data); setAvailableMeta(result.meta);
    } catch (error) { setPageError(error.message); }
  };

  const changeDeliveriesPage = async (page) => {
    try {
      const result = await api.colis.list({ page });
      setMyDeliveries(result.data); setDeliveriesMeta(result.meta);
    } catch (error) { setPageError(error.message); }
  };

  const isVerified = user?.isVerified && user?.verificationStatus === "approved";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {pageError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{pageError}</div>}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Bonjour, {user?.name?.split(" ")[0]} 🚗</h1>
          <p className="text-gray-500 text-sm">Tableau de bord Voyageur — Livrez des colis en voyageant</p>
        </div>

        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 mb-6">
          <h3 className="font-bold text-teal-800 mb-1">Comment ça marche?</h3>
          <p className="text-sm text-teal-700 mb-4">
            Vous voyagez de Casablanca à Marrakech? Gagnez de l'argent en prenant des colis sur votre route. Aucune inscription livreur requise!
          </p>
          <p className="mb-4 text-xs text-teal-800">Un trajet déclaré sert uniquement à faire correspondre un itinéraire. Il ne constitue pas une preuve externe de voyage.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="trip-from-city" className="block text-xs font-semibold text-teal-700 mb-1.5">Ville de départ</label>
              <select id="trip-from-city" value={fromCity} onChange={(e) => setFromCity(e.target.value)} className="w-full border-2 border-teal-200 rounded-xl px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-white">
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="trip-to-city" className="block text-xs font-semibold text-teal-700 mb-1.5">Ville d'arrivée</label>
              <select id="trip-to-city" value={toCity} onChange={(e) => setToCity(e.target.value)} className="w-full border-2 border-teal-200 rounded-xl px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-white">
                {cities.filter((c) => c !== fromCity).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="departure-date" className="block text-xs font-semibold text-teal-700 mb-1.5">Date de départ</label>
            <input id="departure-date" type="date" min={new Date().toISOString().slice(0, 10)} max={new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} className="w-full border-2 border-teal-200 rounded-xl px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none bg-white" />
          </div>
          <button
            onClick={search}
            disabled={loading || fromCity === toCity || cities.length === 0 || !isVerified}
            className="mt-4 w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <MapPin size={18} />
            {loading ? "Recherche..." : `Chercher colis: ${fromCity} → ${toCity}`}
          </button>
        </div>

        {trips.length > 0 && (
          <section className="mb-6 rounded-2xl border bg-white p-4" aria-labelledby="active-trips-title">
            <h3 id="active-trips-title" className="mb-3 font-semibold text-gray-800">Mes trajets actifs</h3>
            <div className="space-y-2">
              {trips.map((trip) => (
                <div key={trip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <button type="button" onClick={() => { setFromCity(trip.fromCity); setToCity(trip.toCity); setDepartureDate(trip.departureDate.slice(0, 10)); setActiveTrip(trip); }} className="text-left font-medium text-teal-800">{trip.fromCity} → {trip.toCity} · {new Date(trip.departureDate).toLocaleDateString("fr-MA")}</button>
                  <button type="button" onClick={() => cancelTrip(trip.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Annuler</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {searched && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              Colis disponibles: {fromCity} → {toCity} ({available.length})
            </h3>
            {available.length === 0 ? (
              <div className="bg-white rounded-2xl border p-10 text-center text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <div>Aucun colis disponible sur ce trajet pour l'instant</div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {available.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3 flex justify-between items-center">
                      <span className="text-white font-mono font-bold">{c.trackingId}</span>
                      <span className="text-white font-bold">{c.price} MAD</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-4 text-sm mb-3">
                        <div>
                          <div className="text-xs text-gray-500">De</div>
                          <div className="font-semibold">{c.fromCity}</div>
                        </div>
                        <ArrowRight size={18} className="text-gray-400" />
                        <div>
                          <div className="text-xs text-gray-500">Vers</div>
                          <div className="font-semibold">{c.toCity}</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 mb-3">
                        {c.weight} kg • {c.description || "Colis"} • Coordonnées protégées avant acceptation
                      </div>
                      <button
                        onClick={() => acceptColis(c)}
                        disabled={updating || !isVerified}
                        className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
                      >
                        {isVerified ? "Prendre ce Colis" : "Compte non vérifié"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination meta={availableMeta} onPageChange={changeAvailablePage} label="Pagination des colis du trajet" />
          </div>
        )}

        {myDeliveries.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Mes Livraisons ({myDeliveries.length})</h3>
            <div className="space-y-3">
              {myDeliveries.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border shadow-sm px-5 py-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono font-bold text-blue-700">{c.trackingId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "delivered" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{c.fromCity} → {c.toCity} • {c.weight}kg</span>
                    <span className="font-bold text-teal-600">{c.price} MAD</span>
                  </div>
                  {c.status !== "delivered" && c.status !== "failed" && (
                    <div className="flex gap-2 mt-3">
                      {c.status === "picked_up" && <button onClick={() => updateStatus(c.id, "in_transit", "En route avec le voyageur")} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">En transit</button>}
                      {c.status === "in_transit" && <button onClick={() => updateStatus(c.id, "out_for_delivery", "En cours de livraison finale")} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium">En livraison</button>}
                      {c.status === "out_for_delivery" && <button onClick={() => { setPinModal(c); setPin(""); setPinError(""); }} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">Valider PIN</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Pagination meta={deliveriesMeta} onPageChange={changeDeliveriesPage} label="Pagination de mes livraisons" />
          </div>
        )}
      </div>
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPinModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-2 text-center font-bold text-gray-800">Confirmer la livraison</h3>
            <p className="mb-4 text-center text-sm text-gray-500">Saisissez le code PIN communiqué par le destinataire.</p>
            <label htmlFor="traveler-delivery-pin" className="sr-only">Code PIN de livraison</label>
            <input id="traveler-delivery-pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} className="mb-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] focus:border-teal-500 focus:outline-none" />
            {pinError && <p className="mb-3 text-center text-sm text-red-600">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setPinModal(null)} className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm">Annuler</button>
              <button onClick={validatePin} disabled={updating || pin.length !== 4} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
