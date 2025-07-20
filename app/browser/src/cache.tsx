import { DockerJobDefinitionInputRefs, StateChangeValueFinished } from "/@shared/client";
import Dexie from "dexie";

import { getIOBaseUrl } from "./config";
import { getQueueFromUrl } from "./hooks/useQueue";

interface IJobsFinished {
  id: string;
  job: StateChangeValueFinished;
  created_at: Date;
}

interface IJobDefinitions {
  id: string;
  definition: DockerJobDefinitionInputRefs;
  created_at: Date;
}

class LocalDatabase extends Dexie {
  // Declare implicit table properties.
  // (just to inform Typescript. Instantiated by Dexie in stores() method)
  jobsFinished!: Dexie.Table<IJobsFinished, string>; // string = type of the primkey
  jobDefinitions!: Dexie.Table<IJobDefinitions, string>; // string = type of the primkey
  // menuIds!: Dexie.Table<IMenuIds, string>;
  // // These are PROCESSED Menus, ie they are ready to GO
  // menus!: Dexie.Table<IMenu, string>;
  // // These are PROCESSED MenuItemDefinitions, ie they are ready to GO
  // menuItems!: Dexie.Table<IMenuItem, string>;
  // menuDefinitionState!: Dexie.Table<IMenuDefinitionState, string>;

  //...other tables goes here...

  constructor() {
    super("jobs");
    // console.log("CREATING DATABASE")
    this.version(1).stores({
      jobsFinished: "id, job, created_at",
      jobDefinitions: "id, definition, created_at",
      // menuIds: "channel, menuIds, updated_at",
      // menus: "id, channel, menu, updated_at",
      // menuItems: "id, channel, menuItemDefinition, updated_at",
      // menuDefinitionState: "channel, menuDefinitionState, updated_at",
      //...other tables goes here...
    });
  }

  async saveFinishedJob(id: string, job: StateChangeValueFinished): Promise<void> {
    // console.log(`🔻🔻 👜  savesMenuDefinition (channel=${channel.substring(0, 24)})`, menusDefinition);
    await this.jobsFinished.put({
      id,
      job,
      created_at: new Date(),
    });
    // console.log(`🔻 ✅ 👜 saveFinishedJob`);
  }

  async getFinishedJob(id: string): Promise<StateChangeValueFinished | undefined> {
    const jobsFinished = await this.jobsFinished.where({ id }).toArray();
    if (jobsFinished?.[0]?.job) {
      return jobsFinished[0].job;
    }

    const queue = getQueueFromUrl();
    const finishedUrl = `${getIOBaseUrl(queue)}/j/${id}/result.json`;
    const response = await fetch(finishedUrl, { redirect: "follow" });
    if (!response.ok) {
      // console.error(`🔻 ❌  getFinishedJob: ${finishedUrl}`, response);
      return;
    }

    const json: { data: StateChangeValueFinished | null } = await response.json();
    if (json.data) {
      // console.log(`${getJobColorizedString(id)} 🔻 ✅ 👜 saveFinishedJob`, json.data);
      this.saveFinishedJob(id, json.data);
    }

    return json.data;
  }

  async deleteFinishedJob(id: string): Promise<void> {
    // console.log(`${getJobColorizedString(id)} 🔻 🗑️ deleteFinishedJob`);
    await this.jobsFinished.delete(id);
  }

  async getJobDefinition(id: string): Promise<DockerJobDefinitionInputRefs | undefined> {
    const definitionEntries = await this.jobDefinitions.where({ id }).toArray();
    if (definitionEntries?.[0]?.definition) {
      return definitionEntries[0].definition;
    }

    const queue = getQueueFromUrl();
    const url = `${getIOBaseUrl(queue)}/j/${id}/definition.json`;
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      // console.error(`🔻 ❌  getJobDefinition: ${url}`, response);
      return;
    }

    const definition: DockerJobDefinitionInputRefs | undefined = await response.json();

    await this.jobDefinitions.put({
      id,
      definition,
      created_at: new Date(),
    });

    return definition;
  }
}

const localDb = new LocalDatabase();
export const cache = localDb;
