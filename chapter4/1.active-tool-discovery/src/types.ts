export interface RegistryTool {
  server: string;
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface DiscoverHit extends RegistryTool {
  score: number;
}

export interface ActionResponse {
  success: boolean;
  message: string;
  metadata: Record<string, unknown>;
}
