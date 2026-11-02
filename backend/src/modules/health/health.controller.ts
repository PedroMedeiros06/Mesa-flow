import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@mesaflow/shared";

const VERSION = process.env.npm_package_version ?? "0.1.0";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      service: "mesaflow-api",
      version: VERSION,
      time: new Date().toISOString(),
    };
  }
}
