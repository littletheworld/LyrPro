import React, { useState, useEffect, useRef } from 'react';
import { type SyncLine } from '../types';
import { getLineStartTime, getAdlibEndTime, getMainLineEndTime } from '../utils/projectUtils';
import ProgressFillText from './ProgressFillText';

interface AnimatedLyricLineProps {
  lineData: SyncLine;
  currentTime: number;
  isActive: boolean;
  singer: number;
  nextLineStartTime: number | null;
}

// Custom hook to get the previous value of a prop or state
function usePrevious<T>(value: T): T | undefined {
  // FIX: Provide an initial value to useRef to satisfy its overloads.
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}


const AnimatedLyricLine: React.FC<AnimatedLyricLineProps> = ({ lineData, currentTime, isActive, singer, nextLineStartTime }) => {
  const lineStartTime = getLineStartTime(lineData);
  const [animationClass, setAnimationClass] = useState('');
  const prevIsActive = usePrevious(isActive);

  useEffect(() => {
    // Apply animation only when transitioning from inactive to active
    if (prevIsActive === false && isActive === true) {
      setAnimationClass('line-focus-animation');
    } else if (prevIsActive === true && isActive === false) {
      // Reset the class when it becomes inactive, so it can animate again later
      setAnimationClass('');
    }
  }, [isActive, prevIsActive]);

  // Determine the core status: is the line in the past?
  const isCurrentlyPast = !isActive && lineStartTime < currentTime;

  // Use local state to control the blur effect with a delay, ensuring the fill is seen first.
  const [isBlurred, setIsBlurred] = useState(isCurrentlyPast);

  useEffect(() => {
    let timer: number;
    if (isCurrentlyPast) {
      // When a line becomes 'past', wait a bit longer to ensure the user perceives
      // the completed fill before the blur animation begins.
      timer = window.setTimeout(() => {
        setIsBlurred(true);
      }, 300); // Increased delay from 150ms to 300ms
    } else {
      // If the line becomes active or future (e.g., seeking backwards), remove blur immediately.
      setIsBlurred(false);
    }
    
    // Cleanup the timer if the component unmounts or dependencies change.
    return () => clearTimeout(timer);
  }, [isCurrentlyPast]);

  const lineStatus = isActive ? 'active' 
    : isCurrentlyPast ? 'past' 
    : 'future';

  const statusStyles = {
    active: { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
    past: { 
      opacity: 0.5, 
      transform: 'scale(0.95)', 
      filter: isBlurred ? 'blur(1px)' : 'blur(0px)' // Conditionally apply blur
    },
    future: { opacity: 0.5, transform: 'scale(0.95)', filter: 'blur(1px)' },
  };
  
  const currentStyle = statusStyles[lineStatus];

  // The base color for both main text and ad-libs is determined by the overall line's active state.
  const baseColor = isActive ? '#6B7280' /* gray-500, active */ : '#4B5563' /* gray-600, inactive */;
  
  // The sung color is now consistently white for all singers to maintain a clean, uniform look.
  const sungColor = '#FFFFFF';
  
  const sizeClasses = 'text-3xl md:text-4xl leading-relaxed break-all';
  const adlibSizeClasses = 'text-xl md:text-2xl leading-relaxed break-all';
  const fontWeight = isActive ? 'font-semibold' : 'font-medium';

  const textAlignClass = singer === 2 ? 'text-right' : 'text-left';
  const adlibJustifyClass = singer === 2 ? 'justify-end' : 'justify-start';

  const mainLineEndTime = getMainLineEndTime(lineData);
  const mainLineAnimationEndTime = mainLineEndTime !== -Infinity ? mainLineEndTime : nextLineStartTime;
  
  return (
    <div
      className={`tracking-wide transition-[opacity,transform,filter] duration-700 ease-out ${animationClass}`}
      style={currentStyle}
    >
        <div className={`py-1 ${textAlignClass} ${fontWeight}`}>
          <div>
            <ProgressFillText
                chars={lineData.chars}
                time={lineData.time}
                currentTime={currentTime}
                className={sizeClasses}
                baseColor={baseColor}
                sungColor={sungColor}
                endTimeOverride={mainLineAnimationEndTime}
                isComplete={lineStatus === 'past'}
            />
          </div>

          {/* Ad-libs now only appear when the line is actively being sung. */}
          {lineStatus === 'active' && lineData.adlibs.length > 0 && (
              <div className={`mt-2 flex flex-wrap ${adlibJustifyClass} gap-x-4 gap-y-2`}>
              {lineData.adlibs.map((adlib) => {
                  const adlibEndTime = getAdlibEndTime(adlib);
                  // An ad-lib is visually complete if the current time has passed its own final timestamp.
                  const isAdlibConsideredComplete = adlibEndTime !== -Infinity && currentTime > adlibEndTime;
                  
                  // Use the ad-lib's own end time for animation to prevent slow stretching.
                  // Fall back to the next line's start time if the ad-lib has no timing.
                  const adlibAnimationEndTime = adlibEndTime !== -Infinity ? adlibEndTime : nextLineStartTime;

                  return (
                    <div key={`adlib-${adlib.id}`} className="flex items-baseline adlib-enter">
                        <div>
                            <ProgressFillText
                                chars={adlib.chars}
                                time={adlib.time}
                                currentTime={currentTime}
                                className={`${adlibSizeClasses} italic`}
                                baseColor={baseColor}
                                sungColor={sungColor}
                                endTimeOverride={adlibAnimationEndTime}
                                isComplete={isAdlibConsideredComplete}
                            />
                        </div>
                    </div>
                  );
              })}
              </div>
          )}
        </div>
    </div>
  );
};

export default AnimatedLyricLine;