export interface CronEntry {
  id: string | null;
  schedule: string;
  command: string;
  comment: string;
  managed: boolean;
  raw: string;
}
