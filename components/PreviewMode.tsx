import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type SyncLine } from '../types';
import AnimatedLyricLine from './AnimatedLyricLine';
import { prepareProjectData, saveProjectFile, exportToLrcFile, getLineStartTime, getLineEndTime } from '../utils/projectUtils';
import { uploadProjectToCloud } from '../utils/cloud';
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
  const animationFrameRef = useRef<number | undefined>();
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const audioDuration = audioRef.current?.duration;
  const [anchorLineId, setAnchorLineId] = useState<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isVocalRemoverOn, setIsVocalRemoverOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasAudioGraphSetup = useRef(false);
  const bypassGainRef = useRef<GainNode | null>(null);
  const effectGainRef = useRef<GainNode | null>(null);
  const [dynamicBgColors, setDynamicBgColors] = useState<string[]>([]);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimerRef = useRef<number | null>(null);
  const [cloudSaveState, setCloudSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');


  const sortedSyncData = useMemo(() => {
    return [...syncData].sort((a, b) => getLineStartTime(a) - getLineStartTime(b));
  }, [syncData]);
  
  useEffect(() => {
    if (albumArtUrl) extractDominantColors(albumArtUrl).then(setDynamicBgColors);
    else setDynamicBgColors([]);
  }, [albumArtUrl]);

  const dynamicBgStyle = useMemo(() => {
    if (dynamicBgColors.length < 2) return {};
    return { background: `linear-gradient(-45deg, ${dynamicBgColors[0]}, ${dynamicBgColors[1]}, ${dynamicBgColors[0]})`, backgroundSize: '400% 400%', animation: 'gradient-flow 30s ease infinite' };
  }, [dynamicBgColors]);

  const bottomFadeStyle = useMemo(() => ({ background: `linear-gradient(to top, ${dynamicBgColors[0] || '#0f0c29'} 15%, transparent)` }), [dynamicBgColors]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || hasAudioGraphSetup.current) return;
    hasAudioGraphSetup.current = true;
    try {
        // Fix: Pass an empty object to the AudioContext constructor to prevent an error where it expects one argument.
        const context = new (window.AudioContext || (window as any).webkitAudioContext)({});
        audioContextRef.current = context;
        const source = context.createMediaElementSource(audio);
        const splitter = context.createChannelSplitter(2);
        const merger = context.createChannelMerger(2);
        const invert = context.createGain(); invert.gain.value = -1;
        const monoMix = context.createGain();
        const bypassGain = context.createGain(); bypassGainRef.current = bypassGain;
        const effectGain = context.createGain(); effectGainRef.current = effectGain;
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
      const audioCtx = audioContextRef.current;
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch((e) => console.error("Error closing AudioContext:", e));
      }
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
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setIsControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showAndAutoHideControls();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
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
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
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

  const handleSaveToCloud = useCallback(async () => {
    setCloudSaveState('saving');
    try {
        const projectData = await prepareProjectData(audioFile, lyrics, syncData, songTitle, artist, albumArtUrl, credits);
        await uploadProjectToCloud(projectData);
        setCloudSaveState('success');
        setTimeout(() => setCloudSaveState('idle'), 2000); // Reset after 2s
    } catch (error) {
        console.error("Cloud save failed:", error);
        setCloudSaveState('error');
        alert("เกิดข้อผิดพลาดในการบันทึกโปรเจกต์ขึ้นคลาวด์");
        setTimeout(() => setCloudSaveState('idle'), 2000);
    }
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
    if (!anchorLineId) {
        if (isAutoScrolling) {
            const container = document.getElementById('lyrics-container');
            if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
    }
    
    const lineElement = lineRefs.current.get(anchorLineId);
    const lineData = linesAndPlaceholders.find(l => l.id === anchorLineId);

    if (lineElement && lineData && isAutoScrolling) {
      const container = document.getElementById('lyrics-container');
      if (!container) return;
      
      const containerHeight = container.clientHeight;
      const lineTop = lineElement.offsetTop;
      
      const isInstrumental = !('chars' in lineData);
      
      let targetScrollTop = lineTop - (containerHeight * (isInstrumental ? 0.45 : 0.4));
      
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    }
  }, [anchorLineId, isAutoScrolling, linesAndPlaceholders]);

  const handleMetadataSave = async (updates: { title: string; artist: string; credits: string; newArtFile?: File }) => {
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
      className="karaoke-bg w-full h-screen text-white flex flex-col overflow-hidden" 
      style={dynamicBgStyle}
      onClick={showAndAutoHideControls}
      onMouseMove={showAndAutoHideControls}
    >
      <MetadataEditorModal 
        isOpen={isEditingMetadata}
        onClose={() => setIsEditingMetadata(false)}
        onSave={handleMetadataSave}
        initialData={{ title: songTitle, artist, credits, artUrl: albumArtUrl }}
      />
      
      <header className="absolute top-0 left-0 right-0 z-30 p-4 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
        <div className="flex items-center gap-4">
          {albumArtUrl && ( <img src={albumArtUrl} alt={`${artist} - ${songTitle}`} className="w-14 h-14 rounded-md shadow-lg" /> )}
          <div className="flex-grow min-w-0">
            <h1 className="text-xl font-bold text-shadow-md truncate">{songTitle}</h1>
            <h2 className="text-base font-medium text-gray-200 text-shadow-sm truncate">{artist}</h2>
          </div>
          <button onClick={() => setIsEditingMetadata(true)} className="ml-2 p-2 rounded-full hover:bg-white/10 transition-colors shrink-0 pointer-events-auto" title="แก้ไขข้อมูลเพลง">
              <Icons name="pencil-square" className="w-5 h-5"/>
          </button>
        </div>
      </header>
      
      <div 
        className="absolute bottom-0 left-0 right-0 h-40 z-10 pointer-events-none"
        style={bottomFadeStyle}
      />

      <main 
        id="lyrics-container"
        className="flex-grow overflow-y-auto px-4 md:px-8 pt-24 pb-48 relative z-10"
        onWheel={() => setIsAutoScrolling(false)}
        onTouchStart={() => setIsAutoScrolling(false)}
      >
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {linesAndPlaceholders.map((line) => {
              if (!('chars' in line)) {
                  return (
                      <div key={line.id} ref={el => { if (el) lineRefs.current.set(line.id, el); else lineRefs.current.delete(line.id); }} className="h-16 flex items-center justify-center">
                          <Icons name="swatches" className="w-6 h-6 text-gray-400 opacity-50" />
                      </div>
                  );
              }
              
              const currentLineIndex = sortedSyncData.findIndex(l => l.id === line.id);
              const nextLine = sortedSyncData[currentLineIndex + 1];
              const nextLineStartTime = nextLine ? getLineStartTime(nextLine) : null;
              const isActive = activeLineIds.includes(line.id);

              return (
                  <div key={line.id} ref={el => { if (el) lineRefs.current.set(line.id, el); else lineRefs.current.delete(line.id); }} onClick={() => handleLineClick(line)}>
                      <AnimatedLyricLine
                          lineData={line}
                          currentTime={currentTime}
                          isActive={isActive}
                          singer={line.singer || 1}
                          nextLineStartTime={nextLineStartTime}
                      />
                  </div>
              );
          })}
        </div>
        
        {!isAutoScrolling && (
            <div className="sticky bottom-6 w-full flex justify-center z-20">
            <button
                onClick={() => setIsAutoScrolling(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white font-semibold shadow-lg hover:bg-white/30 transition-all animate-bounce"
                title="กลับไปยังบรรทัดปัจจุบัน"
            >
                <Icons name="arrow-down-to-line" className="w-5 h-5" />
                <span>กลับมายังจุดเดิม</span>
            </button>
            </div>
        )}
      </main>

      <footer className="relative z-20">
        <AudioControls
          audioRef={audioRef}
          showPreviewControls
          onBackToSync={() => onBackToSync(sortedSyncData.findIndex(l => l.id === focusLineId))}
          onSaveProject={handleSaveProject}
          onReset={onReset}
          onExportLrc={handleExportLrc}
          isVocalRemoverOn={isVocalRemoverOn}
          onToggleVocalRemover={handleToggleVocalRemover}
          isVisible={isControlsVisible}
          onSaveToCloud={handleSaveToCloud}
          cloudSaveState={cloudSaveState}
        />
        <audio ref={audioRef} src={audioUrl} className="hidden" />
      </footer>
    </div>
  );
};

export default PreviewMode;