import React, { useState, useCallback, useMemo } from 'react';
import { type SyncLine } from '../types';
import Button from './Button';

interface LyricEditorProps {
    selectedLine: SyncLine;
    allLines: SyncLine[];
    onUpdate: (updatedLine: SyncLine) => void;
    onClose: () => void;
}

const LyricEditor: React.FC<LyricEditorProps> = ({ selectedLine, allLines, onUpdate, onClose }) => {
    const [label, setLabel] = useState(selectedLine.label || '');
    const [mainText, setMainText] = useState(selectedLine.chars.join(''));
    const [adlibTexts, setAdlibTexts] = useState<Record<string, string>>(
        Object.fromEntries(selectedLine.adlibs.map(adlib => [adlib.id, adlib.chars.join('')]))
    );
    
    const initialGroupMembers = useMemo(() => {
        if (!selectedLine.groupId) return [selectedLine.id];
        return allLines.filter(l => l.groupId === selectedLine.groupId).map(l => l.id);
    }, [selectedLine, allLines]);

    const [groupMembers, setGroupMembers] = useState<string[]>(initialGroupMembers);

    const handleGroupMemberToggle = (lineId: string) => {
        setGroupMembers(prev => 
            prev.includes(lineId) 
            ? prev.filter(id => id !== lineId) 
            : [...prev, lineId]
        );
    };
    
    const handleAdlibTextChange = (adlibId: string, text: string) => {
        setAdlibTexts(prev => ({ ...prev, [adlibId]: text }));
    };

    const handleSaveChanges = useCallback(() => {
        let finalLineState = { ...selectedLine };
    
        // 1. Process Text Changes
        // When text is changed, the timing is reset for that part.
        const mainTextChanged = mainText !== selectedLine.chars.join('');
        if (mainTextChanged) {
            const newChars = [...mainText];
            finalLineState.chars = newChars;
            finalLineState.time = new Array(newChars.length).fill(null);
        }
        
        const newAdlibs = finalLineState.adlibs.map(adlib => {
            const newText = adlibTexts[adlib.id];
            if (newText !== undefined && newText !== adlib.chars.join('')) {
                const newChars = [...newText];
                return { ...adlib, chars: newChars, time: new Array(newChars.length).fill(null) };
            }
            return adlib;
        });
        finalLineState.adlibs = newAdlibs;

        // 2. Process Label Change
        finalLineState.label = label;

        // 3. Process Grouping Changes
        let newGroupId = selectedLine.groupId;
        if (groupMembers.length > 1) {
            newGroupId = selectedLine.groupId || `group-${crypto.randomUUID()}`;
        } else {
            newGroupId = undefined;
        }

        const allMemberIds = new Set([...initialGroupMembers, ...groupMembers]);

        allMemberIds.forEach(lineId => {
            // The selected line will be updated once at the very end with all changes.
            if (lineId === selectedLine.id) return;

            const originalLine = allLines.find(l => l.id === lineId);
            if (!originalLine) return;
            
            const isNowMember = groupMembers.includes(lineId);
            const targetGroupId = isNowMember ? newGroupId : undefined;

            // Update other lines only if their group ID changes.
            if (originalLine.groupId !== targetGroupId) {
                onUpdate({ ...originalLine, groupId: targetGroupId });
            }
        });

        // 4. Commit all changes for the selected line
        finalLineState.groupId = groupMembers.includes(selectedLine.id) ? newGroupId : undefined;
        onUpdate(finalLineState);

        onClose();
    }, [
        selectedLine, mainText, adlibTexts, label, groupMembers,
        initialGroupMembers, allLines, onUpdate, onClose
    ]);

    return (
        <div className="space-y-4 text-sm text-gray-700">
            <div>
                <label className="font-semibold block mb-1">ป้ายกำกับ (เช่น Verse 1)</label>
                <input 
                    type="text" 
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Verse 1, Chorus, Duet..."
                    className="w-full p-2 bg-gray-100 rounded-md border border-gray-300 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
            </div>
            
            <div>
                <label className="font-semibold block mb-1">เนื้อเพลง</label>
                 <textarea
                    value={mainText}
                    onChange={(e) => setMainText(e.target.value)}
                    placeholder="เนื้อเพลงหลัก"
                    className="w-full p-2 bg-gray-100 rounded-md border border-gray-300 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y"
                    rows={2}
                />
                {selectedLine.adlibs.length > 0 && (
                    <div className="mt-2 space-y-1">
                        {selectedLine.adlibs.map(adlib => (
                            <input
                                key={adlib.id}
                                type="text"
                                value={adlibTexts[adlib.id] || ''}
                                onChange={(e) => handleAdlibTextChange(adlib.id, e.target.value)}
                                placeholder="เนื้อเพลงเสริม (Ad-lib)"
                                className="w-full p-2 bg-gray-50 rounded-md border border-gray-200 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h4 className="font-semibold block mb-1">จัดกลุ่ม (ร้องพร้อมกัน)</h4>
                <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded-md border space-y-1">
                    {allLines.map(line => (
                        <label key={line.id} className="flex items-center gap-2 p-1 rounded hover:bg-gray-200 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={groupMembers.includes(line.id)}
                                onChange={() => handleGroupMemberToggle(line.id)}
                                className="form-checkbox text-blue-600 rounded"
                            />
                            <span className="truncate">{line.chars.join('') || '(บรรทัดว่าง)'}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="flex justify-between items-center pt-2">
                <Button onClick={handleSaveChanges}>
                    บันทึก
                </Button>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-800 font-medium">
                    ปิด
                </button>
            </div>
        </div>
    );
};

export default LyricEditor;