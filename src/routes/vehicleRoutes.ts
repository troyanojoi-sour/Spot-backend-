import { Router, Request, Response } from "express";
import db from "../config/db.js";

const router = Router();

/**
 * GET /api/vehicles
 * Devuelve la lista completa de vehículos de un conductor.
 * Query: userId
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({ error: "El userId es requerido." });
    return;
  }

  try {
    const query = "SELECT * FROM vehicles WHERE user_id = $1 ORDER BY created_at ASC";
    const { rows } = await db.query(query, [userId]);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener vehículos:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/vehicles
 * Añade un nuevo vehículo al garaje del usuario de forma reactiva.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { userId, brand, model, plate, size } = req.body;

  if (!userId || !brand || !model || !plate || !size) {
    res.status(400).json({ error: "Todos los campos (userId, brand, model, plate, size) son requeridos." });
    return;
  }

  try {
    const checkPlate = "SELECT id FROM vehicles WHERE plate = $1";
    const { rows: existing } = await db.query(checkPlate, [plate.toUpperCase().trim()]);
    if (existing.length > 0) {
      res.status(409).json({ error: "Esta matrícula ya está registrada." });
      return;
    }

    const vehicleId = "vh_" + Math.random().toString(36).substr(2, 9);
    const query = `
      INSERT INTO vehicles (id, user_id, brand, model, plate, size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const { rows } = await db.query(query, [
      vehicleId,
      userId,
      brand.trim(),
      model.trim(),
      plate.toUpperCase().trim(),
      size
    ]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al añadir vehículo:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * DELETE /api/vehicles/:id
 * Elimina un coche del garaje.
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM vehicles WHERE id = $1 RETURNING *";
    const { rows } = await db.query(query, [id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Vehículo no encontrado." });
      return;
    }

    res.json({ success: true, message: "Vehículo eliminado con éxito.", vehicle: rows[0] });
  } catch (error) {
    console.error("Error al eliminar vehículo:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
