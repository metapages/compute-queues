import React from "react";
import { Link, Text } from "@chakra-ui/react";
import { capitalize } from "/@/helpers";

export const FormLink: React.FC<{
  href: string;
  label: string;
}> = ({ href, label }) => {
  return (
    <Link isExternal href={href}>
      <Text>{capitalize(label)}</Text>
    </Link>
  );
};
