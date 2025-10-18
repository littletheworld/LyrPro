import { put, list, del, type ListBlobResultBlob } from '@vercel/blob';
import { type ProjectData } from '../types';

// This function checks for the presence of the API key and provides a clear,
// user-facing error if it's missing. This is crucial for debugging setup issues.
const getToken = (): string => {
  // Check if process.env is available at all. This is a common issue in client-side environments
  // without a specific build step to inject environment variables.
  if (typeof process === 'undefined' || typeof process.env === 'undefined') {
    const errorMessage = 'The "process.env" object is not available in this browser environment. Cloud features require a build step to inject environment variables. This is a limitation of the hosting platform, not the application itself.';
    alert(errorMessage);
    throw new Error(errorMessage);
  }
  
  // Vercel automatically provides BLOB_READ_WRITE_TOKEN.
  // We also check for API_KEY for backward compatibility or alternative setups.
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.API_KEY;
  if (!token) {
    const errorMessage = 'Cloud storage token (BLOB_READ_WRITE_TOKEN or API_KEY) was not found in `process.env`. Please ensure it is set correctly in your Vercel project settings and that your project setup (e.g., using a framework like Next.js with NEXT_PUBLIC_) exposes it to the client-side browser environment.';
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
        if (!(error instanceof Error && error.message.includes('token'))) {
          alert(`Failed to delete project from the cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        throw new Error('Failed to delete project from the cloud.');
    }
};