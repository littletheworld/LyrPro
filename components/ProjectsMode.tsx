import React, { useState, useEffect, useCallback } from 'react';
import { type ListBlobResultBlob } from '@vercel/blob';
import { listCloudProjects, loadProjectFromCloud, deleteProjectFromCloud } from '../utils/cloud';
import { type ProjectData } from '../types';
import Icons from './Icons';
import Button from './Button';
import Card from './GlassCard';

// A type for the combined data
type ProjectInfo = {
    blob: ListBlobResultBlob;
    data?: ProjectData;
    error?: boolean;
};

interface ProjectsModeProps {
    onOpenProject: (projectData: ProjectData) => void;
    onBack: () => void;
}

// A component for a single project card
const ProjectCard: React.FC<{
    projectInfo: ProjectInfo;
    onClick: () => void;
    onDelete: () => Promise<void>;
}> = ({ projectInfo, onClick, onDelete }) => {
    const { blob, data, error } = projectInfo;
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบโปรเจกต์นี้จากคลาวด์? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
            setIsDeleting(true);
            try {
                await onDelete();
            } catch (e) {
                // error alert is handled by the delete function itself
                setIsDeleting(false);
            }
        }
    };

    if (!data && !error) {
        // Loading state for this card
        return (
            <div className="bg-gray-200 rounded-2xl aspect-[4/3] flex items-center justify-center animate-pulse">
                <Icons name="folder" className="w-12 h-12 text-gray-400" />
            </div>
        );
    }

    if (error) {
         return (
            <div className="bg-red-50 border border-red-200 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-4 text-center">
                <Icons name="xCircle" className="w-12 h-12 text-red-400 mb-2" />
                <p className="text-red-700 font-semibold text-sm">โหลดไม่สำเร็จ</p>
                <p className="text-xs text-red-500 truncate">{blob.pathname}</p>
            </div>
        );
    }
    
    // Loaded state
    return (
        <div onClick={onClick} className="group relative bg-white rounded-2xl shadow-md overflow-hidden cursor-pointer transition-transform duration-300 hover:scale-105 hover:shadow-xl border border-gray-200">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={handleDelete} disabled={isDeleting} className="p-2 bg-black/50 text-white rounded-full hover:bg-red-600 disabled:bg-gray-500">
                    {isDeleting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Icons name="trash" className="w-5 h-5"/>}
                </button>
            </div>
            <img src={data.albumArtUrl || undefined} alt="Album Art" className="w-full h-2/3 object-cover bg-gray-200" onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null; // prevent looping
                target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NjYyI+PHBhdGggZD0iTTE5IDNINWMtMS4xIDAtMiAuOS0yIDJ2MTRjMCAxLjEuOSAyIDIgMmgxNGMxLjEgMCAyLS45IDItMlY1YzAtMS4xLS45LTItMi0yem0wIDE2SDVWNWgxNHYxNHptLTQuNS02TDExIDguNDYgOC41IDEySDExdjZoM3YtMmgxLjVsLTItMi41MXoiLz48L3N2Zz4=';
            }}/>
            <div className="p-3 h-1/3 flex flex-col justify-center">
                <div>
                    <h3 className="font-bold text-gray-800 truncate" title={data.songTitle}>{data.songTitle || 'Untitled'}</h3>
                    <p className="text-sm text-gray-500 truncate" title={data.artist}>{data.artist || 'Unknown Artist'}</p>
                </div>
            </div>
             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Icons name="play" className="w-16 h-16 text-white" />
            </div>
        </div>
    );
};

const ProjectsMode: React.FC<ProjectsModeProps> = ({ onOpenProject, onBack }) => {
    const [projects, setProjects] = useState<ProjectInfo[]>([]);
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

    const fetchProjects = useCallback(async () => {
        setStatus('loading');
        try {
            const cloudBlobs = await listCloudProjects();
            setProjects(cloudBlobs.map(blob => ({ blob }))); // Set placeholders first
            setStatus('idle');

            const promises = cloudBlobs.map(blob => loadProjectFromCloud(blob.url));
            const results = await Promise.allSettled(promises);

            const projectsWithData = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return { blob: cloudBlobs[index], data: result.value };
                } else {
                    console.error(`Failed to load ${cloudBlobs[index].pathname}`, result.reason);
                    return { blob: cloudBlobs[index], error: true };
                }
            });

            setProjects(projectsWithData);

        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);
    
    const handleDeleteProject = useCallback(async (projectInfo: ProjectInfo) => {
        await deleteProjectFromCloud(projectInfo.blob.url);
        setProjects(current => current.filter(p => p.blob.url !== projectInfo.blob.url));
    }, []);

    return (
        <Card className="p-6 md:p-8 space-y-6 w-full max-w-6xl mx-auto min-h-[70vh]">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">โปรเจกต์ของฉัน</h2>
                <Button onClick={onBack} variant="secondary">กลับ</Button>
            </div>
            {status === 'loading' && <p className="text-center text-gray-500 pt-16">กำลังโหลดรายการโปรเจกต์...</p>}
            {status === 'error' && <p className="text-center text-red-500 pt-16">เกิดข้อผิดพลาดในการโหลดรายการโปรเจกต์</p>}
            {status === 'idle' && projects.length === 0 && <p className="text-center text-gray-500 pt-16">ไม่พบโปรเจกต์ที่บันทึกไว้บนคลาวด์</p>}
            {status === 'idle' && projects.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {projects.map(p => (
                        <ProjectCard
                            key={p.blob.pathname}
                            projectInfo={p}
                            onClick={() => p.data && onOpenProject(p.data)}
                            onDelete={() => handleDeleteProject(p)}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
};

export default ProjectsMode;
