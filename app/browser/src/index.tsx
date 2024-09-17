import '@fontsource-variable/jetbrains-mono';
import './styles/app.css'
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { WithMetaframeAndInputs } from "@metapages/metaframe-hook";
import { App } from "./App";
import { theme } from './styles/theme';

const container = document.getElementById("root");
createRoot(container!).render(
  <ChakraProvider theme={theme}>
    <WithMetaframeAndInputs>
      <App />
    </WithMetaframeAndInputs>
  </ChakraProvider>
);
