import React from "react";

import { useStore } from "/@/store";

import { Alert, AlertIcon, Link, Tooltip } from "@chakra-ui/react";
import { WifiX } from "@phosphor-icons/react";
import { useQueue } from "/@/hooks/useQueue";

export const ConnectionStatus: React.FC = () => {
  const { resolvedQueue: resolvedQueueOrUrl } = useQueue();
  const isServerConnected = useStore(state => state.isServerConnected);

  if (isServerConnected) {
    return null;
  }

  if (resolvedQueueOrUrl === "local") {
    return resolvedQueueOrUrl === "local" ? (
      <Alert status="error">
        <AlertIcon />
        The local worker agent is not connected 👉 &nbsp;{" "}
        <Link isExternal href="https://metapage.io/settings/queues">
          /settings/queues
        </Link>
      </Alert>
    ) : null;
    // (
    //   <Alert status="error">
    //     <AlertIcon />
    //     No queue set 👉 &nbsp;{" "}
    //     <Link isExternal href="https://metapage.io/settings/queues">
    //       /settings/queues
    //     </Link>
    //   </Alert>
    // )
  } else {
    return (
      <Tooltip label="reconnecting...">
        <Link isExternal href="https://metapage.io/settings/queues">
          <WifiX size={20} color="orange" />
        </Link>
      </Tooltip>
    );
  }
};
