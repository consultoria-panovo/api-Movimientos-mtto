// 1. Importaciones necesarias
const express = require('express');
const sql = require('mssql'); 

// 2. Inicialización de la aplicación
const app = express();
app.disable("x-powered-by");

// --- Seguridad: solo el proxy (edge function sap-proxy) puede llamar esta API ---
// La llave vive en la variable de entorno API_KEY de Render; nunca en el código.
const crypto = require("crypto");
function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    // Falla cerrado: sin llave configurada no se sirve nada.
    console.error("API_KEY no configurada; solicitud rechazada");
    return res.status(503).json({ error: "service_unavailable" });
  }
  const given = req.get("x-api-key") || "";
  // Compara hashes de longitud fija para que el tiempo no revele la llave.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
// Ruta pública SOLO para el health check de Render (no devuelve datos).
app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.use(requireApiKey);
const PORT = process.env.PORT || 3000;

// 3. Configuración de tu base de datos
const config = {
    user: process.env.DB_USER || 'tu_usuario',
    password: process.env.DB_PASSWORD || 'tu_password',
    server: process.env.DB_SERVER || 'tu_servidor', 
    database: process.env.DB_NAME || 'tu_base_de_datos',
    options: {
        encrypt: true, 
        trustServerCertificate: true 
    }
};

// 4. TU RUTA (Corregida con los movimientos de MT10 y P402)
app.get("/consumo/pal4", async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT 
          MATNR,
          WERKS,
          LGORT,
          SUM(
              CASE 
                  -- Lógica para el almacén P402 (Movimientos 201 y 202)
                  WHEN LGORT = 'P402' AND BWART = 201 THEN ABS(MENGE)
                  WHEN LGORT = 'P402' AND BWART = 202 THEN -ABS(MENGE)
                  
                  -- Lógica para el almacén MT10 (Movimientos 261 y 262)
                  WHEN LGORT = 'MT10' AND BWART = 261 THEN ABS(MENGE)
                  WHEN LGORT = 'MT10' AND BWART = 262 THEN -ABS(MENGE)
                  
                  ELSE 0
              END
          ) AS ConsumoUltimos3Meses,
          MAX(BUDAT_MKPF) AS UltimaFecha
      FROM MovimientosDeInventario
      WHERE 
        BUDAT_MKPF >= DATEADD(MONTH, -3, GETDATE())
        AND (
          (LGORT = 'P402' AND BWART IN (201, 202)) OR 
          (LGORT = 'MT10' AND BWART IN (261, 262))
        )
      GROUP BY MATNR, WERKS, LGORT;
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la ruta:", err);
    console.error("Error en " + req.path + ":", err.message);
    res.status(500).json({ error: "internal_error" });
  }
});

// 5. Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
