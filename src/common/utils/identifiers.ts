import { BadRequestException } from '@nestjs/common';

const IDENTIFIER_REGEX = /^[A-Za-z0-9:_-]{1,64}$/;

function formatLabel(label: string): string {
  return label || 'valeur';
}

export function ensureIdentifier(
  value: string | undefined | null,
  label: string,
  options?: { required?: boolean; maxLength?: number }
): string {
  const { required = true, maxLength = 64 } = options || {};
  const normalizedLabel = formatLabel(label);

  if (value === undefined || value === null || value === '') {
    if (!required) {
      return '';
    }
    throw new BadRequestException(`${normalizedLabel} manquant(e)`);
  }

  if (value.length > maxLength) {
    throw new BadRequestException(`${normalizedLabel} trop long (${maxLength} max)`);
  }

  if (!IDENTIFIER_REGEX.test(value)) {
    throw new BadRequestException(`${normalizedLabel} invalide`);
  }

  return value;
}

export function ensureOptionalIdentifier(
  value: string | undefined | null,
  label: string,
  options?: { maxLength?: number }
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return ensureIdentifier(value, label, { required: false, ...(options || {}) }) || undefined;
}

