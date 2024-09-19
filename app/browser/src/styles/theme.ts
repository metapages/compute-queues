import { extendTheme } from "@chakra-ui/react";
import { tabsTheme } from './components/tabs';

export const defaultBorder = '1px solid var(--chakra-colors-black-10)';
const headerHeightVal = 3
const footerHeightVal = 3.5;
export const contentHeight = `calc(100vh - ${headerHeightVal + footerHeightVal}rem)`;
export const headerHeight = `${headerHeightVal}rem`;
export const footerHeight = `${footerHeightVal}rem`;

export const theme = extendTheme(
  {
    fonts: {
      body: `'JetBrains Mono Variable', monospace`,
      mono: `'JetBrains Mono Variable', monospace`,
    },
    colors: {
      gray: {
        35: '#585858',
        39: '#636564',
        87: '#DEDEDE',
        90: '#E6E6E6',
        95: '#F3F3F3',
      },
      black: {
        3: 'rgba(0, 0, 0, 0.03)',
        4: 'rgba(0, 0, 0, 0.04)',
        10: 'rgba(0, 0, 0, 0.1)',
        100: '#000',
      }
    },
    components: {
      Text: {
        baseStyle: (props) => {
          return {
            color: props.color || 'gray.35',
            fontSize: props.fontSize || '0.9rem',
          }
        },
      },
      Icon: {
        baseStyle: (props) => {
          return {
            color: props.color || 'gray.35',
            boxSize: props.boxSize || '1.2rem',
            cursor: props.cursor || 'pointer',
          }
        },
      },
      Input: {
        variants: {
          outline: {
            field: {
              bg: '#ECECEC !important',
              border: "1px solid",
              borderColor: 'gray.87',
              _hover: {
                borderColor: 'gray.87',
              },
              _focusVisible:{
                outline: 'none',
                borderColor: 'gray.87',
                boxShadow: '0 0 0 0px transparent !important',
              },
            }
          }
        },
      },
      PanelContainer: {
        baseStyle: {
          bg: 'black.3',
          w: '100%',
          minHeight: contentHeight,
          maxHeight: contentHeight,
          overflow: 'scroll',
        }
      },
      Tabs: {
        variants: {
          line: {
            tab: {
              border: 'none',
              borderBottom: 'none',
              color: 'none',
              borderColor: 'none',
              bg: "black.10",
              _selected: {
                border: 'none',
                borderColor: 'none',
                color: 'none',
                bg: 'none',
                borderBottom: 'none',
                }
            },
            tablist: {
              borderBottom: '0px solid',
            },
          }
        },
      },
      Table: {
        variants: {
          simple: {
            td: {
              fontSize: '0.8rem'
            }
          }
        }
      }
    }
  },
);