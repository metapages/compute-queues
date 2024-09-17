import React from "react"
import { VStack, useStyleConfig } from "@chakra-ui/react"

const PanelContainer:  React.FC<any> = (props) => {
  const { size, variant, ...rest } = props
  const styles = useStyleConfig("PanelContainer", { size, variant })
  return <VStack sx={styles} {...rest} />
}

export default PanelContainer;