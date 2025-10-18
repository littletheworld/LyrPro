import { put, list, del, type ListBlobResultBlob } from '@vercel/blob';
import { type ProjectData } from '../types';

// Client-side Vercel Blob operations require a token.
// The platform provides a unified API key for services.
const BLOB_TOKEN = process.env.API_KEY;

/**
 * Uploads the project data to Vercel Blob storage.
 */
export const uploadProjectToCloud = async (projectData: ProjectData): Promise<string> => {
  const sanitizedTitle = (projectData.songTitle || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const sanitizedArtist = (projectData.artist || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `${sanitizedArtist}-${sanitizedTitle}-${Date.now()}.lsk`;

  const projectContent = JSON.stringify(projectData);
  const projectFile = new File([projectContent], fileName, { type: 'application/json' });

  try {
    const blob = await put(fileName, projectFile, {
      access: 'public',
      token: BLOB_TOKEN,
    });
    return blob.url;
  } catch (error) {
    console.error('Error uploading to Vercel Blob:', error);
    throw new Error('Failed to save project to the cloud.');
  }
};

/**
 * Lists all projects from Vercel Blob storage.
 */
export const listCloudProjects = async (): Promise<ListBlobResultBlob[]> => {
  try {
    const { blobs } = await list({ token: BLOB_TOKEN });
    return blobs
      .filter(blob => blob.pathname.endsWith('.lsk'))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  } catch (error) {
    console.error('Error listing projects from Vercel Blob:', error);
    throw new Error('Failed to list cloud projects.');
  }
};

/**
 * Loads a project from a given Vercel Blob URL.
 */
export const loadProjectFromCloud = async (url: string): Promise<ProjectData> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.statusText}`);
    }
    const projectData: ProjectData = await response.json();
    if (!projectData.version || !projectData.audioDataUrl || !projectData.lyrics) {
        throw new Error("Invalid project file format");
    }
    return projectData;
  } catch (error) {
    console.error('Error loading project from Vercel Blob:', error);
    throw new Error('Failed to load project from the cloud.');
  }
};

/**
 * Deletes a project from Vercel Blob storage.
 */
export const deleteProjectFromCloud = async (url: string): Promise<void> => {
    try {
        await del(url, { token: BLOB_TOKEN });
    } catch (error) {
        console.error('Error deleting project from Vercel Blob:', error);
        throw new Error('Failed to delete project from the cloud.');
    }
};
