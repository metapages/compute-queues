import { Link, Text } from "@chakra-ui/react"
import { capitalize } from "/@/shared"

const FormLink: React.FC<{
  href: string, 
  label: string
}> = ({ href, label }) => {
  return <Link
    isExternal
    href={href}
  >
    <Text>{capitalize(label)}</Text>
  </Link>
}

export default FormLink;