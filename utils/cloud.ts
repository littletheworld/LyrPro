import { put, list, del, type ListBlobResultBlob } from '@vercel/blob';
import { type ProjectData } from '../types';

// This function reads the token from Vite's `import.meta.env` object,
// which is the correct way to access environment variables on the client side.
const getToken = (): string => {
  // Vite exposes env variables on import.meta.env.
  // To expose a variable to the client, it MUST be prefixed with `VITE_`.
  const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN || import.meta.env.VITE_API_KEY;

  if (!token) {
    const errorMessage = 'Cloud storage token was not found. Please set `VITE_BLOB_READ_WRITE_TOKEN` as an environment variable in your Vercel project settings. The "VITE_" prefix is required for it to be accessible in the browser.';
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
    // Avoid showing the generic alert again if getToken already did.
    if (!(error instanceof Error && error.message.includes('token'))) {
      alert(`Failed to save project to the cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
     if (!(error instanceof Error && error.message.includes('token'))) {
      alert(`Failed to list cloud projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    throw new Error('Failed to list cloud projects.');
  }
};

/**
 * Loads a project from a given Vercel Blob URL.
 */
export const loadProjectFromCloud = async (url: string): Promise<ProjectData> => {
  try {
    // A token isisis not needed to fetch a public blob.
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
        if (!(error instanceof Error && error.message.includes('token'))) {
          alert(`Failed to delete project from the cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        throw new Error('Failed to delete project from the cloud.');
    }
};
