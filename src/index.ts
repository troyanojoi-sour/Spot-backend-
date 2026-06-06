import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./config/db.js";
import { stripe } from "./config/stripe.js";

// Importación de enrutadores modulares
import authRoutes from "./routes/authRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import spotRoutes from "./routes/spotRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de CORS
app.use(cors());

// ==========================================
// 💳 STRIPE WEBHOOKS ROUTE (RAW BODY ROUTING)
// ==========================================
// NOTA: Debe colocarse antes de express.json() para recibir la carga cruda (raw buffer)
// requerida por la API de Stripe para validar la firma de seguridad asíncrona.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`❌ Error de firma en Webhook Stripe: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Escucha eventos de pago exitosos para activar las reservas
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      console.log(`💰 Pago procesado exitosamente en Stripe Connect: ${paymentIntent.id}`);
      
      const bookingId = paymentIntent.metadata.booking_id;
      if (bookingId) {
        // Marca la reserva como 'active' al recibir la confirmación de Stripe
        await db.query(
          "UPDATE bookings SET status = 'active', stripe_payment_intent_id = $1 WHERE id = $2",
          [paymentIntent.id, bookingId]
        );
        console.log(`✅ Reserva ${bookingId} activada en PostgreSQL.`);
      }
    }

    res.json({ received: true });
  }
);

// Middleware global para decodificar peticiones JSON
app.use(express.json());

// ==========================================
// 🔗 REGISTRO DE RUTAS MODULARES DE LA API
// ==========================================
app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/users", userRoutes);

// Ruta básica para salud (Health check)
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Inicialización del servidor Express en el puerto configurado
app.listen(PORT, () => {
  console.log(`🚀 Servidor Spot corriendo en http://localhost:${PORT}`);
});
