let serverOrigin = import.meta.env.VITE_SERVER_ORIGIN || window.location.origin;

console.log(`SERVER_ORIGIN=${serverOrigin}`);

export const websocketConnectionUrl = `${serverOrigin.replace("http", "ws")}${serverOrigin.endsWith("/") ? "" : "/"}browser/`;
export const UPLOAD_DOWNLOAD_BASE_URL = serverOrigin;
