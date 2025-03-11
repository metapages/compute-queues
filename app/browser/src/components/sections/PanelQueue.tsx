import React from "react";

import { PanelHeader } from "/@/components/generic/PanelHeader";
import { PanelContainer } from "/@/components/generic/PanelContainer";
import { Queue } from "/@/components/sections/queue/Queue";

export const PanelQueue: React.FC = () => {
  return (
    <PanelContainer>
      <PanelHeader title={"Queue"} />
      <Queue />
    </PanelContainer>
  );
};
