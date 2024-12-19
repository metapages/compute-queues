import { BaseDockerJobQueue, userJobQueues } from "/@/shared";

export class ApiDockerJobQueue extends BaseDockerJobQueue {
  constructor(opts: { serverId: string; address: string }) {
    super(opts); // Call parent constructor with required options
  }
}

export { userJobQueues };
