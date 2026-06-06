import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

/**
 * Inicialización de la API de Stripe.
 * Configura la versión de la API de Stripe e inicializa la clave secreta.
 */
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-04-10" as any, // Versión estable compatible
});

/**
 * LÓGICA DE STRIPE CONNECT PARA SPOT:
 * 
 * 1. Cuenta Express del Propietario:
 *    Los propietarios registran su cuenta bancaria mediante cuentas Express conectadas.
 *    Endpoint para crear link de registro:
 *    const account = await stripe.accounts.create({ type: 'express' });
 * 
 * 2. Destinos de Pago (Transferencias directas):
 *    Al cobrar al conductor, el dinero se divide usando "Destination Charges".
 *    const paymentIntent = await stripe.paymentIntents.create({
 *      amount: totalAmountInCents, // Ej: 1960 céntimos (19,60 €)
 *      currency: 'eur',
 *      payment_method_types: ['card'],
 *      application_fee_amount: platformFeeInCents, // Comisión de Spot (56 céntimos)
 *      transfer_data: {
 *        destination: ownerStripeAccountId, // Cuenta Express del dueño (recibe 19,04 €)
 *      },
 *    });
 */
export default stripe;
