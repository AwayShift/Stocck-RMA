// Segurança: só admin autenticado pode consultar as métricas (a rota usa o token de gerenciamento do servidor).
async function requireAdmin(req: any): Promise<{ ok: boolean; status?: number; error?: string }> {
  const authHeader = String(req.headers?.authorization || '');
  const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!userToken) return { ok: false, status: 401, error: 'Faça login para consultar as métricas do Supabase.' };

  const supaUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!supaUrl || !anonKey) {
    return { ok: false, status: 500, error: 'Servidor sem VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: não foi possível validar o login.' };
  }

  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' };
  try {
    const userRes = await fetch(`${supaUrl}/auth/v1/user`, { headers: authHeaders });
    if (!userRes.ok) return { ok: false, status: 401, error: 'Sessão inválida ou expirada. Entre novamente.' };

    const roleRes = await fetch(`${supaUrl}/rest/v1/rpc/app_role`, { method: 'POST', headers: authHeaders, body: '{}' });
    const role = roleRes.ok ? await roleRes.json() : null;
    if (role !== 'admin') return { ok: false, status: 403, error: 'Apenas administradores podem consultar as métricas do Supabase.' };
    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível validar o login no Supabase.' };
  }
}

export default async function handler(req: any, res: any) {
  // Allow both GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Método não permitido. Utilize GET ou POST.' 
    });
  }

  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return res.status(gate.status || 403).json({ success: false, tokenValid: false, error: gate.error });

    const body = req.body || {};

    // 1. Identify Token: somente variáveis de ambiente do servidor (nunca da requisição)
    let patToken = (
      process.env.SUPABASE_MANAGEMENT_TOKEN ||
      process.env.SUPABASE_ACCESS_TOKEN ||
      process.env.SUPABASE_PAT ||
      process.env.SUPABASE_TOKEN ||
      ''
    ).trim();

    // Sanitize Bearer prefix or surrounding quotes if pasted by user
    patToken = patToken.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

    // 2. Identify Project Ref: somente do servidor (nunca da requisição) > extracted from Supabase URL env vars
    let ref = (
      process.env.SUPABASE_PROJECT_ID ||
      process.env.VITE_SUPABASE_PROJECT_ID ||
      ''
    ).trim();

    if (!ref) {
      const urlCandidates = [
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_URL
      ];
      for (const rawUrl of urlCandidates) {
        if (rawUrl && typeof rawUrl === 'string') {
          try {
            const parsed = new URL(rawUrl.trim());
            const firstPart = parsed.hostname.split('.')[0];
            if (firstPart && firstPart !== 'localhost') {
              ref = firstPart;
              break;
            }
          } catch {}
        }
      }
    }

    if (!patToken) {
      return res.status(400).json({
        success: false,
        tokenValid: false,
        error: 'Nenhum Personal Access Token (PAT) encontrado. Defina a variável SUPABASE_MANAGEMENT_TOKEN no ambiente do servidor (painel da Vercel).',
        projectRef: ref,
        hasTokenInEnv: false
      });
    }

    // Check if user accidentally pasted an API key (anon / service_role JWT) instead of an account PAT
    if (patToken.startsWith('eyJ')) {
      return res.status(400).json({
        success: false,
        tokenValid: false,
        error: 'A chave inserida começa com "eyJ", indicando ser uma chave de API do projeto (anon ou service_role) e não um Personal Access Token. Para métricas oficiais da conta, gere um PAT em supabase.com/dashboard/account/tokens (começa com "sbp_").',
        projectRef: ref,
        tokenSource: 'vercel_environment',
        hasTokenInEnv: true
      });
    }

    if (!ref) {
      return res.status(400).json({
        success: false,
        tokenValid: false,
        error: 'Nenhuma referência de projeto (Project Ref) informada ou encontrada nas variáveis de ambiente.',
        hasTokenInEnv: true
      });
    }

    const headers = {
      'Authorization': `Bearer ${patToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Stocck-RMA-Vercel-Monitor/1.0'
    };

    // 3. Test token against Supabase Management API
    const projectTestRes = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers });
    
    if (projectTestRes.status === 403) {
      return res.status(403).json({
        success: false,
        tokenValid: true,
        error: `O token é autêntico, porém a conta do Supabase não possui permissão de acesso ao projeto '${ref}'. Verifique se o token foi gerado na mesma conta proprietária deste projeto.`,
        httpStatus: 403,
        projectRef: ref,
        tokenSource: 'vercel_environment',
        hasTokenInEnv: true
      });
    }

    if (projectTestRes.status === 401) {
      return res.status(401).json({
        success: false,
        tokenValid: false,
        error: 'O Token do Supabase configurado no servidor (SUPABASE_MANAGEMENT_TOKEN) é inválido ou expirou (HTTP 401 Unauthorized). Gere um novo Personal Access Token e atualize a variável de ambiente no servidor.',
        httpStatus: 401,
        projectRef: ref,
        tokenSource: 'vercel_environment',
        hasTokenInEnv: true
      });
    }

    if (projectTestRes.status === 404) {
      return res.status(404).json({
        success: false,
        tokenValid: true, // Token is authenticated, but this ref was not found in their account
        error: `Projeto '${ref}' não encontrado ou o token não possui permissão para este projeto (HTTP 404).`,
        httpStatus: 404,
        projectRef: ref,
        hasTokenInEnv: true
      });
    }

    let projectData: any = null;
    if (projectTestRes.ok) {
      projectData = await projectTestRes.json();
    }

    // 4. Fetch telemetry, database size, table sizes, auth users, and storage
    const [orgsRes, projectBillingRes, projectUsageRes, sizeRes, tablesRes, authRes, storageRes] = await Promise.allSettled([
      fetch(`https://api.supabase.com/v1/organizations`, { headers }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/billing/usage`, { headers }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/usage`, { headers }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            SELECT 
              pg_database_size(current_database()) as db_bytes,
              pg_size_pretty(pg_database_size(current_database())) as db_pretty;
          `
        })
      }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            SELECT 
              schemaname, 
              relname, 
              pg_size_pretty(pg_total_relation_size(relid)) as total_size, 
              pg_total_relation_size(relid) as bytes 
            FROM pg_catalog.pg_statio_user_tables 
            ORDER BY pg_total_relation_size(relid) DESC
            LIMIT 15;
          `
        })
      }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `SELECT count(*) as user_count FROM auth.users;`
        })
      }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            SELECT 
              count(*) as total_objects, 
              coalesce(sum((metadata->>'size')::bigint), 0) as storage_bytes 
            FROM storage.objects;
          `
        })
      })
    ]);

    // Parse Organizations Billing for exact Egress
    let orgBillingUsages: any[] = [];
    if (orgsRes.status === 'fulfilled' && orgsRes.value.ok) {
      try {
        const orgs = await orgsRes.value.json();
        if (Array.isArray(orgs)) {
          const orgPromises = orgs.map(async (org: any) => {
            const orgId = org.id || org.slug;
            if (!orgId) return null;
            try {
              const r = await fetch(`https://api.supabase.com/v1/organizations/${orgId}/billing/usage`, { headers });
              if (r.ok) return await r.json();
            } catch {
              return null;
            }
          });
          const orgResults = await Promise.allSettled(orgPromises);
          for (const item of orgResults) {
            if (item.status === 'fulfilled' && item.value) {
              const val = item.value;
              if (Array.isArray(val?.usages)) orgBillingUsages.push(...val.usages);
              else if (Array.isArray(val)) orgBillingUsages.push(...val);
            }
          }
        }
      } catch {}
    }

    if (projectBillingRes.status === 'fulfilled' && projectBillingRes.value.ok) {
      try {
        const pBilling = await projectBillingRes.value.json();
        if (Array.isArray(pBilling?.usages)) orgBillingUsages.push(...pBilling.usages);
        else if (Array.isArray(pBilling)) orgBillingUsages.push(...pBilling);
      } catch {}
    }

    if (projectUsageRes.status === 'fulfilled' && projectUsageRes.value.ok) {
      try {
        const pUsage = await projectUsageRes.value.json();
        if (Array.isArray(pUsage?.usages)) orgBillingUsages.push(...pUsage.usages);
        else if (Array.isArray(pUsage)) orgBillingUsages.push(...pUsage);
      } catch {}
    }

    let officialEgressBytes: number | null = null;
    for (const u of orgBillingUsages) {
      const metricName = String(u.metric || u.name || '').toUpperCase();
      if (metricName.includes('EGRESS') || metricName.includes('BYTES_TRANSFERRED') || metricName.includes('BANDWIDTH')) {
        if (typeof u.usage_in_bytes === 'number' && u.usage_in_bytes > 0) {
          officialEgressBytes = u.usage_in_bytes;
          break;
        }
        if (typeof u.usage === 'number' && u.usage > 0) {
          if (u.usage < 100) {
            officialEgressBytes = Math.round(u.usage * 1024 * 1024 * 1024);
          } else {
            officialEgressBytes = Math.round(u.usage);
          }
          break;
        }
      }
    }

    // Database size from SQL query
    let dbSizeBytes = 0;
    let dbPretty = '0 MB';
    if (sizeRes.status === 'fulfilled' && sizeRes.value.ok) {
      try {
        const rows = await sizeRes.value.json();
        if (rows && rows[0]) {
          dbSizeBytes = Number(rows[0].db_bytes || 0);
          dbPretty = rows[0].db_pretty || `${Math.round(dbSizeBytes / (1024 * 1024))} MB`;
        }
      } catch {}
    }

    // Top database tables
    let tablesData: any[] = [];
    if (tablesRes.status === 'fulfilled' && tablesRes.value.ok) {
      try {
        const rows = await tablesRes.value.json();
        if (Array.isArray(rows)) {
          tablesData = rows.map((t: any) => ({
            tableName: t.relname || t.table_name,
            schemaName: t.schemaname || 'public',
            sizePretty: t.total_size,
            bytes: Number(t.bytes || 0)
          }));
        }
      } catch {}
    }

    // Auth Users count
    let authUsersCount = 0;
    if (authRes.status === 'fulfilled' && authRes.value.ok) {
      try {
        const rows = await authRes.value.json();
        if (rows && rows[0]) {
          authUsersCount = Number(rows[0].user_count || 0);
        }
      } catch {}
    }

    // Storage size
    let storageBytes = 0;
    let storageObjectsCount = 0;
    if (storageRes.status === 'fulfilled' && storageRes.value.ok) {
      try {
        const rows = await storageRes.value.json();
        if (rows && rows[0]) {
          storageObjectsCount = Number(rows[0].total_objects || 0);
          storageBytes = Number(rows[0].storage_bytes || 0);
        }
      } catch {}
    }

    const requestedManualEgressGb = typeof body.calibratedEgressGb === 'number' ? body.calibratedEgressGb : null;
    const requestedManualEgressBytes = requestedManualEgressGb ? Math.round(requestedManualEgressGb * 1024 * 1024 * 1024) : null;
    const finalEgressBytes = officialEgressBytes ?? requestedManualEgressBytes ?? 0;
    const finalEgressGb = finalEgressBytes / (1024 * 1024 * 1024);

    return res.json({
      success: true,
      tokenValid: true,
      tokenSource: 'vercel_environment',
      projectRef: ref,
      projectName: projectData?.name || `Stocck-RMA (${ref})`,
      projectStatus: projectData?.status || 'ACTIVE_HEALTHY',
      region: projectData?.region || 'sa-east-1',
      createdAt: projectData?.created_at,
      dbSizeBytes,
      dbPretty,
      tables: tablesData,
      authUsersCount,
      storageBytes,
      storageObjectsCount,
      egressBytes: finalEgressBytes,
      egressGb: finalEgressGb,
      hasOfficialBilling: officialEgressBytes !== null,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Erro na API Supabase Usage:', err);
    return res.status(500).json({
      success: false,
      tokenValid: false,
      error: err.message || 'Erro interno ao consultar a API de Gerenciamento do Supabase.'
    });
  }
}
