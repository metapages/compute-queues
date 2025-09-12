/**
 * HTTP client for communicating with the worker.metapage.io API
 * This is used by the MCP server to interact with the job queue
 */

export interface JobQueueClient {
  baseUrl: string;
}

export class WorkerMetapageClient implements JobQueueClient {
  public baseUrl: string;

  constructor(baseUrl: string = "https://container.mtfm.io") {
    this.baseUrl = baseUrl;
  }

  async submitJob(queue: string, jobDefinition: any): Promise<{ jobId: string }> {
    const response = await fetch(`${this.baseUrl}/q/${queue}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobDefinition),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit job: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return { jobId: result.jobId || result.id };
  }

  async getJobStatus(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/j/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    // The API returns data wrapped in a 'data' property
    return result.data || result;
  }

  async getJobResult(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/j/${jobId}/result.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job result: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async listJobs(queue: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/q/${queue}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async cancelJob(queue: string, jobId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/q/${queue}/j/${jobId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${response.status} ${response.statusText}`);
    }
  }

  async uploadFile(key: string, content: string | ArrayBuffer): Promise<string> {
    const response = await fetch(`${this.baseUrl}/f/${key}`, {
      method: "PUT",
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
    }

    return key;
  }

  async downloadFile(key: string): Promise<ArrayBuffer> {
    const response = await fetch(`${this.baseUrl}/f/${key}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }
}
