import React from "react"
import { VStack, useStyleConfig } from "@chakra-ui/react"

export const PanelContainer:  React.FC<any> = (props) => {
  const { size, variant, ...rest } = props
  const styles = useStyleConfig("PanelContainer", { size, variant })
  return <VStack sx={styles} {...rest} />
}