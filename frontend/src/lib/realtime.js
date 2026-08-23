import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { csrfHeaders } from "./api";

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const broadcastAuthUrl = `${apiUrl.replace(/\/api\/?$/, "")}/api/broadcasting/auth`;

export function subscribeToUserNotifications({ userId, onNotification, onConnectionChange }) {
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key) return null;

  window.Pusher = Pusher;
  const echo = new Echo({
    broadcaster: "reverb",
    key,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME || "https") === "https",
    enabledTransports: ["ws", "wss"],
    authEndpoint: broadcastAuthUrl,
    withCredentials: true,
    auth: { headers: { Accept: "application/json", ...csrfHeaders() } },
  });

  const connection = echo.connector?.pusher?.connection;
  connection?.bind("connected", () => onConnectionChange?.(true));
  for (const event of ["disconnected", "unavailable", "failed", "error"]) {
    connection?.bind(event, () => onConnectionChange?.(false));
  }
  echo.private(`users.${userId}`).listen(".notification.created", onNotification);

  return echo;
}
