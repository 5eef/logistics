const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const REQUEST_TIMEOUT_MS = 15000;

function getToken() {
  return localStorage.getItem("logistics_token");
}

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", "Accept": "application/json", ...extra };
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export function snakeToCamel(obj) {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        snakeToCamel(v),
      ])
    );
  }
  return obj;
}

export function camelToSnake(obj) {
  if (Array.isArray(obj)) return obj.map(camelToSnake);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
        camelToSnake(v),
      ])
    );
  }
  return obj;
}

async function req(method, path, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const opts = { method, headers: headers(), signal: controller.signal };
  if (body) opts.body = JSON.stringify(camelToSnake(body));

  try {
    const res = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const validationMessage = data.errors
        ? Object.values(data.errors).flat().find(Boolean)
        : null;
      throw new Error(data.error || validationMessage || data.message || "Erreur serveur");
    }
    return snakeToCamel(data);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("La requête a expiré. Veuillez réessayer.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function upload(path, file) {
  const formData = new FormData();
  formData.append("avatar", file);
  const token = getToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const validationMessage = data.errors
        ? Object.values(data.errors).flat().find(Boolean)
        : null;
      throw new Error(data.error || validationMessage || data.message || "Erreur lors de l'envoi de la photo");
    }
    return snakeToCamel(data);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("L'envoi de la photo a expire.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  auth: {
    login: (email, password) => req("POST", "/auth/login", { email, password }),
    register: (data) => req("POST", "/auth/register", data),
    me: () => req("GET", "/auth/me"),
    logout: () => req("POST", "/auth/logout"),
    updateMe: (data) => req("PATCH", "/auth/me", data),
    notifications: () => req("GET", "/auth/notifications"),
    readNotification: (id) => req("PATCH", `/auth/notifications/${id}/read`),
  },
  profile: {
    show: () => req("GET", "/profile"),
    update: (data) => req("PATCH", "/profile", data),
    uploadAvatar: (file) => upload("/profile/avatar", file),
  },
  colis: {
    track: (trackingId) => req("GET", `/colis/track/${encodeURIComponent(trackingId)}`),
    list: (params = {}) => {
      const qs = new URLSearchParams(camelToSnake(params)).toString();
      return req("GET", `/colis${qs ? "?" + qs : ""}`);
    },
    create: async (data) => {
      const result = await req("POST", "/colis", data);
      const { pinCode, ...shipment } = result;
      return { ...shipment, recipientPin: pinCode };
    },
    updateStatus: (id, status, message) => req("PATCH", `/colis/${id}/status`, { status, message }),
    validatePin: (id, pin) => req("POST", `/colis/${id}/validate-pin`, { pin }),
    rate: (id, data) => req("POST", `/colis/${id}/rate`, data),
    stats: () => req("GET", "/colis/stats"),
  },
  admin: {
    stats: () => req("GET", "/admin/stats"),
    users: (params = {}) => {
      const qs = new URLSearchParams(camelToSnake(params)).toString();
      return req("GET", `/admin/users${qs ? "?" + qs : ""}`);
    },
    pendingCouriers: () => req("GET", "/admin/couriers/pending"),
    verifyCourier: (id, status, reason) => req("PATCH", `/admin/couriers/${id}/verify`, { status, reason }),
    warnCourier: (id, reason) => req("POST", `/admin/couriers/${id}/warn`, { reason }),
    banCourier: (id) => req("PATCH", `/admin/couriers/${id}/ban`),
    colis: (params = {}) => {
      const qs = new URLSearchParams(camelToSnake(params)).toString();
      return req("GET", `/admin/colis${qs ? "?" + qs : ""}`);
    },
    tickets: () => req("GET", "/admin/tickets"),
    replyTicket: (id, status, response) => req("PATCH", `/admin/tickets/${id}`, { status, response }),
  },
  tickets: {
    list: () => req("GET", "/tickets"),
    create: (data) => req("POST", "/tickets", data),
    respond: (id, message) => req("POST", `/tickets/${id}/respond`, { message }),
  },
  misc: {
    cities: () => req("GET", "/misc/cities"),
  },
};
