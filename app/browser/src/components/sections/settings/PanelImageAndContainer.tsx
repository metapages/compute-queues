import { Tab, TabList, TabPanel, TabPanels, Tabs, Text, VStack } from '@chakra-ui/react';

import { TabConfigureImage } from '/@/components/sections/settings/TabConfigureImage';
import { TabConfigureJob } from '/@/components/sections/settings/TabConfigureJob';

export const PanelImageAndContainer: React.FC = () => {
  return (
    <VStack w='100%' alignItems='stretch' overflow={'scroll'}>
      <Tabs isFitted={true}>
        <TabList mb='1em'>
          <Tab>
            <Text>Configure Job</Text>
          </Tab>
          <Tab>
            <Text>Docker Image</Text>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <TabConfigureJob />
          </TabPanel>
          <TabPanel>
            <TabConfigureImage />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
};
