/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloudinary & Supabase Storage WebP Media Service
 * 
 * Enforces PRD Directives:
 * 1. Hard upload limit of 3MB per file (client-side validation with friendly alerts).
 * 2. Automatic frontend conversion to `.webp` format using pure Canvas before upload.
 * 3. Isolated Storage: files stored in Cloudinary CDN / Supabase Storage, saving ONLY the public HTTPS URLs in DB tables.
 */

import { getActiveDbProvider, getSupabaseClient } from './supabase';
import { validateAndSanitizeImage } from './imageSecurityService';
import { isCloudinaryActive, uploadToCloudinary } from './cloudinaryService';

export const MAX_IMAGE_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024; // Exactly 3MB
export const DEFAULT_STORAGE_BUCKET = 'product-images';

/**
 * Converts a Base64 data URL string to a standard Blob
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0].split(':')[1] || 'image/webp';
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

/**
 * Prepares, sanitizes, and uploads an image:
 * 1. Checks 3MB ceiling.
 * 2. Sanitizes and converts to pristine .webp via Canvas.
 * 3. Uploads to Cloudinary (Primary Storage & CDN) returning high-speed secure_url.
 * 4. If Cloudinary is not configured, uploads to Supabase Storage if active.
 * 5. Fallback to sanitized WebP data URL.
 */
export const uploadImageToCloudStorage = async (
  file: File | Blob,
  folder: string = 'catalog',
  options: {
    bucketName?: string;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  } = {}
): Promise<string> => {
  const {
    bucketName = DEFAULT_STORAGE_BUCKET,
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82
  } = options;

  // 1. Client-side 3MB Hard Limit Verification
  if (file.size > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    const currentMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `O arquivo selecionado possui ${currentMb} MB e excede o limite máximo permitido de 3 MB por imagem. Por favor, selecione uma imagem menor.`
    );
  }

  // 2. Convert to WebP & Sanitize Pixels
  const sanitized = await validateAndSanitizeImage(file, {
    maxWidth,
    maxHeight,
    quality,
    maxFileSizeBytes: MAX_IMAGE_UPLOAD_SIZE_BYTES,
    outputFormat: 'image/webp'
  });

  if (!sanitized.isValid || !sanitized.sanitizedBase64) {
    throw new Error(sanitized.error || 'Falha ao processar e otimizar imagem para formato WebP.');
  }

  // Double check resulting WebP size
  if (sanitized.sanitizedSizeBytes && sanitized.sanitizedSizeBytes > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    throw new Error('A imagem otimizada em WebP ainda excede o teto de 3 MB. Reduza as dimensões da foto.');
  }

  // 3. Primary: Upload to Cloudinary if configured
  if (isCloudinaryActive()) {
    try {
      const cloudinaryFolder = `stocck_rma/${folder.replace(/^stocck_rma\//, '')}`;
      const uploadRes = await uploadToCloudinary(sanitized.sanitizedBase64, cloudinaryFolder);
      if (uploadRes && uploadRes.url) {
        return uploadRes.url;
      }
    } catch (cloudinaryErr: any) {
      console.warn('Cloudinary upload attempt failed, falling back:', cloudinaryErr?.message);
      // If user configured Cloudinary but it failed with an explicit error, let them know or fallback
      if (cloudinaryErr?.message && (cloudinaryErr.message.includes('Preset') || cloudinaryErr.message.includes('Cloud Name'))) {
        throw cloudinaryErr;
      }
    }
  }

  // 4. Secondary: Upload to Supabase Storage if active
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const webpBlob = dataUrlToBlob(sanitized.sanitizedBase64);
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 9);
        const filename = `${folder}/${timestamp}_${randomId}.webp`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filename, webpBlob, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true
          });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
          if (urlData && urlData.publicUrl) {
            return urlData.publicUrl;
          }
        } else if (uploadError) {
          console.warn('Supabase storage upload failed or bucket does not exist, using optimized WebP base64 fallback:', uploadError.message);
        }
      } catch (storageErr) {
        console.warn('Error during Supabase Storage upload:', storageErr);
      }
    }
  }

  // 5. Fallback to high-efficiency WebP Data URL
  return sanitized.sanitizedBase64;
};

