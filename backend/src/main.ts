import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";

const app = await NestFactory.create(AppModule);
// Atrás de um proxy (Render, Railway, Nginx), o IP do cliente vem no X-Forwarded-For.
// Sem isto o limite de pedidos da vitrine veria todo mundo com o IP do proxy.
if (process.env.TRUST_PROXY) {
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", Number(process.env.TRUST_PROXY) || true);
}
configureApp(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
console.log(`MesaFlow API em http://localhost:${port}/api`);
