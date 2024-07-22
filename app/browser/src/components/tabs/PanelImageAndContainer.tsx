import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react';

import { PanelContainerFromUrlParams } from './PanelContainerFromUrlParams';
import { PanelImageBuildFromUrlParams } from './PanelImageBuildFromUrlParams';

export const PanelImageAndContainer: React.FC<{
  onSave?: () => void;
}> = ({ onSave }) => {
  return (
    <Tabs w="50%">
      <TabList>
        <Tab>Container</Tab>
        <Tab>Image</Tab>
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
  );
};
