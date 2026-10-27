import { createMcpApp } from "./server.js";
import { WebApiClient } from "./api-client.js";

const port = Number(process.env.MCP_PORT ?? 3001);
const hermesToken = process.env.MCP_HERMES_BEARER_TOKEN;
const apiToken = process.env.MCP_API_TOKEN;
const apiUrl = process.env.MCP_API_URL ?? "http://web:3000/api/";

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MCP_PORT deve ser uma porta válida");
if (!hermesToken || Buffer.byteLength(hermesToken) < 32) {
  throw new Error("MCP_HERMES_BEARER_TOKEN deve conter ao menos 32 bytes");
}
if (!apiToken || Buffer.byteLength(apiToken) < 32) {
  throw new Error("MCP_API_TOKEN deve conter ao menos 32 bytes");
}
if (hermesToken === apiToken) throw new Error("MCP_HERMES_BEARER_TOKEN e MCP_API_TOKEN devem ser diferentes");

const app = createMcpApp(hermesToken, new WebApiClient(apiUrl, apiToken));
app.listen(port, "0.0.0.0", () => console.info(`MCP HTTP server listening on port ${port}`));
