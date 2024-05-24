import {
  HStack,
  VStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@chakra-ui/react";
import { QueueButtonAndLabel } from "./queue/QueueButtonAndLabel";
import { Jobs } from "../Jobs";
import { Workers } from "../Workers";
import { useActiveJobsCount } from "/@/hooks/useActiveJobsCount";
import { useWorkersCount } from "/@/hooks/useWorkersCount";
import { QuestionIcon } from "@chakra-ui/icons";

export const PanelQueue: React.FC = () => {
  const activeJobsCount = useActiveJobsCount();
  const workerCount = useWorkersCount();

  const maybeHelpForNoWorkers =
    workerCount > 0 ? null : <QuestionIcon color="red" />;

  return (
    <VStack width="100%" justifyContent="flex-start" alignItems="flex-start">
      <QueueButtonAndLabel />

      <HStack width="100%" justifyContent="flex-start" alignItems="stretch">
        <Tabs width="100%">
          <TabList>
            <Tab>Jobs (active total: {activeJobsCount})</Tab>
            <Tab>Workers (total {workerCount}) &nbsp; {maybeHelpForNoWorkers}</Tab>
            {/* {maybeHelpForNoWorkers} */}
          </TabList>

          <TabPanels>
            <TabPanel>
              <Jobs />
            </TabPanel>
            <TabPanel>
              <Workers />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </HStack>
    </VStack>
  );
};
