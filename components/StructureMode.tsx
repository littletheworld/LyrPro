import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { type SyncLine } from '../types';
import Button from './Button';
import Icons from './Icons';
import Card from './GlassCard';

interface AdlibStructure {
  id: string;
  text: string; // e.g., "(yeah!)"
}

interface StructureLine {
  id: string;
  text: string; // Main text
  adlibs: AdlibStructure[];
  label: string;
  singer: number;
  groupId?: string;
}

interface StructureModeProps {
  rawLines: string[];
  initialStructure?: SyncLine[]; // Add this prop
  onConfirm: (syncData: SyncLine[]) => void;
  onBack: () => void;
}

const STRUCTURE_AUTOSAVE_KEY = 'lyric-sync-pro-structure-autosave';

const processRawLines = (rawLines: string[]): StructureLine[] => {
  const adlibRegex = /\s*\([^)]+\)/g;
  const singerRegex = /^\s*([12])\s*[:：]\s*/; // Matches "1:", "2 :", "1：" etc.

  return rawLines.map(rawLine => {
    let singer = 1;
    let lineContent = rawLine.trim();

    const singerMatch = lineContent.match(singerRegex);
    if (singerMatch) {
      singer = parseInt(singerMatch[1], 10);
      lineContent = lineContent.replace(singerRegex, '').trim();
    }

    const adlibMatches = lineContent.match(adlibRegex) || [];
    const mainText = lineContent.replace(adlibRegex, '').trim();

    const adlibs: AdlibStructure[] = [];
    if (adlibMatches.length > 0) {
      // Combine all ad-lib text into a single ad-lib entry
      const combinedAdlibText = adlibMatches
        .map(text => text.trim().replace(/^\(|\)$/g, ''))
        .join(' ');
      adlibs.push({
        id: crypto.randomUUID(),
        text: `(${combinedAdlibText})`,
      });
    }

    return {
      id: crypto.randomUUID(),
      text: mainText,
      adlibs,
      label: '',
      singer,
    };
  });
};

const convertSyncDataToStructure = (syncData: SyncLine[]): StructureLine[] => {
    return syncData.map(syncLine => ({
        id: syncLine.id,
        text: syncLine.chars.join(''),
        adlibs: syncLine.adlibs.map(adlib => ({
            id: adlib.id,
            text: `(${adlib.chars.join('')})`,
        })),
        label: syncLine.label || '',
        singer: syncLine.singer || 1,
        groupId: syncLine.groupId,
    }));
};


interface ToolbarButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, children, title }) => (
    <button
        onClick={onClick}
        title={title}
        className="flex items-center justify-center p-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none text-gray-700 hover:bg-gray-200 focus:ring-2 focus:ring-blue-400"
    >
        {children}
    </button>
);


export const StructureMode: React.FC<StructureModeProps> = ({ rawLines, initialStructure, onConfirm, onBack }) => {
  const [lines, setLines] = useState<StructureLine[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [editingTarget, setEditingTarget] = useState<{ lineId: string; adlibId?: string } | null>(null);
  const [editingText, setEditingText] = useState('');
  
  // Load state from localStorage on mount or when rawLines change
  useEffect(() => {
    // Priority 1: Use initialStructure if provided (e.g., when navigating back from SyncMode).
    if (initialStructure && initialStructure.length > 0) {
        setLines(convertSyncDataToStructure(initialStructure));
        return;
    }

    // Priority 2: Try to load from autosave if no initial structure is given.
    const savedData = localStorage.getItem(STRUCTURE_AUTOSAVE_KEY);
    if (savedData) {
        try {
            const { savedRawLines, structure } = JSON.parse(savedData);
            // Check if the saved structure corresponds to the current lyrics
            if (JSON.stringify(savedRawLines) === JSON.stringify(rawLines)) {
                setLines(structure);
                return; // Exit if we successfully loaded the saved state
            }
        } catch (e) {
            console.error("Failed to parse saved structure", e);
        }
    }
    // Priority 3: Default to processing rawLines if no other data source is available.
    if (rawLines.length > 0) {
        setLines(processRawLines(rawLines));
    } else {
        setLines([]);
    }
  }, [rawLines, initialStructure]);

  // Save state to localStorage whenever lines or rawLines change
  useEffect(() => {
    if (lines.length > 0) {
        const dataToSave = {
            savedRawLines: rawLines,
            structure: lines,
        };
        localStorage.setItem(STRUCTURE_AUTOSAVE_KEY, JSON.stringify(dataToSave));
    }
  }, [lines, rawLines]);

  const isAllSelected = useMemo(() => lines.length > 0 && selectedLineIds.length === lines.length, [lines, selectedLineIds]);

  const groupColors = useMemo(() => {
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'];
    const groupColorMap = new Map<string, string>();
    let colorIndex = 0;
    lines.forEach(line => {
        if (line.groupId && !groupColorMap.has(line.groupId)) {
            groupColorMap.set(line.groupId, colors[colorIndex % colors.length]);
            colorIndex++;
        }
    });
    return groupColorMap;
  }, [lines]);

  const handleToggleSelectAll = () => setSelectedLineIds(isAllSelected ? [] : lines.map(l => l.id));
  
  const handleToggleSelect = (lineId: string) => {
    if (editingTarget?.lineId !== lineId) {
        setSelectedLineIds(prev => prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId]);
    }
  };

  const handleDeleteLines = useCallback((lineIdsToDelete: string[]) => {
    if (lineIdsToDelete.length === 0) return;
    if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ ${lineIdsToDelete.length} บรรทัด? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
        setLines(currentLines => currentLines.filter(line => !lineIdsToDelete.includes(line.id)));
        setSelectedLineIds(prev => prev.filter(id => !lineIdsToDelete.includes(id)));
    }
  }, []);

  const handleBulkUpdate = (updates: Partial<Pick<StructureLine, 'singer'>>) => {
    setLines(currentLines =>
      currentLines.map(line => 
        selectedLineIds.includes(line.id) ? { ...line, ...updates } : line
      )
    );
  };

  const handleGroupSelected = () => {
    const linesToGroup = lines.filter(l => selectedLineIds.includes(l.id));
    if (linesToGroup.length === 0) return;

    const allGroupIdsInSelection = [...new Set(linesToGroup.map(l => l.groupId).filter(Boolean))];
    const targetGroupId = allGroupIdsInSelection[0] || `group-${crypto.randomUUID()}`;

    setLines(currentLines => {
        return currentLines.map(line => {
            if (selectedLineIds.includes(line.id)) {
                return { ...line, groupId: targetGroupId };
            }
            if (line.groupId && allGroupIdsInSelection.includes(line.groupId)) {
                 return { ...line, groupId: targetGroupId };
            }
            return line;
        });
    });
  };
  
  const handleUngroupSelected = () => {
    setLines(currentLines =>
        currentLines.map(line => {
            if (selectedLineIds.includes(line.id)) {
                const { groupId, ...restOfLine } = line;
                return restOfLine as StructureLine;
            }
            return line;
        })
    );
  };
  
  const handleSetSinger = useCallback((lineId: string, singer: number) => {
      setLines(prevLines => prevLines.map(line => line.id === lineId ? { ...line, singer } : line));
  }, []);

  const handleAddAdlib = (lineId: string) => {
    const newAdlibId = crypto.randomUUID();
    setLines(prevLines =>
      prevLines.map(line =>
        line.id === lineId
          ? { ...line, adlibs: [...line.adlibs, { id: newAdlibId, text: '()' }] }
          : line
      )
    );
    // Immediately start editing the new adlib
    setEditingText('()');
    setEditingTarget({ lineId, adlibId: newAdlibId });
  };
  
  const handleRemoveAdlib = (lineId: string, adlibId: string) => {
      setLines(prevLines =>
          prevLines.map(line =>
              line.id === lineId
                  ? { ...line, adlibs: line.adlibs.filter(adlib => adlib.id !== adlibId) }
                  : line
          )
      );
  };
  
  const handleConfirm = useCallback(() => {
    const finalSyncData: SyncLine[] = lines.map(line => {
        const originalLine = initialStructure?.find(l => l.id === line.id);

        let mainText = line.text;
        let adlibs = [...line.adlibs];

        if (!mainText.trim() && adlibs.length > 0) {
          mainText = adlibs[0].text.replace(/^\(|\)$/g, '');
          adlibs.shift();
        }
        
        const newChars = [...mainText];
        let finalTime = new Array(newChars.length).fill(null);

        // Preserve timing if main text is unchanged
        if (originalLine && originalLine.chars.join('') === mainText) {
            finalTime = originalLine.time;
        }

        return {
            id: line.id,
            chars: newChars,
            time: finalTime,
            label: line.label || undefined,
            singer: line.singer,
            groupId: line.groupId,
            adlibs: adlibs.map(adlib => {
                const cleanText = adlib.text.replace(/^\(|\)$/g, '');
                const newAdlibChars = [...cleanText];

                const originalAdlib = originalLine?.adlibs.find(a => a.id === adlib.id);
                let finalAdlibTime = new Array(newAdlibChars.length).fill(null);

                // Preserve timing if ad-lib text is unchanged
                if (originalAdlib && originalAdlib.chars.join('') === cleanText) {
                    finalAdlibTime = originalAdlib.time;
                }

                return {
                    id: adlib.id,
                    chars: newAdlibChars,
                    time: finalAdlibTime,
                };
            }),
        };
    }).filter(line => line.chars.length > 0 || line.adlibs.length > 0);
    onConfirm(finalSyncData);
  }, [lines, onConfirm, initialStructure]);

  const startEditing = (lineId: string, adlibId?: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    const text = adlibId ? line.adlibs.find(a => a.id === adlibId)?.text : line.text;
    setEditingText(text || '');
    setEditingTarget({ lineId, adlibId });
  };

  const cancelEditing = () => {
    setEditingTarget(null);
    setEditingText('');
  };

  const saveEditing = () => {
    if (!editingTarget) return;
    const { lineId, adlibId } = editingTarget;
    
    setLines(prevLines =>
      prevLines.map(line => {
        if (line.id === lineId) {
          if (adlibId) { // Editing an adlib
            return {
              ...line,
              adlibs: line.adlibs.map(adlib =>
                adlib.id === adlibId ? { ...adlib, text: editingText } : adlib
              ),
            };
          } else { // Editing main text
            return { ...line, text: editingText };
          }
        }
        return line;
      })
    );
    cancelEditing();
  };

  const renderLine = (line: StructureLine) => {
    const groupColor = line.groupId ? groupColors.get(line.groupId) : undefined;
    
    return (
      <div key={line.id} className="line-container-wrapper">
        <div 
          onClick={() => handleToggleSelect(line.id)}
          style={groupColor ? { borderLeftColor: groupColor } : {}}
          className={`line-container flex items-start gap-3 p-3 rounded-lg my-1
              line-item line-type-main bg-white
              ${selectedLineIds.includes(line.id) ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
              ${editingTarget?.lineId === line.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'cursor-pointer'}
          `}
        >
          <input type="checkbox" checked={selectedLineIds.includes(line.id)} readOnly className="form-checkbox h-5 w-5 text-blue-600 rounded mt-1 shrink-0" />
          <div className="flex-1 space-y-2">
             {editingTarget?.lineId === line.id && !editingTarget.adlibId ? (
                <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={saveEditing}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditing(); } if (e.key === 'Escape') cancelEditing(); }}
                    className="w-full p-1 -m-1 rounded bg-white border border-blue-400 focus:outline-none text-gray-900"
                    autoFocus
                />
            ) : (
                <p className="font-medium text-gray-800" onClick={(e) => {e.stopPropagation(); startEditing(line.id)}}>
                    {line.text || <span className="text-gray-400 italic">ท่อนร้องหลักว่าง</span>}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {line.adlibs.map(adlib => (
                    <div key={adlib.id} className="group/adlib flex items-center bg-emerald-100 text-emerald-800 rounded-full text-sm">
                        {editingTarget?.adlibId === adlib.id ? (
                            <input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onBlur={saveEditing}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); saveEditing(); }}}
                                className="w-32 px-3 py-1 bg-emerald-100 border border-emerald-400 rounded-full focus:outline-none text-emerald-900"
                                autoFocus
                            />
                        ) : (
                            <span className="px-3 py-1 cursor-text" onClick={(e) => {e.stopPropagation(); startEditing(line.id, adlib.id)}}>
                                {adlib.text}
                            </span>
                        )}
                        <button 
                            onClick={(e) => {e.stopPropagation(); handleRemoveAdlib(line.id, adlib.id)}}
                            className="mr-1 p-0.5 rounded-full text-emerald-600 hover:bg-emerald-200 opacity-0 group-hover/adlib:opacity-100 focus:opacity-100"
                            title="ลบ Ad-lib"
                        >
                            <Icons name="xCircle" className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button 
                    onClick={(e) => { e.stopPropagation(); handleAddAdlib(line.id); }} 
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 font-medium p-1 rounded-md hover:bg-gray-200"
                    title="เพิ่ม Ad-lib"
                >
                    <Icons name="plusCircle" className="w-5 h-5"/>
                    <span>Ad-lib</span>
                </button>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
             <div className="flex items-center gap-1.5">
                  <button onClick={(e) => { e.stopPropagation(); handleSetSinger(line.id, 1); }} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${line.singer === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title="Set to Singer 1">1</button>
                  <button onClick={(e) => { e.stopPropagation(); handleSetSinger(line.id, 2); }} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${line.singer === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title="Set to Singer 2">2</button>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); handleDeleteLines([line.id]); }}
                className="p-1.5 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                title="ลบบรรทัดนี้"
            >
                <Icons name="trash" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <Card className="p-4 md:p-6 space-y-4 flex flex-col h-[85vh]">
      <div className="flex justify-between items-center shrink-0">
        <div>
            <h2 className="text-xl font-bold text-gray-800 border-l-4 border-blue-500 pl-3">จัดโครงสร้างเพลง</h2>
            <p className="text-sm text-gray-500 mt-1 pl-3">
              ใส่เลข 1: หรือ 2: หน้าเนื้อเพลงเพื่อกำหนดนักร้อง
            </p>
        </div>
      </div>
      
      {selectedLineIds.length > 0 && (
        <div className="sticky top-2 bg-white/80 backdrop-blur-sm z-10 shrink-0 p-2 rounded-lg shadow-md border border-gray-200 flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <ToolbarButton onClick={handleGroupSelected} title="จัดกลุ่มท่อนที่เลือก">
                    <Icons name="link" className="w-5 h-5"/>
                </ToolbarButton>
                <ToolbarButton onClick={handleUngroupSelected} title="ยกเลิกการจัดกลุ่ม">
                    <Icons name="unlink" className="w-5 h-5"/>
                </ToolbarButton>
                
                <div className="h-6 w-px bg-gray-300 mx-1"></div>

                <ToolbarButton onClick={() => handleBulkUpdate({ singer: 1 })} title="ตั้งเป็นนักร้อง 1">
                    <span className="font-bold text-lg w-5 h-5 flex items-center justify-center">1</span>
                </ToolbarButton>
                <ToolbarButton onClick={() => handleBulkUpdate({ singer: 2 })} title="ตั้งเป็นนักร้อง 2">
                    <span className="font-bold text-lg w-5 h-5 flex items-center justify-center">2</span>
                </ToolbarButton>

                <div className="h-6 w-px bg-gray-300 mx-1"></div>
                <ToolbarButton onClick={() => handleDeleteLines(selectedLineIds)} title="ลบบรรทัดที่เลือก">
                    <Icons name="trash" className="w-5 h-5 text-red-600"/>
                </ToolbarButton>
            </div>
            <div className="flex-grow"></div>
            <ToolbarButton onClick={() => setSelectedLineIds([])} title="ยกเลิกการเลือกทั้งหมด">
                <Icons name="xCircle" className="w-5 h-5 text-red-600"/>
            </ToolbarButton>
        </div>
      )}

      <div className={`flex-grow overflow-y-auto pr-2 -mr-2 space-y-1`}>
        <div className="flex items-center p-2">
            <input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="form-checkbox h-5 w-5 text-blue-600 rounded" />
            <label className="ml-4 font-semibold text-gray-700">เลือกทั้งหมด</label>
        </div>
        <hr className="my-2"/>
        {lines.map(line => renderLine(line))}
      </div>

      <div className="flex justify-between items-center pt-4 shrink-0">
        <Button variant="secondary" onClick={onBack} title="กลับไปยังหน้าตั้งค่าโปรเจกต์">กลับ</Button>
        <Button onClick={handleConfirm} icon={<Icons name="next" />} title="ยืนยันโครงสร้างและเริ่มซิงก์เวลา">
            ต่อไปยังหน้าซิงก์
        </Button>
      </div>
    </Card>
    </>
  );
};