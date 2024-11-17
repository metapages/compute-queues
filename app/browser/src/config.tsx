const serverOrigin = import.meta.env.VITE_SERVER_ORIGIN || globalThis.location.origin;
// console.log('VITE_SERVER_ORIGIN', import.meta.env.VITE_SERVER_ORIGIN)
// console.log('serverOrigin', serverOrigin)
export const websocketConnectionUrl = `${serverOrigin.replace("http", "ws")}${serverOrigin.endsWith("/") ? "" : "/"}`;
export const UPLOAD_DOWNLOAD_BASE_URL = serverOrigin;
