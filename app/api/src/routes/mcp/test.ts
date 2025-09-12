#!/usr/bin/env deno run --allow-net --allow-env --allow-read

/**
 * Test script for the integrated MCP server
 */

const BASE_URL = "http://localhost:8000";

async function testMCPHTTPEndpoints() {
  console.log("🧪 Testing MCP HTTP endpoints...");

  try {
    // Test health endpoint
    console.log("📊 Testing health endpoint...");
    const healthResponse = await fetch(`${BASE_URL}/mcp/health`);
    const health = await healthResponse.json();
    console.log("✅ Health:", health.status);

    // Test info endpoint
    console.log("📋 Testing info endpoint...");
    const infoResponse = await fetch(`${BASE_URL}/mcp/info`);
    const info = await infoResponse.json();
    console.log("✅ Info:", `${info.capabilities.tools.count} tools, ${info.capabilities.resources.count} resources`);

    // Test tools/list
    console.log("🔧 Testing tools/list...");
    const toolsRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    };

    const toolsResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolsRequest),
    });

    const toolsResult = await toolsResponse.json();
    console.log("✅ Tools available:", toolsResult.result.tools.map((t: any) => t.name).join(", "));

    // Test resources/list
    console.log("📂 Testing resources/list...");
    const resourcesRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "resources/list",
      params: {},
    };

    const resourcesResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resourcesRequest),
    });

    const resourcesResult = await resourcesResponse.json();
    console.log("✅ Resources available:", resourcesResult.result.resources.map((r: any) => r.name).join(", "));

    // Test submit_job tool
    console.log("📤 Testing submit_job tool...");
    const submitJobRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "submit_job",
        arguments: {
          queue: "mcp-test-queue",
          image: "alpine:latest",
          command: "echo 'Hello from MCP integrated test!'",
          inputs: {
            "test.txt": "This is a test file from integrated MCP server",
          },
        },
      },
    };

    const submitResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitJobRequest),
    });

    const submitResult = await submitResponse.json();
    const jobResult = JSON.parse(submitResult.result.content[0].text);
    console.log("✅ Job submitted:", jobResult.jobId);

    // Test get_job_status tool
    if (jobResult.success && jobResult.jobId) {
      console.log("📊 Testing get_job_status tool...");
      const statusRequest = {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "get_job_status",
          arguments: {
            jobId: jobResult.jobId,
            includeResult: true,
          },
        },
      };

      const statusResponse = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusRequest),
      });

      const statusResult = await statusResponse.json();
      const status = JSON.parse(statusResult.result.content[0].text);
      console.log("✅ Job status:", status.status.state);
    }

    // Test list_jobs tool
    console.log("📋 Testing list_jobs tool...");
    const listJobsRequest = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "list_jobs",
        arguments: {
          queue: "mcp-test-queue",
          limit: 10,
        },
      },
    };

    const listResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listJobsRequest),
    });

    const listResult = await listResponse.json();
    const jobs = JSON.parse(listResult.result.content[0].text);
    console.log("✅ Jobs listed:", jobs.totalJobs, "jobs found");

  } catch (error) {
    console.error("❌ Test failed:", (error as Error).message);
    console.error("Stack:", (error as Error).stack);
  }
}

async function testMCPWebSocket() {
  console.log("🔌 Testing MCP WebSocket...");

  try {
    const ws = new WebSocket(`ws://localhost:8000/mcp/ws`);

    ws.onopen = () => {
      console.log("✅ WebSocket connected");

      // Send initialize request
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("📨 Received:", message);

      if (message.method === "initialized") {
        console.log("✅ Server initialized");

        // Test tools/list via WebSocket
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }));
      }

      if (message.id === 2 && message.result) {
        console.log("✅ Tools via WebSocket:", message.result.tools.length, "tools");
        ws.close();
      }
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket closed");
    };

    // Wait a bit for WebSocket operations
    await new Promise(resolve => setTimeout(resolve, 3000));

  } catch (error) {
    console.error("❌ WebSocket test failed:", (error as Error).message);
  }
}

async function testMCPInfo() {
  console.log("🔍 MCP Server Integration Information:");
  console.log("  HTTP Endpoint: http://localhost:8000/mcp");
  console.log("  WebSocket Endpoint: ws://localhost:8000/mcp/ws");
  console.log("  Health Check: http://localhost:8000/mcp/health");
  console.log("  Server Info: http://localhost:8000/mcp/info");
  console.log("");
  console.log("💡 Features:");
  console.log("  ✅ HTTP MCP protocol support");
  console.log("  ✅ WebSocket MCP protocol support");
  console.log("  ✅ Real-time job log streaming");
  console.log("  ✅ Job status notifications");
  console.log("  ✅ Job subscriptions");
  console.log("  ✅ Integrated with existing queue system");
  console.log("");
  console.log("🚀 Usage:");
  console.log("  1. Start the API server: just api/dev");
  console.log("  2. Connect MCP clients to http://localhost:8000/mcp");
  console.log("  3. Use WebSocket for real-time features");
}

if (import.meta.main) {
  await testMCPInfo();
  console.log("⏳ Make sure the API server is running (just api/dev)...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await testMCPHTTPEndpoints();
  await testMCPWebSocket();
}