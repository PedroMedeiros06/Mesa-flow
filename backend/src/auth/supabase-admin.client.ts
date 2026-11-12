import { randomBytes } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { supabaseConfig } from "../config/env.js";
import { chamarAuth } from "./supabase-auth.client.js";

/**
 * Operações de administrador no Supabase Auth (criar usuário, gerar link de senha), com a chave secreta.
 * Só o backend usa. É uma classe abstrata para os testes trocarem por uma versão em memória.
 */
export abstract class AuthAdmin {
  /** Cria o login com uma senha aleatória que ninguém conhece: a pessoa define a dela pelo link. */
  abstract createUser(email: string, name: string): Promise<string>;
  abstract deleteUser(authUserId: string): Promise<void>;
  /**
   * Gera o token de troca de senha SEM mandar e-mail. O link é montado pelo front e enviado
   * pelo dono (WhatsApp, por exemplo), então não depende de servidor de e-mail.
   */
  abstract passwordToken(email: string): Promise<string>;
}

@Injectable()
export class SupabaseAuthAdmin extends AuthAdmin {
  private readonly config = supabaseConfig();

  // Lida só quando precisa: a API sobe e os testes rodam sem a chave secreta.
  private get secret(): string {
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!key) throw new Error("Variável de ambiente SUPABASE_SECRET_KEY não definida (veja .env.example).");
    return key;
  }

  private async chamar(caminho: string, init: RequestInit): Promise<Response> {
    return chamarAuth(`${this.config.authUrl}${caminho}`, {
      ...init,
      headers: { apikey: this.secret, Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
    });
  }

  async createUser(email: string, name: string): Promise<string> {
    const res = await this.chamar("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: randomBytes(24).toString("base64url"),
        email_confirm: true,
        user_metadata: { name },
      }),
    });
    const corpo = (await res.json().catch(() => ({}))) as { id?: string; error_code?: string; msg?: string };
    // O e-mail do login é único em todo o MesaFlow, não só no restaurante.
    if (res.status === 422 && corpo.error_code === "email_exists") {
      throw new ConflictException("Este e-mail já tem acesso ao MesaFlow. Use outro e-mail.");
    }
    if (!res.ok || !corpo.id) throw new Error(`Supabase Auth respondeu ${res.status} ao criar usuário: ${corpo.msg ?? ""}`);
    return corpo.id;
  }

  async deleteUser(authUserId: string): Promise<void> {
    await this.chamar(`/admin/users/${authUserId}`, { method: "DELETE" }).catch(() => undefined);
  }

  async passwordToken(email: string): Promise<string> {
    const res = await this.chamar("/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "recovery", email }),
    });
    const corpo = (await res.json().catch(() => ({}))) as { hashed_token?: string; properties?: { hashed_token?: string } };
    const token = corpo.hashed_token ?? corpo.properties?.hashed_token;
    if (!res.ok || !token) throw new Error(`Supabase Auth respondeu ${res.status} ao gerar o link de senha.`);
    return token;
  }
}
