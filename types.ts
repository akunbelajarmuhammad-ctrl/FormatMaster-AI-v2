
export enum AppMode {
  TEXT_CLEANUP = 'TEXT_CLEANUP',
  IMAGE_TO_TEXT = 'IMAGE_TO_TEXT',
  IMAGE_TO_TABLE = 'IMAGE_TO_TABLE',
  ACADEMIC_PAPER = 'ACADEMIC_PAPER',
  SKRIPSI_MERGER = 'SKRIPSI_MERGER',
  PDF_TO_WORD = 'PDF_TO_WORD'
}

export enum ChapterType {
  FULL_FRONT_MATTER = 'FULL_FRONT_MATTER',
  FRONT_COVER = 'FRONT_COVER',
  FRONT_APPROVAL = 'FRONT_APPROVAL',
  FRONT_PREFACE = 'FRONT_PREFACE',
  FRONT_ABSTRACT = 'FRONT_ABSTRACT',
  BAB_1 = 'BAB_1',
  BAB_2 = 'BAB_2',
  BAB_3 = 'BAB_3',
  BAB_4 = 'BAB_4',
  BAB_5 = 'BAB_5',
  BIBLIOGRAPHY = 'BIBLIOGRAPHY',
  FULL_SKRIPSI_AUTO = 'FULL_SKRIPSI_AUTO'
}

export enum AIProvider {
  GOOGLE = 'GOOGLE',
  GOOGLE_EXP = 'GOOGLE_EXP',
  GROQ = 'GROQ',
  OPENROUTER = 'OPENROUTER',
  TOGETHER = 'TOGETHER',
  OLLAMA = 'OLLAMA'
}

export interface ExtractedTableData {
  headers: string[];
  rows: string[][];
}

export interface ProcessingResult {
  rawText: string;
  tableData?: ExtractedTableData;
  isTable: boolean;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface MergerInputs {
  cover: string;
  approval: string;
  preface: string;
  abstract: string;
  bab1: string;
  bab2: string;
  bab3: string;
  bab4: string;
  bab5: string;
  biblio: string;
  autoToc: boolean;
}