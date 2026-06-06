import { Router, Request, Response } from "express";
import db from "../config/db.js";

const router = Router();

/**
 * PUT /api/users/:id/fcm-token
 * Guarda el FCM token del dispositivo del usuario para poder enviarle alertas push.
 */
router.put("/:id/fcm-token", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { fcmToken } = req.body;

  if (fcmToken === undefined) {
    res.status(400).json({ error: "El campo fcmToken es requerido." });
    return;
  }

  try {
    const query = "UPDATE users SET fcm_token = $1 WHERE id = $2 RETURNING *";
    const { rows } = await db.query(query, [fcmToken || null, id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Usuario no encontrado." });
      return;
    }

    res.json({ success: true, message: "Token FCM actualizado con éxito.", user: rows[0] });
  } catch (error) {
    console.error("Error al actualizar token FCM:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * PUT /api/users/:id/stripe-connect
 * Vincula una cuenta Express de Stripe Connect a un propietario.
 */
router.put("/:id/stripe-connect", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { stripeAccountId } = req.body;

  if (!stripeAccountId) {
    res.status(400).json({ error: "stripeAccountId es requerido." });
    return;
  }

  try {
    const query = "UPDATE users SET stripe_account_id = $1 WHERE id = $2 RETURNING *";
    const { rows } = await db.query(query, [stripeAccountId, id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Usuario no encontrado." });
      return;
    }

    res.json({ success: true, message: "Cuenta Stripe Connect vinculada con éxito.", user: rows[0] });
  } catch (error) {
    console.error("Error al vincular Stripe Connect:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * GET /api/users/:id
 * Devuelve la información fiscal e historial financiero de un usuario.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM users WHERE id = $1";
    const { rows } = await db.query(query, [id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Usuario no encontrado." });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener perfil de usuario:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
