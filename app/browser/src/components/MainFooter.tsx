import React, { useEffect, useState } from "react";
import { Box, HStack, Spacer, Icon, Tooltip, useMediaQuery } from "@chakra-ui/react";
import { QuestionMark, TerminalWindow } from "@phosphor-icons/react";
import { useStore } from "/@/store";

import { JobStatus } from "/@/components/footer/JobStatus";
import { QueueIconAndModal } from "/@/components/sections/queue/QueueIconAndModal";

export const MainFooter: React.FC = () => {
  const [isLargerThan400] = useMediaQuery("(min-width: 400px)");
  const setShowTerminal = useStore(state => state.setShowTerminal);
  const showTerminal = useStore(state => state.showTerminal);
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const rightPanelContext = useStore(state => state.rightPanelContext);
  const helpPanelShown = rightPanelContext === "help";
  const [jobId, setJobId] = useState<string | undefined>();
  const jobState = useStore(state => state.jobState);

  useEffect(() => {
    setJobId(jobState?.hash);
  }, [jobState]);

  return (
    <Box bg={"gray.100"} px={3} borderTop={"1px"} minWidth="100vw" h={"footerHeight"}>
      <HStack justify={"space-between"} h={"3.5rem"}>
        <JobStatus />
        <Spacer />
        {isLargerThan400 && (
          <HStack gap={3}>
            <Tooltip label={jobId && "Terminal"}>
              <Icon
                pointerEvents={!jobId ? 'none' : undefined}
                as={TerminalWindow}
                color={!jobId && "gray.300"}
                bg={showTerminal ? "gray.300" : "none"}
                borderRadius={5}
                onClick={jobId ? () => setShowTerminal(!showTerminal) : undefined}
              />
            </Tooltip>
            <QueueIconAndModal />
            <Tooltip label={"Help"}>
              <Icon
                bg={helpPanelShown ? "gray.300" : "none"}
                p={"3px"}
                borderRadius={"50%"}
                as={QuestionMark}
                onClick={() => setRightPanelContext(helpPanelShown ? null : "help")}
              />
            </Tooltip>
          </HStack>
        )}
      </HStack>
    </Box>
  );
};
