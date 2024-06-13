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
  BroadcastJobStates,
  BroadcastWorkers,
  WebsocketMessageClientToServer,
  WebsocketMessageSenderClient,
  WebsocketMessageServerBroadcast,
  WebsocketMessageTypeServerBroadcast,
} from '/@/shared';
import ReconnectingWebSocket from 'reconnecting-websocket';

import { useHashParam } from '@metapages/hash-query';

import { websocketConnectionUrl } from '../config';

type Props = {
  // children: React.ReactNode;
  children: any;
};

interface ServerStateObject {
  jobStates?: BroadcastJobStates;
  workers?: BroadcastWorkers;
  stateChange?: WebsocketMessageSenderClient;
  connected: boolean;
}

const FAKESENDER = (_: WebsocketMessageClientToServer) => {};

const serverStateMachine = (): {
  jobStates: BroadcastJobStates;
  workers: BroadcastWorkers;
  sender: WebsocketMessageSenderClient;
  connected: boolean;
} => {
  const [address] = useHashParam("queue");
  const [connected, setConnected] = useState<boolean>(false);
  // const [jobs, setJobs] = useState<BroadcastJobs|undefined>(undefined);
  const [jobStates, setJobStates] = useState<BroadcastJobStates|undefined>(undefined);
  const [workers, setWorkers] = useState<BroadcastWorkers|undefined>(undefined);
  const [sendMessage, setSendMessage] = useState<{
    sender: WebsocketMessageSenderClient;
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
        const possibleMessage: WebsocketMessageServerBroadcast =
          JSON.parse(messageString);
        // console.log(`❔ received from server:`, possibleMessage)

        if (!possibleMessage?.payload) {
          console.log({
            error: "Missing payload in message",
            message: messageString,
          });
          return;
        }

        switch (possibleMessage.type) {
          case WebsocketMessageTypeServerBroadcast.JobStates:
            const allJobStatesMessage =
              possibleMessage.payload as BroadcastJobStates;
            setJobStates(allJobStatesMessage);
            break;
          case WebsocketMessageTypeServerBroadcast.JobStateUpdates:
            const onlySomeJobsMessage = possibleMessage.payload as BroadcastJobStates;
            onlySomeJobsMessage.isSubset = true;
            setJobStates(onlySomeJobsMessage);
            // setJobs(jobsMessage);
            break;
          case WebsocketMessageTypeServerBroadcast.Workers:
            const workersMessage = possibleMessage.payload as BroadcastWorkers;
            setWorkers(workersMessage);
            break;
          default:
          //ignored
        }
      } catch (err) {
        console.log(err);
      }
    };

    const sender = (m: WebsocketMessageClientToServer) => {
      // console.log(`❔ sending from browser to server:`, m);
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
  }, [address, setSendMessage, setConnected]);

  return {
    // jobs,
    jobStates,
    workers,
    sender: sendMessage.sender,
    connected,
  };
  // return [state, sendMessage.sender, connected];
};

const defaultServerStateObject: ServerStateObject = {
  // jobs: undefined,
  jobStates: undefined,
  workers: undefined,
  stateChange: undefined,
  connected: false,
};

const ServerStateContext = createContext<ServerStateObject>(
  defaultServerStateObject
);

export const ServerStateProvider = ({ children }: Props) => {
  const {jobStates, workers, connected, sender} = serverStateMachine();

  return (
    <ServerStateContext.Provider
      value={{ stateChange:sender, jobStates, workers, connected }}
    >
      {children}
    </ServerStateContext.Provider>
  );
};

export const useServerState = () => {
  return useContext(ServerStateContext);
};
