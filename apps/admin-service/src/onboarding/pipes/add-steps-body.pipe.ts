import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateStepDto } from '../dto/create-step.dto';

function formatValidationErrors(
  errors: ValidationError[],
  prefix = '',
): string[] {
  const messages: string[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      messages.push(
        ...Object.values(err.constraints).map((m) => `${path}: ${m}`),
      );
    }
    if (err.children?.length) {
      messages.push(...formatValidationErrors(err.children, path));
    }
  }
  return messages;
}

function assertUniqueOrderIndexes(dtos: CreateStepDto[]): void {
  const seen = new Set<number>();
  for (const dto of dtos) {
    if (seen.has(dto.orderIndex)) {
      throw new BadRequestException(
        `Duplicate orderIndex ${dto.orderIndex} in request`,
      );
    }
    seen.add(dto.orderIndex);
  }
}

@Injectable()
export class AddStepsBodyPipe implements PipeTransform {
  async transform(value: unknown): Promise<CreateStepDto[]> {
    const { items, prefixes } = this.extractItems(value);
    if (items.length === 0) {
      throw new BadRequestException('At least one step is required');
    }

    const dtos: CreateStepDto[] = [];
    for (let i = 0; i < items.length; i++) {
      const dto = plainToInstance(CreateStepDto, items[i]);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: formatValidationErrors(errors, prefixes[i]),
        });
      }
      dtos.push(dto);
    }

    assertUniqueOrderIndexes(dtos);
    return dtos;
  }

  private extractItems(value: unknown): {
    items: unknown[];
    prefixes: string[];
  } {
    if (Array.isArray(value)) {
      return {
        items: value,
        prefixes: value.map((_, i) => `[${i}]`),
      };
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.steps)) {
        return {
          items: record.steps,
          prefixes: record.steps.map((_, i) => `steps[${i}]`),
        };
      }
      return { items: [value], prefixes: [''] };
    }
    throw new BadRequestException(
      'Body must be a step object, { "steps": [...] }, or an array of steps',
    );
  }
}
