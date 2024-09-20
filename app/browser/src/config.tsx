let serverOrigin = import.meta.env.VITE_SERVER_ORIGIN || globalThis.location.origin;

export const websocketConnectionUrl = `${serverOrigin.replace("http", "ws")}${serverOrigin.endsWith("/") ? "" : "/"}`;
export const UPLOAD_DOWNLOAD_BASE_URL = serverOrigin;
