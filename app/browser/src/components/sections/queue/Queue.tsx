import {
  HStack,
  VStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@chakra-ui/react";
import { QueueButtonAndLabel } from "./QueueButtonAndLabel";
import { Jobs } from "/@/components/sections/queue/Jobs";
import { Workers } from "/@/components/sections/queue/Workers";
import { useActiveJobsCount } from "/@/hooks/useActiveJobsCount";
import { useWorkersCount } from "/@/hooks/useWorkersCount";
import { QuestionIcon } from "@chakra-ui/icons";

export const Queue: React.FC = () => {
  const activeJobsCount = useActiveJobsCount();
  const workerCount = useWorkersCount();

  const maybeHelpForNoWorkers =
    workerCount > 0 ? null : <QuestionIcon color="red" />;

  return (
    <VStack width="100%" justifyContent="flex-start" alignItems="flex-start">
      <QueueButtonAndLabel />
      <HStack width="100%" justifyContent="flex-start" alignItems="stretch">
        <Tabs isFitted={true} width="100%" variant="enclosed">
          <TabList>
            <Tab>Jobs (active total: {activeJobsCount})</Tab>
            <Tab>Workers (total {workerCount}) &nbsp; {maybeHelpForNoWorkers}</Tab>
            {/* {maybeHelpForNoWorkers} */}
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <Jobs />
            </TabPanel>
            <TabPanel px={0}>
              <Workers />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </HStack>
    </VStack>
  );
};
