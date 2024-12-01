import '@fontsource-variable/jetbrains-mono';
import './styles/app.css';

import { App } from '/@/App';
import { mfTheme } from '/@/styles/theme';
import { createRoot } from 'react-dom/client';

import { ChakraProvider } from '@chakra-ui/react';
import { WithMetaframeAndInputs } from '@metapages/metapage-react';

const container = document.getElementById("root");
createRoot(container!).render(
  <ChakraProvider theme={mfTheme}>
    <WithMetaframeAndInputs>
      <App />
    </WithMetaframeAndInputs>
  </ChakraProvider>,
);
