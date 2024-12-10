import Dexie from "dexie";

import { DockerJobDefinitionRow } from "./shared";

interface IJobsFinished {
  id: string;
  job: DockerJobDefinitionRow;
  created_at: Date;
}

class LocalDatabase extends Dexie {
  // Declare implicit table properties.
  // (just to inform Typescript. Instantiated by Dexie in stores() method)
  jobsFinished!: Dexie.Table<IJobsFinished, string>; // string = type of the primkey
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
      // menuIds: "channel, menuIds, updated_at",
      // menus: "id, channel, menu, updated_at",
      // menuItems: "id, channel, menuItemDefinition, updated_at",
      // menuDefinitionState: "channel, menuDefinitionState, updated_at",
      //...other tables goes here...
    });
  }

  async saveFinishedJob(
    id: string,
    job: DockerJobDefinitionRow,
  ): Promise<void> {
    // console.log(`🔻🔻 👜  savesMenuDefinition (channel=${channel.substring(0, 24)})`, menusDefinition);
    await this.jobsFinished.put({
      id,
      job,
      created_at: new Date(),
    });

    console.log(`🔻 ✅ 👜   saveFinishedJob`);
  }

  async getFinishedJob(
    id: string,
  ): Promise<DockerJobDefinitionRow | undefined> {
    const jobsFinished = await this.jobsFinished.where({ id }).toArray();
    if (!jobsFinished || jobsFinished.length === 0) {
      return;
    }
    console.log("jobsFinished", jobsFinished);

    return jobsFinished && jobsFinished[0] ? jobsFinished[0].job : undefined;
  }

  async deleteFinishedJob(id: string): Promise<void> {
    await this.jobsFinished.delete(id);
  }
}

const localDb = new LocalDatabase();
export const cache = localDb;

// Function to get an object from the database
export const saveFinishedJob = async (
  id: string,
  job: DockerJobDefinitionRow,
) => {
  return await cache.saveFinishedJob(id, job);
};

// Function to store an object in the database
export const getFinishedJob = async (
  id: string,
): Promise<DockerJobDefinitionRow | undefined> => {
  return await cache.getFinishedJob(id);
};

export const deleteFinishedJob = async (id: string): Promise<void> => {
  await cache.deleteFinishedJob(id);
};
