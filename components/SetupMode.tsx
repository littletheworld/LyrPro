import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ListBlobResultBlob } from '@vercel/blob';
import Card from './GlassCard';
import Button from './Button';
import Icons from './Icons';
import { type SyncLine, type ProjectData } from '../types';
import { dataUrlToFile } from '../utils/projectUtils';
import { listCloudProjects, loadProjectFromCloud, deleteProjectFromCloud } from '../utils/cloud';

interface SetupModeProps {
  onStartSync: (file: File, lyrics: string, title: string, artist: string, albumArtUrl: string | null, credits: string) => void;
  onLoadProject: (file: File, lyrics: string[], syncData: SyncLine[], title: string, artist: string, albumArtUrl: string | null, credits: string) => void;
}

const AUTOSAVE_KEY = 'lyric-sync-pro-autosave';
const SETUP_AUTOSAVE_KEY = 'lyric-sync-pro-setup-draft';

const CloudProjectsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onLoadProject: (projectData: ProjectData) => void;
}> = ({ isOpen, onClose, onLoadProject }) => {
    const [projects, setProjects] = useState<ListBlobResultBlob[]>([]);
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

    const fetchProjects = useCallback(async () => {
        setStatus('loading');
        try {
            const cloudProjects = await listCloudProjects();
            setProjects(cloudProjects);
            setStatus('idle');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
        }
    }, [isOpen, fetchProjects]);

    const handleLoad = async (url: string) => {
        try {
            const projectData = await loadProjectFromCloud(url);
            onLoadProject(projectData);
            onClose();
        } catch (error) {
            alert(`ไม่สามารถโหลดโปรเจกต์ได้: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
    
    const handleDelete = async (url: string) => {
        if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบโปรเจกต์นี้จากคลาวด์? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
            try {
                await deleteProjectFromCloud(url);
                await fetchProjects(); // Refresh the list
            } catch (error) {
                alert(`เกิดข้อผิดพลาดในการลบ: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };

    if (!isOpen) return null;

    const getProjectName = (pathname: string) => {
        const parts = pathname.replace(/\.lsk$/, '').split('-');
        if (parts.length > 2) {
            const artist = parts[0].replace(/_/g, ' ').replace(/(^\w)/, c => c.toUpperCase());
            const title = parts.slice(1, -1).join('-').replace(/_/g, ' ').replace(/(^\w)/, c => c.toUpperCase());
            return `${artist} - ${title}`;
        }
        return pathname.replace(/\.lsk$/, '').replace(/_/g, ' ');
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white text-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b">
                    <h3 className="text-xl font-bold">โหลดโปรเจกต์จากคลาวด์</h3>
                </div>
                <div className="p-4 flex-grow overflow-y-auto">
                    {status === 'loading' && <p className="text-center text-gray-500">กำลังโหลด...</p>}
                    {status === 'error' && <p className="text-center text-red-500">เกิดข้อผิดพลาดในการโหลดรายการโปรเจกต์</p>}
                    {status === 'idle' && projects.length === 0 && <p className="text-center text-gray-500">ไม่พบโปรเจกต์ที่บันทึกไว้บนคลาวด์</p>}
                    {status === 'idle' && projects.length > 0 && (
                        <ul className="space-y-3">
                            {projects.map(p => (
                                <li key={p.pathname} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border">
                                    <div>
                                        <p className="font-semibold truncate" title={p.pathname}>{getProjectName(p.pathname)}</p>
                                        <p className="text-xs text-gray-500">
                                            บันทึกเมื่อ: {new Date(p.uploadedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button onClick={() => handleLoad(p.url)} variant="primary">โหลด</Button>
                                        <Button onClick={() => handleDelete(p.url)} variant="secondary" title="ลบโปรเจกต์">
                                            <Icons name="trash" className="w-5 h-5"/>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                 <div className="p-4 border-t text-right">
                    <Button variant="secondary" onClick={onClose}>ปิด</Button>
                </div>
            </div>
        </div>
    );
};


const SetupMode: React.FC<SetupModeProps> = ({ onStartSync, onLoadProject }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lyricsText, setLyricsText] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [albumArtFile, setAlbumArtFile] = useState<File | null>(null);
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState('');
  const [savedSession, setSavedSession] = useState<any>(null);
  const [savedSetupDraft, setSavedSetupDraft] = useState<any>(null);
  const [restoredFromSessionData, setRestoredFromSessionData] = useState<{lyrics: string[], syncData: SyncLine[]} | null>(null);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedData = localStorage.getItem(AUTOSAVE_KEY);
    if (savedData) {
        try {
            const projectData = JSON.parse(savedData);
            if (projectData.audioFileName && projectData.syncData) {
                setSavedSession(projectData);
            }
        } catch (e) {
            console.error("Failed to parse auto-saved session", e);
            localStorage.removeItem(AUTOSAVE_KEY);
        }
    }
    const savedDraftData = localStorage.getItem(SETUP_AUTOSAVE_KEY);
    if (savedDraftData) {
        try {
            setSavedSetupDraft(JSON.parse(savedDraftData));
        } catch (e) {
            console.error("Failed to parse setup draft", e);
            localStorage.removeItem(SETUP_AUTOSAVE_KEY);
        }
    }
  }, []);
  
  useEffect(() => {
    if (albumArtFile) {
      const url = URL.createObjectURL(albumArtFile);
      setAlbumArtUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAlbumArtUrl(null);
  }, [albumArtFile]);

  useEffect(() => {
    const saveDraft = () => {
        if (!selectedFile && !lyricsText.trim() && !title.trim() && !artist.trim() && !albumArtFile && !credits.trim()) {
            localStorage.removeItem(SETUP_AUTOSAVE_KEY);
            return;
        }

        const dataToSave: Record<string, any> = { lyricsText, title, artist, credits, audioFileName: selectedFile?.name || null, audioDataUrl: '', albumArtFileName: albumArtFile?.name || null, albumArtDataUrl: '' };
        
        let pendingReaders = 0;
        const finalizeSave = () => { if (pendingReaders === 0) localStorage.setItem(SETUP_AUTOSAVE_KEY, JSON.stringify(dataToSave)); };
        if (selectedFile) {
            pendingReaders++;
            const reader = new FileReader();
            reader.onload = (e) => { dataToSave.audioDataUrl = e.target?.result as string; pendingReaders--; finalizeSave(); };
            reader.readAsDataURL(selectedFile);
        }
        if (albumArtFile) {
            pendingReaders++;
            const artReader = new FileReader();
            artReader.onload = (e) => { dataToSave.albumArtDataUrl = e.target?.result as string; pendingReaders--; finalizeSave(); };
            artReader.readAsDataURL(albumArtFile);
        }
        if (pendingReaders === 0) finalizeSave();
    };
    const timeoutId = setTimeout(saveDraft, 1500);
    return () => clearTimeout(timeoutId);
  }, [selectedFile, lyricsText, title, artist, albumArtFile, credits]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title && !artist) {
        const parts = file.name.replace(/\.[^/.]+$/, '').split('-').map(p => p.trim());
        if (parts.length === 2) {
          setArtist(parts[0]);
          setTitle(parts[1]);
        } else {
          setTitle(parts[0]);
        }
      }
    }
  };

  const handleArtFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setAlbumArtFile(file);
  };
  
  const handleProjectFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') throw new Error("File is not readable");
            const projectData: ProjectData = JSON.parse(text);
            handleCloudProjectLoad(projectData);
        } catch (error) {
            console.error("Failed to load project:", error);
            alert("ไม่สามารถโหลดไฟล์โปรเจกต์ได้ อาจเป็นไฟล์ที่ไม่ถูกต้อง");
        }
    };
    reader.readAsText(file);
  };
  
  const handleCloudProjectLoad = useCallback(async (projectData: ProjectData) => {
        if (!projectData.audioDataUrl || !projectData.lyrics || !projectData.syncData) {
            throw new Error("Invalid project file format");
        }
        const audioFile = await dataUrlToFile(projectData.audioDataUrl, projectData.audioFileName);
        localStorage.removeItem(SETUP_AUTOSAVE_KEY);
        setRestoredFromSessionData(null);
        onLoadProject( audioFile, projectData.lyrics, projectData.syncData, projectData.songTitle || '', projectData.artist || '', projectData.albumArtUrl || null, projectData.credits || '' );
  }, [onLoadProject]);

  const handleUploadClick = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleArtUploadClick = useCallback(() => { artInputRef.current?.click(); }, []);
  const handleLoadProjectClick = useCallback(() => { projectInputRef.current?.click(); }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedFile && lyricsText.trim()) {
      localStorage.removeItem(AUTOSAVE_KEY);
      localStorage.removeItem(SETUP_AUTOSAVE_KEY);
      let artUrlForApp: string | null = null;
      if (albumArtFile) artUrlForApp = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target?.result as string); reader.readAsDataURL(albumArtFile); });
      const currentLyricLines = lyricsText.split('\n').filter(line => line.trim() !== '');
      if (restoredFromSessionData && JSON.stringify(currentLyricLines) === JSON.stringify(restoredFromSessionData.lyrics)) {
          onLoadProject( selectedFile, restoredFromSessionData.lyrics, restoredFromSessionData.syncData, title, artist, artUrlForApp, credits );
      } else {
          onStartSync(selectedFile, lyricsText, title, artist, artUrlForApp, credits);
      }
      setRestoredFromSessionData(null);
    } else {
      alert('กรุณาอัพโหลดไฟล์เสียงและใส่เนื้อเพลงให้ครบถ้วน');
    }
  }, [selectedFile, lyricsText, title, artist, onStartSync, onLoadProject, restoredFromSessionData, albumArtFile, credits]);

  const handleRestoreSession = useCallback(async () => {
    if (!savedSession) return;
    setTitle(savedSession.songTitle || '');
    setArtist(savedSession.artist || '');
    setLyricsText(savedSession.lyrics.join('\n'));
    setCredits(savedSession.credits || '');
    try {
        const audioFile = await dataUrlToFile(savedSession.audioDataUrl, savedSession.audioFileName);
        setSelectedFile(audioFile);
    } catch (error) {
        console.error("Failed to restore audio file from session:", error);
        setSelectedFile(null);
        alert('เกิดข้อผิดพลาดในการกู้คืนไฟล์เสียง');
    }
    if (savedSession.albumArtUrl) {
      try {
        const artFile = await dataUrlToFile(savedSession.albumArtUrl, 'album-art-restored');
        setAlbumArtFile(artFile);
      } catch (error) {
        console.error("Failed to restore album art from session:", error);
        setAlbumArtFile(null);
      }
    } else {
        setAlbumArtFile(null);
    }
    setRestoredFromSessionData({ lyrics: savedSession.lyrics, syncData: savedSession.syncData });
    localStorage.removeItem(SETUP_AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_KEY);
    setSavedSession(null);
  }, [savedSession]);

  const handleDismissSession = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_KEY);
    setSavedSession(null);
  }, []);
  
  const handleRestoreSetupDraft = useCallback(async () => {
    if (!savedSetupDraft) return;
    const { title: draftTitle, artist: draftArtist, lyricsText: draftLyrics, credits: draftCredits, audioDataUrl, audioFileName, albumArtDataUrl, albumArtFileName } = savedSetupDraft;
    setTitle(draftTitle || '');
    setArtist(draftArtist || '');
    setLyricsText(draftLyrics || '');
    setCredits(draftCredits || '');
    if (audioDataUrl && audioFileName) {
        try { const audioFile = await dataUrlToFile(audioDataUrl, audioFileName); setSelectedFile(audioFile); } 
        catch (error) { console.error("Failed to restore audio file from draft:", error); setSelectedFile(null); }
    } else { setSelectedFile(null); }
    if (albumArtDataUrl && albumArtFileName) {
        try { const artFile = await dataUrlToFile(albumArtDataUrl, albumArtFileName); setAlbumArtFile(artFile); } 
        catch (error) { console.error("Failed to restore album art from draft:", error); setAlbumArtFile(null); }
    } else { setAlbumArtFile(null); }
    localStorage.removeItem(SETUP_AUTOSAVE_KEY);
    setSavedSetupDraft(null);
  }, [savedSetupDraft]);

  const handleDismissSetupDraft = useCallback(() => {
    localStorage.removeItem(SETUP_AUTOSAVE_KEY);
    setSavedSetupDraft(null);
  }, []);
  
  const uploadAreaClasses = `border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 ${ selectedFile ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-100 hover:border-gray-400' }`;

  return (
    <>
      <CloudProjectsModal isOpen={isCloudModalOpen} onClose={() => setIsCloudModalOpen(false)} onLoadProject={handleCloudProjectLoad} />
      {savedSetupDraft && (
        <Card className="p-5 mb-6 bg-blue-50 border-blue-300">
            <div className="text-center">
                <h3 className="font-bold text-blue-800">พบฉบับร่างที่ยังไม่ได้บันทึก</h3>
                <p className="text-sm text-blue-700 mt-1">คุณต้องการทำต่อจากที่ค้างไว้หรือไม่?</p>
                <div className="flex justify-center gap-4 mt-4">
                    <Button onClick={handleRestoreSetupDraft} variant="primary" title="ดำเนินการต่อจากฉบับร่างที่บันทึกไว้">ทำต่อ</Button>
                    <Button onClick={handleDismissSetupDraft} variant="secondary" title="ลบฉบับร่างนี้ทิ้งอย่างถาวร">ลบทิ้ง</Button>
                </div>
            </div>
        </Card>
      )}
      {savedSession && !savedSetupDraft && (
        <Card className="p-5 mb-6 bg-yellow-50 border-yellow-300">
            <div className="text-center">
                <h3 className="font-bold text-yellow-800">พบเซสชันที่ยังไม่เสร็จสิ้น</h3>
                <p className="text-sm text-yellow-700 mt-1">"{savedSession.artist || 'Unknown'} - {savedSession.songTitle || 'Untitled'}"</p>
                <div className="flex justify-center gap-4 mt-4">
                    <Button onClick={handleRestoreSession} variant="primary" title="กู้คืนและทำงานต่อจากเซสชันที่แล้ว">ทำงานต่อ</Button>
                    <Button onClick={handleDismissSession} variant="secondary" title="ลบเซสชันที่บันทึกไว้นี้ทิ้ง">ลบทิ้ง</Button>
                </div>
            </div>
        </Card>
      )}
      <Card className="p-6 md:p-8 space-y-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800 border-l-4 border-blue-500 pl-4 mb-3">1. ข้อมูลเพลง</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="md:col-span-1 flex flex-col gap-4">
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อเพลง" className="w-full p-3 bg-gray-50 text-gray-800 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300" />
                  <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="ศิลปิน" className="w-full p-3 bg-gray-50 text-gray-800 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300" />
                  <input type="text" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Written by..." className="w-full p-3 bg-gray-50 text-gray-800 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300" />
              </div>
              <div className="md:col-span-1">
                 <input type="file" accept="image/*" ref={artInputRef} onChange={handleArtFileChange} className="hidden" />
                 <div className={`border-2 border-dashed rounded-xl w-full h-full min-h-[120px] flex items-center justify-center cursor-pointer transition-all duration-300 ${albumArtUrl ? 'border-blue-400 p-1' : 'border-gray-300 hover:bg-gray-100'}`} onClick={handleArtUploadClick} title="อัพโหลดปกเพลง">
                    {albumArtUrl ? ( <img src={albumArtUrl} alt="Album Art Preview" className="w-full h-full object-cover rounded-lg" /> ) : ( <div className="text-center text-gray-500"><Icons name="photo" className="w-8 h-8 mx-auto" /><span className="text-xs font-semibold mt-1 block">ปกเพลง</span></div> )}
                 </div>
              </div>
              <div className="md:col-span-2">
                <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <input type="file" accept=".lsk" ref={projectInputRef} onChange={handleProjectFileChange} className="hidden" />
                <div className={uploadAreaClasses} onClick={handleUploadClick}>
                  <p className={`font-semibold ${selectedFile ? 'text-blue-800' : 'text-gray-600'}`}>{selectedFile ? `✓ ${selectedFile.name}` : '📁 คลิกเพื่ออัพโหลดไฟล์เสียง'}</p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 border-l-4 border-blue-500 pl-4 mb-3">2. เนื้อเพลง</h2>
            <textarea value={lyricsText} onChange={(e) => setLyricsText(e.target.value)} placeholder="เช่น&#10;1: เห็นฉันไหม (นักร้อง 1)&#10;2: ได้ยินเพลงของฉันหรือเปล่า (นักร้อง 2)&#10;(ไม่มีเลข) = นักร้อง 1" className="w-full h-48 p-4 bg-gray-50 text-gray-800 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y transition-colors duration-300 placeholder:text-gray-400" />
          </div>
        </div>
        <div className="pt-2">
            <div className="text-center">
                <Button onClick={handleSubmit} disabled={!selectedFile || !lyricsText.trim()} icon={<Icons name="play"/>} title="เริ่มต้นการจัดโครงสร้างและซิงค์เนื้อเพลง">เริ่มซิงก์</Button>
            </div>
            <div className="relative flex py-5 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-sm">หรือ</span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>
            <div className="flex justify-center flex-wrap gap-4">
                 <button onClick={handleLoadProjectClick} title="เปิดไฟล์โปรเจกต์ (.lsk) ที่บันทึกไว้" className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200 ease-in-out bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <Icons name="upload" className="w-5 h-5" />
                    <span>โหลดโปรเจกต์ (จากเครื่อง)</span>
                </button>
                <button onClick={() => setIsCloudModalOpen(true)} title="เปิดโปรเจกต์ที่บันทึกไว้บนคลาวด์" className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200 ease-in-out bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <Icons name="folder" className="w-5 h-5" />
                    <span>โหลดจากคลาวด์</span>
                </button>
            </div>
        </div>
      </Card>
    </>
  );
};

export default SetupMode;