import { ClinicalRecord } from '@/types/health';
import fs from 'fs';
import path from 'path';

export function parseClinicalRecord(filePath: string): ClinicalRecord {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ClinicalRecord;
}

export function getAllClinicalRecords(directory: string): ClinicalRecord[] {
  const files = fs.readdirSync(directory);
  const records: ClinicalRecord[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const record = parseClinicalRecord(path.join(directory, file));
        records.push(record);
      } catch (error) {
        console.error(`Error parsing ${file}:`, error);
      }
    }
  }

  return records;
}

