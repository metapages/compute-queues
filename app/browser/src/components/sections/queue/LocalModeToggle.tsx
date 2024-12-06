import React, { useCallback, useEffect, useState } from "react";

import { HouseLine } from "@phosphor-icons/react";

import { Button, Icon, Tooltip } from "@chakra-ui/react";
import { useHashParam } from "@metapages/hash-query/react-hooks";

export const LocalModeToggle: React.FC = () => {
  const [queue, setQueue] = useHashParam("queue", "");
  const [isLocalMode, setIsLocalMode] = useState<boolean>(queue === "local");
  useEffect(() => {
    setIsLocalMode(queue === "local");
  }, [queue]);

  const onToggle = useCallback(() => {
    if (queue === "local") {
      const previousQueue = localStorage.getItem("previous-queue");
      if (previousQueue) {
        setQueue(previousQueue);
      } else {
        setQueue("");
      }
    } else {
      localStorage.setItem("previous-queue", queue ?? "");
      setQueue("local");
    }
  }, [queue, setQueue]);

  return (
    <Tooltip label={isLocalMode ? "Enable remote mode" : "Enable local mode"}>
      {/* onFocus https://github.com/chakra-ui/chakra-ui/issues/5304#issuecomment-1102836734 */}
      <Button minWidth={200} onFocus={e => e.preventDefault()} pr={10} variant="ghost" leftIcon={<Icon as={HouseLine} boxSize={6} />} onClick={onToggle} aria-label="local mode">
        {isLocalMode ? "Local Mode" : "Remote Mode"}
      </Button>
    </Tooltip>
  );
};
