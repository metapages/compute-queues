import { 
  Tooltip, 
  Icon, 
  useDisclosure, 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalOverlay,
  Container,
} from "@chakra-ui/react"
import { headerHeight, defaultBorder } from "/@/styles/theme";
import { Queue as QueueIcon } from "@phosphor-icons/react";
import Queue from "/@/components/sections/queue/Queue";


export const QueueIconAndModal: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return <>
    <Tooltip label={'Queue'}>            
      <Icon 
        as={QueueIcon} 
        _hover={{ bg: 'black.10' }} 
        bg={isOpen ? 'black.10' : 'none'}
        p={'3px'} 
        borderRadius={5} 
        boxSize="6" 
        onClick={onOpen}
        />
    </Tooltip>
    <Modal isOpen={isOpen} onClose={onClose} size={'100%'}>
        <ModalOverlay backdropFilter='blur(1px)'/>
        <ModalContent h={'90%'} w={'90%'}>
          <ModalHeader p={0} h={headerHeight} borderBottom={defaultBorder}>
          </ModalHeader>
          <Container p={3} m={0} overflow={'scroll'} minWidth={'100%'} h={'100%'}>
            <Queue />
          </Container>
        </ModalContent>
      </Modal>
  </>
};

export default QueueIconAndModal;