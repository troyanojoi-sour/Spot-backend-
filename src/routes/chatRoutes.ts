import { Router, Request, Response } from "express";
import db from "../config/db.js";
import { sendFcmNotification } from "../config/firebase.js";

const router = Router();

/**
 * GET /api/chats
 * Devuelve todas las conversaciones del usuario (Conductor o Propietario).
 * Query: userId
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({ error: "El userId es requerido." });
    return;
  }

  try {
    // Consulta SQL avanzada para buscar los hilos de conversación asociados a reservas (bookings)
    const query = `
      SELECT b.id AS booking_id, b.spot_id, s.name AS parking_name, 
             u_owner.name AS owner_name, u_owner.id AS owner_id,
             u_driver.name AS driver_name, u_driver.id AS driver_id,
             (SELECT text FROM chat_messages WHERE booking_id = b.id ORDER BY created_at DESC LIMIT 1) AS last_message,
             (SELECT created_at FROM chat_messages WHERE booking_id = b.id ORDER BY created_at DESC LIMIT 1) AS last_message_time
      FROM bookings b
      JOIN parking_spots s ON b.spot_id = s.id
      JOIN users u_owner ON s.owner_id = u_owner.id
      JOIN users u_driver ON b.driver_id = u_driver.id
      WHERE b.driver_id = $1 OR s.owner_id = $1
      ORDER BY last_message_time DESC NULLS LAST
    `;
    const { rows } = await db.query(query, [userId]);

    const formatted = rows.map((r: any) => {
      const isOwner = r.owner_id === userId;
      return {
        id: r.booking_id,
        ownerName: isOwner ? r.driver_name : r.owner_name, // Muestra el interlocutor adecuado
        parkingName: r.parking_name,
        spotId: r.spot_id,
        lastMessage: r.last_message || "Haz clic para iniciar el chat...",
        time: r.last_message_time ? new Date(r.last_message_time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Ahora",
        unread: false
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("Error al obtener chats:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * GET /api/chats/:bookingId/messages
 * Devuelve todo el historial de mensajes de un chat específico.
 */
router.get("/:bookingId/messages", async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.params;
  const { userId } = req.query; // Para marcar remitente 'me' o interlocutor

  try {
    const query = "SELECT * FROM chat_messages WHERE booking_id = $1 ORDER BY created_at ASC";
    const { rows } = await db.query(query, [bookingId]);

    const formatted = rows.map((m: any) => ({
      sender: m.sender_id === userId ? "me" : "owner",
      text: m.text,
      time: new Date(m.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Error al obtener mensajes:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/chats/:bookingId/messages
 * Envía un mensaje en un chat.
 * Si es el conductor quien escribe, simula automáticamente una respuesta del propietario
 * tras 1.5 segundos y despacha una notificación push nativa (FCM) al dispositivo del conductor.
 */
router.post("/:bookingId/messages", async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.params;
  const { senderId, text } = req.body;

  if (!senderId || !text) {
    res.status(400).json({ error: "Campos senderId y text requeridos." });
    return;
  }

  try {
    // 1. Guarda el mensaje del remitente en la base de datos
    const insertMsg = `
      INSERT INTO chat_messages (booking_id, sender_id, text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const { rows } = await db.query(insertMsg, [bookingId, senderId, text]);
    const userMsg = rows[0];

    // 2. Consulta detalles de la reserva para ver si requiere auto-respuesta
    const bookingQuery = `
      SELECT b.driver_id, s.owner_id, u.fcm_token as driver_fcm, u_owner.name as owner_name
      FROM bookings b
      JOIN parking_spots s ON b.spot_id = s.id
      JOIN users u ON b.driver_id = u.id
      JOIN users u_owner ON s.owner_id = u_owner.id
      WHERE b.id = $1
    `;
    const { rows: bookings } = await db.query(bookingQuery, [bookingId]);
    
    if (bookings.length > 0) {
      const b = bookings[0];

      // Si el conductor es quien escribe (senderId === driver_id), simula respuesta del dueño
      if (senderId === b.driver_id) {
        setTimeout(async () => {
          try {
            const ownerReplyText = "¡Perfecto! Te deseo una buena estancia en mi plaza de parking.";
            
            // Inserta respuesta en la base de datos
            await db.query(insertMsg, [bookingId, b.owner_id, ownerReplyText]);

            // Envía notificación push FCM de aviso al móvil del conductor si tiene token registrado
            if (b.driver_fcm) {
              await sendFcmNotification(
                b.driver_fcm,
                `Nuevo mensaje de ${b.owner_name}`,
                ownerReplyText,
                { route: "/dashboard" }
              );
            }
          } catch (e) {
            console.error("Error en respuesta simulada del propietario:", e);
          }
        }, 1500);
      }
    }

    res.status(201).json({
      sender: "me",
      text: userMsg.text,
      time: new Date(userMsg.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
