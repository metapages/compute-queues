## Guides and reminders for development

- a single websocket on a queue/address does all the communication to the api
  server
- job flow:
  - `PanelImageAndContainer` (and others) takes the job parameters and sets it
    in the url hash `job` param
  - `useDockerJobDefinition` gets the job parameters and combines with the
    metaframe inputs (which if large are copied to the cloud storage)
  - `useJobSubmissionHook` is where the job is actually submitted to the server,
    via a `StateChangeValueQueued`
  - `useSendJobOutputs` is where the job outputs are sent to the metaframe
