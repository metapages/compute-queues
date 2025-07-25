let serverOrigin = import.meta.env.VITE_SERVER_ORIGIN || globalThis.location.origin;
if (serverOrigin.endsWith("/")) {
  serverOrigin = serverOrigin.slice(0, -1);
}
export const ApiOrigin = serverOrigin;
export const websocketConnectionUrl = ApiOrigin.replace("http", "ws");
// local mode where the worker is running on the same machine as the browser
// and acts as the queue API combined with the job worker
const LocalModeBaseUrl = "http://localhost:8000";
export const websocketConnectionUrlLocalmode = LocalModeBaseUrl.replace("http", "ws");

export const getIOBaseUrl = (queue: string): string => {
  if (!queue) {
    return ApiOrigin;
  }
  if (queue === "local") {
    return LocalModeBaseUrl;
  }
  if (queue.startsWith("http")) {
    return new URL(queue).origin;
  }
  return ApiOrigin;
};
