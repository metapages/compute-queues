import React from "react";
import { Text } from "@chakra-ui/react";

export const ErrorText: React.FC<{
  text: string;
  ariaLabel?: string;
}> = ({ text, ariaLabel }) => {
  return (
    <Text aria-label={ariaLabel} color={'red'} fontWeight={400} fontSize={'0.7rem'}>{text}</Text>
  );
};
