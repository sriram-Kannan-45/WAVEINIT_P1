/**
 * compressImage — Client-side image resize + re-encode.
 * ─────────────────────────────────────────────────────────────────────────
 * Avatars are uploaded as base-64 data URLs inside a JSON body. Without
 * compression, a 3 MB phone photo becomes ~4.2 MB of JSON, blowing past
 * any reasonable body-parser limit and bloating the database.
 *
 * This helper:
 *   1. Reads the file via FileReader.
 *   2. Draws it into a <canvas> at a capped resolution (preserves aspect
 *      ratio).
 *   3. Re-encodes as JPEG at the requested quality.
 *   4. Returns a new File with the same name (extension changed to .jpg).
 *
 * Already-tiny files are passed through untouched so we don't waste cycles
 * re-compressing 12 KB icons.
 *
 * Usage:
 *   const compact = await compressImage(rawFile, { maxWidth: 512, quality: 0.85 })
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 512,
    maxHeight = 512,
    quality = 0.85,
    mime = 'image/jpeg',
    skipBelowBytes = 80 * 1024, // 80 KB — already small, don't bother
  } = options

  if (!file || !file.type?.startsWith('image/')) return file
  // SVG / GIF: skip — canvas re-encoding would lose animation/vector data
  if (/\b(svg|gif)\b/i.test(file.type)) return file
  if (file.size <= skipBelowBytes) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => { img.src = e.target.result }
    reader.onerror = () => reject(new Error('Could not read image'))

    img.onload = () => {
      let { width, height } = img

      // Preserve aspect ratio — only scale down, never up
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      // White background fixes JPEG transparency to white (PNGs with alpha)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image compression failed'))
            return
          }
          // Keep the original base name but switch to .jpg
          const base = (file.name || 'image').replace(/\.[^.]+$/, '')
          const compressed = new File([blob], `${base}.jpg`, {
            type: mime,
            lastModified: Date.now(),
          })
          resolve(compressed)
        },
        mime,
        quality,
      )
    }
    img.onerror = () => reject(new Error('Could not decode image'))

    reader.readAsDataURL(file)
  })
}

/** Read a File / Blob as a data URL string. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

/** Approximate decoded byte size of a base-64 data URL (4:3 expansion). */
export function dataUrlByteSize(dataUrl) {
  if (!dataUrl) return 0
  const idx = dataUrl.indexOf(',')
  const b64 = idx === -1 ? dataUrl : dataUrl.slice(idx + 1)
  return Math.floor((b64.length * 3) / 4)
}
