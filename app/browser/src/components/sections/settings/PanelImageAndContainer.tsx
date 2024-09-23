import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react';

import { PanelConfigurationAndContainerFromUrlParams } from '/@/components/sections/settings/PanelConfigurationAndContainerFromUrlParams';
import { PanelImageBuildFromUrlParams } from '/@/components/sections/settings/PanelImageBuildFromUrlParams';

export const PanelImageAndContainer: React.FC = () => {

  return (
    <VStack w="100%" alignItems="stretch" overflow={'scroll'}>
      <Tabs isFitted={true}>
        <TabList mb='1em'>
          <Tab><Text>Configure Job</Text></Tab>
          <Tab><Text>Docker Image</Text></Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <PanelConfigurationAndContainerFromUrlParams />
          </TabPanel>
          <TabPanel>
            <PanelImageBuildFromUrlParams />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
};