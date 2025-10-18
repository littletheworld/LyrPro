import { put, list, del, type ListBlobResultBlob } from '@vercel/blob';
import { type ProjectData } from '../types';

// This function checks for the presence of the API key and provides a clear,
// user-facing error if it's missing. This is crucial for debugging setup issues.
const getToken = (): string => {
  // Vercel automatically provides BLOB_READ_WRITE_TOKEN.
  // We also check for API_KEY for backward compatibility or alternative setups.
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.API_KEY;
  if (!token) {
    const errorMessage = 'Cloud storage token (BLOB_READ_WRITE_TOKEN) is not configured. Please set the environment variable to use cloud features.';
    alert(errorMessage);
    throw new Error(errorMessage);
  }
  return token;
};

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
      token: getToken(),
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
    const { blobs } = await list({ token: getToken() });
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
    // A token is not needed to fetch a public blob.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch project file: ${response.statusText}`);
    }
    const projectData: ProjectData = await response.json();
    if (!projectData.version || !projectData.audioDataUrl || !projectData.lyrics) {
        throw new Error("Invalid project file format. The file might be corrupted.");
    }
    return projectData;
  } catch (error) {
    console.error('Error loading project from Vercel Blob:', error);
    // Re-throw with a clearer message if it's a parsing error vs. a network error.
    if (error instanceof SyntaxError) {
        throw new Error('Failed to parse project data. The file may be corrupted.');
    }
    if (error instanceof Error && error.message.includes('fetch')) {
        throw error;
    }
    throw new Error('Failed to load the project from the cloud.');
  }
};

/**
 * Deletes a project from Vercel Blob storage.
 */
export const deleteProjectFromCloud = async (url: string): Promise<void> => {
    try {
        await del(url, { token: getToken() });
    } catch (error) {
        console.error('Error deleting project from Vercel Blob:', error);
        throw new Error('Failed to delete project from the cloud.');
    }
};