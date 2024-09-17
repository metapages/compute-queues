import React from 'react';

import { PanelHeader } from '/@/components/generic/PanelHeader';
import { PanelImageAndContainer } from './settings/PanelImageAndContainer';
import PanelContainer from '../generic/PanelContainer';

export const PanelSettings: React.FC = () => {
  return (
    <PanelContainer gap={0}>
      <PanelHeader title={'Job Settings'}/>
      <PanelImageAndContainer />
    </PanelContainer>
  );
};


