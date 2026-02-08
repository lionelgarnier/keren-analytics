import { config } from "../config.js";
import { createMockClient } from "./mockClient.js";
import { createRealClient } from "./realClient.js";

export function getAzureClient() {
  if (config.azureMode === "real") {
    return createRealClient();
  }
  return createMockClient();
}
