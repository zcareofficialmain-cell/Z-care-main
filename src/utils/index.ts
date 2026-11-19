import { format, formatDistanceToNow, parseISO, differenceInYears } from 'date-fns';

export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    return format(parseISO(dateString), 'dd MMM yyyy');
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    return format(parseISO(dateString), 'dd MMM yyyy, hh:mm a');
  } catch {
    return dateString;
  }
};

export const formatTimeAgo = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
};

export const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
  if (!dateOfBirth) return null;
  try {
    return differenceInYears(new Date(), parseISO(dateOfBirth));
  } catch {
    return null;
  }
};

export const maskPolicyNumber = (policyNumber: string): string => {
  if (policyNumber.length <= 4) return '****';
  return '***' + policyNumber.slice(-4);
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export const validateFileType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

export const validateFileSize = (file: File, maxSizeMB: number): boolean => {
  return file.size <= maxSizeMB * 1024 * 1024;
};

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export const MAX_FILE_SIZE_MB = 10;
