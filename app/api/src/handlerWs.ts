import {
  wsHandlerBrowser,
  wsHandlerWorker,
} from './routes/websocket.ts';

export const handleWebsocketConnection = (
  socket: WebSocket,
  request: Request,
) => {
  const urlBlob = new URL(request.url);
  const pathTokens = urlBlob.pathname.split("/").filter((x) => x !== "");
  const isBrowser = pathTokens[0] === "browser";
  const isWorker = pathTokens[0] === "worker";
  const queueKey = pathTokens[1];

  if (!queueKey) {
    console.log("No queue key, closing socket");
    socket.close();
    return;
  }

  if (isBrowser) {
    wsHandlerBrowser(queueKey, socket, request);
  } else if (isWorker) {
    wsHandlerWorker(queueKey, socket, request);
  } else {
    console.log("Unknown type, closing socket");
    socket.close();
    return;
  }

};

