import React from "react";
import "@fontsource-variable/jetbrains-mono";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { WithMetaframeAndInputs } from "@metapages/metaframe-react-hook";
import { App } from "/@/App";
import { mfTheme } from "/@/styles/theme";

const container = document.getElementById("root");
createRoot(container!).render(
  <ChakraProvider theme={mfTheme}>
    <WithMetaframeAndInputs>
      <App />
    </WithMetaframeAndInputs>
  </ChakraProvider>,
);
