/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { resolveCategoryHierarchy } from '../utils/categoryTaxonomy';

interface CategoryBadgeProps {
  category?: string;
  size?: 'xs' | 'sm' | 'md';
  showGeneralOnly?: boolean;
  showSubOnly?: boolean;
  className?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  size = 'xs',
  showGeneralOnly = false,
  showSubOnly = false,
  className = ''
}) => {
  if (!category || !category.trim() || category.trim() === 'Todas') {
    return null;
  }

  const hierarchy = resolveCategoryHierarchy(category);
  const { general, subCategoryLabel, subCategoryName } = hierarchy;

  const sizeClasses = {
    xs: 'text-[9px] py-0.5 px-1.5',
    sm: 'text-[10px] py-0.5 px-2',
    md: 'text-xs py-1 px-2.5',
  }[size];

  if (showGeneralOnly) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-bold rounded-md border ${general.color.badge} ${sizeClasses} ${className}`}
        title={`Categoria Geral: ${general.name}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${general.color.dot}`} />
        <span>{general.shortName}</span>
      </span>
    );
  }

  if (showSubOnly) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-semibold rounded-md border ${general.color.badge} ${sizeClasses} ${className}`}
        title={`${general.name} › ${subCategoryName}`}
      >
        <span>{subCategoryLabel || subCategoryName}</span>
      </span>
    );
  }

  return (
    <span 
      className={`inline-flex items-center gap-1 font-medium rounded-md border ${general.color.badge} ${sizeClasses} ${className}`}
      title={`${general.name} › ${subCategoryName}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${general.color.dot} shrink-0`} />
      <span className="font-bold opacity-90">{general.shortName}</span>
      <span className="opacity-50 text-[8px]">›</span>
      <span className="font-semibold truncate max-w-[160px]">{subCategoryLabel || subCategoryName}</span>
    </span>
  );
};
