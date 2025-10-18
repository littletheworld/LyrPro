import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type SyncLine } from '../types';
import Button from './Button';
import Icons from './Icons';
import { saveProjectFile } from '../utils/projectUtils';
import AudioControls from './AudioControls';
import { getLineStartTime } from '../utils/projectUtils';

interface SyncModeProps {
  audioUrl: string;
  audioFile: File;
  lyrics: string[];
  syncData: SyncLine[];
  setSyncData: React.Dispatch<React.SetStateAction<SyncLine[]>>;
  onFinish: (currentLineIndex: number) => void;
  onBack: () => void;
  songTitle: string;
  artist: string;
  albumArtUrl: string | null;
  credits: string;
  initialLineIndex?: number;
}

type SyncTarget = {
    part: 'main' | 'adlib';
    adlibIndex?: number;
};

const AUTOSAVE_KEY = 'lyric-sync-pro-autosave';
const SLIDER_MAX_VALUE = 1000;

const isPartSynced = (chars: string[], time: (number | null)[]): boolean => {
    if (chars.length === 0) return true;
    let lastSyncedIndex = -1;
    for (let i = time.length - 1; i >= 0; i--) {
        if (time[i] !== null) {
            lastSyncedIndex = i;
            break;
        }
    }
    return lastSyncedIndex >= chars.length - 1;
};

const findEarliestStartTimeForGroup = (groupId: string, allLines: SyncLine[]): number => {
    const groupLines = allLines.filter(line => line.groupId === groupId);
    const groupStartTimes = groupLines.map(getLineStartTime).filter(t => t !== Infinity);
    if (groupStartTimes.length > 0) {
        return Math.min(...groupStartTimes);
    }
    return Infinity;
};


export const SyncMode: React.FC<SyncModeProps> = ({ audioUrl, audioFile, lyrics, syncData, setSyncData, onFinish, onBack, songTitle, artist, albumArtUrl, credits, initialLineIndex }) => {
  const [currentLine, setCurrentLine] = useState(initialLineIndex ?? 0);
  const [charIdx, setCharIdx] = useState(0);
  const [syncTarget, setSyncTarget] = useState<SyncTarget>({ part: 'main' });
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const isLineFullySynced = useCallback((line: SyncLine): boolean => {
    if (!line) return false;
    const mainSynced = isPartSynced(line.chars, line.time);
    const adlibsSynced = line.adlibs.every(adlib => isPartSynced(adlib.chars, adlib.time));
    return mainSynced && adlibsSynced;
  }, []);

  const unsyncedLinesCount = useMemo(() => syncData.filter(line => !isLineFullySynced(line)).length, [syncData, isLineFullySynced]);

  const groupColors = useMemo(() => {
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6']; // Same colors as StructureMode
    const groupColorMap = new Map<string, string>();
    let colorIndex = 0;
    syncData.forEach(line => {
        if (line.groupId && !groupColorMap.has(line.groupId)) {
            groupColorMap.set(line.groupId, colors[colorIndex % colors.length]);
            colorIndex++;
        }
    });
    return groupColorMap;
  }, [syncData]);
  
  const changeLine = useCallback((index: number, options: { play?: boolean; seek?: boolean; } = {}) => {
    const { play = false, seek = false } = options;
    const audio = audioRef.current;
    if (!audio) return;

    if (seek) {
        // Use the updater function to get the old start time (before clearing) and set the new cleared state atomically.
        // This makes this callback's dependencies stable and prevents re-triggering effects.
        setSyncData(prevData => {
            // 1. Get the original start time from the *old* state to calculate the jump-back position.
            const lineToSeek = prevData[index];
            if (lineToSeek) {
                let jumpTime = getLineStartTime(lineToSeek);
                if (lineToSeek.groupId) {
                    const groupStartTime = findEarliestStartTimeForGroup(lineToSeek.groupId, prevData);
                    if (groupStartTime !== Infinity) {
                        if (jumpTime === Infinity || jumpTime > groupStartTime) {
                            jumpTime = groupStartTime;
                        }
                    }
                }
                if (jumpTime !== Infinity) {
                    audio.currentTime = Math.max(0, jumpTime - 3);
                }
            }
            
            // 2. Prepare and return the new state with cleared timings for the target line.
            const lineToClear = prevData[index];
            if (!lineToClear) return prevData;

            const clearedLine = {
                ...lineToClear,
                time: new Array(lineToClear.chars.length).fill(null),
                adlibs: lineToClear.adlibs.map(adlib => ({
                    ...adlib,
                    time: new Array(adlib.chars.length).fill(null)
                }))
            };
            const newData = [...prevData];
            newData[index] = clearedLine;
            return newData;
        });
    }
    
    setCurrentLine(index);
    setSyncTarget({ part: 'main' });
    setCharIdx(0);

    if (play) {
      audio.play().catch(e => console.error("Playback failed:", e));
    } else {
      audio.pause();
    }
  }, [setSyncData]);

  const handleJumpToNextUnsynced = useCallback(() => {
    const nextUnsyncedIndex = syncData.findIndex(line => !isLineFullySynced(line));
    if (nextUnsyncedIndex !== -1) {
        changeLine(nextUnsyncedIndex, { seek: true, play: true });
    }
  }, [syncData, isLineFullySynced, changeLine]);

  // Auto-play audio on component mount unless an initial index is set
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !initialLineIndex) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio autoplay was prevented:", error);
        });
      }
    }
  }, [initialLineIndex]);
  
  // If an initial index is provided (e.g., from re-syncing), wait for the audio
  // to be ready, then jump to that line. This avoids race conditions.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || initialLineIndex === undefined) return;

    const startResync = () => {
        changeLine(initialLineIndex, { seek: true, play: true });
    };

    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or more
      startResync();
    } else {
      audio.addEventListener('canplay', startResync, { once: true });
    }

    return () => {
      audio.removeEventListener('canplay', startResync);
    };
  }, [initialLineIndex, changeLine]);

  // Debounced auto-save to localStorage
  const debouncedSave = useMemo(() => {
    let timeout: number;
    return (dataToSave: Omit<any, 'audioDataUrl' | 'audioFileName'>) => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const audioDataUrl = e.target?.result;
                const projectData = {
                    ...dataToSave,
                    audioDataUrl,
                    audioFileName: audioFile.name,
                };
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(projectData));
            };
            reader.readAsDataURL(audioFile);
        }, 2000); // 2-second debounce
    };
  }, [audioFile]);

  useEffect(() => {
      if (syncData.length > 0) {
          debouncedSave({ lyrics, syncData, songTitle, artist, albumArtUrl, credits });
      }
  }, [syncData, lyrics, songTitle, artist, albumArtUrl, credits, debouncedSave]);

  const lineData = syncData[currentLine];

  const activeChars = useMemo(() => {
    if (!lineData) return [];
    if (syncTarget.part === 'main') return lineData.chars;
    return lineData.adlibs[syncTarget.adlibIndex!]?.chars || [];
  }, [lineData, syncTarget]);
  
  
  const handleTargetChange = useCallback((newTarget: SyncTarget) => {
    setSyncTarget(newTarget);
    setCharIdx(0); // Reset character index when switching between main/adlib

    const audio = audioRef.current;
    if (!audio) return;
    
    const lineStartTime = getLineStartTime(syncData[currentLine]);

    if (lineStartTime !== Infinity) {
        audio.currentTime = lineStartTime > 0.1 ? lineStartTime - 0.1 : 0;
    }

    // Auto-play when any part is selected for syncing if currently paused
    if (audio.paused) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("Audio playback failed on target selection:", error);
            });
        }
    }
  }, [currentLine, syncData]);

  useEffect(() => {
    if (!lineData) return;
    const timeArray = (
        syncTarget.part === 'main' 
        ? lineData.time 
        : lineData.adlibs[syncTarget.adlibIndex!].time
    );
    let lastSyncedChar = -1;
    for (let i = timeArray.length - 1; i >= 0; i--) {
        if (timeArray[i] !== null) {
            lastSyncedChar = i;
            break;
        }
    }
    setCharIdx(lastSyncedChar === -1 ? 0 : lastSyncedChar);
  }, [syncTarget, currentLine, lineData]);


  const handleSliderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !lineData) return;

    const sliderValue = parseInt(e.target.value, 10);
    const numChars = activeChars.length;
    if (numChars === 0) return;
    const newIdx = numChars > 1 ? Math.round((sliderValue / SLIDER_MAX_VALUE) * (numChars - 1)) : 0;
    
    const newTime = audio.currentTime;

    setSyncData((prevData) => {
        const newData = [...prevData];
        const lineToUpdate = { ...newData[currentLine] };

        const updateTimestamps = (timeArray: (number | null)[]) => {
            const newTimes = [...timeArray];
            
            // Set the time for the current character index from the slider
            newTimes[newIdx] = newTime;

            // When moving the slider backward, clear any timestamps that are now "in the future"
            for (let i = newIdx + 1; i < newTimes.length; i++) {
                newTimes[i] = null;
            }

            // Find the most recent character *before* the current one that has a timestamp.
            let lastSyncedIdx = -1;
            let lastSyncedTime = null;
            for (let i = newIdx - 1; i >= 0; i--) {
                if (newTimes[i] !== null) {
                    lastSyncedIdx = i;
                    lastSyncedTime = newTimes[i];
                    break;
                }
            }
            
            // If we found a previously synced character and there's a gap (more than 1 character)
            // between it and our new position, fill that gap with interpolated values.
            if (lastSyncedTime !== null && newIdx > lastSyncedIdx + 1) {
                const timeDiff = newTime - lastSyncedTime;
                const indexDiff = newIdx - lastSyncedIdx;

                for (let i = lastSyncedIdx + 1; i < newIdx; i++) {
                    const fraction = (i - lastSyncedIdx) / indexDiff;
                    newTimes[i] = lastSyncedTime + (timeDiff * fraction);
                }
            }

            return newTimes;
        };

        if (syncTarget.part === 'main') {
            lineToUpdate.time = updateTimestamps(lineToUpdate.time);
        } else {
            const adlibIndex = syncTarget.adlibIndex!;
            const newAdlibs = [...lineToUpdate.adlibs];
            const adlibToUpdate = { ...newAdlibs[adlibIndex] };
            adlibToUpdate.time = updateTimestamps(adlibToUpdate.time);
            newAdlibs[adlibIndex] = adlibToUpdate;
            lineToUpdate.adlibs = newAdlibs;
        }

        newData[currentLine] = lineToUpdate;
        return newData;
    });

    setCharIdx(newIdx);
  };
  
  const handleSliderRelease = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !lineData) return;
  
    const releaseTime = audio.currentTime;
    const releaseIndex = charIdx;

    // Create a new version of the data based on the current state to avoid stale closures.
    const nextSyncData = JSON.parse(JSON.stringify(syncData));
    const lineToUpdate = nextSyncData[currentLine];
    
    // 1. Update the timestamp for the released character in our new data copy.
    if (syncTarget.part === 'main') {
        lineToUpdate.time[releaseIndex] = releaseTime;
    } else {
        const adlibIndex = syncTarget.adlibIndex!;
        if (lineToUpdate.adlibs[adlibIndex]) {
            lineToUpdate.adlibs[adlibIndex].time[releaseIndex] = releaseTime;
        }
    }

    const isAtEnd = releaseIndex >= activeChars.length - 1 && activeChars.length > 0;

    // 2. If the slider was released at the end of a part, decide the next action.
    if (isAtEnd) {
        // If the main part isn't synced, switch to it.
        if (!isPartSynced(lineToUpdate.chars, lineToUpdate.time)) {
            setSyncData(nextSyncData);
            handleTargetChange({ part: 'main' });
            return;
        }
        // Find the next unsynced ad-lib and switch to it.
        const firstUnsyncedAdlibIndex = lineToUpdate.adlibs.findIndex(
            (adlib: any) => !isPartSynced(adlib.chars, adlib.time)
        );
        if (firstUnsyncedAdlibIndex !== -1) {
            setSyncData(nextSyncData);
            handleTargetChange({ part: 'adlib', adlibIndex: firstUnsyncedAdlibIndex });
            return;
        }

        // If we reach here, the current line is now fully synced. Time to advance.
        const nextLineIndex = currentLine + 1;
        if (nextLineIndex < nextSyncData.length) {
            const currentLineData = lineToUpdate;
            const nextLineData = nextSyncData[nextLineIndex];
            
            // This is the adjusted logic as per user request.
            if (currentLineData.groupId && currentLineData.groupId === nextLineData.groupId) {
                // Case 1: Next line is in the same group. Jump to group start.
                const groupStartTime = findEarliestStartTimeForGroup(currentLineData.groupId, nextSyncData);
                if (groupStartTime !== Infinity) {
                    audio.currentTime = groupStartTime > 0.1 ? groupStartTime - 0.1 : 0;
                }
            } else {
                // Case 2: Not grouped. Check for ad-libs to decide on rewind.
                if (currentLineData.adlibs && currentLineData.adlibs.length > 0) {
                    // Rewind 3 seconds if there were ad-libs.
                    audio.currentTime = Math.max(0, audio.currentTime - 3);
                }
                // Case 3 (implicit): No ad-libs, so audio continues uninterrupted.
            }
            // Commit the state changes *before* changing the line UI.
            setSyncData(nextSyncData);
            changeLine(nextLineIndex, { play: true, seek: false });
            return;
        }
    }

    // If no special action was taken, just commit the timestamp update.
    setSyncData(nextSyncData);
    
}, [syncData, currentLine, charIdx, activeChars.length, lineData, syncTarget, handleTargetChange, changeLine, isLineFullySynced]);
  
  const handleResetTimings = useCallback(() => {
    if (window.confirm('คุณต้องการลบข้อมูลเวลาทั้งหมดและเริ่มซิงก์ใหม่หรือไม่?')) {
        setSyncData(prevData => {
            return prevData.map(line => ({
                ...line,
                time: new Array(line.chars.length).fill(null),
                adlibs: line.adlibs.map(adlib => ({
                    ...adlib,
                    time: new Array(adlib.chars.length).fill(null),
                })),
            }));
        });
        // Reset to the beginning
        changeLine(0, { seek: true });
        if (audioRef.current) {
            audioRef.current.pause();
        }
    }
  }, [setSyncData, changeLine]);

  const handleReplayLine = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !lineData) return;

    // Get the start time *before* we reset the line's data
    const originalStartTime = getLineStartTime(lineData);

    // Create the reset version of the current line
    const resetLine = {
        ...lineData,
        time: new Array(lineData.chars.length).fill(null),
        adlibs: lineData.adlibs.map(adlib => ({
            ...adlib,
            time: new Array(adlib.chars.length).fill(null)
        }))
    };
    
    // Update the state with the reset line
    setSyncData(prevData => {
        const newData = [...prevData];
        newData[currentLine] = resetLine;
        return newData;
    });
    
    // Reset the UI sync targets
    setSyncTarget({ part: 'main' });
    setCharIdx(0);

    // Seek to just before the line starts and play
    if (originalStartTime !== Infinity) {
        audio.currentTime = Math.max(0, originalStartTime - 3); // 3-second lead-in
        if (audio.paused) {
            audio.play().catch(e => console.error("Playback failed on re-sync", e));
        }
    }
  }, [audioRef, lineData, currentLine, setSyncData]);

  
  const lastCharIndex = activeChars.length > 0 ? activeChars.length - 1 : 0;

  const currentLineIsFullySynced = useMemo(() => isLineFullySynced(lineData), [lineData, isLineFullySynced]);
  const mainPartIsSynced = useMemo(() => lineData && isPartSynced(lineData.chars, lineData.time), [lineData]);
  const nextLineData = syncData[currentLine + 1];

  const progressPercentage = lastCharIndex > 0 ? (charIdx / lastCharIndex) * 100 : 0;
  const sliderStyle = {
      background: `linear-gradient(to right, #3b82f6 ${progressPercentage}%, #e5e7eb ${progressPercentage}%)`
  };

  if (!lineData) return null;
  
  const groupColor = lineData.groupId ? groupColors.get(lineData.groupId) : undefined;
  const nextLineGroupColor = nextLineData?.groupId ? groupColors.get(nextLineData.groupId) : undefined;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg text-gray-800 border border-gray-100 relative">
        <audio ref={audioRef} src={audioUrl} className="hidden" />
        <div 
          key={lineData.id} 
          style={groupColor ? { borderLeft: `6px solid ${groupColor}` } : {}}
          className={`h-56 mb-4 flex flex-col justify-center items-center transition-all duration-500 ${currentLineIsFullySynced ? 'opacity-40' : ''} line-enter-animation ${groupColor ? 'pl-4' : ''}`}
        >
            <div
              onClick={() => handleTargetChange({ part: 'main' })}
              className={`p-2 rounded-lg cursor-pointer transition-all duration-200 w-full ${syncTarget.part === 'main' ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'} ${mainPartIsSynced ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap justify-center text-3xl font-bold leading-relaxed tracking-wide">
                {lineData.chars.map((char, i) => (
                    <span key={i} className={`transition-colors duration-150 ${syncTarget.part === 'main' && i <= charIdx ? 'text-blue-600' : 'text-gray-400'}`}>
                        {char === ' ' ? '\u00A0' : char}
                    </span>
                ))}
              </div>
            </div>
            {lineData.adlibs.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2 w-full">
                    {lineData.adlibs.map((adlib, index) => {
                        const adlibIsSynced = isPartSynced(adlib.chars, adlib.time);
                        return (
                        <div 
                          key={adlib.id}
                          onClick={() => handleTargetChange({ part: 'adlib', adlibIndex: index })}
                          className={`p-2 rounded-lg cursor-pointer transition-all duration-200 text-lg w-full ${syncTarget.part === 'adlib' && syncTarget.adlibIndex === index ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'} ${adlibIsSynced ? 'opacity-60' : ''}`}
                        >
                            <div className="italic flex items-center justify-center gap-1">
                                <span>(</span>
                                <div className="flex flex-wrap justify-center flex-grow">
                                    {adlib.chars.map((char, i) => (
                                        <span key={i} className={`transition-colors duration-100 text-center ${syncTarget.part === 'adlib' && syncTarget.adlibIndex === index && i <= charIdx ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {char === ' ' ? '\u00A0' : char}
                                        </span>
                                    ))}
                                </div>
                                <span>)</span>
                            </div>
                        </div>
                    )})}
                </div>
            )}
        </div>

        <div className="my-6">
            <div className="w-full mb-4 space-y-1">
                {/* Current active line's characters */}
                 <div className="w-full flex justify-between text-sm font-mono text-gray-500" aria-hidden="true">
                    {activeChars.map((char, i) => (
                        <span key={i} className={`text-center transition-colors duration-150 ${i <= charIdx ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                            {char === ' ' ? '\u00A0' : char}
                        </span>
                    ))}
                </div>

                {/* Next line's preview with indicators */}
                {nextLineData && (
                    <div className="opacity-75 mt-2">
                        <div className="text-center text-sm font-mono text-gray-400 italic" aria-hidden="true">
                            {nextLineData.chars.join('').replace(/ /g, '\u00A0')}
                        </div>
                        <div className="flex justify-end items-center gap-3 text-xs text-gray-500 mt-1 h-4">
                            {nextLineData.groupId && (
                                <span 
                                    className="flex items-center gap-1 font-semibold"
                                    style={nextLineGroupColor ? { color: nextLineGroupColor } : {}}
                                >
                                    <Icons name="link" className="w-3 h-3" />
                                    ท่อนซ้อน
                                </span>
                            )}
                            {nextLineData.adlibs.length > 0 && (
                                <span className="flex items-center gap-1">
                                    <Icons name="subtitles" className="w-3 h-3" />
                                    เสียงเสริม
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="relative w-full h-8 flex items-center">
              <div
                  className="absolute bottom-1/2 w-px bg-blue-400 pointer-events-none transition-all duration-100 ease-linear"
                  style={{
                      left: `${progressPercentage}%`,
                      height: '5rem'
                  }}
                  aria-hidden="true"
              />
              <input 
                  type="range" 
                  min="0"
                  max={SLIDER_MAX_VALUE}
                  value={lastCharIndex > 0 ? (charIdx / lastCharIndex) * SLIDER_MAX_VALUE : 0}
                  onInput={handleSliderInput}
                  onMouseUp={handleSliderRelease}
                  onTouchEnd={handleSliderRelease}
                  style={sliderStyle}
                  className="w-full h-8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-10"
              />
              <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 flex items-center justify-center bg-white shadow-lg border-2 border-gray-300 rounded-full pointer-events-none font-mono text-blue-600 font-bold text-2xl transition-all duration-100 ease-linear"
                  style={{ left: `${progressPercentage}%` }}
              >
                  <span className="-mt-1">
                      {activeChars[charIdx] === ' ' ? '␣' : activeChars[charIdx]}
                  </span>
              </div>
            </div>
            <p className="text-center font-bold text-blue-600 mt-6 font-mono text-sm">
                {`เลื่อนเพื่อซิงก์ (ตัวอักษรที่: ${charIdx + 1}/${lastCharIndex + 1})`}
            </p>
        </div>
        
        <div className="text-center font-semibold text-gray-500 my-4 font-mono h-6 flex items-center justify-center">
            <p>
              {`บรรทัดที่: ${currentLine + 1} / ${syncData.length}`}
            </p>
        </div>

        <AudioControls 
            audioRef={audioRef} 
            onReplayLine={handleReplayLine} 
        />
        
        <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
            <Button variant="secondary" onClick={() => changeLine(Math.max(0, currentLine - 1), { seek: true })} disabled={currentLine === 0} icon={<Icons name="prev"/>} title="ไปยังบรรทัดก่อนหน้าและรีเซ็ตเวลา">
                บรรทัดก่อนหน้า
            </Button>
            <Button 
                onClick={() => onFinish(currentLine)} 
                icon={<Icons name="done" />} 
                disabled={unsyncedLinesCount > 0}
                title={unsyncedLinesCount > 0 ? `ต้องซิงก์อีก ${unsyncedLinesCount} บรรทัด` : "เสร็จสิ้นการซิงก์และเข้าสู่โหมดพรีวิว"}
            >
                จบการซิงก์
            </Button>
        </div>
        <div className="flex justify-center items-center gap-4 mt-4">
            <Button variant="secondary" onClick={onBack} icon={<Icons name="edit" className="w-5 h-5"/>} title="กลับไปแก้ไขโครงสร้างเนื้อเพลง">กลับไปจัดโครงสร้าง</Button>
            <Button variant="secondary" onClick={handleResetTimings} icon={<Icons name="reset" className="w-5 h-5"/>} title="ลบข้อมูลเวลาที่ซิงก์ไว้ทั้งหมด">รีเซ็ตเวลา</Button>
        </div>
        <div className="text-center mt-4 h-6">
            {unsyncedLinesCount > 0 ? (
                <div className="flex items-center justify-center gap-4">
                    <p className="font-semibold text-orange-600">
                        {`เหลืออีก ${unsyncedLinesCount} บรรทัดที่ต้องซิงก์`}
                    </p>
                    <button 
                        onClick={handleJumpToNextUnsynced}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline transition-colors"
                        title="ข้ามไปซิงก์บรรทัดถัดไปที่ยังไม่เสร็จ"
                    >
                        ข้ามไปท่อนถัดไป
                    </button>
                </div>
            ) : (
                <p className="font-semibold text-green-600">
                    ✓ ซิงก์ครบทุกบรรทัดแล้ว!
                </p>
            )}
        </div>
    </div>
  );
};