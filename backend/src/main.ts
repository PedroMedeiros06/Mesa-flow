import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";

const app = await NestFactory.create(AppModule);
configureApp(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
console.log(`MesaFlow API em http://localhost:${port}/api`);
