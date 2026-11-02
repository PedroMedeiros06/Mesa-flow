import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { healthResponseSchema } from "@mesaflow/shared";
import { AppModule } from "../../app.module.js";
import { configureApp } from "../../configure-app.js";

describe("GET /api/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responde no formato definido em @mesaflow/shared", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    const health = healthResponseSchema.parse(res.body);
    expect(health.status).toBe("ok");
    // Os testes rodam sem banco; com DATABASE_URL o valor seria "ok".
    expect(health.database).toBe(process.env.DATABASE_URL ? "ok" : "not_configured");
  });
});
