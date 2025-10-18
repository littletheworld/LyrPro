import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type SyncLine, type AdlibPart } from '../types';
import AnimatedLyricLine from './AnimatedLyricLine';
import { saveProjectFile, exportToLrcFile, getLineStartTime, getLineEndTime, getAdlibStartTime, getAdlibEndTime } from '../utils/projectUtils';
import { extractDominantColors } from '../utils/colorExtractor';
import AudioControls from './AudioControls';
import Icons from './Icons';
import Button from './Button';

interface PreviewModeProps {
  audioUrl: string;
  audioFile: File;
  lyrics: string[];
  syncData: SyncLine[];
  onBackToSync: (lineIndex?: number) => void;
  onReset: () => void;
  songTitle: string;
  artist: string;
  albumArtUrl: string | null;
  credits: string;
  initialLineIndex?: number;
  onUpdateMetadata: (updates: {
    title?: string;
    artist?: string;
    credits?: string;
    albumArtUrl?: string | null;
  }) => void;
}

type RenderableLine = SyncLine | { type: 'instrumental'; id: string };

const INSTRUMENTAL_THRESHOLD = 7; // seconds

const MetadataEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: { title: string; artist: string; credits: string; newArtFile?: File }) => void;
    initialData: { title: string; artist: string; credits: string; artUrl: string | null; };
}> = ({ isOpen, onClose, onSave, initialData }) => {
    const [title, setTitle] = useState(initialData.title);
    const [artist, setArtist] = useState(initialData.artist);
    const [credits, setCredits] = useState(initialData.credits);
    const [newArtFile, setNewArtFile] = useState<File | null>(null);
    const [artPreviewUrl, setArtPreviewUrl] = useState(initialData.artUrl);
    const artInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTitle(initialData.title);
        setArtist(initialData.artist);
        setCredits(initialData.credits);
        setArtPreviewUrl(initialData.artUrl);
        setNewArtFile(null); // Reset file on open
    }, [isOpen, initialData]);

    useEffect(() => {
        if (!newArtFile) return;
        const url = URL.createObjectURL(newArtFile);
        setArtPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [newArtFile]);

    const handleSave = () => {
        onSave({ title, artist, credits, newArtFile: newArtFile || undefined });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
            <div className="bg-white text-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4">แก้ไขข้อมูลเพลง</h3>
                <div className="space-y-4">
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="ชื่อเพลง" className="w-full p-2 border rounded-md bg-white text-gray-900" />
                    <input type="text" value={artist} onChange={e => setArtist(e.target.value)} placeholder="ศิลปิน" className="w-full p-2 border rounded-md bg-white text-gray-900" />
                    <input type="text" value={credits} onChange={e => setCredits(e.target.value)} placeholder="Written by..." className="w-full p-2 border rounded-md bg-white text-gray-900" />
                    <div className="flex items-center gap-4">
                        <img src={artPreviewUrl || undefined} className="w-20 h-20 object-cover rounded-md bg-gray-200" alt="Album art preview" />
                        <Button variant="secondary" onClick={() => artInputRef.current?.click()}>เปลี่ยนปกเพลง</Button>
                        <input type="file" accept="image/*" ref={artInputRef} className="hidden" onChange={e => setNewArtFile(e.target.files?.[0] || null)} />
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
                    <Button onClick={handleSave}>บันทึก</Button>
                </div>
            </div>
        </div>
    );
};


const PreviewMode: React.FC<PreviewModeProps> = ({
  audioUrl,
  audioFile,
  lyrics,
  syncData,
  onBackToSync,
  onReset,
  songTitle,
  artist,
  albumArtUrl,
  credits,
  initialLineIndex,
  onUpdateMetadata,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  // FIX: useRef with a generic type requires an initial value.
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const audioDuration = audioRef.current?.duration;

  const [anchorLineId, setAnchorLineId] = useState<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Vocal Remover State and Refs
  const [isVocalRemoverOn, setIsVocalRemoverOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasAudioGraphSetup = useRef(false);
  const bypassGainRef = useRef<GainNode | null>(null);
  const effectGainRef = useRef<GainNode | null>(null);

  // New states for dynamic background and metadata editing
  const [dynamicBgColors, setDynamicBgColors] = useState<string[]>([]);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);


  const sortedSyncData = useMemo(() => {
    return [...syncData].sort((a, b) => getLineStartTime(a) - getLineStartTime(b));
  }, [syncData]);
  
  // Dynamic Background Color Extraction
  useEffect(() => {
    if (albumArtUrl) {
      extractDominantColors(albumArtUrl).then(setDynamicBgColors);
    } else {
      // Clear colors to revert to default if there's no album art
      setDynamicBgColors([]);
    }
  }, [albumArtUrl]);

  const dynamicBgStyle = useMemo(() => {
    if (dynamicBgColors.length < 2) return {};
    return {
        background: `linear-gradient(-45deg, ${dynamicBgColors[0]}, ${dynamicBgColors[1]}, ${dynamicBgColors[0]})`,
        backgroundSize: '400% 400%',
        animation: 'gradient-flow 30s ease infinite'
    };
  }, [dynamicBgColors]);

  const topFadeStyle = useMemo(() => ({
    background: `linear-gradient(to bottom, ${dynamicBgColors[0] || '#0f0c29'} 15%, transparent)`
  }), [dynamicBgColors]);

  const bottomFadeStyle = useMemo(() => ({
      background: `linear-gradient(to top, ${dynamicBgColors[0] || '#0f0c29'} 15%, transparent)`
  }), [dynamicBgColors]);

  // Web Audio API setup for Vocal Remover
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || hasAudioGraphSetup.current) return;

    hasAudioGraphSetup.current = true;
    try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;

        const source = context.createMediaElementSource(audio);
        const splitter = context.createChannelSplitter(2);
        const merger = context.createChannelMerger(2);
        const invert = context.createGain();
        invert.gain.value = -1;
        const monoMix = context.createGain();
        
        const bypassGain = context.createGain();
        bypassGainRef.current = bypassGain;
        const effectGain = context.createGain();
        effectGainRef.current = effectGain;

        source.connect(splitter);
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 1, 1);
        merger.connect(bypassGain);
        bypassGain.connect(context.destination);
        splitter.connect(monoMix, 0);
        splitter.connect(invert, 1);
        invert.connect(monoMix);
        monoMix.connect(effectGain);
        effectGain.connect(context.destination);
        bypassGain.gain.value = 1;
        effectGain.gain.value = 0;

    } catch (e) { console.error("Could not create AudioContext for vocal remover:", e); }
    
    const resumeContext = () => { if (audioContextRef.current && audioContextRef.current.state === 'suspended') { audioContextRef.current.resume(); } };
    const handleFirstPlay = () => { resumeContext(); audio.removeEventListener('play', handleFirstPlay); };
    audio.addEventListener('play', handleFirstPlay);

    return () => {
        audio.removeEventListener('play', handleFirstPlay);
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(console.error); }
    };
  }, []);

  useEffect(() => {
    const bypassGain = bypassGainRef.current;
    const effectGain = effectGainRef.current;
    const audioCtx = audioContextRef.current;
    if (!bypassGain || !effectGain || !audioCtx) return;
    const targetBypassGain = isVocalRemoverOn ? 0 : 1;
    const targetEffectGain = isVocalRemoverOn ? 1.4 : 0;
    bypassGain.gain.setTargetAtTime(targetBypassGain, audioCtx.currentTime, 0.015);
    effectGain.gain.setTargetAtTime(targetEffectGain, audioCtx.currentTime, 0.015);
  }, [isVocalRemoverOn]);

  const handleToggleVocalRemover = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') { audioContextRef.current.resume(); }
    setIsVocalRemoverOn(prev => !prev);
  }, []);
  
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  
  const showAndAutoHideControls = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
        setIsControlsVisible(false);
    }, 3000); // Hide after 3 seconds of inactivity
  }, []);

  useEffect(() => {
    // Show controls for a moment when the component mounts for discoverability
    showAndAutoHideControls();
    return () => {
        if (controlsTimerRef.current) {
            clearTimeout(controlsTimerRef.current);
        }
    };
  }, [showAndAutoHideControls]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null || initialLineIndex === undefined || sortedSyncData.length === 0) return;
    const initialLineData = sortedSyncData[initialLineIndex];
    if (!initialLineData) return;
    const performSeek = () => {
      const startTime = getLineStartTime(initialLineData);
      if (startTime !== Infinity) {
        audio.currentTime = startTime;
        setFocusLineId(initialLineData.id);
        setIsAutoScrolling(true);
      }
    };
    if (audio.readyState >= 2) { performSeek(); } 
    else { audio.addEventListener('canplay', performSeek, { once: true }); }
    return () => audio.removeEventListener('canplay', performSeek);
  }, [initialLineIndex, sortedSyncData]);

  const updateCurrentTime = useCallback(() => {
    if (audioRef.current) { setCurrentTime(audioRef.current.currentTime); }
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePlay = () => { animationFrameRef.current = requestAnimationFrame(updateCurrentTime); };
    const handlePause = () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handlePause);
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handlePause);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [updateCurrentTime]);
  
  const handleSaveProject = useCallback(() => {
    saveProjectFile(audioFile, lyrics, syncData, songTitle, artist, albumArtUrl, credits);
  }, [audioFile, lyrics, syncData, songTitle, artist, albumArtUrl, credits]);

  const handleExportLrc = useCallback(() => {
    if (audioRef.current?.duration) {
      exportToLrcFile(syncData, songTitle, artist, audioRef.current.duration);
    } else {
      alert("ไม่สามารถ export ได้เนื่องจากยังไม่ทราบความยาวของเพลง");
    }
  }, [syncData, songTitle, artist]);

  const handleLineClick = useCallback((line: SyncLine) => {
    const audio = audioRef.current;
    if (!audio) return;
    const startTime = getLineStartTime(line);
    if (startTime !== Infinity) {
        audio.currentTime = startTime;
        if (audio.paused) { audio.play().catch(e => console.error("Playback failed on line click:", e)); }
        setIsAutoScrolling(true);
        setFocusLineId(line.id);
    }
  }, []);
  
  const linesAndPlaceholders = useMemo<RenderableLine[]>(() => {
    const result: RenderableLine[] = [];
    if (sortedSyncData.length === 0) return [];
    for (let i = 0; i < sortedSyncData.length; i++) {
      const currentLine = sortedSyncData[i];
      result.push(currentLine);
      if (i < sortedSyncData.length - 1) {
        const nextLine = sortedSyncData[i + 1];
        const currentEndTime = getLineEndTime(currentLine);
        const nextStartTime = getLineStartTime(nextLine);
        if (currentEndTime !== -Infinity && nextStartTime !== Infinity) {
          if (nextStartTime - currentEndTime > INSTRUMENTAL_THRESHOLD) {
            result.push({ type: 'instrumental', id: `instr-${currentLine.id}` });
          }
        }
      }
    }
    return result;
  }, [sortedSyncData]);

  const effectiveLineEndTimes = useMemo(() => {
    if (sortedSyncData.length === 0) return new Map<string, number>();
    const linesWithTimes = sortedSyncData.map(line => ({ id: line.id, start: getLineStartTime(line), end: getLineEndTime(line), }));
    const endTimes = new Map<string, number>();
    for (const line of linesWithTimes) { if (line.end !== -Infinity) endTimes.set(line.id, line.end); }
    for (let i = 0; i < linesWithTimes.length; i++) {
        let changedInIteration = false;
        for (const lineA of linesWithTimes) {
            if (lineA.start === Infinity || !endTimes.has(lineA.id)) continue;
            for (const lineB of linesWithTimes) {
                if (lineA.id === lineB.id || lineB.start === Infinity || !endTimes.has(lineB.id)) continue;
                const lineAEnd = getLineEndTime(sortedSyncData.find(l => l.id === lineA.id)!);
                const lineBEnd = getLineEndTime(sortedSyncData.find(l => l.id === lineB.id)!);
                if (lineA.start < lineBEnd && lineAEnd > lineB.start) {
                     const maxEnd = Math.max(endTimes.get(lineA.id)!, endTimes.get(lineB.id)!);
                    if (endTimes.get(lineA.id)! < maxEnd) { endTimes.set(lineA.id, maxEnd); changedInIteration = true; }
                    if (endTimes.get(lineB.id)! < maxEnd) { endTimes.set(lineB.id, maxEnd); changedInIteration = true; }
                }
            }
        }
        if (!changedInIteration) break;
    }
    return endTimes;
  }, [sortedSyncData]);

  const { activeLineIds, mostRecentStartedId } = useMemo(() => {
    const activeIds: string[] = [];
    let mostRecentId: string | null = null;
    let latestStartTime = -1;
    for (const line of sortedSyncData) {
        const startTime = getLineStartTime(line);
        if (startTime === Infinity) continue;
        if (startTime <= currentTime && startTime > latestStartTime) { latestStartTime = startTime; mostRecentId = line.id; }
        const endTime = effectiveLineEndTimes.get(line.id) ?? -Infinity;
        if (endTime !== -Infinity && currentTime >= startTime - 0.2 && currentTime < endTime) activeIds.push(line.id);
    }
    return { activeLineIds: activeIds, mostRecentStartedId: mostRecentId };
  }, [currentTime, sortedSyncData, effectiveLineEndTimes]);

  useEffect(() => {
    const isCurrentFocusStillActive = focusLineId ? activeLineIds.includes(focusLineId) : false;
    if (isCurrentFocusStillActive) return;
    let nextFocusId: string | null = null;
    const currentlyActiveLines = sortedSyncData.filter(l => activeLineIds.includes(l.id));
    if (currentlyActiveLines.length > 0) {
      nextFocusId = currentlyActiveLines.reduce((latest, current) => getLineStartTime(current) > getLineStartTime(latest) ? current : latest).id;
    } else {
      nextFocusId = mostRecentStartedId;
    }
    if (nextFocusId && nextFocusId !== focusLineId) setFocusLineId(nextFocusId);
  }, [activeLineIds, mostRecentStartedId, focusLineId, sortedSyncData]);
  
  useEffect(() => {
      if (!focusLineId) return;
      const focusLine = sortedSyncData.find(l => l.id === focusLineId);
      if (!focusLine) return;
      const currentContextId = focusLine.groupId || focusLine.id;
      if (currentContextId !== activeGroupIdRef.current) {
          activeGroupIdRef.current = currentContextId;
          let newAnchorLine = focusLine;
          if (focusLine.groupId) {
              const groupLines = sortedSyncData.filter(l => l.groupId === focusLine.groupId);
              let earliestStartTimeInGroup = getLineStartTime(focusLine);
              for (const lineInGroup of groupLines) {
                  const lineStartTime = getLineStartTime(lineInGroup);
                  if (lineStartTime < earliestStartTimeInGroup) { earliestStartTimeInGroup = lineStartTime; newAnchorLine = lineInGroup; }
              }
          }
          setAnchorLineId(newAnchorLine.id);
      }
  }, [focusLineId, sortedSyncData]);

  useEffect(() => {
    if (isAutoScrolling && anchorLineId) {
        const targetElement = lineRefs.current.get(anchorLineId);
        if (targetElement) targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [anchorLineId, isAutoScrolling]);
  
  const handleUserScroll = () => { if (isAutoScrolling) setIsAutoScrolling(false); };
  const handleResumeAutoScroll = () => { setIsAutoScrolling(true); };

  const handleSaveMetadata = async (updates: { title: string; artist: string; credits: string; newArtFile?: File }) => {
    let newArtUrl: string | null = albumArtUrl;
    if (updates.newArtFile) {
      newArtUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(updates.newArtFile!);
      });
    }
    onUpdateMetadata({
      title: updates.title,
      artist: updates.artist,
      credits: updates.credits,
      albumArtUrl: newArtUrl,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black text-white flex flex-col z-50 karaoke-bg"
      style={dynamicBgStyle}
      onMouseMove={showAndAutoHideControls}
      onTouchStart={showAndAutoHideControls}
    >
      <audio ref={audioRef} src={audioUrl} className="hidden" crossOrigin="anonymous" />
       <MetadataEditorModal 
          isOpen={isEditingMetadata}
          onClose={() => setIsEditingMetadata(false)}
          onSave={handleSaveMetadata}
          initialData={{ title: songTitle, artist: artist, credits: credits, artUrl: albumArtUrl }}
       />

      {/* Full-width, borderless Metadata Display */}
      <div className="absolute top-0 left-0 right-0 z-20 backdrop-blur-md">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-4">
              <div className="flex items-center gap-3">
                  {albumArtUrl && (
                      <img src={albumArtUrl} alt={`${artist} - ${songTitle}`} className="w-16 h-16 object-cover rounded-md shadow-md flex-shrink-0" />
                  )}
                  <div className="flex-grow min-w-0">
                      <div className="flex items-start gap-2">
                          <div className="truncate">
                              <h2 className="text-base font-bold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]" title={songTitle}>{songTitle || 'Untitled Song'}</h2>
                              <p className="text-sm text-gray-300 truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]" title={artist}>{artist || 'Unknown Artist'}</p>
                          </div>
                          <button onClick={() => setIsEditingMetadata(true)} className="p-1 rounded-full text-gray-300 hover:bg-white/20 hover:text-white transition-opacity shrink-0" title="แก้ไขข้อมูลเพลง">
                              <Icons name="pencil-square" className="w-4 h-4"/>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </div>
      
      <div className="relative w-full h-full flex flex-col overflow-hidden">
         <div style={topFadeStyle} className="absolute top-0 left-0 right-0 h-40 z-10 pointer-events-none"></div>
         <div style={bottomFadeStyle} className="absolute bottom-0 left-0 right-0 h-40 z-10 pointer-events-none"></div>

          <div 
            onWheel={handleUserScroll}
            onTouchStart={handleUserScroll}
            className="w-full max-w-5xl mx-auto flex-grow overflow-y-auto overflow-x-hidden scroll-smooth scroll-pt-[35vh] pt-[35vh] pb-[60vh] px-4 md:px-8"
          >
            <div>
              {linesAndPlaceholders.map((line) => {
                  const lineRefCallback = (el: HTMLDivElement | null) => { el ? lineRefs.current.set(line.id, el) : lineRefs.current.delete(line.id); };
                  // FIX: Use a type guard to correctly narrow the union type.
                  if ('type' in line && line.type === 'instrumental') return <div key={line.id} ref={lineRefCallback} className="h-12"></div>;
                  const lineGlobalIndex = sortedSyncData.findIndex(l => l.id === line.id);
                  const isActive = activeLineIds.includes(line.id);
                  const singer = line.singer || 1;
                  const alignmentContainerClass = singer === 2 ? 'justify-end' : 'justify-start';
                  const isSynced = getLineStartTime(line) !== Infinity;
                  const nextLine = sortedSyncData[lineGlobalIndex + 1];
                  const nextLineStartTime = nextLine ? getLineStartTime(nextLine) : (audioDuration && audioDuration > 0 ? audioDuration : null);
                  const editButtonClass = singer === 2 ? 'left-2' : 'right-2';

                  return (
                    <div ref={lineRefCallback} key={line.id} className="group/line" onClick={() => handleLineClick(line)}>
                        <div className={`flex ${alignmentContainerClass}`}>
                          <div className={`relative w-full max-w-4xl ${singer === 2 ? 'pl-12' : 'pr-12'}`}>
                              <button
                                onClick={(e) => { e.stopPropagation(); onBackToSync(lineGlobalIndex); }}
                                className={`absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-opacity opacity-0 group-hover/line:opacity-100 ${editButtonClass}`}
                                title="แก้ไขท่อนนี้"
                              >
                                <Icons name="edit" className="w-5 h-5" />
                              </button>
                              <AnimatedLyricLine
                                  lineData={line}
                                  currentTime={currentTime}
                                  isActive={isActive}
                                  singer={singer}
                                  nextLineStartTime={nextLineStartTime}
                              />
                          </div>
                        </div>
                    </div>
                  );
              })}
              {credits && (
                  <div className="text-center mt-20 pt-10 text-gray-400 opacity-80 flex items-center justify-center gap-2">
                    <Icons name="sparkles" className="w-5 h-5"/>
                    <p>{credits}</p>
                  </div>
              )}
            </div>
            {!isAutoScrolling && (
                <button
                    onClick={handleResumeAutoScroll}
                    className={`fixed right-6 z-50 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white ${isControlsVisible ? 'bottom-40' : 'bottom-24'}`}
                    title="กลับไปที่ท่อนปัจจุบัน"
                >
                    <Icons name="chevron-down" className="w-6 h-6" />
                </button>
            )}
          </div>
      </div>
      
      <AudioControls 
        audioRef={audioRef}
        showPreviewControls
        onBackToSync={() => onBackToSync()}
        onSaveProject={handleSaveProject}
        onReset={onReset}
        onExportLrc={handleExportLrc}
        isVocalRemoverOn={isVocalRemoverOn}
        onToggleVocalRemover={handleToggleVocalRemover}
        isVisible={isControlsVisible}
      />
    </div>
  );
};

export default PreviewMode;