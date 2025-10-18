export enum AppMode {
  Setup,
  Structure,
  Sync,
  Preview,
  Projects,
}

export interface AdlibPart {
  id: string;
  chars: string[];
  time: (number | null)[];
}

export interface SyncLine {
  id:string; // Unique identifier for each line
  chars: string[]; // Main characters
  time: (number | null)[]; // Timestamps for main characters
  adlibs: AdlibPart[]; // Ad-lib parts extracted from parentheses
  groupId?: string; // Optional ID for grouping simultaneous lines
  label?: string; // Optional label for the line (e.g., Verse 1, Chorus)
  singer?: number; // Optional: 1 for Singer 1 (left), 2 for Singer 2 (right)
}

export interface ProjectData {
  version: number;
  audioFileName: string;
  audioDataUrl: string;
  lyrics: string[];
  syncData: SyncLine[];
  songTitle: string;
  artist: string;
  albumArtUrl: string | null;
  credits: string;
}