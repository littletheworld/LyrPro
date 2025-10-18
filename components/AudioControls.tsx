import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from './Button';
import Icons from './Icons';

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

interface AudioControlsProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  showPreviewControls?: boolean;
  onBackToSync?: () => void;
  onSaveProject?: () => void;
  onReset?: () => void;
  onReplayLine?: () => void;
  onExportLrc?: () => void;
  isVocalRemoverOn?: boolean;
  onToggleVocalRemover?: () => void;
  isVisible?: boolean;
}

const AudioControls: React.FC<AudioControlsProps> = ({
  audioRef,
  showPreviewControls = false,
  onBackToSync,
  onSaveProject,
  onReset,
  onReplayLine,
  onExportLrc,
  isVocalRemoverOn,
  onToggleVocalRemover,
  isVisible,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const isSeekingRef = useRef(isSeeking);
  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncState = () => {
      const audioDuration = audio.duration;
      if (isFinite(audioDuration)) {
        setDuration(audioDuration);
      }
      setCurrentTime(audio.currentTime);
      setIsPlaying(!audio.paused);
    };

    const handleTimeUpdate = () => {
      if (!isSeekingRef.current) {
        setCurrentTime(audio.currentTime);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    if (audio.readyState >= 2) {
      syncState();
    }
    
    audio.addEventListener('loadeddata', syncState);
    audio.addEventListener('durationchange', syncState);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handlePause);
    
    return () => {
      audio.removeEventListener('loadeddata', syncState);
      audio.removeEventListener('durationchange', syncState);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handlePause);
    };
  }, [audioRef]);

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play().catch(e => console.error("Playback failed", e));
    }
  }, [isPlaying, audioRef]);
  
  const handleSkip = (amount: number) => {
      if(audioRef.current) {
        const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + amount));
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };
  
  const handleSeekEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    if (audioRef.current) {
        const newTime = parseFloat(e.currentTarget.value);
        audioRef.current.currentTime = newTime;
    }
    setIsSeeking(false);
  };
  
  if (showPreviewControls) {
    const iconButtonClasses = "p-3 rounded-full transition-colors bg-white/10 hover:bg-white/20 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white";
    const activeToggleButtonClasses = "bg-blue-600 text-white";
    const inactiveToggleButtonClasses = "bg-white/10 hover:bg-white/20 text-white";
    const sliderThumb = '[&::-webkit-slider-thumb]:bg-white';
    const sliderStyle = { background: `linear-gradient(to right, #60a5fa ${progressPercentage}%, #ffffff33 ${progressPercentage}%)`};
    const actionButtonBaseClasses = "flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm shadow-md transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50";

    return (
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl mx-auto p-3 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 shadow-lg z-50 flex flex-col items-center gap-3 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'}`}>
        
        {/* Row 1: Player Controls */}
        <div className="w-full flex items-center gap-4 text-white">
            <div className="flex items-center gap-1">
                <button onClick={() => handleSkip(-10)} className={iconButtonClasses} aria-label="Rewind 10 seconds" title="ย้อนกลับ 10 วินาที">
                    <Icons name="replay" className="w-5 h-5 transform scale-x-[-1]" />
                </button>
                <button onClick={handlePlayPause} className={iconButtonClasses} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'หยุดเล่น' : 'เล่น'}>
                    <Icons name={isPlaying ? 'pause' : 'play'} className="w-7 h-7" />
                </button>
                <button onClick={() => handleSkip(10)} className={iconButtonClasses} aria-label="Forward 10 seconds" title="ข้ามไปข้างหน้า 10 วินาที">
                    <Icons name="replay" className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-grow flex items-center gap-3">
                <span className="text-sm font-mono text-gray-200 w-12 text-center">{formatTime(currentTime)}</span>
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.01"
                    value={currentTime}
                    onInput={handleSliderChange}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    onTouchStart={handleSeekStart}
                    onTouchEnd={handleSeekEnd}
                    style={sliderStyle}
                    className={`w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full ${sliderThumb}`}
                    aria-label="Audio progress"
                />
                <span className="text-sm font-mono text-gray-200 w-12 text-center">{formatTime(duration)}</span>
            </div>
        </div>
        {/* Row 2: Action Buttons */}
        <div className="w-full flex items-center justify-center gap-2">
            <button onClick={onToggleVocalRemover} className={`p-3 rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-blue-500 ${isVocalRemoverOn ? activeToggleButtonClasses : inactiveToggleButtonClasses}`} title={isVocalRemoverOn ? 'ปิดโหมดคาราโอเกะ (ฟังเสียงร้อง)' : 'เปิดโหมดคาราโอเกะ (ตัดเสียงร้อง)'} aria-label={isVocalRemoverOn ? 'ปิดโหมดคาราโอเกะ (ฟังเสียงร้อง)' : 'เปิดโหมดคาราโอเกะ (ตัดเสียงร้อง)'} >
                <Icons name="microphone" className="w-5 h-5" />
            </button>
            <button onClick={onBackToSync} className={iconButtonClasses} title="กลับไปแก้ไข" aria-label="กลับไปแก้ไข">
                <Icons name="edit" className="w-5 h-5" />
            </button>
             <button onClick={onReset} className={iconButtonClasses} title="เริ่มต้นใหม่" aria-label="เริ่มต้นใหม่">
                <Icons name="reset" className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-white/30 mx-1"></div>
            <button onClick={onSaveProject} className={`${actionButtonBaseClasses} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`} title="บันทึกโปรเจกต์เป็นไฟล์ .lsk">
                <Icons name="save" className="w-4 h-4"/>
                <span>บันทึก</span>
            </button>
            {onExportLrc && (
                <button onClick={onExportLrc} className={`${actionButtonBaseClasses} bg-green-500 text-white hover:bg-green-600 focus:ring-green-400`} title="ส่งออกเป็นไฟล์ LRC">
                    <Icons name="export" className="w-4 h-4"/>
                    <span>Export</span>
                </button>
            )}
        </div>
      </div>
    );
  }

  // --- Fallback UI for Sync Mode (unchanged) ---
  const sliderStyle = {
    background: `linear-gradient(to right, #3b82f6 ${progressPercentage}%, #4B5563 ${progressPercentage}%)`,
  };
  const sliderThumb = '[&::-webkit-slider-thumb]:bg-blue-600';
  
  return (
    <div className={`p-4 rounded-lg border-t border-gray-200 bg-gray-100`}>
        <div className="flex items-center gap-3">
            <span className={`text-sm font-mono text-gray-600`}>{formatTime(currentTime)}</span>
            <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.01"
                value={currentTime}
                onInput={handleSliderChange}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                onTouchStart={handleSeekStart}
                onTouchEnd={handleSeekEnd}
                style={sliderStyle}
                className={`w-full h-2.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full ${sliderThumb}`}
                aria-label="Audio progress"
            />
            <span className={`text-sm font-mono text-gray-600`}>{formatTime(duration)}</span>
        </div>
        <div className={`flex items-center justify-center gap-4 mt-3`}>
             <button onClick={() => handleSkip(-10)} className={`p-2.5 rounded-full transition-colors bg-white hover:bg-gray-200 text-gray-700 shadow-sm`} aria-label="Rewind 10 seconds" title="ย้อนกลับ 10 วินาที">
                <Icons name="replay" className="w-5 h-5 transform scale-x-[-1]" />
            </button>
            <button onClick={handlePlayPause} className={`p-3 rounded-full transition-colors bg-white hover:bg-gray-200 text-gray-700 shadow-sm`} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'หยุดเล่น' : 'เล่น'}>
                <Icons name={isPlaying ? 'pause' : 'play'} className="w-7 h-7" />
            </button>
            <button onClick={() => handleSkip(10)} className={`p-2.5 rounded-full transition-colors bg-white hover:bg-gray-200 text-gray-700 shadow-sm`} aria-label="Forward 10 seconds" title="ข้ามไปข้างหน้า 10 วินาที">
                <Icons name="replay" className="w-5 h-5" />
            </button>
            {onReplayLine && (
                <Button variant="secondary" onClick={onReplayLine} icon={<Icons name="replay" className="w-5 h-5"/>} title="เริ่มซิงก์บรรทัดปัจจุบันใหม่อีกครั้ง">ซิงก์ท่อนนี้ใหม่</Button>
            )}
        </div>
    </div>
  );
};

export default AudioControls;