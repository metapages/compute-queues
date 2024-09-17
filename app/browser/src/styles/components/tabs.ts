import { tabsAnatomy } from '@chakra-ui/anatomy'
import { createMultiStyleConfigHelpers, defineStyle } from '@chakra-ui/react'
import { mode } from '@chakra-ui/theme-tools' // import utility to set light and dark mode props

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(tabsAnatomy.keys)

const mpVariant = definePartsStyle(() => {
  return {
    tab: {
      border: 'none',
      borderColor: 'transparent',
      bg: 'black.3',
      borderTopRadius: 'none',
      borderBottom: '1px solid',
      _selected: {
        bg: 'none',
        'border-color': 'red !important',
        border:'1px solid'  ,
        borderBottom: 'none',
      },
    },
    tabpanel: {
    },
  }
})

const variants = {
  mp: mpVariant,
}

// export the component theme
export const tabsTheme = defineMultiStyleConfig({ variants })