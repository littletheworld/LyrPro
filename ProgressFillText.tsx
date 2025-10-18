
import React, { useMemo } from 'react';

interface ProgressFillTextProps {
  chars: string[];
  time: (number | null)[];
  currentTime: number;
  className?: string;
  sungColor: string;
  baseColor: string;
  endTimeOverride: number | null;
  isComplete?: boolean;
}

const ProgressFillText: React.FC<ProgressFillTextProps> = ({ chars, time, currentTime, className = '', sungColor, baseColor, endTimeOverride, isComplete }) => {
  const progress = useMemo(() => {
    if (isComplete) {
      return 100;
    }
    
    if (chars.length === 0 || time.every(t => t === null)) return 0;
    
    const firstTime = time.find(t => t !== null) ?? null;
    if (firstTime === null || currentTime < firstTime) {
        return 0;
    }
    
    let lastSungIndex = -1;
    for (let i = 0; i < time.length; i++) {
      if (time[i] !== null && time[i]! <= currentTime) {
        lastSungIndex = i;
      }
    }

    if (lastSungIndex === -1) {
        return 0;
    }
    
    const startTime = time[lastSungIndex]!;
    
    const nextSungIndex = time.findIndex((t, i) => t !== null && i > lastSungIndex);
    
    const endTime = nextSungIndex !== -1 ? time[nextSungIndex]! : endTimeOverride;
    
    if (endTime === null || endTime <= startTime) {
      return ((lastSungIndex + 1) / chars.length) * 100;
    }

    const segmentDuration = endTime - startTime;
    const timeIntoSegment = currentTime - startTime;
    const segmentProgress = Math.max(0, Math.min(1, timeIntoSegment / segmentDuration));
    
    const charsInSegment = (nextSungIndex !== -1 ? nextSungIndex : chars.length) - lastSungIndex;
    const charsDone = lastSungIndex + (segmentProgress * charsInSegment);
    
    const totalProgress = (charsDone / chars.length) * 100;
    
    return totalProgress;
  }, [chars, time, currentTime, endTimeOverride, isComplete]);

  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(to right, ${sungColor} ${progress}%, ${baseColor} ${progress}%)`,
    textWrap: 'balance',
  };

  return (
    <span
      className={`whitespace-pre-wrap ${className} romanization-text`}
      style={gradientStyle}
    >
      {chars.map((char) => (char === ' ' ? '\u00A0' : char)).join('')}
    </span>
  );
};

export default ProgressFillText;
