/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloudinary Media Storage & CDN Integration
 * 
 * Manages direct frontend image uploads to Cloudinary using Unsigned Upload Presets.
 * The PostgreSQL database (Supabase) stores ONLY the permanent CDN public URLs (`secure_url`),
 * saving 100% of Supabase Storage and database bandwidth.
 */

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  enabled: boolean;
  folder?: string;
}

const STORAGE_KEY = 'stocck_cloudinary_config';

/**
 * Loads the active Cloudinary configuration from LocalStorage or environment variables
 */
export const getCloudinaryConfig = (): CloudinaryConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          cloudName: (parsed.cloudName || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim(),
          uploadPreset: (parsed.uploadPreset || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim(),
          enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
          folder: (parsed.folder || 'stocck_rma').trim()
        };
      }
    }
  } catch (e) {
    console.warn('Could not read Cloudinary config from localStorage:', e);
  }

  return {
    cloudName: (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim(),
    uploadPreset: (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim(),
    enabled: true,
    folder: 'stocck_rma'
  };
};

/**
 * Persists updated Cloudinary configuration to LocalStorage
 */
export const saveCloudinaryConfig = (config: Partial<CloudinaryConfig>): CloudinaryConfig => {
  const current = getCloudinaryConfig();
  const updated: CloudinaryConfig = {
    ...current,
    ...config,
    cloudName: (config.cloudName !== undefined ? config.cloudName : current.cloudName).trim(),
    uploadPreset: (config.uploadPreset !== undefined ? config.uploadPreset : current.uploadPreset).trim()
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('stocck:cloudinary_config_changed', { detail: updated }));

    // Silently synchronize Cloudinary config to the central cloud database
    import('./integrationsConfigService').then(({ persistSystemIntegrationsToCloud }) => {
      persistSystemIntegrationsToCloud({ cloudinaryConfig: updated }).catch(() => {});
    }).catch(() => {});
  } catch (e) {
    console.error('Failed to save Cloudinary configuration:', e);
  }

  return updated;
};

/**
 * Checks if Cloudinary is configured and ready for direct unsigned uploads
 */
export const isCloudinaryActive = (): boolean => {
  const config = getCloudinaryConfig();
  return Boolean(config.enabled && config.cloudName && config.uploadPreset);
};

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
}

/**
 * Performs a direct client-side upload to Cloudinary via REST API
 * using an Unsigned Upload Preset.
 */
export const uploadToCloudinary = async (
  fileOrBlob: File | Blob | string,
  folder: string = 'stocck_rma/catalog'
): Promise<CloudinaryUploadResult> => {
  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.uploadPreset) {
    throw new Error(
      'Cloudinary não configurado. Por favor, acesse as Configurações e informe o "Cloud Name" e o "Upload Preset (Unsigned)".'
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`;
  const formData = new FormData();

  if (typeof fileOrBlob === 'string') {
    // Base64 data URL
    formData.append('file', fileOrBlob);
  } else {
    // File or Blob
    formData.append('file', fileOrBlob);
  }

  formData.append('upload_preset', config.uploadPreset);
  if (folder) {
    formData.append('folder', folder);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `Erro ${response.status}: Falha no upload para o Cloudinary.`;
      console.error('Cloudinary upload error response:', data);
      throw new Error(errMsg);
    }

    if (!data.secure_url) {
      throw new Error('A resposta do Cloudinary não retornou a URL segura (secure_url).');
    }

    return {
      url: data.secure_url,
      publicId: data.public_id,
      bytes: data.bytes || 0,
      format: data.format || 'webp',
      width: data.width || 0,
      height: data.height || 0
    };
  } catch (err: any) {
    console.error('Cloudinary API upload failed:', err);
    throw new Error(err.message || 'Falha ao conectar e enviar imagem para o Cloudinary.');
  }
};

/**
 * Tests connection and unsigned upload preset with a minimal 1x1 test image
 */
export const testCloudinaryConnection = async (
  cloudName: string,
  uploadPreset: string
): Promise<{ success: boolean; message: string; testUrl?: string }> => {
  const cleanCloud = cloudName.trim();
  const cleanPreset = uploadPreset.trim();

  if (!cleanCloud) {
    return { success: false, message: 'Informe o Cloud Name do Cloudinary.' };
  }
  if (!cleanPreset) {
    return { success: false, message: 'Informe o Upload Preset (modo Unsigned).' };
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cleanCloud)}/image/upload`;
  
  // 1x1 transparent WebP pixel
  const testPixelBase64 = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

  const formData = new FormData();
  formData.append('file', testPixelBase64);
  formData.append('upload_preset', cleanPreset);
  formData.append('folder', 'stocck_rma/test_connection');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || `Erro de validação (${response.status})`;
      if (msg.toLowerCase().includes('preset') || msg.toLowerCase().includes('unsigned')) {
        return {
          success: false,
          message: `Erro no Upload Preset: Certifique-se de que o preset "${cleanPreset}" foi criado com a opção "Signing Mode" marcada como "Unsigned" no Cloudinary.`
        };
      }
      if (msg.toLowerCase().includes('cloud') || msg.toLowerCase().includes('not found') || response.status === 404) {
        return {
          success: false,
          message: `Cloud Name "${cleanCloud}" não encontrado no Cloudinary. Verifique se digitou corretamente o nome da nuvem.`
        };
      }
      return { success: false, message: `Falha: ${msg}` };
    }

    if (data.secure_url) {
      return {
        success: true,
        message: 'Conexão e Upload Preset validados com sucesso no Cloudinary!',
        testUrl: data.secure_url
      };
    }

    return { success: false, message: 'Upload concluído mas sem URL retornada.' };
  } catch (err: any) {
    return {
      success: false,
      message: `Não foi possível conectar ao servidor da Cloudinary: ${err.message || 'Verifique sua conexão'}`
    };
  }
};
