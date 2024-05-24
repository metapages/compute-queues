import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { WithMetaframeAndInputs } from "@metapages/metaframe-hook";
import { App } from "./App";

const container = document.getElementById("root");
createRoot(container!).render(
  <ChakraProvider>
    <WithMetaframeAndInputs>
      <App />
    </WithMetaframeAndInputs>
  </ChakraProvider>
);
