/**
 * Gets the server state and a method to send state changes over a websocket connection
 */
import { useEffect } from "react";

import {
  BroadcastJobStates,
  BroadcastWorkers,
  JobStatusPayload,
  WebsocketMessageClientToServer,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "/@/shared";
import ReconnectingWebSocket from "reconnecting-websocket";

import { useHashParam } from "@metapages/hash-query/react-hooks";

import {
  websocketConnectionUrl,
  websocketConnectionUrlLocalmode,
} from "../config";
import { cacheInsteadOfSendMessages, useStore } from "../store";

/**
 * Sets states bits in the store
 */
export const serverWebsocket = (): void => {
  const [queueOrUrl] = useHashParam("queue");

  const setIsServerConnected = useStore((state) => state.setIsServerConnected);

  const setJobStates = useStore((state) => state.setJobStates);

  const setWorkers = useStore((state) => state.setWorkers);

  const setSendMessage = useStore((state) => state.setSendMessage);

  const setRawMessage = useStore((state) => state.setRawMessage);

  const handleJobStatusPayload = useStore((state) =>
    state.handleJobStatusPayload
  );

  useEffect(() => {
    if (!queueOrUrl || queueOrUrl === "") {
      return;
    }
    let queue: string = queueOrUrl;
    let origin: string | undefined;
    if (queueOrUrl.startsWith("http")) {
      const urlBlob = new URL(queueOrUrl);
      queue = urlBlob.pathname.replace("/", "");
      origin = urlBlob.origin + "/";
    }

    const url = `${
      queue === "local" && !origin
        ? websocketConnectionUrlLocalmode
        : origin
        ? origin
        : websocketConnectionUrl
    }${queue}/client`;

    setIsServerConnected(false);
    const rws = new ReconnectingWebSocket(url);
    let timeLastPong = Date.now();
    let timeLastPing = Date.now();

    const onMessage = (message: MessageEvent) => {
      try {
        const messageString = message.data.toString();
        if (messageString === "PONG") {
          timeLastPong = Date.now();

          // wait a bit then send a ping
          setTimeout(() => {
            if (Date.now() - timeLastPing >= 5000) {
              rws.send("PING");
              timeLastPing = Date.now();
            }
            setTimeout(() => {
              if (
                Date.now() - timeLastPong >= 10000 &&
                rws.readyState === rws.OPEN
              ) {
                console.log(
                  `Reconnecting because no PONG since ${
                    Date.now() - timeLastPong
                  }ms `,
                );
                rws.reconnect();
              }
            }, 10000);
          }, 5000);

          return;
        }
        if (!messageString.startsWith("{")) {
          return;
        }
        const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(
          messageString,
        );
        // console.log(`❔ received from server:`, possibleMessage)

        if (!possibleMessage?.payload) {
          console.log({
            error: "Missing payload in message",
            message: messageString,
          });
          return;
        }

        let broadcastJobStates: BroadcastJobStates;
        switch (possibleMessage.type) {
          case WebsocketMessageTypeServerBroadcast.JobStates:
            broadcastJobStates = possibleMessage.payload as BroadcastJobStates;
            break;
          case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
            broadcastJobStates = possibleMessage.payload as BroadcastJobStates;
            broadcastJobStates.isSubset = true;
            break;
          case WebsocketMessageTypeServerBroadcast.Workers:
            setWorkers(possibleMessage.payload as BroadcastWorkers);
            break;
          case WebsocketMessageTypeServerBroadcast.StatusRequest:
            // Clients do not respond to status requests
            break;
          case WebsocketMessageTypeServerBroadcast.ClearJobCacheConfirm:
            // We asked for this now we have a response
            // But we don't currently have a specific use for this
            break;
          case WebsocketMessageTypeServerBroadcast.JobStatusPayload:
            handleJobStatusPayload(possibleMessage.payload as JobStatusPayload);
            break;
          default:
            //ignored
            break;
        }
        if (broadcastJobStates?.state?.jobs) {
          setJobStates(broadcastJobStates?.state?.jobs);
        }
        setRawMessage(possibleMessage);
      } catch (err) {
        console.log(err);
      }
    };

    const sender = (message: WebsocketMessageClientToServer) => {
      // console.log(`❔ sending from browser to server:`, message);
      rws.send(JSON.stringify(message));
    };

    // eslint-disable-next-line
    const onError = (error: any) => {
      console.error(error);
    };

    const onOpen = () => {
      setIsServerConnected(true);
      setSendMessage(sender);
    };

    const onClose = () => {
      setIsServerConnected(false);
      setSendMessage(cacheInsteadOfSendMessages);
    };

    rws.addEventListener("message", onMessage);
    rws.addEventListener("error", onError);
    rws.addEventListener("open", onOpen);
    rws.addEventListener("close", onClose);

    return () => {
      rws.removeEventListener("message", onMessage);
      rws.removeEventListener("error", onError);
      rws.removeEventListener("open", onOpen);
      rws.removeEventListener("close", onClose);
      rws.close();
      setIsServerConnected(false);
      setSendMessage(cacheInsteadOfSendMessages);
    };
  }, [queueOrUrl, setSendMessage, setIsServerConnected, setRawMessage]);
};
