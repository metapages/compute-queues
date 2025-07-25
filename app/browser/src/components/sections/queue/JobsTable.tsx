import React from "react";

import { ButtonJobCancel } from "/@/components/generic/ButtonJobCancel";
import { useStore } from "/@/store";
import { DockerJobState, JobsStateMap } from "/@shared/client";

import { Box, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "@chakra-ui/react";

export const JobsTable: React.FC = () => {
  const jobs = useStore(state => state.jobStates);

  const jobIds = jobs ? Object.keys(jobs) : [];
  jobIds.sort((jobA, jobB) => {
    const jobAActive = jobs[jobA].state === DockerJobState.Running || jobs[jobA].state === DockerJobState.Queued;
    const jobBActive = jobs[jobB].state === DockerJobState.Running || jobs[jobB].state === DockerJobState.Queued;
    if (jobAActive && !jobBActive) {
      return -1;
    }
    if (!jobAActive && jobBActive) {
      return 1;
    }

    const timeA = jobs[jobA].time;
    const timeB = jobs[jobB].time;
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  return (
    <Box p={2}>
      <TableContainer whiteSpace={"wrap"} fontSize={"0.7rem"}>
        <Table layout={"fixed"} size={"sm"} w={"100%"} variant="simple">
          <Thead>
            <Tr>
              <Th w={"15%"}>Id</Th>
              <Th w={"20%"}>image</Th>
              <Th w={"20%"}>command</Th>
              <Th w={"15%"}>Time</Th>
              <Th w={"15%"}>State</Th>
              <Th w={"15%"}>Cancel</Th>
            </Tr>
          </Thead>
          <Tbody>
            {jobIds.map((jobHash, i) => (
              <JobComponent key={jobHash + i} jobId={jobHash} jobs={jobs} />
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const JobComponent: React.FC<{
  jobId: string;
  jobs: JobsStateMap;
}> = ({ jobId, jobs }) => {
  // How many jobs is this worker running
  const jobBlob = jobs[jobId];
  // const definition = (jobBlob!.history[0]!.value as StateChangeValueQueued).definition;

  return (
    <Tr>
      <Td>{jobId.substring(0, 6)}</Td>
      {/* <Td style={{ wordBreak: "break-word" }}>{definition.image}</Td>
      <Td>{definition.command}</Td> */}
      <Td style={{ wordBreak: "break-word" }}></Td>
      <Td></Td>
      <Td>{jobBlob.time ? new Date(jobBlob.time).toLocaleTimeString() : "--"}</Td>
      <Td>{jobBlob.state}</Td>
      <Td>
        <ButtonJobCancel job={jobBlob} jobId={jobId} />
      </Td>
    </Tr>
  );
};
