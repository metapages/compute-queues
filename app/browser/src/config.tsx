const serverOrigin = import.meta.env.VITE_SERVER_ORIGIN || globalThis.location.origin;
export const websocketConnectionUrl = `${serverOrigin.replace("http", "ws")}${serverOrigin.endsWith("/") ? "" : "/"}`;
export const UPLOAD_DOWNLOAD_BASE_URL = serverOrigin;
// local mode where the worker is running on the same machine as the browser
// and acts as the queue API combined with the job worker
export const websocketConnectionUrlLocalmode = "ws://localhost:8000/";
