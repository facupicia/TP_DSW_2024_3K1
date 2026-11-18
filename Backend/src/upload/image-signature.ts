// Only allow the raster formats accepted by the upload endpoint. Cloudinary's
// image decoder remains responsible for validating the complete image stream.
export function detectImageMime(buffer: Buffer): string | null {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'image/gif';
    if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP'
        && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))) return 'image/webp';
    return null;
}
