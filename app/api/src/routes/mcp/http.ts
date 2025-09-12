import type { Context } from "hono";
import type { MCPRequest, MCPResponse } from "./types.ts";
import { handleToolCall, tools } from "./tools.ts";
import { readResource, resources } from "./resources.ts";

/**
 * HTTP MCP Server endpoints
 */

export async function handleMCPRequest(c: Context): Promise<Response> {
  try {
    const request = await c.req.json() as MCPRequest;
    const response = await processMCPRequest(request);
    return c.json(response);
  } catch (error) {
    const errorResponse: MCPResponse = {
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error",
        data: (error as Error).message,
      },
    };
    return c.json(errorResponse, 400);
  }
}

async function processMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const { method, params, id } = request;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            capabilities: {
              tools: {},
              resources: {},
              logging: {},
            },
            serverInfo: {
              name: "worker-metapage-mcp",
              version: "1.0.0",
            },
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools },
        };

      case "tools/call":
        const toolResult = await handleToolCall({
          name: params.name,
          arguments: params.arguments,
        });
        
        return {
          jsonrpc: "2.0",
          id,
          result: toolResult,
        };

      case "resources/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { resources },
        };

      case "resources/read":
        const resourceResult = await readResource(params.uri);
        return {
          jsonrpc: "2.0",
          id,
          result: resourceResult,
        };

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: "Method not found",
        data: (error as Error).message,
      },
    };
  }
}

// Health check endpoint for MCP server
export async function handleMCPHealth(c: Context): Promise<Response> {
  return c.json({
    status: "healthy",
    server: "worker-metapage-mcp",
    version: "1.0.0",
    capabilities: ["tools", "resources", "websocket"],
    timestamp: new Date().toISOString(),
  });
}

// MCP server info endpoint
export async function handleMCPInfo(c: Context): Promise<Response> {
  return c.json({
    server: {
      name: "worker-metapage-mcp",
      version: "1.0.0",
      description: "MCP server for worker.metapage.io job queue system",
    },
    capabilities: {
      tools: {
        count: tools.length,
        names: tools.map(t => t.name),
      },
      resources: {
        count: resources.length,
        patterns: resources.map(r => r.uri),
      },
      realtime: {
        websocket: true,
        streaming: true,
        subscriptions: true,
      },
    },
    endpoints: {
      http: "/mcp",
      websocket: "/mcp/ws",
      health: "/mcp/health",
      info: "/mcp/info",
    },
    documentation: {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        required: tool.inputSchema.required || [],
        properties: Object.keys(tool.inputSchema.properties || {}),
      })),
      resources: resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
      })),
    },
  });
}