import { CloudArrowUp, HouseLine } from "@phosphor-icons/react";

import { Button, Icon, Tooltip } from "@chakra-ui/react";
import { useQueue } from "/@/hooks/useQueue";

export const LocalModeToggle: React.FC = () => {
  const { isLocalMode, toggleLocalMode, ignoreQueueOverride } = useQueue();
  return (
    <Tooltip label={isLocalMode ? "Enable remote mode" : "Enable local mode"}>
      {/* onFocus https://github.com/chakra-ui/chakra-ui/issues/5304#issuecomment-1102836734 */}
      <Button
        minWidth={200}
        onFocus={e => e.preventDefault()}
        pr={10}
        variant="ghost"
        leftIcon={<Icon as={isLocalMode ? HouseLine : CloudArrowUp} boxSize={6} />}
        // We cannot change this if injected from the page
        isDisabled={!ignoreQueueOverride}
        onClick={toggleLocalMode}
        aria-label="local mode">
        {isLocalMode ? "Local Mode" : "Remote Mode"}
      </Button>
    </Tooltip>
  );
};
