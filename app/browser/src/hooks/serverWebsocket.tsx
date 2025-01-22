/**
 * Gets the server state and a method to send state changes over a websocket connection
 */
import { useEffect, useRef } from "react";

import {
  BroadcastJobStates,
  BroadcastWorkers,
  JobStatusPayload,
  WebsocketMessageClientToServer,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from "/@shared/client";
import ReconnectingWebSocket from "reconnecting-websocket";

import { useHashParam } from "@metapages/hash-query/react-hooks";

import { websocketConnectionUrl, websocketConnectionUrlLocalmode } from "../config";
import { cacheInsteadOfSendMessages, useStore } from "../store";

/**
 * Sets states bits in the store
 */
export const serverWebsocket = (): void => {
  const [queueOrUrl] = useHashParam("queue");

  const setIsServerConnected = useStore(state => state.setIsServerConnected);

  const setJobStates = useStore(state => state.setJobStates);

  const setWorkers = useStore(state => state.setWorkers);

  const setSendMessage = useStore(state => state.setSendMessage);

  const setRawMessage = useStore(state => state.setRawMessage);

  const handleJobStatusPayload = useStore(state => state.handleJobStatusPayload);

  const rwsRef = useRef<ReconnectingWebSocket | null>(null);
  const pingTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);
  const timeLastPongRef = useRef<number>(Date.now());
  const timeLastPingRef = useRef<number>(Date.now());

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
      queue === "local" && !origin ? websocketConnectionUrlLocalmode : origin ? origin : websocketConnectionUrl
    }/${queue}/client`;

    setIsServerConnected(false);
    rwsRef.current = new ReconnectingWebSocket(url);
    const rws = rwsRef.current;

    const onMessage = (message: MessageEvent) => {
      try {
        const messageString = message.data.toString();
        if (messageString === "PONG") {
          timeLastPongRef.current = Date.now();

          // wait a bit then send a ping
          clearTimeout(pingTimeoutRef.current);
          pingTimeoutRef.current = setTimeout(() => {
            if (Date.now() - timeLastPingRef.current >= 5000) {
              rws?.send("PING");
              timeLastPingRef.current = Date.now();
            }
            clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = setTimeout(() => {
              if (Date.now() - timeLastPongRef.current >= 10000 && rws?.readyState === rws?.OPEN) {
                console.log(`Reconnecting because no PONG since ${Date.now() - timeLastPongRef.current}ms `);
                rws.reconnect();
              }
            }, 10000);
          }, 5000);

          return;
        }
        if (!messageString.startsWith("{")) {
          return;
        }
        const possibleMessage: WebsocketMessageServerBroadcast = JSON.parse(messageString);
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
      rws?.send(JSON.stringify(message));
    };

    // eslint-disable-next-line
    const onError = (error: any) => {
      console.error(error);
    };

    const onOpen = () => {
      setIsServerConnected(true);
      setSendMessage(sender);
      // Send initial ping after connection
      rws?.send("PING");
      timeLastPingRef.current = Date.now();
    };

    const onClose = () => {
      setIsServerConnected(false);
      setSendMessage(cacheInsteadOfSendMessages);
    };

    rws?.addEventListener("message", onMessage);
    rws?.addEventListener("error", onError);
    rws?.addEventListener("open", onOpen);
    rws?.addEventListener("close", onClose);

    return () => {
      rws?.removeEventListener("message", onMessage);
      rws?.removeEventListener("error", onError);
      rws?.removeEventListener("open", onOpen);
      rws?.removeEventListener("close", onClose);
      rws?.close();
      setIsServerConnected(false);
      setSendMessage(cacheInsteadOfSendMessages);
      clearTimeout(pingTimeoutRef.current);
      clearTimeout(pongTimeoutRef.current);
    };
  }, [
    queueOrUrl,
    setSendMessage,
    setIsServerConnected,
    setJobStates,
    setWorkers,
    setRawMessage,
    handleJobStatusPayload,
  ]);
};
