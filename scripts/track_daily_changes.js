import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const jsonPath = path.join(rootDir, 'daily_changes.json');
const mdPath = path.join(rootDir, 'DAILY_CHANGES.md');

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function recordFileChange(filePath, summary = '') {
  const today = getTodayString();
  let data = {
    currentDate: today,
    todayFiles: [],
    history: {}
  };

  if (fs.existsSync(jsonPath)) {
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      // Use defaults if parse fails
    }
  }

  // If the date has changed, archive previous todayFiles into history
  if (data.currentDate !== today) {
    if (data.todayFiles && data.todayFiles.length > 0) {
      if (!data.history) data.history = {};
      data.history[data.currentDate] = data.todayFiles.map(f => (typeof f === 'string' ? f : f.file));
    }
    data.currentDate = today;
    data.todayFiles = [];
  }

  // Normalize file path relative to root
  const relativeFile = filePath.replace(/^(\/app\/applet\/|\/)/, '');

  if (relativeFile) {
    const existingIndex = data.todayFiles.findIndex(item => 
      (typeof item === 'string' ? item : item.file) === relativeFile
    );

    const fileEntry = {
      file: relativeFile,
      summary: summary || 'Arquivo alterado'
    };

    if (existingIndex >= 0) {
      data.todayFiles[existingIndex] = fileEntry;
    } else {
      data.todayFiles.push(fileEntry);
    }
  }

  // Write JSON
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  // Regenerate Markdown
  let md = `# 📋 Registro Interno de Arquivos Alterados por Data\n\n`;
  md += `Este arquivo é mantido internamente no sistema para registrar todos os arquivos modificados no dia de trabalho.\n`;
  md += `Quando a data muda, a seção **Arquivos Alterados no Dia** é atualizada conforme o novo dia, preservando os dias anteriores no histórico.\n\n`;
  md += `---\n\n`;
  md += `## 📅 Data Atual: ${data.currentDate}\n`;
  md += `- **Total de arquivos alterados hoje:** ${data.todayFiles.length} arquivos\n\n`;
  md += `### Lista de Arquivos Alterados Hoje:\n`;

  if (data.todayFiles.length === 0) {
    md += `*Nenhum arquivo alterado até o momento nesta data.*\n`;
  } else {
    data.todayFiles.forEach((item, idx) => {
      const fileName = typeof item === 'string' ? item : item.file;
      const desc = typeof item === 'object' && item.summary ? ` - ${item.summary}` : '';
      md += `${idx + 1}. \`${fileName}\`${desc}\n`;
    });
  }

  md += `\n---\n\n## 🗄️ Histórico de Alterações por Data\n\n`;

  const historyDates = Object.keys(data.history || {}).sort().reverse();
  if (historyDates.length === 0) {
    md += `*Nenhum histórico anterior registrado.*\n`;
  } else {
    historyDates.forEach(date => {
      md += `### 📅 ${date}\n`;
      const files = data.history[date] || [];
      files.forEach(f => {
        md += `- \`${f}\`\n`;
      });
      md += `\n`;
    });
  }

  md += `---\n\n*Nota de Manutenção: Este arquivo é atualizado a cada alteração no sistema. Ao virar a data, a seção 'Data Atual' é renovada automaticamente para refletir as edições do novo dia.*\n`;

  fs.writeFileSync(mdPath, md, 'utf8');
}

// Allow CLI execution: node scripts/track_daily_changes.js [filepath] [summary]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetFile = process.argv[2] || '';
  const targetSummary = process.argv[3] || '';
  recordFileChange(targetFile, targetSummary);
  console.log(`[DailyChangeTracker] Atualizado com sucesso para a data ${getTodayString()}`);
}
