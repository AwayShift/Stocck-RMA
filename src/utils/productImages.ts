/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProduct, TriageUnit } from '../types';

/**
 * Finds the base product for a triage unit by ID or SKU.
 */
export function findBaseProduct(unit: { baseProductId?: string; baseProductSku?: string }, products: BaseProduct[] = []): BaseProduct | undefined {
  if (!products || products.length === 0) return undefined;
  
  if (unit.baseProductId) {
    const foundById = products.find(p => p.id === unit.baseProductId);
    if (foundById) return foundById;
  }
  
  if (unit.baseProductSku) {
    const skuClean = unit.baseProductSku.trim().toLowerCase();
    const foundBySku = products.find(p => p.sku && p.sku.trim().toLowerCase() === skuClean);
    if (foundBySku) return foundBySku;
  }
  
  return undefined;
}

/**
 * Resolves the display product name for a triage unit or pending item,
 * prioritizing the catalog name registered in the system over generic placeholders.
 */
export function getResolvedUnitProductName(
  unit: { baseProductName?: string; baseProductId?: string; baseProductSku?: string },
  products: BaseProduct[] = []
): string {
  const baseProd = findBaseProduct(unit, products);
  const currentName = unit.baseProductName?.trim();
  const isGeneric = !currentName || 
    currentName.toLowerCase() === 'produto em análise' || 
    currentName.toLowerCase() === 'produto transferido de pendências' ||
    currentName.toLowerCase() === 'produto em analise';

  if (baseProd?.name) {
    if (isGeneric || !currentName) {
      return baseProd.name;
    }
  }

  return currentName || baseProd?.name || 'Produto Cadastrado';
}

/**
 * Extracts image URLs registered on a BaseProduct without generating new files or duplicating storage.
 */
export function getBaseProductImages(product?: BaseProduct): {
  main: string | null;
  productPhotos: string[];
  boxPhotos: string[];
  accessoriesPhotos: string[];
} {
  if (!product) {
    return { main: null, productPhotos: [], boxPhotos: [], accessoriesPhotos: [] };
  }

  const productPhotos = (product.imagesProduct && product.imagesProduct.length > 0)
    ? product.imagesProduct
    : (product.images && product.images.length > 0)
      ? product.images
      : (product.imageUrl ? [product.imageUrl] : []);

  const boxPhotos = product.imagesBox || [];
  const accessoriesPhotos = product.imagesAccessories || [];

  const main = productPhotos[0] || boxPhotos[0] || accessoriesPhotos[0] || product.imageUrl || null;

  return {
    main,
    productPhotos,
    boxPhotos,
    accessoriesPhotos
  };
}

/**
 * Resolves the display photos for a TriageUnit.
 * Only units whose destination is strictly 'Principal' (Estoque Principal) will use the base product's
 * registered image if they do not have separate triage photos.
 * Non-Principal items (Openbox, Sucata, Garantia, Doação, etc.) will NEVER fall back to the base product image.
 */
export function getUnitResolvedPhotos(
  unit: TriageUnit,
  products: BaseProduct[] = []
): {
  mainPhoto: string | null;
  photosProduct: string[];
  photosBox: string[];
  photosAccessories: string[];
  isUsingBaseProductImage: boolean;
  totalPhotosCount: number;
} {
  const isPrincipal = unit.destinationSector === 'Principal';

  const unitHasProductPhotos = Array.isArray(unit.photosProduct) && unit.photosProduct.length > 0;
  const unitHasBoxPhotos = Array.isArray(unit.photosBox) && unit.photosBox.length > 0;
  const unitHasAccPhotos = Array.isArray(unit.photosAccessories) && unit.photosAccessories.length > 0;

  let resolvedProductPhotos = unit.photosProduct || [];
  let resolvedBoxPhotos = unit.photosBox || [];
  let resolvedAccPhotos = unit.photosAccessories || [];
  let isUsingBaseProductImage = false;

  // STRICT RULE: Only use base product image for units in Estoque Principal
  if (isPrincipal) {
    const baseProduct = findBaseProduct(unit, products);
    const baseImgs = getBaseProductImages(baseProduct);

    if (!unitHasProductPhotos && baseImgs.productPhotos.length > 0) {
      resolvedProductPhotos = baseImgs.productPhotos;
      isUsingBaseProductImage = true;
    }
    if (!unitHasBoxPhotos && baseImgs.boxPhotos.length > 0) {
      resolvedBoxPhotos = baseImgs.boxPhotos;
    }
    if (!unitHasAccPhotos && baseImgs.accessoriesPhotos.length > 0) {
      resolvedAccPhotos = baseImgs.accessoriesPhotos;
    }
  }

  // Determine main photo strictly: for Principal it can come from base if resolved; for non-Principal it comes ONLY from actual triage unit photos
  const mainPhoto = resolvedProductPhotos[0] || resolvedBoxPhotos[0] || resolvedAccPhotos[0] || null;
  const totalPhotosCount = resolvedProductPhotos.length + resolvedBoxPhotos.length + resolvedAccPhotos.length;

  return {
    mainPhoto,
    photosProduct: resolvedProductPhotos,
    photosBox: resolvedBoxPhotos,
    photosAccessories: resolvedAccPhotos,
    isUsingBaseProductImage,
    totalPhotosCount
  };
}

/**
 * Returns an ultra-lightweight thumbnail URL for list/table rendering.
 * Automatically leverages Cloudinary CDN transformations (w_*, h_*, c_fit, q_auto, f_auto)
 * to save megabytes of bandwidth and render instantaneously without downloading raw 3MB files,
 * while STRICTLY preserving 100% of the product without cropping any edges (no c_fill).
 */
export function getOptimizedThumbnailUrl(
  url: string | null | undefined,
  width: number = 300,
  height: number = 300
): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  // Cloudinary dynamic URL transformation
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    // Dimension sized for crisp rendering on high-DPI screens without cropping
    const targetSize = Math.max(width, height, 400);
    const transform = `upload/c_fit,w_${targetSize},h_${targetSize},q_auto,f_auto/`;

    // If URL already contains a legacy c_fill or crop transformation, replace it with non-cropping c_fit
    if (url.includes('/upload/c_fill') || url.includes('/upload/c_crop') || url.includes('/upload/c_scale')) {
      return url.replace(/\/upload\/c_[^/]+\//, `/${transform}`);
    }

    // If it already has non-cropping c_fit or c_limit, return as is
    if (url.includes('/upload/c_fit') || url.includes('/upload/c_limit') || url.includes('/upload/c_pad')) {
      return url;
    }

    return url.replace('/upload/', `/${transform}`);
  }

  return url;
}

