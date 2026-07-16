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
        -- Filtro general de fecha
        BUDAT_MKPF >= DATEADD(MONTH, -3, GETDATE())
        -- Filtro cruzado: Asegura que solo entren las combinaciones correctas de Almacén + Movimiento
        AND (
          (LGORT = 'P402' AND BWART IN (201, 202)) OR 
          (LGORT = 'MT10' AND BWART IN (261, 262))
        )
      GROUP BY MATNR, WERKS, LGORT;
    `);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la ruta:", err);
    res.status(500).json({ error: err.toString() });
  }
});
