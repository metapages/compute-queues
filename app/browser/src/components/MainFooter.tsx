import React from "react";
import { Box, HStack, Icon, Spacer, Tooltip, useMediaQuery } from "@chakra-ui/react";
import { QuestionMark } from "@phosphor-icons/react";
import { useStore } from "/@/store";

import { QueueIconAndModal } from "/@/components/sections/queue/QueueIconAndModal";
import { EditInput } from "./footer/EditInput";

export const MainFooter: React.FC = () => {
  const [isLargerThan400] = useMediaQuery("(min-width: 400px)");
  const setRightPanelContext = useStore(state => state.setRightPanelContext);
  const rightPanelContext = useStore(state => state.rightPanelContext);
  const helpPanelShown = rightPanelContext === "help";

  return (
    <Box bg={"gray.100"} px={3} borderTop={"1px"} minWidth="100vw" h={"footerHeight"}>
      <HStack justify={"space-between"} h={"3.5rem"}>
        <EditInput />
        <Spacer />
        {isLargerThan400 && (
          <HStack gap={3}>
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
