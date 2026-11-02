import { Module } from "@nestjs/common";
import { StorageClient } from "../../storage/storage.client.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, StorageClient],
})
export class CatalogModule {}
