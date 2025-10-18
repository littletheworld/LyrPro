// utils/colorExtractor.ts
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Simple function to convert RGB to Hex
function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


export const extractDominantColors = (imageUrl: string): Promise<string[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    // Set crossOrigin to anonymous to prevent canvas tainting from blob URLs or other origins
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    const fallback = () => resolve(['#302b63', '#0f0c29']);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        fallback();
        return;
      }

      const size = 50; // Analyze a smaller version for performance
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      try {
        const imageData = ctx.getImageData(0, 0, size, size).data;
        const colorCounts: { [key: string]: number } = {};
        const step = 4 * 5; // Sample every 5th pixel

        for (let i = 0; i < imageData.length; i += step) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];

          if (a < 128) continue; // Skip transparent pixels

          // Simple binning to group similar colors
          const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
          colorCounts[key] = (colorCounts[key] || 0) + 1;
        }

        const sortedColors = Object.entries(colorCounts).sort(([, a], [, b]) => b - a);

        const dominantColors = sortedColors.slice(0, 4).map(([key]) => {
          const [r, g, b] = key.split(',').map(v => parseInt(v, 10) * 32);
          
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);

          if (brightness < 40 || brightness > 225 || saturation < 35) {
            return null;
          }
          return { r, g, b };
        }).filter((c): c is RGB => c !== null);

        if (dominantColors.length < 2) {
            fallback();
        } else {
            // Pick the most dominant and a second, different one
            const finalColors = [dominantColors[0]];
            const secondColor = dominantColors.find(c => 
                Math.abs(c.r - dominantColors[0].r) > 32 ||
                Math.abs(c.g - dominantColors[0].g) > 32 ||
                Math.abs(c.b - dominantColors[0].b) > 32
            );
            finalColors.push(secondColor || (dominantColors[1] || {r: 15, g: 12, b: 41}));

            resolve(finalColors.map(rgbToHex));
        }
      } catch (e) {
        console.error("Error processing image data:", e);
        fallback();
      }
    };
    img.onerror = () => {
      console.error("Failed to load image for color extraction");
      fallback();
    };
  });
};
