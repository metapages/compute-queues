import React from "react";
import { HStack, VStack, Tab, TabList, TabPanel, TabPanels, Tabs } from "@chakra-ui/react";
import { useActiveJobsCount } from "/@/hooks/useActiveJobsCount";
import { useWorkersCount } from "/@/hooks/useWorkersCount";
import { QuestionIcon } from "@chakra-ui/icons";

import { JobsTable } from "/@/components/sections/queue/JobsTable";
import { WorkersTable } from "/@/components/sections/queue/WorkersTable";
import { QueueButtonAndLabel } from "./QueueButtonAndLabel";

export const Queue: React.FC = () => {
  const activeJobsCount = useActiveJobsCount();
  const workerCount = useWorkersCount();

  const maybeHelpForNoWorkers = workerCount > 0 ? null : <QuestionIcon color="red" />;

  return (
    <VStack width="100%" justifyContent="flex-start" alignItems="flex-start">
      <QueueButtonAndLabel />
      <HStack width="100%" justifyContent="flex-start" alignItems="stretch">
        <Tabs isFitted={true} width="100%" variant="enclosed">
          <TabList>
            <Tab fontSize={"0.9rem"}>Jobs (active total: {activeJobsCount})</Tab>
            <Tab fontSize={"0.9rem"}>
              Workers (total {workerCount}) &nbsp; {maybeHelpForNoWorkers}
            </Tab>
            {/* {maybeHelpForNoWorkers} */}
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <JobsTable />
            </TabPanel>
            <TabPanel px={0}>
              <WorkersTable />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </HStack>
    </VStack>
  );
};