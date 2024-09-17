import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react';

import { PanelContainerFromUrlParams } from './PanelContainerFromUrlParams';
import { PanelImageBuildFromUrlParams } from './PanelImageBuildFromUrlParams';

export const PanelImageAndContainer: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
  return (
    <VStack w="100%" alignItems="stretch">
      <Tabs isFitted={true}>
        <TabList mb='1em'>
          <Tab><Text>Configure Job</Text></Tab>
          <Tab><Text>Docker Image</Text></Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <PanelContainerFromUrlParams onSave={onSave} />
          </TabPanel>
          <TabPanel>
            <PanelImageBuildFromUrlParams onSave={onSave} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
};
