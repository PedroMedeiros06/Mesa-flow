import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

// Valida o corpo da requisição com o mesmo schema zod que o frontend usa (@mesaflow/shared).
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      statusCode: 400,
      message: "Dados inválidos",
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}
