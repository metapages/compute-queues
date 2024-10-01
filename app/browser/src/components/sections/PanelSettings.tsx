import React from "react";

import { PanelHeader } from "/@/components/generic/PanelHeader";
import { PanelImageAndContainer } from "/@/components/sections/settings/PanelImageAndContainer";
import { PanelContainer } from "/@/components/generic/PanelContainer";

export const PanelSettings: React.FC = () => {
  return (
    <PanelContainer>
      <PanelHeader title={"Job Settings"} />
      <PanelImageAndContainer />
    </PanelContainer>
  );
};
