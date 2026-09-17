import fs from 'fs';
import path from 'path';

// Configurações do Cloudinary
const CLOUD_NAME = 'rg1isavz'; 
const UPLOAD_PRESET = 'stocck-imagens'; 
const BACKUP_FILE = 'backup_stocck.json'; 
const CACHE_FILE = 'migration_url_cache.json';
const OUTPUT_FILE = 'backup_migrado.json';
const CONCURRENCY = 5; // Uploads simultâneos para maior velocidade

const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// Carregar cache existente se houver para continuar de onde parou
let urlCache = new Map();
const cachePath = path.resolve(process.cwd(), CACHE_FILE);
if (fs.existsSync(cachePath)) {
  try {
    const rawCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    urlCache = new Map(Object.entries(rawCache));
    console.log(`[Cache] Carregadas ${urlCache.size} URLs migradas anteriormente.`);
  } catch (e) {
    console.warn('[Cache] Não foi possível ler o cache anterior:', e.message);
  }
}

function saveCache() {
  const obj = Object.fromEntries(urlCache);
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2), 'utf8');
}

async function uploadToCloudinary(imageUrl, folderName, retries = 3) {
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;

  // Se já está na conta nova do Cloudinary
  if (imageUrl.includes(`res.cloudinary.com/${CLOUD_NAME}/`)) {
    return imageUrl;
  }

  // Se já foi migrado nesta ou em execuções anteriores
  if (urlCache.has(imageUrl)) {
    return urlCache.get(imageUrl);
  }

  if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:image')) {
    return imageUrl; // Não é URL nem base64 válido
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', imageUrl);
      formData.append('upload_preset', UPLOAD_PRESET);
      if (folderName) {
        formData.append('folder', folderName);
      }

      const response = await fetch(CLOUDINARY_API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || response.statusText);
      }

      const newUrl = data.secure_url;
      urlCache.set(imageUrl, newUrl);
      return newUrl;
    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ Falha definitiva no upload (${imageUrl.substring(0, 50)}...):`, error.message);
        return imageUrl; // Retorna original se falhar após tentativas
      }
      console.warn(`⚠️ Tentativa ${attempt}/${retries} falhou: ${error.message}. Retentando em 2s...`);
      await new Promise(res => setTimeout(res, 2000));
    }
  }

  return imageUrl;
}

async function processQueue(items, folderName) {
  const total = items.length;
  let completed = 0;

  console.log(`\nIniciando processamento de ${total} URLs únicas com concorrência de ${CONCURRENCY}...`);

  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const url = items[currentIndex];
      
      if (!urlCache.has(url) && !url.includes(`res.cloudinary.com/${CLOUD_NAME}/`)) {
        await uploadToCloudinary(url, folderName);
      }
      
      completed++;
      if (completed % 25 === 0 || completed === total) {
        saveCache();
        const percent = ((completed / total) * 100).toFixed(1);
        console.log(`[Progresso] ${completed}/${total} (${percent}%) concluídos. (Cache salvo)`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  saveCache();
}

async function main() {
  const backupPath = path.resolve(process.cwd(), BACKUP_FILE);
  if (!fs.existsSync(backupPath)) {
    console.error(`Arquivo de backup não encontrado em: ${backupPath}`);
    return;
  }

  console.log('Lendo backup_stocck.json...');
  const rawData = fs.readFileSync(backupPath, 'utf8');
  const payload = JSON.parse(rawData);
  const data = payload.data;

  // 1. Coletar todas as URLs únicas para cada tipo/pasta
  const productUrls = new Set();
  const triageUrls = new Set();
  const pendingUrls = new Set();

  function addIfValid(set, val) {
    if (val && typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) {
      set.add(val);
    }
  }

  if (data.products) {
    for (const p of data.products) {
      addIfValid(productUrls, p.imageUrl);
      (p.images || []).forEach(u => addIfValid(productUrls, u));
      (p.imagesProduct || []).forEach(u => addIfValid(productUrls, u));
      (p.imagesBox || []).forEach(u => addIfValid(productUrls, u));
      (p.imagesAccessories || []).forEach(u => addIfValid(productUrls, u));
    }
  }

  if (data.triageUnits) {
    for (const t of data.triageUnits) {
      (t.photosProduct || []).forEach(u => addIfValid(triageUrls, u));
      (t.photosBox || []).forEach(u => addIfValid(triageUrls, u));
      (t.photosAccessories || []).forEach(u => addIfValid(triageUrls, u));
    }
  }

  if (data.pendingItems) {
    for (const p of data.pendingItems) {
      (p.photos || []).forEach(u => addIfValid(pendingUrls, u));
    }
  }

  console.log(`\n📊 Encontradas:`);
  console.log(`- ${productUrls.size} imagens únicas de Produtos`);
  console.log(`- ${triageUrls.size} imagens únicas de Triagens`);
  console.log(`- ${pendingUrls.size} imagens únicas de Pendências`);

  // 2. Processar uploads por fila
  console.log('\n--- 1/3: Migrando imagens de Produtos ---');
  await processQueue([...productUrls], 'stocck_rma/products');

  console.log('\n--- 2/3: Migrando imagens de Triagens ---');
  await processQueue([...triageUrls], 'stocck_rma/triage');

  console.log('\n--- 3/3: Migrando imagens de Pendências ---');
  await processQueue([...pendingUrls], 'stocck_rma/pending');

  // 3. Substituir no backup com as novas URLs
  console.log('\nSubstituindo URLs no backup original...');
  function mapUrl(u) {
    return urlCache.get(u) || u;
  }
  function mapArr(arr) {
    if (!arr || !Array.isArray(arr)) return arr;
    return arr.map(mapUrl);
  }

  if (data.products) {
    for (const p of data.products) {
      if (p.imageUrl) p.imageUrl = mapUrl(p.imageUrl);
      if (p.images) p.images = mapArr(p.images);
      if (p.imagesProduct) p.imagesProduct = mapArr(p.imagesProduct);
      if (p.imagesBox) p.imagesBox = mapArr(p.imagesBox);
      if (p.imagesAccessories) p.imagesAccessories = mapArr(p.imagesAccessories);
    }
  }

  if (data.triageUnits) {
    for (const t of data.triageUnits) {
      if (t.photosProduct) t.photosProduct = mapArr(t.photosProduct);
      if (t.photosBox) t.photosBox = mapArr(t.photosBox);
      if (t.photosAccessories) t.photosAccessories = mapArr(t.photosAccessories);
    }
  }

  if (data.pendingItems) {
    for (const p of data.pendingItems) {
      if (p.photos) p.photos = mapArr(p.photos);
    }
  }

  // 4. Salvar backup_migrado.json
  const outPath = path.resolve(process.cwd(), OUTPUT_FILE);
  const jsonContent = JSON.stringify(payload, null, 2);
  fs.writeFileSync(outPath, jsonContent, 'utf8');

  console.log(`\n🎉 Migração concluída com sucesso!`);
  console.log(`- Arquivo de saída: ${outPath}`);
  console.log(`- Total de URLs migradas: ${urlCache.size}`);
  console.log(`Agora você pode importar "backup_migrado.json" diretamente no sistema!`);
}

main().catch(console.error);
