import { Router, Request, Response } from "express";
import db from "../config/db.js";
import { stripe } from "../config/stripe.js";

const router = Router();

/**
 * GET /api/bookings
 * Devuelve el historial de reservas de un usuario.
 * Query: userId, role ('Conductor' o 'Propietario')
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = req.query;

  if (!userId || !role) {
    res.status(400).json({ error: "Parámetros userId y role requeridos." });
    return;
  }

  try {
    let query = "";
    let params = [userId];

    if (role === "Conductor") {
      // Lista las reservas hechas por el conductor
      query = `
        SELECT b.id, b.start_time as "startTime", b.end_time as "endTime", b.subtotal, b.commission, b.total, 
               b.qr_code as "qrCode", b.status, b.vehicle_id as "vehicleId", v.plate as "vehiclePlate",
               b.created_at as "createdAt",
               s.name as "spotName", s.address as "spotAddress", s.id as "spotId",
               b.end_time as "expiresAt"
        FROM bookings b
        JOIN parking_spots s ON b.spot_id = s.id
        LEFT JOIN vehicles v ON b.vehicle_id = v.id
        WHERE b.driver_id = $1
        ORDER BY b.created_at DESC
      `;
    } else {
      // Lista los alquileres recibidos por el propietario
      query = `
        SELECT b.id, b.start_time as "startTime", b.end_time as "endTime", b.total, b.status,
               s.name as "spotName", s.address as "spotAddress", u.name as "driverName"
        FROM bookings b
        JOIN parking_spots s ON b.spot_id = s.id
        JOIN users u ON b.driver_id = u.id
        WHERE s.owner_id = $1
        ORDER BY b.created_at DESC
      `;
    }

    const { rows } = await db.query(query, params);
    
    // Formatea campos para el cliente Vue
    const formatted = rows.map((b: any) => {
      if (role === "Conductor") {
        return {
          id: b.id,
          date: new Date(b.startTime).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
          timeSlot: `${new Date(b.startTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} - ${new Date(b.endTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
          durationHours: 4,
          subtotal: parseFloat(b.subtotal),
          commission: parseFloat(b.commission),
          total: parseFloat(b.total),
          amount: parseFloat(b.total), // Duplicado para compatibilidad
          qrCode: b.qrCode,
          status: b.status,
          vehiclePlate: b.vehiclePlate || "9481KGB",
          expiresAt: new Date(b.expiresAt).toISOString(),
          spot: {
            id: b.spotId,
            name: b.spotName,
            address: b.spotAddress
          }
        };
      }
      return b;
    });

    res.json(formatted);
  } catch (error) {
    console.error("Error al obtener reservas:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/bookings
 * Crea una nueva reserva e inicia el cobro en Stripe Connect.
 * Guarda la reserva en la base de datos PostgreSQL con estado inicial 'pending'.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { driverId, spotId, vehicleId, startTime, endTime, hours } = req.body;

  if (!driverId || !spotId || !startTime || !endTime) {
    res.status(400).json({ error: "Faltan campos obligatorios para procesar la reserva." });
    return;
  }

  try {
    // 1. Consulta la plaza y el ID de Stripe Connect del propietario
    const spotQuery = `
      SELECT p.*, u.stripe_account_id 
      FROM parking_spots p
      JOIN users u ON p.owner_id = u.id
      WHERE p.id = $1;
    `;
    const { rows: spots } = await db.query(spotQuery, [spotId]);
    if (spots.length === 0) {
      res.status(404).json({ error: "Plaza de parking no encontrada." });
      return;
    }
    const spot = spots[0];

    // 2. Calcula importes fiscales (IVA y comisiones)
    const duration = parseFloat(hours || "4");
    const subtotal = spot.price * duration;
    const commission = 0.56;
    const total = subtotal + commission;

    const bookingId = "bk_" + Math.random().toString(36).substr(2, 9);
    const qrCode = `SPOT-ACCESS-${bookingId.toUpperCase()}-${spotId.toUpperCase()}`;

    // 3. Simula la pasarela de Stripe Connect usando Destination Charges
    let paymentIntent = null;
    if (spot.stripe_account_id) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(total * 100), // En céntimos
        currency: "eur",
        application_fee_amount: Math.round(commission * 100), // Spot se queda con 56 céntimos
        transfer_data: {
          destination: spot.stripe_account_id, // El propietario Express recibe el resto
        },
        metadata: { booking_id: bookingId }
      });
    }

    // 4. Guarda la reserva en estado inicial 'pending' (a la espera de la webhook de confirmación)
    const insertQuery = `
      INSERT INTO bookings (id, driver_id, spot_id, vehicle_id, start_time, end_time, subtotal, commission, total, qr_code, status, stripe_payment_intent_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
      RETURNING *;
    `;
    const { rows: bookings } = await db.query(insertQuery, [
      bookingId,
      driverId,
      spotId,
      vehicleId || null,
      new Date(startTime),
      new Date(endTime),
      subtotal,
      commission,
      total,
      qrCode,
      paymentIntent?.id || null
    ]);

    res.status(201).json({
      booking: bookings[0],
      clientSecret: paymentIntent?.client_secret || null // Devuelve el secret para Stripe.js en el cliente
    });
  } catch (error) {
    console.error("Error creando reserva:", error);
    res.status(500).json({ error: "Error en el servidor al procesar la reserva." });
  }
});

/**
 * POST /api/bookings/:id/cancel
 * Cancela una reserva activa antes de su inicio.
 */
router.post("/:id/cancel", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const query = "UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING *";
    const { rows } = await db.query(query, [id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Reserva activa no encontrada para cancelar." });
      return;
    }

    res.json({ success: true, message: "Reserva cancelada con éxito.", booking: rows[0] });
  } catch (error) {
    console.error("Error al cancelar reserva:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/bookings/:id/reviews
 * Registra una valoración escrita para un parking asociado a una reserva expirada.
 */
router.post("/:id/reviews", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!rating) {
    res.status(400).json({ error: "La valoración de estrellas es requerida." });
    return;
  }

  try {
    // Verifica que la reserva exista
    const checkBooking = "SELECT id, status FROM bookings WHERE id = $1";
    const { rows: bookings } = await db.query(checkBooking, [id]);

    if (bookings.length === 0) {
      res.status(404).json({ error: "Reserva no encontrada." });
      return;
    }

    // Registra la reseña en la tabla de valoraciones
    const reviewId = "rv_" + Math.random().toString(36).substr(2, 9);
    const insertReview = `
      INSERT INTO reviews (id, booking_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows } = await db.query(insertReview, [reviewId, id, parseInt(rating), comment || ""]);

    res.status(201).json({ success: true, review: rows[0] });
  } catch (error) {
    console.error("Error al registrar reseña:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
