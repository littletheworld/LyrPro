import { type SyncLine, type AdlibPart } from '../types';

/**
 * Converts a data URL string into a File object.
 */
export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

/**
 * Saves the project data (audio, lyrics, sync data) into a single .lsk file.
 */
export function saveProjectFile(
  audioFile: File,
  lyrics: string[],
  syncData: SyncLine[],
  songTitle: string,
  artist: string,
  albumArtUrl: string | null,
  credits: string
): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const audioDataUrl = e.target?.result;
    
    const projectData = {
      version: 1,
      audioFileName: audioFile.name,
      audioDataUrl,
      lyrics,
      syncData,
      songTitle,
      artist,
      albumArtUrl,
      credits,
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    let fileName = 'LyricSync Pro Project';
    if (artist && songTitle) {
        fileName = `${artist} - ${songTitle}`;
    } else if (songTitle) {
        fileName = songTitle;
    } else if (audioFile.name) {
        fileName = audioFile.name.replace(/\.[^/.]+$/, '');
    }

    if (fileName.toLowerCase().endsWith('.lsk')) {
        fileName = fileName.slice(0, -4);
    }

    a.href = url;
    a.download = `${fileName}.lsk`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  reader.readAsDataURL(audioFile);
}

// Helper to format time for LRC files [mm:ss.xx]
const formatTimeForLrc = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00.00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
};

export const getLineStartTime = (line: SyncLine): number => {
    if (!line) return Infinity;
    const times = [...line.time, ...line.adlibs.flatMap(a => a.time)]
        .filter((t): t is number => t !== null);
    return times.length > 0 ? Math.min(...times) : Infinity;
};

export const getLineEndTime = (line: SyncLine): number => {
    if (!line) return Infinity;
    const times = [...line.time, ...line.adlibs.flatMap(a => a.time)]
        .filter((t): t is number => t !== null);
    return times.length > 0 ? Math.max(...times) : -Infinity;
};

export const getMainLineEndTime = (line: SyncLine): number => {
    if (!line) return -Infinity;
    const times = line.time.filter((t): t is number => t !== null);
    return times.length > 0 ? Math.max(...times) : -Infinity;
};

export const getAdlibStartTime = (adlib: AdlibPart): number => {
    if (!adlib) return Infinity;
    const times = adlib.time.filter((t): t is number => t !== null);
    return times.length > 0 ? Math.min(...times) : Infinity;
};

export const getAdlibEndTime = (adlib: AdlibPart): number => {
    if (!adlib) return Infinity;
    const times = adlib.time.filter((t): t is number => t !== null);
    return times.length > 0 ? Math.max(...times) : -Infinity;
};


/**
 * Exports the sync data to an Enhanced LRC file.
 */
export function exportToLrcFile(
  syncData: SyncLine[],
  songTitle: string,
  artist: string,
  duration: number
): void {
  const sortedSyncData = [...syncData].sort((a, b) => getLineStartTime(a) - getLineStartTime(b));

  let lrcContent = `[ti:${songTitle || 'Untitled'}]\n[ar:${artist || 'Unknown'}]\n[length:${formatTimeForLrc(duration)}]\n\n`;

  sortedSyncData.forEach(line => {
    const startTime = getLineStartTime(line);
    if (startTime === Infinity || line.chars.length === 0) return;

    let lrcLine = `[${formatTimeForLrc(startTime)}]`;
    
    for (let i = 0; i < line.chars.length; i++) {
        const char = line.chars[i];
        const time = line.time[i];
        if (time !== null) {
            lrcLine += `<${formatTimeForLrc(time)}>${char}`;
        } else {
            lrcLine += char;
        }
    }
    lrcContent += lrcLine + '\n';
  });

  const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  let fileName = 'lyrics';
  if (artist && songTitle) {
      fileName = `${artist} - ${songTitle}`;
  } else if (songTitle) {
      fileName = songTitle;
  }

  a.href = url;
  a.download = `${fileName}.lrc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}