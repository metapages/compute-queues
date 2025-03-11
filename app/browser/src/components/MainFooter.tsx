import { QueueControl } from "/@/components/sections/queue/QueueControl";

import { Box, HStack, IconButton, Spacer, Tooltip, useMediaQuery } from "@chakra-ui/react";
import { CloudArrowUp, House, Question } from "@phosphor-icons/react";

import { EditInput } from "./footer/EditInput";
import { useQueue } from "../hooks/useQueue";

export const MainFooter: React.FC = () => {
  const [isLargerThan400] = useMediaQuery("(min-width: 400px)");
  const { isLocalMode } = useQueue();
  // const rightPanelContext = useStore(state => state.rightPanelContext);
  // const setRightPanelContext = useStore(state => state.setRightPanelContext);
  // const helpPanelShown = rightPanelContext === "help";

  return (
    <Box bg={"gray.100"} px={3} borderTop={"1px"} minWidth="100vw" h={"footerHeight"}>
      <HStack justify={"space-between"} h={"3.5rem"}>
        <EditInput />
        <Spacer />
        {isLargerThan400 && (
          <HStack gap={3}>
            <QueueControl />
            <Tooltip label={isLocalMode ? "Local mode help" : "Remote mode help"}>
              <IconButton
                aria-label={isLocalMode ? "help local mode" : "help remote mode"}
                as="a"
                href={
                  isLocalMode
                    ? "https://docs.metapage.io/docs/container-local-mode"
                    : "https://docs.metapage.io/docs/container-remote-mode"
                }
                target="_blank"
                size="sm"
                color="gray.400"
                variant="link"
                icon={isLocalMode ? <House size={16} /> : <CloudArrowUp size={16} />}
              />
            </Tooltip>
            <Tooltip label={"Help"}>
              <IconButton
                aria-label="help"
                as="a"
                href="https://docs.metapage.io/docs/containers"
                target="_blank"
                size="sm"
                color="gray.400"
                variant="link"
                icon={<Question size={16} />}
              />

              {/* <Icon
                bg={helpPanelShown ? "gray.300" : "none"}
                p={"3px"}
                borderRadius={"50%"}
                as={QuestionMark}
                onClick={() => setRightPanelContext(helpPanelShown ? null : "help")}
              /> */}
            </Tooltip>
          </HStack>
        )}
      </HStack>
    </Box>
  );
};
