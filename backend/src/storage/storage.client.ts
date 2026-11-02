import { Injectable } from "@nestjs/common";
import { supabaseConfig } from "../config/env.js";

/** Bucket público das fotos do cardápio (a vitrine mostra as fotos sem login). */
export const CATALOG_BUCKET = "cardapio";

// Supabase Storage pela API REST, com a chave secreta. Só o backend envia e apaga arquivos.
@Injectable()
export class StorageClient {
  private readonly config = supabaseConfig();

  // Lida só quando precisa: a API sobe e os testes rodam sem a chave secreta.
  private get secret(): string {
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!key) throw new Error("Variável de ambiente SUPABASE_SECRET_KEY não definida (veja .env.example).");
    return key;
  }

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.secret, Authorization: `Bearer ${this.secret}`, ...extra };
  }

  publicUrl(path: string): string {
    return `${this.config.url}/storage/v1/object/public/${CATALOG_BUCKET}/${path}`;
  }

  async upload(path: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(`${this.config.url}/storage/v1/object/${CATALOG_BUCKET}/${path}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "Cache-Control": "max-age=31536000" }),
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Storage respondeu ${res.status} ao enviar a foto.`);
  }

  /** Apaga arquivos. Falha aqui não pode desfazer a operação principal: só sobra um arquivo órfão. */
  async remove(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const res = await fetch(`${this.config.url}/storage/v1/object/${CATALOG_BUCKET}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) console.warn(`Storage respondeu ${res.status} ao apagar ${paths.length} foto(s).`);
  }
}

/** Tipo real da imagem pelos primeiros bytes (não confia na extensão nem no Content-Type enviado). */
export function detectImageType(bytes: Buffer): { mime: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}
