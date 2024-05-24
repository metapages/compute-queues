/**
 * Gets the server state and a method to send state changes over a websocket connection
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  BroadcastState,
  WebsocketMessage,
  WebsocketMessageSender,
  WebsocketMessageType,
} from '/@/shared';
import ReconnectingWebSocket from 'reconnecting-websocket';

import { useHashParam } from '@metapages/hash-query';

import { websocketConnectionUrl } from '../config';

type Props = {
  // children: React.ReactNode;
  children: any;
};

interface ServerStateObject {
  state?: BroadcastState | undefined;
  stateChange?: WebsocketMessageSender | undefined;
  connected: boolean;
}

const FAKESENDER = (_: WebsocketMessage) => {};

const serverStateMachine = (): [
  BroadcastState | undefined,
  WebsocketMessageSender,
  boolean
] => {
  const [address] = useHashParam("queue");
  const [connected, setConnected] = useState<boolean>(false);
  const [state, setState] = useState<BroadcastState | undefined>(undefined);
  const [sendMessage, setSendMessage] = useState<{
    sender: WebsocketMessageSender;
  }>({ sender: FAKESENDER });

  useEffect(() => {
    if (!address || address === "") {
      return;
    }
    const url = `${websocketConnectionUrl}${address}`;
    setConnected(false);
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
                  }ms `
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
        const possibleMessage: WebsocketMessage = JSON.parse(messageString);
        switch (possibleMessage.type) {
          case WebsocketMessageType.State:
            const state: BroadcastState =
              possibleMessage.payload as BroadcastState;
            if (!state) {
              console.log({
                error: "Missing payload in message",
                message: messageString,
              });
              break;
            }
            setState(state);
            break;
          default:
          //ignored
        }
      } catch (err) {
        console.log(err);
      }
    };

    const sender = (m: WebsocketMessage) => {
      rws.send(JSON.stringify(m));
    };

    const onError = (error: any) => {
      console.error(error);
    };

    const onOpen = () => {
      setConnected(true);
      setSendMessage({ sender });
    };

    const onClose = () => {
      setConnected(false);
      setSendMessage({ sender: FAKESENDER });
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
      setConnected(false);
      setSendMessage({ sender: FAKESENDER });
    };
  }, [address, setState, setSendMessage, setConnected]);

  return [state, sendMessage.sender, connected];
};

const defaultServerStateObject: ServerStateObject = {
  state: undefined,
  stateChange: undefined,
  connected: false,
};

const ServerStateContext = createContext<ServerStateObject>(
  defaultServerStateObject
);

export const ServerStateProvider = ({ children }: Props) => {
  const [state, stateChange, connected] = serverStateMachine();

  return (
    <ServerStateContext.Provider
      value={{ state: state, stateChange: stateChange, connected }}
    >
      {children}
    </ServerStateContext.Provider>
  );
};

export const useServerState = () => {
  return useContext(ServerStateContext);
};
