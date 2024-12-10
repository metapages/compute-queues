## Guides and reminders for development

- a single websocket on a queue/address does all the communication to the api
  server
- job flow:
  - `PanelJobInputFromUrlParams` takes the job parameters and sets it in the url
    hash `job` param
  - `jobDefinitionHook` gets the job parameters and combines with the metaframe
    inputs (which if large are copied to the cloud storage)
  - `TabMenu` is where the job is actually submitted to the server, via a
    `StateChangeValueQueued`
    - This class should be renamed or use a hook so the data flow is not tied up
      with the UI. I was less familiar with react when I wrote this.
