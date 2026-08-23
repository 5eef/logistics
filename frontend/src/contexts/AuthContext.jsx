
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("logistics_token");
    if (!token) { setLoading(false); return; }
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      localStorage.removeItem("logistics_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const res = await api.auth.login(email, password);
    localStorage.setItem("logistics_token", res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (data) => {
    const res = await api.auth.register(data);
    localStorage.setItem("logistics_token", res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try { await api.auth.logout(); } catch {}
    localStorage.removeItem("logistics_token");
    setUser(null);
  };

  const updateUser = async (data) => {
    const updated = await api.profile.update(data);
    setUser(updated);
    return updated;
  };

  const refreshUser = async () => {
    const updated = await api.profile.show();
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, refreshUser, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
