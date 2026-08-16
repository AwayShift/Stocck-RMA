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
