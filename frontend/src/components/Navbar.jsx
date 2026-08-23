
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { subscribeToUserNotifications } from "../lib/realtime";
import { Bell, LogOut, User, Package, ChevronDown, Menu, X } from "lucide-react";

export default function Navbar() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const refreshNotifications = () => {
      api.auth.notifications().then(setNotifications).catch(() => {});
    };

    refreshNotifications();
    const echo = subscribeToUserNotifications({
      userId: user.id,
      token: localStorage.getItem("logistics_token"),
      onNotification: (notification) => {
        setNotifications((current) => [
          notification,
          ...current.filter((item) => item.id !== notification.id),
        ].slice(0, 50));
      },
    });

    if (echo) {
      return () => echo.disconnect();
    }

    const interval = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  const unread = notifications.filter((n) => !n.isRead).length;

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const dashboardPath = () => {
    if (!user) return "/";
    switch (user.role) {
      case "admin": return "/admin";
      case "expediteur": return "/expediteur";
      case "livreur": return "/livreur";
      case "destinataire": return "/destinataire";
      case "voyageur": return "/voyageur";
      default: return "/";
    }
  };

  const roleLabel = () => {
    switch (user?.role) {
      case "admin": return "Administrateur";
      case "expediteur": return "Expéditeur";
      case "livreur": return "Livreur";
      case "destinataire": return "Destinataire";
      case "voyageur": return "Voyageur";
      default: return "";
    }
  };

  const roleColor = () => {
    switch (user?.role) {
      case "admin": return "bg-purple-100 text-purple-700";
      case "expediteur": return "bg-blue-100 text-blue-700";
      case "livreur": return "bg-green-100 text-green-700";
      case "destinataire": return "bg-orange-100 text-orange-700";
      case "voyageur": return "bg-teal-100 text-teal-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const markRead = async (id) => {
    await api.auth.readNotification(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const openProfile = () => {
    navigate("/profil");
    setShowMenu(false);
    setMobileOpen(false);
  };

  return (
    <nav className="bg-[#1a2744] text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
              <Package size={20} />
            </div>
            <span className="font-bold text-xl tracking-wide">LOGISTICS</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => navigate("/")} className="text-gray-300 hover:text-white text-sm transition-colors">
              Suivi Public
            </button>
            {user && (
              <button onClick={() => navigate(dashboardPath())} className="text-gray-300 hover:text-white text-sm transition-colors">
                Tableau de Bord
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="relative hidden md:block">
                  <button
                    onClick={() => { setShowNotifs(!showNotifs); setShowMenu(false); }}
                    className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Ouvrir les notifications"
                  >
                    <Bell size={20} />
                    {unread > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>
                  {showNotifs && (
                    <div className="absolute right-0 top-12 w-80 bg-white text-gray-800 rounded-xl shadow-2xl border overflow-hidden z-50">
                      <div className="px-4 py-3 border-b font-semibold text-sm">Notifications</div>
                      <div className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">Aucune notification</div>
                        ) : (
                          notifications.slice(0, 10).map((n) => (
                            <div
                              key={n.id}
                              onClick={() => markRead(n.id)}
                              className={`px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? "bg-blue-50" : ""}`}
                            >
                              <div className="text-sm font-medium">{n.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{n.message}</div>
                              <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleDateString("fr-MA")}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative hidden md:block">
                  <button
                    onClick={() => { setShowMenu(!showMenu); setShowNotifs(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden">
                      {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : user.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm max-w-24 truncate">{user.name}</span>
                    <ChevronDown size={14} />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-12 w-52 bg-white text-gray-800 rounded-xl shadow-2xl border overflow-hidden z-50">
                      <div className="px-4 py-3 border-b">
                        <div className="font-semibold text-sm">{user.name}</div>
                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${roleColor()}`}>{roleLabel()}</span>
                      </div>
                      <button
                        onClick={openProfile}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <User size={15} /> Mon profil
                      </button>
                      <button
                        onClick={() => { navigate(dashboardPath()); setShowMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <Package size={15} /> Tableau de Bord
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={15} /> Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => navigate("/auth")}
                  className="text-sm px-4 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  SE CONNECTER
                </button>
                <button
                  onClick={() => navigate("/auth?mode=register")}
                  className="text-sm px-4 py-1.5 bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors font-medium"
                >
                  S'INSCRIRE
                </button>
              </div>
            )}

            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/10"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-white/10 pt-3 space-y-2">
            <button onClick={() => { navigate("/"); setMobileOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/10">
              Suivi Public
            </button>
            {user ? (
              <>
                <button onClick={() => { navigate(dashboardPath()); setMobileOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/10">
                  Tableau de Bord
                </button>
                <button onClick={openProfile} className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/10">
                  Mon profil
                </button>
                <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm text-red-400 rounded-lg hover:bg-white/10">
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { navigate("/auth"); setMobileOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-gray-300 rounded-lg hover:bg-white/10">
                  Se Connecter
                </button>
                <button onClick={() => { navigate("/auth?mode=register"); setMobileOpen(false); }} className="block w-full px-3 py-2 bg-orange-500 text-sm text-center rounded-lg font-medium">
                  S'Inscrire
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
