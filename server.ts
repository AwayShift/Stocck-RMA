import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API proxy endpoint to query Supabase Management API with real PostgreSQL telemetry
  app.all("/api/supabase-usage", async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Método não permitido. Utilize GET ou POST.' });
    }

    try {
      const body = req.body || {};
      const query = req.query || {};

      const patToken = (
        body.token ||
        query.token ||
        process.env.SUPABASE_MANAGEMENT_TOKEN ||
        process.env.VITE_SUPABASE_MANAGEMENT_TOKEN ||
        process.env.SUPABASE_ACCESS_TOKEN ||
        process.env.SUPABASE_PAT ||
        process.env.SUPABASE_TOKEN ||
        ""
      ).trim();

      let ref = (
        body.projectRef ||
        query.projectRef ||
        process.env.SUPABASE_PROJECT_ID ||
        process.env.VITE_SUPABASE_PROJECT_ID ||
        ""
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
          error: "Nenhum Personal Access Token (PAT) encontrado. Defina a variável SUPABASE_MANAGEMENT_TOKEN no painel da Vercel ou passe o token na requisição.",
          projectRef: ref,
          hasTokenInEnv: false
        });
      }

      if (!ref) {
        return res.status(400).json({
          success: false,
          tokenValid: false,
          error: "Nenhuma referência de projeto (Project Ref) informada ou encontrada nas variáveis de ambiente.",
          hasTokenInEnv: true
        });
      }

      const headers = {
        "Authorization": `Bearer ${patToken}`,
        "Content-Type": "application/json",
        "User-Agent": "Stocck-RMA-Monitor/1.0"
      };

      const projectTestRes = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers });
      if (projectTestRes.status === 401 || projectTestRes.status === 403) {
        return res.status(401).json({
          success: false,
          tokenValid: false,
          error: "O Token do Supabase é inválido ou expirou (HTTP 401 Unauthorized). Verifique o Personal Access Token (PAT) configurado.",
          httpStatus: projectTestRes.status,
          projectRef: ref,
          hasTokenInEnv: true
        });
      }

      if (projectTestRes.status === 404) {
        return res.status(404).json({
          success: false,
          tokenValid: true,
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

      // 1. Fetch telemetry, database size, table sizes, auth users, and storage
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

      let orgBillingUsages: any[] = [];
      if (orgsRes.status === "fulfilled" && orgsRes.value.ok) {
        try {
          const orgs = await orgsRes.value.json();
          if (Array.isArray(orgs)) {
            const orgPromises = orgs.map(async (org: any) => {
              const target = org.id || org.slug;
              if (!target) return null;
              try {
                const r = await fetch(`https://api.supabase.com/v1/organizations/${target}/billing/usage`, { headers });
                if (r.ok) return await r.json();
              } catch {
                return null;
              }
            });
            const results = await Promise.allSettled(orgPromises);
            for (const resItem of results) {
              if (resItem.status === 'fulfilled' && resItem.value) {
                const val = resItem.value;
                if (Array.isArray(val?.usages)) orgBillingUsages.push(...val.usages);
                else if (Array.isArray(val)) orgBillingUsages.push(...val);
              }
            }
          }
        } catch {}
      }

      if (projectBillingRes.status === "fulfilled" && projectBillingRes.value.ok) {
        try {
          const pBilling = await projectBillingRes.value.json();
          if (Array.isArray(pBilling?.usages)) orgBillingUsages.push(...pBilling.usages);
          else if (Array.isArray(pBilling)) orgBillingUsages.push(...pBilling);
        } catch {}
      }

      if (projectUsageRes.status === "fulfilled" && projectUsageRes.value.ok) {
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

      let dbSizeBytes = 0;
      let dbPretty = "0 MB";
      if (sizeRes.status === "fulfilled" && sizeRes.value.ok) {
        try {
          const rows = await sizeRes.value.json();
          if (rows && rows[0]) {
            dbSizeBytes = Number(rows[0].db_bytes || 0);
            dbPretty = rows[0].db_pretty || `${Math.round(dbSizeBytes / (1024 * 1024))} MB`;
          }
        } catch {}
      }

      let tablesData: any[] = [];
      if (tablesRes.status === "fulfilled" && tablesRes.value.ok) {
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

      let authUsersCount = 0;
      if (authRes.status === "fulfilled" && authRes.value.ok) {
        try {
          const rows = await authRes.value.json();
          if (rows && rows[0]) {
            authUsersCount = Number(rows[0].user_count || 0);
          }
        } catch {}
      }

      let storageBytes = 0;
      let storageObjectsCount = 0;
      if (storageRes.status === "fulfilled" && storageRes.value.ok) {
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
        tokenSource: body.token ? 'manual_input' : 'server_environment',
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
      console.error("Error proxying Supabase Usage API:", err);
      return res.status(500).json({
        success: false,
        tokenValid: false,
        error: err.message || "Erro interno ao consultar a API do Supabase."
      });
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
