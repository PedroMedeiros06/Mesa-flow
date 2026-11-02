import type { INestApplication } from "@nestjs/common";

// Configuração comum ao servidor real e aos testes, para os dois se comportarem igual.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  });
}
