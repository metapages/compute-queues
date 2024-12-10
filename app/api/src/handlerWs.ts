import { wsHandlerClient, wsHandlerWorker } from "./routes/websocket.ts";

export const handleWebsocketConnection = (
  socket: WebSocket,
  request: Request,
) => {
  const urlBlob = new URL(request.url);
  const pathTokens = urlBlob.pathname.split("/").filter((x) => x !== "");
  const queueKey = pathTokens[0];
  const isClient = pathTokens[1] === "browser" || pathTokens[1] === "client";
  const isWorker = pathTokens[1] === "worker";

  if (!queueKey) {
    console.log("No queue key, closing socket");
    socket.close();
    return;
  }

  if (isClient) {
    wsHandlerClient(queueKey, socket, request);
  } else if (isWorker) {
    wsHandlerWorker(queueKey, socket, request);
  } else {
    console.log("Unknown type, closing socket");
    socket.close();
    return;
  }
};
