/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Database, 
  X, 
  Check, 
  Sparkles, 
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { BaseProduct } from '../types';
import { uploadFileToStorage } from '../lib/dbService';

interface BaseCatalogProps {
  products: BaseProduct[];
  onSaveProduct: (product: BaseProduct) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  userRole?: 'admin' | 'operator' | null;
}

export default function BaseCatalog({ products, onSaveProduct, onDeleteProduct, userRole }: BaseCatalogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedVoltage, setSelectedVoltage] = useState('Todas');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BaseProduct | null>(null);
  const [viewingProduct, setViewingProduct] = useState<BaseProduct | null>(null);
  const [activeViewImageIndex, setActiveViewImageIndex] = useState<number>(0);

  useEffect(() => {
    setActiveViewImageIndex(0);
  }, [viewingProduct]);

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomPosition, setZoomPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isZoomDragging, setIsZoomDragging] = useState<boolean>(false);
  const [zoomDragStart, setZoomDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    setZoomScale(1);
    setZoomPosition({ x: 0, y: 0 });
    setIsZoomDragging(false);
  }, [zoomedImage]);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [voltage, setVoltage] = useState<'110V' | '220V' | 'Bivolt' | 'N/A'>('Bivolt');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imagesProduct, setImagesProduct] = useState<string[]>([]);
  const [imagesBox, setImagesBox] = useState<string[]>([]);
  const [imagesAccessories, setImagesAccessories] = useState<string[]>([]);
  const [activeUploadCategory, setActiveUploadCategory] = useState<'product' | 'box' | 'accessories'>('product');
  const activeUploadCategoryRef = useRef(activeUploadCategory);

  useEffect(() => {
    activeUploadCategoryRef.current = activeUploadCategory;
  }, [activeUploadCategory]);
  const [accessories, setAccessories] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPasteFocused, setIsPasteFocused] = useState(false);

  // Quill Editor refs
  const quillContainerRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<any>(null);

  // Dynamic Quill.js CDN loader and lifecycle
  useEffect(() => {
    if (!isFormOpen) {
      if (quillInstanceRef.current) {
        quillInstanceRef.current = null;
      }
      return;
    }

    let quillScript: HTMLScriptElement | null = null;
    let quillStyle: HTMLLinkElement | null = null;

    const initQuill = () => {
      if (quillContainerRef.current && (window as any).Quill && !quillInstanceRef.current) {
        const parent = quillContainerRef.current.parentNode;
        if (parent) {
          const toolbars = parent.querySelectorAll('.ql-toolbar');
          toolbars.forEach(tb => tb.remove());
        }
        quillContainerRef.current.innerHTML = '';

        quillInstanceRef.current = new (window as any).Quill(quillContainerRef.current, {
          theme: 'snow',
          placeholder: 'Insira as especificações técnicas, características e detalhes gerais do produto...',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [
                { 'color': [
                  '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
                  '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff',
                  '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff',
                  '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24b2',
                  '#444444', '#5c0000', '#663d00', '#666600', '#003700', '#002966', '#3d1466'
                ] },
                { 'background': [
                  'transparent', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
                  '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff',
                  '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff',
                  '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24b2',
                  '#444444', '#5c0000', '#663d00', '#666600', '#003700', '#002966', '#000000'
                ] }
              ],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['clean']
            ]
          }
        });

        // Set initial state
        quillInstanceRef.current.root.innerHTML = description;

        // Listen for changes
        quillInstanceRef.current.on('text-change', () => {
          setDescription(quillInstanceRef.current.root.innerHTML);
        });

        // Block image paste in description field
        quillInstanceRef.current.root.addEventListener('paste', (e: ClipboardEvent) => {
          const items = e.clipboardData?.items;
          if (items) {
            let hasImage = false;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                hasImage = true;
                break;
              }
            }
            if (hasImage) {
              e.preventDefault();
              e.stopPropagation();
              setErrorMessage('Imagens não são permitidas no campo de descrição. Use a seção "Anexos e Imagens" abaixo para colar/anexar.');
              setTimeout(() => setErrorMessage(''), 5000);
            }
          }
        }, true);
      }
    };

    const timer = setTimeout(() => {
      if (!(window as any).Quill) {
        quillStyle = document.createElement('link');
        quillStyle.rel = 'stylesheet';
        quillStyle.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css';
        document.head.appendChild(quillStyle);

        quillScript = document.createElement('script');
        quillScript.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js';
        quillScript.async = true;
        quillScript.onload = () => {
          initQuill();
        };
        document.body.appendChild(quillScript);
      } else {
        initQuill();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (quillInstanceRef.current) {
        quillInstanceRef.current = null;
      }
    };
  }, [isFormOpen]);

  // Image upload handler
  const handleImagesUpload = async (files: FileList | File[] | null) => {
    if (!files) return;
    setIsUploading(true);
    setErrorMessage('');
    const fileArray = Array.from(files);
    const promises = fileArray.map(file => uploadFileToStorage(file, 'catalog_products'));
    try {
      const urls = await Promise.all(promises);
      const currentCategory = activeUploadCategoryRef.current;
      if (currentCategory === 'product') {
        setImagesProduct(prev => [...prev, ...urls]);
      } else if (currentCategory === 'box') {
        setImagesBox(prev => [...prev, ...urls]);
      } else if (currentCategory === 'accessories') {
        setImagesAccessories(prev => [...prev, ...urls]);
      }
      setImages(prev => [...prev, ...urls]);
      setSuccessMessage('Fotos enviadas com sucesso!');
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (err) {
      setErrorMessage('Erro ao realizar upload das fotos.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle clipboard paste of files (Ctrl + V)
  useEffect(() => {
    if (!isFormOpen) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if the active element is inside the description editor
      const activeEl = document.activeElement;
      if (activeEl && activeEl.closest('.ql-editor')) {
        return;
      }

      const pastedFiles: File[] = [];

      // 1. Check clipboardData.files (files copied from filesystem)
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          const file = e.clipboardData.files[i];
          if (file.type.indexOf('image/') !== -1) {
            pastedFiles.push(file);
          }
        }
      }

      // 2. Check clipboardData.items (screenshot / copied web images)
      if (pastedFiles.length === 0 && e.clipboardData?.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              pastedFiles.push(file);
            }
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleImagesUpload(pastedFiles);
        setIsPasteFocused(false);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isFormOpen]);

  const handleRemoveImage = (index: number) => {
    const currentCategory = activeUploadCategoryRef.current;
    if (currentCategory === 'product') {
      const removedUrl = imagesProduct[index];
      setImagesProduct(prev => prev.filter((_, i) => i !== index));
      setImages(prev => prev.filter(url => url !== removedUrl));
    } else if (currentCategory === 'box') {
      const removedUrl = imagesBox[index];
      setImagesBox(prev => prev.filter((_, i) => i !== index));
      setImages(prev => prev.filter(url => url !== removedUrl));
    } else if (currentCategory === 'accessories') {
      const removedUrl = imagesAccessories[index];
      setImagesAccessories(prev => prev.filter((_, i) => i !== index));
      setImages(prev => prev.filter(url => url !== removedUrl));
    }
  };

  // Handle opening form for adding a new product
  const handleAddClick = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setVoltage('Bivolt');
    setBrand('');
    setCategory('');
    setDescription('');
    setImages([]);
    setImagesProduct([]);
    setImagesBox([]);
    setImagesAccessories([]);
    setActiveUploadCategory('product');
    setAccessories('');
    setErrorMessage('');
    setSuccessMessage('');
    setIsPasteFocused(false);
    setIsFormOpen(true);
  };

  // Handle opening form for editing a product
  const handleEditClick = (p: BaseProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setVoltage(p.voltage);
    setBrand(p.brand || '');
    setCategory(p.category || '');
    setDescription(p.description || '');
    
    const fallbackImages = p.images || (p.imageUrl ? [p.imageUrl] : []);
    setImages(fallbackImages);
    setImagesProduct(p.imagesProduct || fallbackImages);
    setImagesBox(p.imagesBox || []);
    setImagesAccessories(p.imagesAccessories || []);
    setActiveUploadCategory('product');
    
    setAccessories(p.accessories || '');
    setErrorMessage('');
    setSuccessMessage('');
    setIsPasteFocused(false);
    setIsFormOpen(true);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim()) {
      setErrorMessage('O nome do produto é obrigatório.');
      return;
    }
    if (!sku.trim()) {
      setErrorMessage('O SKU é obrigatório.');
      return;
    }

    const cleanSku = sku.trim().toUpperCase();

    // Check for SKU duplicates (excluding the current product being edited)
    const duplicate = products.find(p => p.sku.toUpperCase() === cleanSku && p.id !== editingProduct?.id);
    if (duplicate) {
      setErrorMessage(`O SKU "${cleanSku}" já está cadastrado para o produto "${duplicate.name}".`);
      return;
    }

    const productToSave: BaseProduct = {
      id: editingProduct ? editingProduct.id : 'bp-' + Date.now(),
      name: name.trim(),
      sku: cleanSku,
      voltage,
      brand: brand.trim(),
      category: category.trim(),
      description: description.trim(),
      imageUrl: imagesProduct[0] || imagesBox[0] || imagesAccessories[0] || images[0] || '',
      images: [...imagesProduct, ...imagesBox, ...imagesAccessories],
      imagesProduct,
      imagesBox,
      imagesAccessories,
      accessories: accessories.trim(),
    };

    try {
      await onSaveProduct(productToSave);
      setSuccessMessage(editingProduct ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
      
      // Reset form states if it was an add operation
      if (!editingProduct) {
        setName('');
        setSku('');
        setVoltage('Bivolt');
        setBrand('');
        setCategory('');
        setDescription('');
        setImages([]);
        setImagesProduct([]);
        setImagesBox([]);
        setImagesAccessories([]);
        setAccessories('');
      }

      // Automatically close modal after 1.5 seconds
      setTimeout(() => {
        setIsFormOpen(false);
        setSuccessMessage('');
      }, 1500);

    } catch (err) {
      console.error(err);
      setErrorMessage('Erro ao salvar produto no banco de dados.');
    }
  };

  // Handle deletion (using custom state-based confirmation)
  const handleDeleteClick = (id: string, productName: string) => {
    setConfirmConfig({
      title: 'Excluir Produto do Catálogo',
      message: `Tem certeza de que deseja excluir o produto "${productName}" do Catálogo de Base? Isso removerá a referência permanente para triagens futuras.`,
      onConfirm: async () => {
        try {
          await onDeleteProduct(id);
        } catch (err) {
          console.error(err);
          // show inline error instead of window alert
          setErrorMessage('Erro ao excluir produto. Verifique seus privilégios RBAC.');
          setTimeout(() => setErrorMessage(''), 4000);
        }
      }
    });
  };

  // Dynamically extract unique categories for the filters
  const uniqueCategories = React.useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
  }, [products]);

  // Filter products by SKU or Name/Model, Category, and Voltage
  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesTerm = p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    const matchesVoltage = selectedVoltage === 'Todas' || p.voltage === selectedVoltage;
    return matchesTerm && matchesCategory && matchesVoltage;
  });

  return (
    <div className="space-y-6" id="base-catalog-container">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="catalog-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Database className="text-sky-400 w-6 h-6" />
            Catálogo de Base
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Cadastre os produtos oficiais da empresa para padronizar e facilitar a triagem de devoluções.
          </p>
        </div>
        {userRole === 'admin' && (
          <button 
            onClick={handleAddClick}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 transition-all cursor-pointer"
            id="btn-add-product"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Produto Master
          </button>
        )}
      </div>

      {/* Main Catalog View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden" id="catalog-main-card">
        {/* Search and filters controls bar */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 space-y-4" id="catalog-search-bar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Filter by Model / SKU */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modelo do Produto / SKU</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Buscar por Modelo, Nome ou SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors font-sans"
                  id="input-catalog-search"
                />
              </div>
            </div>

            {/* Filter by Category */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoria</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
                id="select-filter-category"
              >
                <option value="Todas">Todas as Categorias</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Filter by Voltage */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tensão / Voltagem</label>
              <select
                value={selectedVoltage}
                onChange={(e) => setSelectedVoltage(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
                id="select-filter-voltage"
              >
                <option value="Todas">Todas as Tensões</option>
                <option value="110V">110V</option>
                <option value="220V">220V</option>
                <option value="Bivolt">Bivolt</option>
                <option value="N/A">N/A (USB / Pilhas)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-850">
            <span>Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong> produtos</span>
            {(searchTerm || selectedCategory !== 'Todas' || selectedVoltage !== 'Todas') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('Todas');
                  setSelectedVoltage('Todas');
                }}
                className="text-sky-400 hover:text-sky-300 font-bold transition-colors cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table representation */}
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center bg-slate-950" id="catalog-empty-state">
            <Database className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold text-sm">Nenhum produto cadastrado com os critérios.</p>
            <p className="text-slate-500 text-xs mt-1">Insira um novo produto para que ele apareça no cadastro da empresa.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" id="catalog-table-wrapper">
            <table className="w-full border-collapse text-left text-sm text-slate-200" id="catalog-table">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-medium uppercase text-xs tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">SKU Identificador</th>
                  <th scope="col" className="px-6 py-4">Nome do Produto</th>
                  <th scope="col" className="px-6 py-4">Voltagem Padrão</th>
                  <th scope="col" className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900" id="catalog-table-body">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-800/50 transition-colors" id={`product-row-${product.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-sky-400">
                      {product.sku}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">
                      <div 
                        onClick={() => setViewingProduct(product)}
                        className="flex items-center gap-3 cursor-pointer group/item hover:opacity-90"
                        title="Ver detalhes do produto"
                      >
                        {product.imageUrl ? (
                          <div className="relative group/thumb">
                            <img src={product.imageUrl} alt={product.name} className="w-10 h-10 object-cover rounded-lg border border-slate-800 group-hover/item:border-sky-500 bg-slate-950 flex-shrink-0 transition-colors" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-[10px] text-slate-500 font-mono flex-shrink-0 group-hover/item:border-sky-500 transition-colors">
                            N/D
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white group-hover/item:text-sky-400 transition-colors flex items-center gap-1.5">
                            {product.name}
                            <Eye className="w-3.5 h-3.5 opacity-0 group-hover/item:opacity-100 text-sky-400 transition-opacity" />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            {product.brand && (
                              <span className="bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-750">
                                Marca: <strong className="text-slate-350">{product.brand}</strong>
                              </span>
                            )}
                            {product.category && (
                              <span className="bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-750">
                                Cat: <strong className="text-slate-350">{product.category}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        product.voltage === 'Bivolt' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                        product.voltage === '110V' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                        product.voltage === '220V' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {product.voltage}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-2">
                        <button 
                          onClick={() => setViewingProduct(product)}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-sky-450 rounded-lg border border-slate-850 transition-colors cursor-pointer"
                          title="Visualizar informações completas"
                          id={`btn-view-${product.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {userRole === 'admin' && (
                          <>
                            <button 
                              onClick={() => handleEditClick(product)}
                              className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-850 transition-colors cursor-pointer"
                              title="Editar produto"
                              id={`btn-edit-${product.id}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteClick(product.id, product.name)}
                              className="p-1.5 bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-850 hover:border-rose-500/30 transition-colors cursor-pointer"
                              title="Excluir produto"
                              id={`btn-delete-${product.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

       {/* Add / Edit Product Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto py-10" id="catalog-form-modal">
          <style>{`
            #catalog-form-modal .ql-toolbar.ql-snow {
              background-color: #0f172a !important;
              border: 1px solid #1e293b !important;
              border-top-left-radius: 0.75rem !important;
              border-top-right-radius: 0.75rem !important;
              padding: 8px 12px !important;
              display: flex !important;
              align-items: center !important;
              flex-wrap: wrap !important;
              gap: 16px !important;
            }
            #catalog-form-modal .ql-toolbar.ql-snow .ql-formats {
              display: inline-flex !important;
              align-items: center !important;
              gap: 4px !important;
              margin-right: 0 !important;
              margin-bottom: 0 !important;
            }
            #catalog-form-modal .ql-container.ql-snow {
              background-color: #0b1329 !important;
              border: 1px solid #1e293b !important;
              border-top: none !important;
              border-bottom-left-radius: 0.75rem !important;
              border-bottom-right-radius: 0.75rem !important;
              color: #f1f5f9 !important;
              font-size: 0.875rem !important;
            }
            #catalog-form-modal .ql-editor {
              min-height: 120px !important;
              max-height: 180px !important;
            }
            #catalog-form-modal .ql-toolbar .ql-stroke:not(.ql-color-label) {
              stroke: #cbd5e1 !important;
            }
            #catalog-form-modal .ql-toolbar .ql-fill:not(.ql-color-label) {
              fill: #cbd5e1 !important;
            }
            #catalog-form-modal .ql-toolbar button {
              width: 28px !important;
              height: 28px !important;
              padding: 4px !important;
              border-radius: 0.375rem !important;
              transition: all 0.15s ease !important;
              color: #cbd5e1 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
            }
            #catalog-form-modal .ql-toolbar button:hover {
              background-color: #1e293b !important;
              color: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar button:hover .ql-stroke:not(.ql-color-label) {
              stroke: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar button:hover .ql-fill:not(.ql-color-label) {
              fill: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar button.ql-active {
              background-color: #1e293b !important;
              color: #38bdf8 !important;
            }
            #catalog-form-modal .ql-toolbar button.ql-active .ql-stroke:not(.ql-color-label) {
              stroke: #38bdf8 !important;
            }
            #catalog-form-modal .ql-toolbar button.ql-active .ql-fill:not(.ql-color-label) {
              fill: #38bdf8 !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker {
              color: #cbd5e1 !important;
              height: 28px !important;
              display: inline-flex !important;
              align-items: center !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker.ql-header {
              width: 96px !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker:not(.ql-color-picker) .ql-picker-label {
              padding-left: 6px !important;
              padding-right: 20px !important;
              border: 1px solid #1e293b !important;
              background-color: #0b1329 !important;
              border-radius: 0.375rem !important;
              height: 28px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: space-between !important;
              font-size: 0.8125rem !important;
              color: #cbd5e1 !important;
              transition: all 0.15s ease !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker:not(.ql-color-picker) .ql-picker-label:hover {
              border-color: #334155 !important;
              color: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker:not(.ql-color-picker) .ql-picker-label svg {
              right: 6px !important;
              width: 12px !important;
              height: 12px !important;
            }
            /* Specific styling for the color and background pickers to look like icon buttons */
            #catalog-form-modal .ql-toolbar .ql-color-picker {
              width: 28px !important;
              height: 28px !important;
            }
            #catalog-form-modal .ql-toolbar .ql-color-picker .ql-picker-label {
              width: 28px !important;
              height: 28px !important;
              border: none !important;
              background-color: transparent !important;
              padding: 5px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              border-radius: 0.375rem !important;
              transition: all 0.15s ease !important;
              cursor: pointer !important;
              position: relative !important;
            }
            #catalog-form-modal .ql-toolbar .ql-color-picker .ql-picker-label:hover,
            #catalog-form-modal .ql-toolbar .ql-color-picker.ql-expanded .ql-picker-label {
              background-color: #1e293b !important;
            }
            #catalog-form-modal .ql-toolbar .ql-color-picker .ql-picker-label svg {
              width: 18px !important;
              height: 18px !important;
              position: static !important;
              display: block !important;
            }
            #catalog-form-modal .ql-toolbar .ql-color-picker .ql-picker-label:hover .ql-stroke:not(.ql-color-label),
            #catalog-form-modal .ql-toolbar .ql-color-picker.ql-expanded .ql-picker-label .ql-stroke:not(.ql-color-label) {
              stroke: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar .ql-color-picker .ql-picker-label:hover .ql-fill:not(.ql-color-label),
            #catalog-form-modal .ql-toolbar .ql-color-picker.ql-expanded .ql-picker-label .ql-fill:not(.ql-color-label) {
              fill: #ffffff !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker-options {
              background-color: #0f172a !important;
              border: 1px solid #1e293b !important;
              border-radius: 0.5rem !important;
              z-index: 100 !important;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
              padding: 4px !important;
              max-height: 250px !important;
              overflow-y-auto !important;
            }
            #catalog-form-modal .ql-snow .ql-picker.ql-expanded .ql-picker-options {
              background-color: #0f172a !important;
              border-color: #334155 !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker-options .ql-picker-item {
              color: #94a3b8 !important;
              padding: 4px 8px !important;
              border-radius: 0.25rem !important;
              cursor: pointer !important;
              font-size: 0.8125rem !important;
              transition: all 0.1s ease !important;
            }
            #catalog-form-modal .ql-toolbar .ql-picker-options .ql-picker-item:hover,
            #catalog-form-modal .ql-toolbar .ql-picker-options .ql-picker-item.ql-selected {
              background-color: #1e293b !important;
              color: #ffffff !important;
            }
                        /* Styling for the Quill color & background picker popups */
            #catalog-form-modal .ql-snow .ql-color-picker.ql-expanded .ql-picker-options {
              display: grid !important;
              grid-template-columns: repeat(7, 18px) !important;
              justify-content: center !important;
              gap: 6px !important;
              width: 182px !important;
              padding: 10px !important;
              background-color: #0f172a !important;
              border: 1px solid #334155 !important;
              border-radius: 0.5rem !important;
              max-height: none !important;
            }
            #catalog-form-modal .ql-snow .ql-color-picker .ql-picker-item {
              width: 18px !important;
              height: 18px !important;
              border-radius: 4px !important;
              border: 1px solid rgba(255, 255, 255, 0.25) !important;
              cursor: pointer !important;
              float: none !important;
              margin: 0 !important;
              box-sizing: border-box !important;
            }
            #catalog-form-modal .ql-snow .ql-color-picker .ql-picker-item:hover,
            #catalog-form-modal .ql-snow .ql-color-picker .ql-picker-item.ql-selected {
              border-color: #ffffff !important;
              transform: scale(1.15) !important;
            }
            #catalog-form-modal .ql-snow .ql-color-picker .ql-picker-item[data-value="transparent"] {
              background-color: transparent !important;
              position: relative !important;
              overflow: hidden !important;
              border-color: rgba(255, 255, 255, 0.3) !important;
            }
            #catalog-form-modal .ql-snow .ql-color-picker .ql-picker-item[data-value="transparent"]::after {
              content: "" !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              background: linear-gradient(45deg, transparent 40%, #ef4444 40%, #ef4444 60%, transparent 60%) !important;
            }
          `}</style>
          
          <div className="w-full max-w-3xl bg-[#111c2e] border border-slate-800 rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-[#0c1421]">
              <h3 className="text-base font-black text-white">
                {editingProduct ? 'Editar Produto Master' : 'Cadastrar Novo Produto'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {errorMessage && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Nome do Produto and SKU Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Name Field */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Nome do Produto *</label>
                  <input 
                    type="text"
                    placeholder="Ex: Fritadeira Elétrica AirFryer Touch"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-600"
                    id="input-product-name"
                  />
                </div>

                {/* SKU Field */}
                <div className="md:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 font-mono">SKU *</label>
                  <input 
                    type="text"
                    placeholder="Ex: AIR-FRY-45L"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    disabled={!!editingProduct}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-slate-200 uppercase focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono placeholder:text-slate-600"
                    id="input-product-sku"
                  />
                </div>
              </div>

              {/* Descrição / Especificações */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Descrição / Especificações</label>
                <div className="text-slate-200 relative">
                  <div ref={quillContainerRef} id="quill-editor" className="text-sm"></div>
                </div>
              </div>

              {/* Voltagem and Inclui (Acessórios) Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Voltage Dropdown */}
                <div className="md:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Voltagem</label>
                  <select 
                    value={voltage}
                    onChange={(e) => setVoltage(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                    id="select-product-voltage"
                  >
                    <option value="110V">110V</option>
                    <option value="220V">220V</option>
                    <option value="Bivolt">Bivolt</option>
                    <option value="N/A">N/A (USB / Pilhas)</option>
                  </select>
                </div>

                {/* Accessories Included */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Inclui (Acessórios)</label>
                  <input 
                    type="text"
                    placeholder="Ex: Cabo HDMI, Carregador..."
                    value={accessories}
                    onChange={(e) => setAccessories(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-600"
                    id="input-product-accessories"
                  />
                </div>
              </div>

              {/* Marca e Categoria Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Brand Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Marca</label>
                  <input 
                    type="text"
                    placeholder="Ex: Electrolux, Philips, Samsung..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-600"
                    id="input-product-brand"
                  />
                </div>

                {/* Category Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Categoria</label>
                  <input 
                    type="text"
                    placeholder="Ex: Eletroportáteis, Áudio, Informática..."
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0b1321] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-600"
                    id="input-product-category"
                  />
                </div>
              </div>

              {/* Anexos e Imagens Section */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">Anexos e Imagens por Setor</span>
                  <input 
                    type="file"
                    id="catalog-images-picker"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleImagesUpload(e.target.files)}
                    className="hidden"
                  />
                </div>

                {/* Category Selector Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b1321] border border-slate-800 rounded-xl text-center text-xs text-slate-400" id="catalog-category-selector">
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setActiveUploadCategory('product'); }}
                    className={`py-1.5 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'product' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
                  >
                    Produto ({imagesProduct.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setActiveUploadCategory('box'); }}
                    className={`py-1.5 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'box' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
                  >
                    Embalagem ({imagesBox.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setActiveUploadCategory('accessories'); }}
                    className={`py-1.5 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'accessories' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
                  >
                    Acessórios ({imagesAccessories.length})
                  </button>
                </div>

                <div 
                  tabIndex={0}
                  className={`border border-dashed rounded-xl p-4 bg-[#0a111c] transition-all flex flex-col items-center justify-center min-h-[100px] outline-none cursor-pointer select-none ${
                    isPasteFocused 
                      ? 'border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.35)] bg-[#0c1d33]/50' 
                      : 'border-slate-800 hover:bg-[#0a111c]/80 hover:border-slate-700'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      handleImagesUpload(e.dataTransfer.files);
                    }
                  }}
                  onBlur={() => setIsPasteFocused(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPasteFocused) {
                      setIsPasteFocused(true);
                    } else {
                      document.getElementById('catalog-images-picker')?.click();
                    }
                  }}
                  id="catalog-paste-dropzone"
                >
                  {(activeUploadCategory === 'product' ? imagesProduct : activeUploadCategory === 'box' ? imagesBox : imagesAccessories).length === 0 ? (
                    <div className="text-center py-4 space-y-1.5 pointer-events-none">
                      <ImageIcon className={`w-8 h-8 mx-auto transition-colors ${isPasteFocused ? 'text-sky-400' : 'text-slate-600'}`} />
                      <p className="text-xs text-slate-350 font-bold">
                        {isPasteFocused ? '👉 Área de colagem ativa! Cole com Ctrl + V' : 'Clique aqui para habilitar colagem'}
                      </p>
                      <p className="text-[10px] text-slate-500 font-normal">
                        {isPasteFocused 
                          ? `Cole imagens de ${activeUploadCategory === 'product' ? 'Produto' : activeUploadCategory === 'box' ? 'Embalagem' : 'Acessórios'} com Ctrl+V` 
                          : 'Clique para ativar colagem (Ctrl+V) ou clique novamente para selecionar do PC'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 w-full" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 w-full">
                        {(activeUploadCategory === 'product' ? imagesProduct : activeUploadCategory === 'box' ? imagesBox : imagesAccessories).map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg border border-slate-800 bg-slate-950 overflow-hidden group">
                            <img src={img} className="w-full h-full object-cover" alt={`${activeUploadCategory}-${idx}`} />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="text-center pt-2 border-t border-slate-800/40 pointer-events-none">
                        <p className="text-[10px] text-slate-500 font-medium">
                          {isPasteFocused 
                            ? '👉 Área de colagem ativa! Pressione Ctrl + V para colar mais fotos ou clique novamente para escolher arquivos' 
                            : 'Clique aqui para habilitar colagem com Ctrl+V ou selecione arquivos'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-5 border-t border-slate-800 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 bg-transparent hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/15 transition-all cursor-pointer"
                  id="btn-submit-product"
                >
                  {editingProduct ? 'Salvar Alterações' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom Confirmation Modal */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{confirmConfig.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{confirmConfig.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmConfig(null)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs shadow-lg shadow-rose-600/15 transition-all cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Viewer Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" id="product-details-modal">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Ficha Técnica do Produto</h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">SKU: <span className="text-sky-400 font-bold">{viewingProduct.sku}</span></p>
                </div>
              </div>
              <button 
                onClick={() => setViewingProduct(null)}
                className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Images & Details */}
                <div className="md:col-span-5 space-y-5">
                  {/* Main Image */}
                  <div 
                    onClick={() => {
                      const imgUrl = (viewingProduct.images && viewingProduct.images.length > 0)
                        ? (viewingProduct.images[activeViewImageIndex] || viewingProduct.imageUrl)
                        : viewingProduct.imageUrl;
                      if (imgUrl) setZoomedImage(imgUrl);
                    }}
                    className="aspect-square w-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center relative group/mainImg cursor-zoom-in"
                    title="Clique para dar zoom na imagem"
                  >
                    {/* Category Badge */}
                    {(viewingProduct.imageUrl || (viewingProduct.images && viewingProduct.images.length > 0)) && (
                      <span className="absolute top-3 left-3 px-2 py-1 bg-slate-900/90 text-[10px] font-bold text-sky-400 border border-slate-800 rounded-lg backdrop-blur-sm z-10">
                        {(() => {
                          const imgUrl = (viewingProduct.images && viewingProduct.images.length > 0)
                            ? (viewingProduct.images[activeViewImageIndex] || viewingProduct.imageUrl)
                            : viewingProduct.imageUrl;
                          if (imgUrl) {
                            if (viewingProduct.imagesBox?.includes(imgUrl)) return 'Embalagem';
                            if (viewingProduct.imagesAccessories?.includes(imgUrl)) return 'Acessórios';
                          }
                          return 'Produto';
                        })()}
                      </span>
                    )}

                    {viewingProduct.images && viewingProduct.images.length > 0 ? (
                      <img 
                        src={viewingProduct.images[activeViewImageIndex] || viewingProduct.imageUrl} 
                        alt={viewingProduct.name} 
                        className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover/mainImg:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    ) : viewingProduct.imageUrl ? (
                      <img 
                        src={viewingProduct.imageUrl} 
                        alt={viewingProduct.name} 
                        className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover/mainImg:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 font-mono text-xs p-4">
                        <ImageIcon className="w-12 h-12 mb-2 text-slate-700" />
                        Nenhuma imagem cadastrada
                      </div>
                    )}

                    {/* Zoom Icon Overlay on Hover */}
                    {(viewingProduct.imageUrl || (viewingProduct.images && viewingProduct.images.length > 0)) && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/mainImg:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 text-white font-bold text-xs pointer-events-none">
                        <div className="p-3 bg-slate-900/95 rounded-full border border-slate-750 shadow-xl text-sky-400">
                          <ZoomIn className="w-6 h-6" />
                        </div>
                        <span className="bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-750 backdrop-blur-sm text-[11px]">Clique para dar zoom</span>
                      </div>
                    )}
                  </div>

                  {/* Image Gallery Thumbnails */}
                  {viewingProduct.images && viewingProduct.images.length > 1 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {viewingProduct.images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveViewImageIndex(idx)}
                          className={`w-14 h-14 rounded-xl border overflow-hidden bg-slate-950 transition-all focus:outline-none cursor-pointer ${
                            activeViewImageIndex === idx 
                              ? 'border-sky-500 ring-2 ring-sky-500/20 scale-95' 
                              : 'border-slate-800 hover:border-slate-600 hover:scale-105'
                          }`}
                        >
                          <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Core Specifications Cards */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                      <div className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">Voltagem Padrão</div>
                      <div className="text-white font-bold mt-1.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold inline-block ${
                          viewingProduct.voltage === 'Bivolt' ? 'bg-sky-500/10 text-sky-400' :
                          viewingProduct.voltage === '110V' ? 'bg-teal-500/10 text-teal-400' :
                          viewingProduct.voltage === '220V' ? 'bg-orange-500/10 text-orange-400' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>
                          {viewingProduct.voltage}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                      <div className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">Marca</div>
                      <div className="text-slate-250 font-bold mt-1.5 truncate" title={viewingProduct.brand || 'Não informada'}>
                        {viewingProduct.brand || <span className="text-slate-600 font-normal italic">Não informada</span>}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl col-span-2">
                      <div className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">Categoria</div>
                      <div className="text-slate-250 font-bold mt-1.5" title={viewingProduct.category || 'Não informada'}>
                        {viewingProduct.category || <span className="text-slate-600 font-normal italic">Não informada</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Name, Description, Accessories */}
                <div className="md:col-span-7 space-y-5 flex flex-col justify-between">
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome Comercial</h4>
                      <h2 className="text-xl font-extrabold text-white mt-1 leading-tight">{viewingProduct.name}</h2>
                    </div>

                    {/* Accessories */}
                    <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                      <h4 className="text-xs font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Acessórios Inclusos de Fábrica
                      </h4>
                      <p className="text-slate-300 text-xs mt-2 whitespace-pre-line leading-relaxed">
                        {viewingProduct.accessories && viewingProduct.accessories.trim() !== '' 
                          ? viewingProduct.accessories 
                          : 'Nenhum acessório adicional cadastrado para este modelo.'}
                      </p>
                    </div>

                    {/* Description HTML */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição Técnica / Detalhes</h4>
                      <div className="mt-2 p-0 bg-transparent max-h-[320px] overflow-y-auto custom-scrollbar [&_.ql-editor]:!border-none [&_.ql-editor]:!bg-transparent [&_.ql-editor]:!min-h-0 [&_.ql-editor]:!p-0 [&_.ql-editor]:!rounded-none">
                        {viewingProduct.description && viewingProduct.description.trim() !== '' && viewingProduct.description !== '<p><br></p>' ? (
                          <div 
                            className="text-xs text-slate-300 leading-relaxed prose prose-invert prose-xs ql-editor"
                            dangerouslySetInnerHTML={{ __html: viewingProduct.description }}
                          />
                        ) : (
                          <p className="text-xs text-slate-500 italic">Nenhuma descrição técnica informada para este produto.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-2.5">
              <button
                onClick={() => setViewingProduct(null)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  const prod = viewingProduct;
                  setViewingProduct(null);
                  handleEditClick(prod);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Image Zoom Lightbox Overlay */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 select-none animate-in fade-in duration-200"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setZoomedImage(null);
          }}
          tabIndex={0}
          id="image-zoom-lightbox"
        >
          {/* Top Bar with Title and Close button */}
          <div className="w-full flex justify-between items-center px-4 py-2 z-10 bg-gradient-to-b from-black/65 to-transparent">
            <span className="text-slate-400 text-xs font-mono">Zoom Interativo &bull; Use os botões, clique e arraste ou role o mouse</span>
            <button 
              onClick={() => setZoomedImage(null)}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full border border-slate-800 transition-all cursor-pointer"
              title="Fechar Zoom"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Interactive Zoom Stage */}
          <div 
            className="w-full flex-1 flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
            onWheel={(e) => {
              const zoomFactor = 0.15;
              const newScale = e.deltaY < 0 
                ? Math.min(zoomScale + zoomFactor, 6) 
                : Math.max(zoomScale - zoomFactor, 1);
              setZoomScale(newScale);
              if (newScale === 1) {
                setZoomPosition({ x: 0, y: 0 });
              }
            }}
            onMouseDown={(e) => {
              if (zoomScale <= 1) return;
              e.preventDefault();
              setIsZoomDragging(true);
              setZoomDragStart({ x: e.clientX - zoomPosition.x, y: e.clientY - zoomPosition.y });
            }}
            onMouseMove={(e) => {
              if (!isZoomDragging) return;
              e.preventDefault();
              setZoomPosition({
                x: e.clientX - zoomDragStart.x,
                y: e.clientY - zoomDragStart.y
              });
            }}
            onMouseUp={() => setIsZoomDragging(false)}
            onMouseLeave={() => setIsZoomDragging(false)}
            onDoubleClick={() => {
              if (zoomScale > 1) {
                setZoomScale(1);
                setZoomPosition({ x: 0, y: 0 });
              } else {
                setZoomScale(2);
              }
            }}
          >
            <div 
              style={{
                transform: `translate(${zoomPosition.x}px, ${zoomPosition.y}px) scale(${zoomScale})`,
                transition: isZoomDragging ? 'none' : 'transform 0.15s ease-out'
              }}
              className="max-w-[90vw] max-h-[75vh] flex items-center justify-center pointer-events-none"
            >
              <img 
                src={zoomedImage} 
                alt="Zoomed Product" 
                className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Bottom Floating Controls */}
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-5 py-3 rounded-full shadow-2xl backdrop-blur-md mb-4 z-10">
            <button 
              onClick={() => {
                setZoomScale(prev => Math.max(prev - 0.5, 1));
                if (zoomScale <= 1.5) {
                  setZoomPosition({ x: 0, y: 0 });
                }
              }}
              disabled={zoomScale <= 1}
              className={`p-2 rounded-full transition-all border border-slate-800 text-slate-400 hover:text-white ${zoomScale <= 1 ? 'opacity-40 cursor-not-allowed bg-slate-950/20' : 'bg-slate-950 hover:bg-slate-850 cursor-pointer'}`}
              title="Afastar (-)"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            
            <div className="text-white font-mono text-xs font-bold w-16 text-center">
              {zoomScale.toFixed(1)}x
            </div>

            <button 
              onClick={() => setZoomScale(prev => Math.min(prev + 0.5, 6))}
              disabled={zoomScale >= 6}
              className={`p-2 rounded-full transition-all border border-slate-800 text-slate-400 hover:text-white ${zoomScale >= 6 ? 'opacity-40 cursor-not-allowed bg-slate-950/20' : 'bg-slate-950 hover:bg-slate-850 cursor-pointer'}`}
              title="Aproximar (+)"
            >
              <ZoomIn className="w-5 h-5" />
            </button>

            <div className="w-px h-5 bg-slate-800 mx-1"></div>

            <button 
              onClick={() => {
                setZoomScale(1);
                setZoomPosition({ x: 0, y: 0 });
              }}
              disabled={zoomScale === 1 && zoomPosition.x === 0 && zoomPosition.y === 0}
              className={`p-2 rounded-full transition-all border border-slate-800 text-slate-400 hover:text-white ${zoomScale === 1 && zoomPosition.x === 0 && zoomPosition.y === 0 ? 'opacity-40 cursor-not-allowed bg-slate-950/20' : 'bg-slate-950 hover:bg-slate-850 cursor-pointer'}`}
              title="Resetar Zoom"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
