const BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
const ORIGIN = BASE.replace(/\/api$/, "");
const parsedTimeout = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout >= 1000 && parsedTimeout <= 120000
  ? parsedTimeout
  : 15000;

let csrfRequest;

export class ApiError extends Error {
  constructor(message, { status = 0, errors = {}, retryAfter = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }
}

export function snakeToCamel(obj) {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
      snakeToCamel(value),
    ]));
  }
  return obj;
}

export function camelToSnake(obj) {
  if (Array.isArray(obj)) return obj.map(camelToSnake);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [
      key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`),
      camelToSnake(value),
    ]));
  }
  return obj;
}

function cookie(name) {
  const prefix = `${name}=`;
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

export function csrfHeaders() {
  const token = cookie("XSRF-TOKEN");
  return token ? { "X-XSRF-TOKEN": token } : {};
}

async function ensureCsrfCookie() {
  if (!csrfRequest) {
    csrfRequest = fetch(`${ORIGIN}/sanctum/csrf-cookie`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then((response) => {
      if (!response.ok) throw new ApiError("Impossible d’initialiser la session sécurisée.", { status: response.status });
    }).catch((error) => {
      csrfRequest = null;
      throw error;
    });
  }
  return csrfRequest;
}

function collectionItems(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
}

export function collectionPage(result) {
  const data = collectionItems(result);
  const meta = result?.meta || {
    currentPage: 1,
    lastPage: 1,
    perPage: data.length,
    total: data.length,
  };
  return { data, meta, links: result?.links || {} };
}

async function request(method, path, body, { retryCsrf = true, formData = false } = {}) {
  const mutating = !["GET", "HEAD"].includes(method);
  if (mutating) await ensureCsrfCookie();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { Accept: "application/json", ...csrfHeaders() };
  if (!formData) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      ...(body !== undefined ? { body: formData ? body : JSON.stringify(camelToSnake(body)) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 419 && mutating && retryCsrf) {
      csrfRequest = null;
      await ensureCsrfCookie();
      return request(method, path, body, { retryCsrf: false, formData });
    }
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new CustomEvent("logistics:unauthorized"));
      const validationMessage = data.errors ? Object.values(data.errors).flat().find(Boolean) : null;
      throw new ApiError(data.error || validationMessage || data.message || "Erreur serveur", {
        status: response.status,
        errors: snakeToCamel(data.errors || {}),
        retryAfter: response.headers?.get?.("Retry-After") || null,
      });
    }
    return snakeToCamel(data);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("La requête a expiré. Veuillez réessayer.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const req = (method, path, body) => request(method, path, body);

export const api = {
  auth: {
    login: (email, password) => req("POST", "/auth/login", { email, password }),
    register: (data) => req("POST", "/auth/register", data),
    me: () => req("GET", "/auth/me"),
    logout: () => req("POST", "/auth/logout"),
    updateMe: (data) => req("PATCH", "/auth/me", data),
    notifications: (params = {}) => {
      const query = new URLSearchParams(camelToSnake(params)).toString();
      return req("GET", `/auth/notifications${query ? `?${query}` : ""}`).then(collectionPage);
    },
    readNotification: (id) => req("PATCH", `/auth/notifications/${id}/read`),
    forgotPassword: (email) => req("POST", "/auth/forgot-password", { email }),
    resetPassword: (data) => req("POST", "/auth/reset-password", data),
    startPhoneVerification: () => req("POST", "/auth/phone-verification/start"),
    confirmPhoneVerification: (code) => req("POST", "/auth/phone-verification/confirm", { code }),
  },
  profile: {
    show: () => req("GET", "/profile"),
    update: (data) => req("PATCH", "/profile", data),
    uploadAvatar: (file) => {
      const data = new FormData();
      data.append("avatar", file);
      return request("POST", "/profile/avatar", data, { formData: true });
    },
  },
  colis: {
    track: (trackingId) => req("GET", `/colis/track/${encodeURIComponent(trackingId)}`),
    quote: (data) => req("POST", "/colis/quote", data),
    list: (params = {}) => {
      const query = new URLSearchParams(camelToSnake(params)).toString();
      return req("GET", `/colis${query ? `?${query}` : ""}`).then(collectionPage);
    },
    create: async (data) => {
      const result = await req("POST", "/colis", data);
      const { pinCode, ...shipment } = result;
      return { ...shipment, recipientPin: pinCode };
    },
    updateStatus: (id, status, message, tripId) => req("PATCH", `/colis/${id}/status`, { status, message, tripId }),
    validatePin: (id, pin) => req("POST", `/colis/${id}/validate-pin`, { pin }),
    rate: (id, data) => req("POST", `/colis/${id}/rate`, data),
    stats: () => req("GET", "/colis/stats"),
  },
  travelerTrips: {
    list: () => req("GET", "/traveler-trips"),
    create: (data) => req("POST", "/traveler-trips", data),
    cancel: (id) => req("PATCH", `/traveler-trips/${id}/cancel`),
  },
  admin: {
    stats: () => req("GET", "/admin/stats"),
    users: (params = {}) => collectionRequest("/admin/users", params),
    pendingCouriers: (params = {}) => collectionRequest("/admin/couriers/pending", params),
    verifyCourier: (id, status, reason) => req("PATCH", `/admin/couriers/${id}/verify`, { status, reason }),
    warnCourier: (id, reason) => req("POST", `/admin/couriers/${id}/warn`, { reason }),
    banCourier: (id, reason) => req("PATCH", `/admin/couriers/${id}/ban`, { reason }),
    colis: (params = {}) => collectionRequest("/admin/colis", params),
    tickets: (params = {}) => collectionRequest("/admin/tickets", params),
    replyTicket: (id, status, response) => req("PATCH", `/admin/tickets/${id}`, { status, response }),
    overrideStatus: (id, status, reason) => req("PATCH", `/admin/colis/${id}/override-status`, { status, reason }),
    updatePayment: (id, data) => req("PATCH", `/admin/colis/${id}/payment`, data),
  },
  tickets: {
    list: (params = {}) => collectionRequest("/tickets", params),
    create: (data) => req("POST", "/tickets", data),
    respond: (id, message) => req("POST", `/tickets/${id}/respond`, { message }),
  },
  misc: {
    cities: () => req("GET", "/misc/cities").then(collectionItems),
  },
};

function collectionRequest(path, params) {
  const query = new URLSearchParams(camelToSnake(params)).toString();
  return req("GET", `${path}${query ? `?${query}` : ""}`).then(collectionPage);
}
