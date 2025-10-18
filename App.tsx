import React, { useState, useEffect, useCallback } from 'react';
import { AppMode, type SyncLine } from './types';
import SetupMode from './components/SetupMode';
import { StructureMode } from './components/StructureMode';
import { SyncMode } from './components/SyncMode';
import PreviewMode from './components/PreviewMode';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.Setup);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState<string[]>([]); // Keep original lines for saving
  const [syncData, setSyncData] = useState<SyncLine[]>([]);
  const [songTitle, setSongTitle] = useState<string>('');
  const [artist, setArtist] = useState<string>('');
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState<string>('');
  const [targetSyncLineIndex, setTargetSyncLineIndex] = useState<number | undefined>(undefined);
  const [initialPreviewLineIndex, setInitialPreviewLineIndex] = useState<number | undefined>(undefined);


  useEffect(() => {
    if (audioFile) {
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAudioUrl(null);
  }, [audioFile]);

  const handleStartStructuring = useCallback((file: File, lyricsText: string, title: string, artist: string, artUrl: string | null, creditsText: string) => {
    const lines = lyricsText.split('\n').filter(line => line.trim() !== '');
    if (!file || lines.length === 0) {
      alert('กรุณาอัพโหลดไฟล์เสียงและใส่เนื้อเพลง');
      return;
    }
    
    // Clear any previously saved structure to ensure a fresh start for the new project
    localStorage.removeItem('lyric-sync-pro-structure-autosave');

    setAudioFile(file);
    setRawLines(lines);
    setLyrics(lines); // Store original text for project saving
    setSongTitle(title);
    setArtist(artist);
    setAlbumArtUrl(artUrl);
    setCredits(creditsText);
    setSyncData([]); // Clear any previous sync data
    setMode(AppMode.Structure);
  }, []);
  
  const handleLoadProject = useCallback((file: File, lyrics: string[], syncData: SyncLine[], title: string, artist: string, artUrl: string | null, creditsText: string) => {
    setAudioFile(file);
    setLyrics(lyrics);
    setRawLines(lyrics); // Use lyrics to populate structure mode
    setSyncData(syncData);
    setSongTitle(title);
    setArtist(artist);
    setAlbumArtUrl(artUrl);
    setCredits(creditsText);
    setMode(AppMode.Sync); // Go directly to sync mode for loaded projects
  }, []);

  const handleFinishStructuring = useCallback((newSyncData: SyncLine[]) => {
    setSyncData(newSyncData);
    setTargetSyncLineIndex(undefined); // Reset target index when entering sync mode
    setMode(AppMode.Sync);
  }, []);

  const handleFinishSync = useCallback((currentLineIndex: number) => {
    setTargetSyncLineIndex(undefined); // Reset target index when leaving sync mode
    setInitialPreviewLineIndex(currentLineIndex);
    setMode(AppMode.Preview);
  }, []);
  
  const handleBackToStructure = useCallback(() => {
    setTargetSyncLineIndex(undefined); // Reset target index when leaving sync mode
    setInitialPreviewLineIndex(undefined);
    setMode(AppMode.Structure);
  }, []);
  
  const handleBackToSync = useCallback((lineIndex?: number) => {
    setTargetSyncLineIndex(lineIndex);
    setInitialPreviewLineIndex(undefined);
    setMode(AppMode.Sync);
  }, []);
  
  const handleReset = useCallback(() => {
      setMode(AppMode.Setup);
      setAudioFile(null);
      setAudioUrl(null);
      setLyrics([]);
      setSyncData([]);
      setRawLines([]);
      setSongTitle('');
      setArtist('');
      setAlbumArtUrl(null);
      setCredits('');
      setTargetSyncLineIndex(undefined);
      setInitialPreviewLineIndex(undefined);
      // Clear all auto-saved sessions upon full reset
      localStorage.removeItem('lyric-sync-pro-autosave');
      localStorage.removeItem('lyric-sync-pro-structure-autosave');
      localStorage.removeItem('lyric-sync-pro-setup-draft');
  }, []);

  const handleUpdateMetadata = useCallback((updates: {
    title?: string;
    artist?: string;
    credits?: string;
    albumArtUrl?: string | null;
  }) => {
    if (updates.title !== undefined) setSongTitle(updates.title);
    if (updates.artist !== undefined) setArtist(updates.artist);
    if (updates.credits !== undefined) setCredits(updates.credits);
    if (updates.albumArtUrl !== undefined) {
       // Revoke old URL if it was a blob URL to prevent memory leaks
      if (albumArtUrl && albumArtUrl.startsWith('blob:')) {
        URL.revokeObjectURL(albumArtUrl);
      }
      setAlbumArtUrl(updates.albumArtUrl);
    }
  }, [albumArtUrl]);

  const renderMainContent = () => {
    switch (mode) {
      case AppMode.Structure:
        return (
          <StructureMode 
            rawLines={rawLines}
            initialStructure={syncData}
            onConfirm={handleFinishStructuring}
            onBack={() => setMode(AppMode.Setup)}
          />
        );
      case AppMode.Sync:
        return (
          audioUrl && audioFile && <SyncMode 
            audioUrl={audioUrl}
            audioFile={audioFile}
            lyrics={lyrics}
            syncData={syncData}
            setSyncData={setSyncData}
            onFinish={handleFinishSync}
            onBack={handleBackToStructure}
            songTitle={songTitle}
            artist={artist}
            albumArtUrl={albumArtUrl}
            credits={credits}
            initialLineIndex={targetSyncLineIndex}
          />
        );
      case AppMode.Setup:
      default:
        return <SetupMode onStartSync={handleStartStructuring} onLoadProject={handleLoadProject} />;
    }
  };

  return (
    <>
      {mode !== AppMode.Preview && (
        <div className="min-h-screen w-full flex flex-col items-center justify-start p-4 sm:p-6 md:p-10">
          {mode === AppMode.Setup && (
            <header className="mb-8 text-center">
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-800">
                🎶 LyricSync Pro
              </h1>
              <p className="text-gray-500 font-medium mt-2 text-lg">
                เครื่องมือซิงก์คาราโอเกะระดับโปร
              </p>
            </header>
          )}
          <main className={`w-full max-w-4xl transition-transform duration-300 ${mode === AppMode.Sync ? 'scale-80 origin-top' : ''}`}>
            {renderMainContent()}
          </main>
        </div>
      )}

      {mode === AppMode.Preview && audioUrl && audioFile && (
        <PreviewMode 
          audioUrl={audioUrl}
          audioFile={audioFile}
          lyrics={lyrics}
          syncData={syncData}
          onBackToSync={handleBackToSync}
          onReset={handleReset}
          songTitle={songTitle}
          artist={artist}
          albumArtUrl={albumArtUrl}
          credits={credits}
          initialLineIndex={initialPreviewLineIndex}
          onUpdateMetadata={handleUpdateMetadata}
        />
      )}
    </>
  );
};

export default App;